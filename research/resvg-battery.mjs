/**
 * Empirical feature battery against the bag's own resvg pipeline.
 *
 * Each test renders a tiny SVG designed so that pixels DISCRIMINATE between
 * "feature works" and "feature ignored/dropped" — a test whose broken state
 * looks like its healthy state would be worthless. Verdicts feed the
 * [verify] tags in instructions/svg-compatibility.md.
 *
 * Run from the bag dir: node research/resvg-battery.mjs
 */

import { renderSvg } from "../runner/lib/render.mjs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BAG_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const S = 60; // canvas size for every test

const wrap = (body, attrs = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}"${attrs}>${body}</svg>`;

function px(r, x, y) {
  const i = (y * r.width + x) * 4;
  return { r: r.pixels[i], g: r.pixels[i + 1], b: r.pixels[i + 2], a: r.pixels[i + 3] };
}
const isRed = (p) => p.a > 200 && p.r > 180 && p.g < 80 && p.b < 80;
const isGreen = (p) => p.a > 200 && p.g > 180 && p.r < 80 && p.b < 80;
const isBlue = (p) => p.a > 200 && p.b > 180 && p.r < 80 && p.g < 80;
const isBlank = (p) => p.a === 0;
const isDark = (p) => p.a > 200 && p.r < 90 && p.g < 90 && p.b < 90;

