/**
 * Generation entrypoint: execute an agent-authored ESM script with the
 * toolkit injected, capture the SVG, validate it, optionally render a PNG
 * preview — one round trip for the whole generate-and-verify loop.
 *
 * Options: { code, name, seed, width, height, params, preview, background, outDir }
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { main, outputDir, stampedName } from "./lib/io.mjs";
import { buildContext } from "./lib/toolkit.mjs";
import { serialize } from "./lib/env.mjs";
import { checkSvg } from "./lib/checks.mjs";
import { renderToFile } from "./lib/render.mjs";

const BAG_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

await main(async (options) => {
  const { code, name = "art", seed = 1, width = 800, height = 800, params, preview = true, background } = options;
  if (!code || typeof code !== "string") return { ok: false, error: "options.code (an ESM module string) is required" };

  // The script must live inside the bag so its bare imports resolve against
  // the bag's node_modules.
  const scratchDir = join(BAG_DIR, ".scratch");
  mkdirSync(scratchDir, { recursive: true });
  const scriptPath = join(scratchDir, `gen-${process.pid}-${Date.now()}.mjs`);
  writeFileSync(scriptPath, code, "utf8");

  // Capture user console output so diagnostics come back with the result
  // instead of corrupting nothing / vanishing.
  const logs = [];
  for (const level of ["log", "warn", "error", "info"]) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      logs.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
      original(...args);
    };
  }

  let markup;
  try {
    const module = await import(pathToFileURL(scriptPath).href);
    const create = module.default;
    if (typeof create !== "function") {
      return { ok: false, error: "script must `export default (ctx) => ...` (async ok)" };
    }
    const ctx = buildContext({ width, height, seed, params, bagDir: BAG_DIR });
    const returned = await create(ctx);
    markup = serialize(typeof returned === "string" ? returned : ctx.svg);
  } finally {
    rmSync(scriptPath, { force: true });
  }

  const dir = outputDir(options);
  const svgPath = join(dir, stampedName(name, ".svg"));
  writeFileSync(svgPath, markup, "utf8");

  const check = checkSvg(markup);
  const warnings = [...check.errors.map((e) => `ERROR: ${e}`), ...check.warnings];

  let pngPath = null;
  let render = null;
  if (preview) {
    try {
      const outPath = svgPath.replace(/\.svg$/, ".png");
      const rendered = renderToFile(markup, outPath, { width: Math.min(width * 2, 1600), background, bagDir: BAG_DIR });
      pngPath = rendered.pngPath;
      render = { width: rendered.width, height: rendered.height, coverage: Math.round(rendered.coverage * 1000) / 1000 };
      if (rendered.coverage === 0) warnings.push("RENDER: image is completely blank — nothing was drawn inside the viewBox");
      else if (rendered.coverage < 0.005) warnings.push("RENDER: <0.5% of pixels drawn — content may be mis-positioned or invisible");
    } catch (e) {
      warnings.push(`RENDER FAILED: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return {
    ok: check.ok,
    svgPath,
    pngPath,
    seed,
    stats: check.stats,
    render,
    warnings,
    logs: logs.slice(-50),
    // Inline the markup only when small; otherwise the caller Reads the file.
    svg: markup.length <= 20_000 ? markup : undefined,
  };
});
