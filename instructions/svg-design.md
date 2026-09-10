---
name: svg-design
description: >-
  Design rules for the common asks: icon systems (grid, stroke, optical
  centering), logos, diagrams and flowcharts, and headless charts. Read before
  designing an icon set, logo, diagram, or chart.
mode: on-demand
---

# Design principles for generated SVG

Rules distilled from the major icon systems (Material Symbols, Feather,
Lucide, Heroicons conventions), logo practice, and diagram/chart craft.
Specifics of a named system are tagged [verify] — check the system's own docs
before claiming exact conformance.

## Icons

- **Pick one grid and never leave it.** 24×24 is the dominant convention
  (Material, Feather, Lucide); Heroicons also ships 20 and 16 [verify]. Design
  at `viewBox="0 0 24 24"` with a 1–2px padding margin: keep artwork inside
  the 20×20 or 22×22 live area, letting round shapes overshoot the square
  ones by ~0.5px (optical, not mathematical, equality).
- **One stroke width per set.** 2px at 24 is the Feather/Lucide look; 1.5px
  reads lighter (Heroicons outline) [verify]. `stroke-linecap="round"
  stroke-linejoin="round"` for friendly sets, `butt`/`miter` for technical
  ones. Never mix.
- **Pixel-align straight strokes.** A 2px stroke centered on an integer
  coordinate fills exact pixels; centered on x.5 it blurs at 1× render. Put
  horizontal/vertical stroke centerlines on integers (even stroke widths) or
  halves (odd widths).
- **Optical centering beats geometric.** A triangle (play icon) sits
  visually left unless nudged toward its centroid — shift ~4–6% of the
  glyph's width toward the heavy side. Circles look smaller than squares of
  equal dimension: oversize circles ~4%.
- **Consistent corner radius** across the set (2px at 24 is common). Radius
  communicates voice: 0 = technical, 2 = neutral, 4+ = playful.
- **Currentcolor everything**: `stroke="currentColor"` (outline sets) or
  `fill="currentColor"` (solid sets) so icons inherit text color. No
  hardcoded colors, no embedded styles.
- Test at 16px rendered size — if a detail vanishes or moirés, remove the
  detail, don't thin it.

## Logos

- Must survive: 16px favicon, single-color (one `currentColor` path),
  inverted on dark, and grayscale. Design the monochrome version FIRST;
  color is an enhancement layer.
- One idea per mark. If the concept needs explanation text inside the mark,
  it is a poster, not a logo.
- Convert all text to outlines (`text_to_path`) — a logo must never depend
  on viewer fonts.
- Provide clearspace guidance in the deliverable: conventionally the height
  of a prominent glyph element on all sides.
- Check silhouette: fill everything with one color and squint — the shape
  must still be recognizable.

## Diagrams and flowcharts

- **Layout is a graph problem — do not eyeball it.** For DAGs/flowcharts use
  `ctx.lib.dagre` (Sugiyama-style: ranks, crossing minimization, placement):
  `const g = new lib.dagre.graphlib.Graph(); g.setGraph({rankdir: "TB",
  nodesep: 24, ranksep: 48}); g.setDefaultEdgeLabel(() => ({}));
  g.setNode("a", {width, height}); g.setEdge("a", "b"); lib.dagre.layout(g);`
  then read `g.node(id).x/.y` (centers) and `g.edge(a,b).points` for
  polyline routes. For small diagrams a simple grid with fixed column/row
  pitch also works.
- Spacing constants that read well: node padding 12–16px, sibling gap ≥ 24px,
  rank gap ≥ 48px, lane gutters ≥ 32px. Uniform pitch matters more than the
  exact number.
- **Edges**: orthogonal (HV/VH) or single-bend cubic béziers; never
  straight-line spaghetti through nodes. Arrowheads via `<marker
  orient="auto-start-reverse">` sized ~3× stroke width. Route edges to enter/
  exit node sides, not corners.
- Text in boxes: measure with real metrics (`ctx.text` gives advanceWidth)
  and size boxes to text + padding — never guess widths. Left-align
  multi-line labels; center single-line ones.
- Visual hierarchy: at most 2 font sizes + 1 accent color for emphasis.
  Grays for structure (borders #d0d0d8-ish, fills near-white), color only
  for meaning.
- Keep a legend when shape or color encodes a category.

## Charts (headless d3 + this toolkit)

- Use `lib.scale` for every axis — never hand-map data to pixels. Standard
  margins convention: `{top: 24, right: 24, bottom: 40, left: 56}` around a
  plot area; axes drawn as explicit lines + tick text.
- Ticks: 4–7 per axis, from `scale.ticks()`, formatted short (1.2k not
  1200.00). Gridlines lighter than axis lines (e.g. 1px #00000014).
- Bars: gap 10–30% of band width (`scaleBand().padding(0.2)`). Lines: 2px,
  points only when few. Areas: fill at 10–25% opacity of the line color.
- Color: one hue for single-series; categorical series need distinguishable
  hues at equal lightness (sample OKLCH hue wheel at constant L/C via
  `lib.culori`); sequential data wants a lightness ramp, not a hue ramp.
- Label the data directly when there are ≤6 series ends — legends force
  eye-travel.
- Convert tick/axis text to outlines only for standalone shipping; keep
  <text> while iterating (cheaper to re-render).

## Everything

- Margins are not optional: give any composition breathing room (~5–8% of
  the short side) unless deliberately full-bleed.
- Round exported coordinates to ≤2 decimals; sub-thousandth precision is
  noise that bloats files (see svg-compatibility).
- Group semantically (`<g id="axes">`, `<g id="nodes">`) — the next editor
  (human or agent) navigates by structure.