const TESTS = [
  {
    name: "css-in-style-element",
    svg: wrap('<style>.a{fill:#ff0000}</style><rect class="a" width="60" height="60"/>'),
    judge: (r) => (isRed(px(r, 30, 30)) ? "supported" : "NOT applied (rect fell back to black)"),
  },
  {
    name: "linear-gradient",
    svg: wrap('<defs><linearGradient id="g"><stop offset="0" stop-color="#ff0000"/><stop offset="1" stop-color="#0000ff"/></linearGradient></defs><rect width="60" height="60" fill="url(#g)"/>'),
    judge: (r) => (px(r, 3, 30).r > 200 && px(r, 57, 30).b > 200 ? "supported" : "NOT interpolating"),
  },
  {
    name: "gradient-href-inheritance",
    svg: wrap('<defs><linearGradient id="a"><stop offset="0" stop-color="#ff0000"/><stop offset="1" stop-color="#ff0000"/></linearGradient><linearGradient id="b" href="#a"/></defs><rect width="60" height="60" fill="url(#b)"/>'),
    judge: (r) => (isRed(px(r, 30, 30)) ? "supported" : "stops NOT inherited via href"),
  },
  {
    name: "pattern",
    svg: wrap('<defs><pattern id="p" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill="#ff0000"/></pattern></defs><rect width="60" height="60" fill="url(#p)"/>'),
    judge: (r) => (isRed(px(r, 2, 2)) && isBlank(px(r, 8, 8)) ? "supported" : "pattern NOT tiled"),
  },
  {
    name: "clip-path",
    svg: wrap('<defs><clipPath id="c"><circle cx="30" cy="30" r="15"/></clipPath></defs><rect width="60" height="60" fill="#ff0000" clip-path="url(#c)"/>'),
    judge: (r) => (isRed(px(r, 30, 30)) && isBlank(px(r, 3, 3)) ? "supported" : "clip NOT applied"),
  },
  {
    name: "mask-luminance",
    svg: wrap('<defs><mask id="m"><rect width="60" height="60" fill="#000"/><circle cx="30" cy="30" r="15" fill="#fff"/></mask></defs><rect width="60" height="60" fill="#ff0000" mask="url(#m)"/>'),
    judge: (r) => (isRed(px(r, 30, 30)) && isBlank(px(r, 3, 3)) ? "supported" : "mask NOT applied"),
  },
  {
    name: "filter-feGaussianBlur",
    // Explicit region: the default -10%/120% region would CLIP the blur halo
    // before the probe pixel, misreading region clipping as "unsupported"
    // (verified — the first battery run did exactly that).
    svg: wrap('<defs><filter id="f" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="4"/></filter></defs><rect x="20" y="20" width="20" height="20" fill="#ff0000" filter="url(#f)"/>'),
    judge: (r) => {
      const outside = px(r, 44, 30); // beyond the crisp edge
      const center = px(r, 30, 30);
      if (outside.a > 10 && outside.a < 250) return "supported";
      if (center.a > 200 && outside.a === 0) return "IGNORED (rendered unfiltered)";
      if (isBlank(center)) return "element DROPPED";
      return "unclear";
    },
  },
  {
    name: "filter-feDropShadow",
    svg: wrap('<defs><filter id="f" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="8" dy="8" flood-color="#000000"/></filter></defs><rect x="10" y="10" width="20" height="20" fill="#ff0000" filter="url(#f)"/>'),
    judge: (r) => (px(r, 34, 34).a > 60 ? "supported" : "shadow NOT present"),
  },
  {
    name: "filter-feTurbulence",
    svg: wrap('<defs><filter id="f"><feTurbulence baseFrequency="0.9" numOctaves="2"/></filter></defs><rect width="60" height="60" filter="url(#f)"/>'),
    judge: (r) => {
      let variance = 0;
      const base = px(r, 10, 10);
      for (let i = 0; i < 20; i++) {
        const p = px(r, 5 + i * 2, 30);
        variance += Math.abs(p.r - base.r) + Math.abs(p.g - base.g);
      }
      return variance > 200 ? "supported (noisy output)" : "NOT generating noise";
    },
  },
  {
    name: "filter-displacement",
    svg: wrap('<defs><filter id="f" x="-500%" y="-20%" width="1100%" height="140%"><feTurbulence baseFrequency="0.15" numOctaves="2" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="18"/></filter></defs><rect x="28" y="0" width="4" height="60" fill="#000" filter="url(#f)"/>'),
    judge: (r) => {
      // A straight 4px bar displaced by noise: dark pixels appear off-column.
      let offColumn = 0;
      for (let y = 2; y < 58; y += 2) {
        for (const x of [20, 24, 36, 40]) if (isDark(px(r, x, y))) offColumn++;
      }
      return offColumn > 2 ? "supported (edge displaced)" : "NOT displacing";
    },
  },
  {
    name: "text-with-fontdirs",
    svg: wrap('<text x="4" y="44" font-family="JetBrains Mono" font-size="40" fill="#000">MM</text>'),
    judge: (r) => {
      let dark = 0;
      for (let y = 12; y < 44; y += 2) for (let x = 4; x < 56; x += 2) if (isDark(px(r, x, y))) dark++;
      return dark > 30 ? "supported (glyphs rasterized)" : "text NOT rendered";
    },
  },
  {
    name: "textPath",
    svg: wrap('<defs><path id="p" d="M 5 55 Q 30 5 55 55"/></defs><text font-family="JetBrains Mono" font-size="14" fill="#000"><textPath href="#p">wwwww</textPath></text>'),
    judge: (r) => {
      let upper = 0;
      for (let x = 20; x < 40; x += 2) for (let y = 12; y < 30; y += 2) if (isDark(px(r, x, y))) upper++;
      return upper > 3 ? "supported (text follows curve)" : "textPath NOT rendered";
    },
  },
  {
    name: "oklch-color",
    svg: wrap('<rect width="60" height="60" fill="oklch(0.628 0.258 29.23)"/>'),
    judge: (r) => {
      const p = px(r, 30, 30);
      if (isRed(p)) return "supported";
      if (isBlank(p)) return "NOT supported (element dropped)";
      if (isDark(p)) return "NOT supported (fell back to black)";
      return `NOT red: rgba(${p.r},${p.g},${p.b},${p.a})`;
    },
  },
  {
    name: "currentColor",
    svg: wrap('<rect width="60" height="60" fill="currentColor"/>', ' color="#00ff00"'),
    judge: (r) => (isGreen(px(r, 30, 30)) ? "supported" : "currentColor NOT resolved"),
  },
  {
    name: "css-custom-properties",
    svg: wrap('<style>svg{--c:#0000ff}</style><rect width="60" height="60" fill="var(--c)"/>'),
    judge: (r) => {
      const p = px(r, 30, 30);
      return isBlue(p) ? "supported" : isBlank(p) ? "NOT supported (dropped)" : "NOT supported (fallback paint)";
    },
  },
  {
    name: "paint-order-stroke",
    svg: wrap('<rect x="15" y="15" width="30" height="30" fill="#ff0000" stroke="#00ff00" stroke-width="12" paint-order="stroke"/>'),
    judge: (r) => {
      const innerEdge = px(r, 18, 30); // inside stroke overlap zone
      if (isRed(innerEdge)) return "supported (fill painted over stroke)";
      if (isGreen(innerEdge)) return "NOT applied (normal order)";
      return "unclear";
    },
  },
  {
    name: "marker-auto-start-reverse",
    svg: wrap('<defs><marker id="m" markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto-start-reverse"><rect width="10" height="10" fill="#ff0000"/></marker></defs><path d="M 30 50 L 30 20" stroke="#000" stroke-width="1" marker-start="url(#m)"/>'),
    judge: (r) => (px(r, 30, 50).r > 180 || px(r, 30, 52).r > 180 ? "supported" : "marker NOT drawn"),
  },
  {
    name: "use-href",
    svg: wrap('<defs><circle id="c" r="12" fill="#ff0000"/></defs><use href="#c" x="30" y="30"/>'),
    judge: (r) => (isRed(px(r, 30, 30)) ? "supported" : "use/href NOT resolved"),
  },
  {
    name: "use-xlink-href",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 60 60" width="60" height="60"><defs><circle id="c" r="12" fill="#ff0000"/></defs><use xlink:href="#c" x="30" y="30"/></svg>`,
    judge: (r) => (isRed(px(r, 30, 30)) ? "supported" : "xlink:href NOT resolved"),
  },
  {
    name: "vector-effect-non-scaling-stroke",
    svg: wrap('<g transform="scale(6)"><line x1="1" y1="5" x2="9" y2="5" stroke="#000" stroke-width="1" vector-effect="non-scaling-stroke"/></g>'),
    judge: (r) => {
      let thickness = 0;
      for (let y = 20; y < 40; y++) if (isDark(px(r, 30, y))) thickness++;
      if (thickness === 0) return "line NOT rendered";
      return thickness <= 2 ? "supported (stroke stayed 1px)" : `NOT applied (stroke scaled to ${thickness}px)`;
    },
  },
  {
    name: "fill-rule-evenodd",
    svg: wrap('<path fill-rule="evenodd" fill="#ff0000" d="M 10 10 H 50 V 50 H 10 Z M 20 20 H 40 V 40 H 20 Z"/>'),
    judge: (r) => (isBlank(px(r, 30, 30)) && isRed(px(r, 14, 30)) ? "supported (hole cut)" : "evenodd NOT applied"),
  },
  {
    name: "nested-svg",
    svg: wrap('<svg x="15" y="15" width="30" height="30" viewBox="0 0 10 10"><rect width="10" height="10" fill="#ff0000"/></svg>'),
    judge: (r) => (isRed(px(r, 30, 30)) && isBlank(px(r, 5, 5)) ? "supported" : "nested svg NOT scoped"),
  },
  {
    name: "stroke-dasharray",
    svg: wrap('<line x1="0" y1="30" x2="60" y2="30" stroke="#000" stroke-width="4" stroke-dasharray="8 8"/>'),
    judge: (r) => {
      let on = 0, off = 0;
      for (let x = 1; x < 59; x++) (isDark(px(r, x, 30)) ? on++ : off++);
      return on > 10 && off > 10 ? "supported (gaps present)" : "dashes NOT applied";
    },
  },
  {
    name: "css-transform-style-attr",
    svg: wrap('<rect width="14" height="14" fill="#ff0000" style="transform: translate(23px, 23px)"/>'),
    judge: (r) => {
      if (isRed(px(r, 30, 30)) && isBlank(px(r, 4, 4))) return "supported";
      if (isRed(px(r, 4, 4))) return "NOT applied (rect stayed at origin)";
      return "unclear";
    },
  },
  {
    name: "smil-static-first-frame",
    svg: wrap('<rect x="0" y="20" width="14" height="14" fill="#ff0000"><animate attributeName="x" from="0" to="46" dur="1s"/></rect>'),
    judge: (r) => {
      if (isRed(px(r, 5, 27))) return "renders base value (animation ignored, element kept)";
      if (isRed(px(r, 50, 27))) return "renders end value";
      return "element DROPPED when <animate> present";
    },
  },
];

const results = {};
for (const test of TESTS) {
  try {
    const rendered = renderSvg(test.svg, { bagDir: BAG_DIR, keepPixels: true });
    results[test.name] = test.judge(rendered);
  } catch (e) {
    results[test.name] = `THROWS: ${e instanceof Error ? e.message : String(e)}`;
  }
}
console.log(JSON.stringify({ resvgVersion: "2.6.2", date: "2026-09-10", results }, null, 1));
