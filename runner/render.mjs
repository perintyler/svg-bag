/**
 * Rasterize an SVG (string or file) to PNG.
 * Options: { svg | svgPath, outPath, width, background }
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { main, outputDir, stampedName } from "./lib/io.mjs";
import { renderToFile } from "./lib/render.mjs";

const BAG_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

await main(async (options) => {
  const markup = options.svg ?? readFileSync(options.svgPath, "utf8");
  const outPath =
    options.outPath ?? join(outputDir(options), stampedName(options.name ?? "render", ".png"));
  const rendered = renderToFile(markup, outPath, {
    width: options.width,
    background: options.background,
    bagDir: BAG_DIR,
  });
  const warnings = [];
  if (rendered.coverage === 0) warnings.push("image is completely blank — nothing rendered inside the viewBox");
  return {
    ok: true,
    pngPath: rendered.pngPath,
    width: rendered.width,
    height: rendered.height,
    coverage: Math.round(rendered.coverage * 1000) / 1000,
    warnings,
  };
});
