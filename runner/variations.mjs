/**
 * Seed sweep → contact sheet.
 *
 * Runs one generation script across N seeds and composes a labeled grid so
 * the whole parameter space is judged in ONE look — the "explore by seed
 * sweep" discipline from svg-generative, made one tool call.
 *
 * The sheet is itself built as SVG (thumbnails as data:URI <image>, seed
 * labels as <text>) and rendered by the same pipeline — dogfooding included.
 *
 * Options: { code, seeds | count, width, height, params, name, outDir, thumb }
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { main, outputDir, stampedName } from "./lib/io.mjs";
import { buildContext } from "./lib/toolkit.mjs";
import { serialize } from "./lib/env.mjs";
import { checkSvg } from "./lib/checks.mjs";
import { renderSvg, renderToFile } from "./lib/render.mjs";

const BAG_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

await main(async (options) => {
  const { code, name = "variations", width = 800, height = 800, params, thumb = 320 } = options;
  if (!code || typeof code !== "string") return { ok: false, error: "options.code is required" };
  const seeds = options.seeds?.length
    ? options.seeds
    : Array.from({ length: options.count ?? 9 }, (_, i) => i + 1);
  if (seeds.length > 25) return { ok: false, error: "at most 25 seeds per sheet" };

  const scratchDir = join(BAG_DIR, ".scratch");
  mkdirSync(scratchDir, { recursive: true });
  const scriptPath = join(scratchDir, `var-${process.pid}-${Date.now()}.mjs`);
  writeFileSync(scriptPath, code, "utf8");

  const cells = [];
  const failures = [];
  try {
    const module = await import(pathToFileURL(scriptPath).href);
    const create = module.default;
    if (typeof create !== "function") {
      return { ok: false, error: "script must `export default (ctx) => ...` (async ok)" };
    }
    for (const seed of seeds) {
      try {
        const ctx = buildContext({ width, height, seed, params, bagDir: BAG_DIR });
        const returned = await create(ctx);
        const markup = serialize(typeof returned === "string" ? returned : ctx.svg);
        const check = checkSvg(markup);
        const rendered = renderSvg(markup, { width: thumb, bagDir: BAG_DIR });
        cells.push({
          seed,
          png: rendered.png,
          coverage: Math.round(rendered.coverage * 1000) / 1000,
          valid: check.ok,
        });
        if (!check.ok) failures.push(`seed ${seed}: ${check.errors[0]}`);
      } catch (e) {
        failures.push(`seed ${seed}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } finally {
    rmSync(scriptPath, { force: true });
  }

  if (cells.length === 0) {
    return { ok: false, error: `every seed failed:\n${failures.join("\n")}` };
  }

  // Compose the sheet as SVG — thumbnails as data:URIs, seed labels underneath.
  const columns = options.columns ?? Math.ceil(Math.sqrt(cells.length));
  const rows = Math.ceil(cells.length / columns);
  const pad = 12;
  const label = 22;
  const cellW = thumb + pad;
  const cellH = Math.round((thumb * height) / width) + label + pad;
  const sheetW = columns * cellW + pad;
  const sheetH = rows * cellH + pad;

  const pieces = [`<rect width="${sheetW}" height="${sheetH}" fill="#1c1c22"/>`];
  cells.forEach((cell, i) => {
    const x = pad + (i % columns) * cellW;
    const y = pad + Math.floor(i / columns) * cellH;
    const h = Math.round((thumb * height) / width);
    pieces.push(
      `<image x="${x}" y="${y}" width="${thumb}" height="${h}" href="data:image/png;base64,${cell.png.toString("base64")}"/>`,
      `<text x="${x + thumb / 2}" y="${y + h + 16}" text-anchor="middle" font-family="JetBrains Mono" font-size="13" fill="${cell.valid ? "#9a9aa6" : "#e05555"}">seed ${cell.seed}${cell.valid ? "" : " ✗"}</text>`,
    );
  });
  const sheetSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sheetW} ${sheetH}" width="${sheetW}" height="${sheetH}">${pieces.join("")}</svg>`;

  const dir = outputDir(options);
  const sheetPath = join(dir, stampedName(`${name}-sheet`, ".png"));
  renderToFile(sheetSvg, sheetPath, { bagDir: BAG_DIR });

  return {
    ok: failures.length === 0,
    sheetPath,
    seeds: cells.map((c) => ({ seed: c.seed, coverage: c.coverage, valid: c.valid })),
    failures,
    hint: "view sheetPath, pick the best seed, then call generate with that seed at full size",
  };
});
