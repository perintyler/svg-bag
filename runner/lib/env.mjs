/**
 * Headless SVG.js environment on svgdom.
 *
 * svgdom needs its font directory configured before any text is measured, and
 * bold/italic only resolve when registered as separate family mappings — so
 * mappings are built from real font discovery rather than hardcoded names.
 */

import { existsSync } from "node:fs";
import { createSVGWindow, config } from "svgdom";
import { SVG, registerWindow } from "@svgdotjs/svg.js";
import { bagFontDir, discoverFonts } from "./fonts.mjs";
import { basename } from "node:path";

let fontsConfigured = false;

export function configureFonts(bagDir) {
  if (fontsConfigured) return;
  const dir = bagFontDir(bagDir);
  if (existsSync(dir)) {
    const mappings = {};
    for (const font of discoverFonts(bagDir, { includeSystem: false })) {
      const file = basename(font.file);
      // "Inter" for Regular, "Inter-Bold" / "Inter-italic" style keys for the rest.
      if (font.subfamily.toLowerCase() === "regular") mappings[font.family] = file;
      mappings[`${font.family}-${font.subfamily}`] = file;
    }
    config.setFontDir(dir).setFontFamilyMappings(mappings).preloadFonts();
  }
  fontsConfigured = true;
}

/**
 * A fresh drawing canvas. Every call gets its own window so parallel runs and
 * repeated runs cannot leak state into each other.
 */
export function createCanvas({ width = 800, height = 800, bagDir } = {}) {
  if (bagDir) configureFonts(bagDir);
  const window = createSVGWindow();
  const document = window.document;
  registerWindow(window, document);
  const canvas = SVG(document.documentElement);
  canvas.viewbox(0, 0, width, height);
  // width/height attributes give raster converters and <img> an intrinsic size.
  canvas.attr({ width, height, xmlns: "http://www.w3.org/2000/svg" });
  return { canvas, window, document };
}

/** Serialize a canvas (or accept a raw string) into standalone SVG markup. */
export function serialize(svgOrCanvas) {
  if (typeof svgOrCanvas === "string") return ensureXmlns(svgOrCanvas.trim());
  return ensureXmlns(svgOrCanvas.svg());
}

function ensureXmlns(markup) {
  if (!markup.startsWith("<svg") && !markup.startsWith("<?xml")) return markup;
  if (markup.includes("xmlns=")) return markup;
  return markup.replace(/<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
}
