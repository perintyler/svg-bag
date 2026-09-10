/**
 * Full validation: static checks + a real render probe.
 * Options: { svg | svgPath }
 */

import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { main } from "./lib/io.mjs";
import { checkSvg } from "./lib/checks.mjs";
import { renderSvg } from "./lib/render.mjs";

const BAG_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

await main(async (options) => {
  const markup = options.svg ?? readFileSync(options.svgPath, "utf8");
  const check = checkSvg(markup);

  let render = null;
  const renderErrors = [];
  try {
    const rendered = renderSvg(markup, { width: 400, bagDir: BAG_DIR });
    render = { coverage: Math.round(rendered.coverage * 1000) / 1000, width: rendered.width, height: rendered.height };
    if (rendered.coverage === 0) renderErrors.push("renders completely blank");
  } catch (e) {
    renderErrors.push(`does not render: ${e instanceof Error ? e.message : String(e)}`);
  }

  return {
    ok: check.ok && renderErrors.length === 0,
    errors: [...check.errors, ...renderErrors],
    warnings: check.warnings,
    stats: check.stats,
    render,
  };
});
