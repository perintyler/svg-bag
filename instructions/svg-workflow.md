---
name: svg-workflow
description: >-
  How to use the svg bag's generate→see→iterate loop. The operating manual for
  the generate, render, validate, optimize and text_to_path tools.
mode: always
---

# SVG generation workflow

Generate SVGs by **writing code, not markup** — code computes coordinates;
hand-written markup gets arcs and arithmetic wrong. Then **look at what you
made** before calling it done.

The loop:

1. `generate` with an ESM script: `export default (ctx) => { ... }`. Draw on
   `ctx.svg` (SVG.js) or return a raw `<svg>` string. The result is validated
   and rendered to PNG in the same call.
2. **View the returned `pngPath`** (media `view_image`) — never ship an SVG
   you have not seen. Check `render.coverage` and `warnings` too: blank or
   near-blank renders are called out.
3. Iterate: adjust the code, or sweep `seed` — same `(code, seed)` is
   byte-identical, so a good seed is reproducible forever.
4. `optimize` before shipping; `validate` any SVG from elsewhere.

Rules the toolkit enforces or expects:

- **Never `Math.random`** — use `ctx.random` (`.range/.int/.gaussian/.choice/
  .shuffle`) and `ctx.noise2D/3D/4D`, all seeded from `seed`.
- **Never `<text>` in standalone output** — viewer fonts are not yours. Use
  `ctx.text({text, family, size, x, y})` (or the `text_to_path` tool) to get
  outline paths with real metrics; shipped families: Inter, Lora,
  JetBrains Mono.
- SVG.js setters silently coerce `NaN` to 0 — validate catches `NaN` only in
  raw markup, so guard your arithmetic where it happens.
- `ctx.lib` carries d3 (`shape`, `scale`, `delaunay`, `hierarchy`), `Bezier`,
  `culori` (OKLCH color), `polygonClipping`, `SvgPath`, `SVGPathCommander`,
  `simplify`, `rough`. Bare imports of any bag dependency also work.

Craft references (get_instructions): `svg-craft` (coordinates, paths, paint,
filters, text), `svg-generative` (flow fields, tiling, packing, palettes),
`svg-design` (icons, logos, diagrams), `svg-compatibility` (renderers,
animation, optimization).
