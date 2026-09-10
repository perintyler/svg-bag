/**
 * SVGO optimization with the footguns removed.
 *
 * svgo v4's preset-default no longer strips viewBox or title, but we pin the
 * things that must survive regardless of future preset drift: viewBox stays,
 * ids referenced by url()/href stay (cleanupIds is safe — it only minifies
 * unreferenced ids... which is exactly what breaks external CSS/JS hooks, so
 * it is opt-out via keepIds).
 *
 * Options: { svg | svgPath, outPath, precision, keepIds, pretty }
 */

import { readFileSync, writeFileSync } from "node:fs";
import { optimize } from "svgo";
import { main } from "./lib/io.mjs";

await main(async (options) => {
  const markup = options.svg ?? readFileSync(options.svgPath, "utf8");
  const before = Buffer.byteLength(markup, "utf8");

  const overrides = {
    // Never let a preset remove the viewBox, whatever version is installed.
    removeViewBox: false,
  };
  if (options.keepIds) overrides.cleanupIds = false;

  const config = {
    multipass: true,
    floatPrecision: options.precision ?? 2,
    js2svg: options.pretty ? { pretty: true, indent: 2 } : undefined,
    plugins: [{ name: "preset-default", params: { overrides } }],
  };

  const result = optimize(markup, config);
  const after = Buffer.byteLength(result.data, "utf8");

  const outPath = options.outPath ?? options.svgPath;
  if (outPath) writeFileSync(outPath, result.data, "utf8");

  return {
    ok: true,
    outPath: outPath ?? null,
    bytesBefore: before,
    bytesAfter: after,
    saved: before - after,
    savedPercent: before > 0 ? Math.round(((before - after) / before) * 1000) / 10 : 0,
    svg: result.data.length <= 20_000 ? result.data : undefined,
  };
});
