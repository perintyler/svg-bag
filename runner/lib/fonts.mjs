/**
 * Font discovery, shared by svgdom (text layout), resvg (rasterizing <text>)
 * and text-to-path.
 *
 * The bag ships OFL fonts under assets/fonts so text works deterministically
 * on any machine; system fonts are discovered on top of that. Shipped fonts
 * win name collisions — determinism beats variety.
 */

import { readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { extname, join } from "node:path";
import * as fontkit from "fontkit";

export const FONT_EXTENSIONS = new Set([".ttf", ".otf", ".ttc"]);

export function bagFontDir(bagDir) {
  return join(bagDir, "assets", "fonts");
}

export function systemFontDirs() {
  return [
    join(homedir(), "Library/Fonts"),
    "/Library/Fonts",
    "/System/Library/Fonts",
    "/System/Library/Fonts/Supplemental",
  ];
}

function* fontFilesIn(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    try {
      if (statSync(full).isFile() && FONT_EXTENSIONS.has(extname(entry).toLowerCase())) yield full;
    } catch {
      // unreadable entry — skip
    }
  }
}

function fontsInFile(file) {
  try {
    const opened = fontkit.openSync(file);
    // A .ttc opens as a collection carrying several fonts.
    const fonts = Array.isArray(opened?.fonts) ? opened.fonts : [opened];
    return fonts
      .filter((f) => f && f.familyName)
      .map((f) => ({
        family: f.familyName,
        subfamily: f.subfamilyName ?? "Regular",
        postscriptName: f.postscriptName ?? null,
        file,
      }));
  } catch {
    // Not every file on a real machine parses; discovery must not die on one.
    return [];
  }
}

/**
 * All discoverable fonts. Shipped bag fonts first so they win collisions.
 * `includeSystem: false` limits to the deterministic shipped set.
 */
export function discoverFonts(bagDir, { includeSystem = true } = {}) {
  const dirs = [bagFontDir(bagDir), ...(includeSystem ? systemFontDirs() : [])];
  const seen = new Map(); // family|subfamily -> entry, first wins
  for (const dir of dirs) {
    for (const file of fontFilesIn(dir)) {
      for (const font of fontsInFile(file)) {
        const key = `${font.family}|${font.subfamily}`.toLowerCase();
        if (!seen.has(key)) seen.set(key, font);
      }
    }
  }
  return [...seen.values()];
}

/**
 * Resolve a family name (optionally with style, e.g. "Inter Bold") to a font
 * file + fontkit font. Returns null rather than guessing wildly: text drawn
 * with the wrong font and text that failed to resolve must be distinguishable.
 */
export function resolveFont(bagDir, family, { style } = {}) {
  const wanted = family.toLowerCase();
  const wantedStyle = (style ?? "regular").toLowerCase();
  const fonts = discoverFonts(bagDir);
  const ofFamily = fonts.filter((f) => f.family.toLowerCase() === wanted);
  if (ofFamily.length === 0) return null;
  const styled =
    ofFamily.find((f) => f.subfamily.toLowerCase() === wantedStyle) ??
    ofFamily.find((f) => f.subfamily.toLowerCase() === "regular") ??
    ofFamily[0];
  try {
    const opened = fontkit.openSync(styled.file);
    const fonts = Array.isArray(opened?.fonts) ? opened.fonts : [opened];
    const match =
      fonts.find((f) => f.familyName === styled.family && (f.subfamilyName ?? "Regular") === styled.subfamily) ??
      fonts[0];
    return { ...styled, font: match };
  } catch {
    return null;
  }
}
