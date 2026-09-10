/**
 * Rasterization via resvg — the closed loop's eyes.
 *
 * Render stats (pixel coverage) travel with every render so a "successful"
 * render of a blank image is distinguishable from a real one. A verifier that
 * cannot fail is worse than none: blankness is exactly how broken generated
 * SVG usually presents.
 */

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { bagFontDir, systemFontDirs } from "./fonts.mjs";

/**
 * Render SVG markup to PNG.
 *
 * Returns { png, width, height, coverage, opaquePixels } where coverage is the
 * fraction of pixels with any alpha. Throws on unparseable SVG — callers that
 * want a verdict instead of an exception wrap this.
 */
export function renderSvg(svg, { width, background, bagDir, keepPixels = false } = {}) {
  const options = {
    font: {
      loadSystemFonts: true,
      fontDirs: bagDir ? [bagFontDir(bagDir), ...systemFontDirs()] : systemFontDirs(),
    },
  };
  if (width) options.fitTo = { mode: "width", value: width };
  if (background) options.background = background;

  const resvg = new Resvg(svg, options);
  const rendered = resvg.render();
  const png = rendered.asPng();

  // Alpha-channel census over the raw RGBA pixels.
  const pixels = rendered.pixels;
  let opaque = 0;
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i] > 0) opaque++;
  }
  const total = rendered.width * rendered.height;

  return {
    png,
    width: rendered.width,
    height: rendered.height,
    opaquePixels: opaque,
    coverage: total > 0 ? opaque / total : 0,
    // RGBA buffer on request only — it is large and most callers need verdicts.
    pixels: keepPixels ? pixels : undefined,
  };
}

export function renderToFile(svg, outPath, options = {}) {
  const result = renderSvg(svg, options);
  writeFileSync(outPath, result.png);
  return { ...result, png: undefined, pngPath: outPath };
}
