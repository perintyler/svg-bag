/**
 * The status smoke test — proves the whole pipeline with a real render, and
 * proves the VERIFIER with a built-in negative control.
 *
 * "A check that cannot fail is worse than no check": if this probe were
 * broken, what would we see? A probe that only renders a good SVG could pass
 * while validation silently rots. So it also feeds the pipeline a broken SVG
 * and a blank SVG, and goes red unless both are correctly rejected.
 */

import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { main } from "./lib/io.mjs";
import { buildContext } from "./lib/toolkit.mjs";
import { serialize } from "./lib/env.mjs";
import { renderSvg } from "./lib/render.mjs";
import { checkSvg } from "./lib/checks.mjs";
import { discoverFonts } from "./lib/fonts.mjs";

const BAG_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

await main(async () => {
  const failures = [];

  // --- Positive path: generate through the real toolkit and render. ---
  let coverage = 0;
  try {
    const ctx = buildContext({ width: 200, height: 200, seed: 42, bagDir: BAG_DIR });
    ctx.svg.rect(200, 200).fill("#1a1a2e");
    ctx.svg.circle(120).center(100, 100).fill("#e94560");
    // Exercise noise + seeded random + a path.
    const points = [];
    for (let i = 0; i < 40; i++) {
      const x = (i / 39) * 200;
      points.push([x, 100 + ctx.noise2D(x * 0.02, 0) * 40]);
    }
    ctx.svg.polyline(points).fill("none").stroke({ color: "#f0f0f0", width: 2 });
    const markup = serialize(ctx.svg);

    const check = checkSvg(markup);
    if (!check.ok) failures.push(`generated smoke SVG failed validation: ${check.errors.join("; ")}`);

    const rendered = renderSvg(markup, { bagDir: BAG_DIR });
    coverage = rendered.coverage;
    if (rendered.coverage < 0.9) {
      failures.push(`smoke render coverage ${rendered.coverage.toFixed(3)} — expected ~1.0 (full background)`);
    }
  } catch (e) {
    failures.push(`toolkit/render pipeline threw: ${e instanceof Error ? e.message : String(e)}`);
  }

  // --- Negative control 1: malformed SVG must be REJECTED, not rendered. ---
  try {
    const verdict = checkSvg("<svg><path d='M 0 NaN L broken'/></svg>");
    if (verdict.ok) failures.push("NEGATIVE CONTROL FAILED: validator passed a malformed SVG");
  } catch {
    // throwing is also a rejection — acceptable
  }

  // --- Negative control 2: a blank SVG must be detected as blank. ---
  try {
    const rendered = renderSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"></svg>', {
      bagDir: BAG_DIR,
    });
    if (rendered.coverage !== 0) {
      failures.push(`NEGATIVE CONTROL FAILED: blank SVG reported coverage ${rendered.coverage}`);
    }
  } catch (e) {
    failures.push(`blank-SVG probe threw unexpectedly: ${e instanceof Error ? e.message : String(e)}`);
  }

  // --- Text pipeline: shipped fonts make this deterministic. ---
  const fonts = discoverFonts(BAG_DIR, { includeSystem: false });
  const fontNote = fonts.length === 0 ? "no shipped fonts found under assets/fonts — text_to_path will rely on system fonts" : null;

  return {
    ok: failures.length === 0,
    failures,
    coverage: Math.round(coverage * 1000) / 1000,
    shippedFonts: fonts.length,
    note: fontNote,
  };
});
