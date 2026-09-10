/**
 * Text → path outlines with real font metrics (fontkit).
 *
 * Standalone SVGs cannot rely on viewer fonts; converting text to paths is
 * the portable answer. Font units are y-up with an em square of unitsPerEm;
 * SVG is y-down — the transform below is where that flip happens.
 */

import * as fontkit from "fontkit";
import SvgPath from "svgpath";
import { resolveFont } from "./fonts.mjs";

/**
 * Lay out `text` in `family` at `size`, returning combined path data with the
 * pen starting at (x, y) — y is the BASELINE, as in SVG <text>.
 */
export function textToPath(bagDir, { text, family, style, fontFile, size = 72, x = 0, y = 0, letterSpacing = 0 }) {
  const resolved = fontFile ? openFontFile(fontFile) : resolveFont(bagDir, family ?? "Inter", { style });
  if (!resolved) {
    return {
      ok: false,
      error: `font not found: ${fontFile ?? family ?? "Inter"} — call the fonts tool to list available families`,
    };
  }

  const font = resolved.font;
  const scale = size / font.unitsPerEm;
  const run = font.layout(text);

  let penX = 0; // font units
  const pieces = [];
  for (let i = 0; i < run.glyphs.length; i++) {
    const glyph = run.glyphs[i];
    const position = run.positions[i];
    const d = glyph.path.toSVG();
    if (d) {
      const placed = new SvgPath(d)
        .translate(penX + position.xOffset, position.yOffset)
        .scale(scale, -scale)
        .translate(x, y)
        .round(3)
        .toString();
      if (placed) pieces.push(placed);
    }
    penX += position.xAdvance + letterSpacing / scale;
  }

  return {
    ok: true,
    d: pieces.join(" "),
    advanceWidth: round3(penX * scale),
    ascent: round3(font.ascent * scale),
    descent: round3(font.descent * scale),
    capHeight: round3(font.capHeight * scale),
    font: {
      family: resolved.family ?? font.familyName,
      subfamily: resolved.subfamily ?? font.subfamilyName,
      file: resolved.file ?? fontFile,
    },
  };
}

function openFontFile(file) {
  try {
    const opened = fontkit.openSync(file);
    const font = Array.isArray(opened?.fonts) ? opened.fonts[0] : opened;
    return { font, file, family: font.familyName, subfamily: font.subfamilyName };
  } catch {
    return null;
  }
}

const round3 = (n) => Math.round(n * 1000) / 1000;
