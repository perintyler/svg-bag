# The Craft of Authoring Excellent SVG

Reference for an LLM agent generating SVG markup or SVG.js code.
Written 2026-09 from domain knowledge — web sources were unavailable this session.
Claims that need empirical re-verification (exact defaults, renderer support matrices,
2026-era status) are marked **[verify]** inline. Everything else is long-settled
SVG 1.1 / SVG 2 / CSS spec behavior.

---

## 1. Coordinate systems

### 1.1 viewBox and sizing

- Always emit `viewBox="minX minY width height"`. It defines the user coordinate
  system; without it the SVG cannot scale.
- The four sizing combinations:
  - **viewBox + width/height**: intrinsic size = width/height; user units map at
    scale = width_attr / viewBox_width. The normal choice for a deliverable file.
  - **viewBox only**: no intrinsic size; scales to fill its CSS/container context
    (in `<img>` the intrinsic aspect ratio comes from the viewBox; height defaults
    per replaced-element rules). The normal choice for responsive inline SVG.
  - **width/height only**: fixed canvas, user units = CSS px, no scaling — avoid.
  - **neither**: 300×150 default replaced-element size [verify exact fallback per context].
- Scale factor: `sx = viewportWidth / viewBoxWidth`, `sy = viewportHeight / viewBoxHeight`;
  preserveAspectRatio reconciles sx ≠ sy.
- `minX/minY` translate the content: `viewBox="-50 -50 100 100"` puts (0,0) at center —
  extremely useful for radial art (clocks, spinners, polar charts).
- Negative width/height in viewBox is an error (disables rendering); width or height
  of 0 disables rendering of the element entirely.

### 1.2 preserveAspectRatio

- Grammar: `<align> <meetOrSlice>?`. Default: **`xMidYMid meet`**.
- Align values: `none`, and the 3×3 grid `x{Min,Mid,Max}Y{Min,Mid,Max}` (case exactly
  as written: lowercase x, uppercase Y).
- `meet` = contain (letterbox: whole viewBox visible, possible empty space);
  `slice` = cover (viewport filled, viewBox content cropped).
- `none` = non-uniform stretch to exactly fill; the only align that distorts. Use it
  deliberately for stretchable decorative dividers/waves; never for icons or text.
- Applies to: root `<svg>`, nested `<svg>`, `<symbol>` (used via `<use>`), `<image>`
  (fitting the raster into its x/y/width/height box), `<marker>`, `<pattern>` (with
  viewBox), and `<feImage>` [verify feImage].
- Computation (spec): scale = meet ? min(sx,sy) : max(sx,sy); then translate so the
  chosen alignment point of the viewBox maps to the same point of the viewport
  (Min→0, Mid→half the leftover, Max→all the leftover).
- Gotcha: preserveAspectRatio does nothing unless there is a viewBox.

### 1.3 Transforms

- Attribute functions: `translate(tx [ty=0])`, `scale(sx [sy=sx])`, `rotate(a [cx cy])`,
  `skewX(a)`, `skewY(a)`, `matrix(a b c d e f)` = [[a c e][b d f][0 0 1]].
- **Order semantics**: a transform list `A B C` post-multiplies: the point is
  transformed by C first, then B, then A ("right-to-left application"). Equivalent
  mental model reading left-to-right: each function creates a new nested coordinate
  system in which the subsequent functions (and the content) operate.
- Therefore `rotate(45) translate(10,0)` moves along the rotated x-axis (ends at
  (7.07, 7.07)), while `translate(10,0) rotate(45)` moves in screen axes then spins
  in place at (10,0).
- `rotate(a cx cy)` ≡ `translate(cx cy) rotate(a) translate(-cx -cy)`. Angles are
  degrees. Positive rotation is clockwise on screen (y-down coordinate system).
- Attribute transforms are unitless (user units, degrees). Nested elements compose:
  child CTM = parent CTM × child transform.
- To rotate a shape about its own center with the attribute: use
  `rotate(a cx cy)` with the shape's center — the attribute has no transform-origin.

### 1.4 CSS transforms on SVG elements

- CSS `transform` requires units: `rotate(45deg)`, `translate(10px, 0)`. Unitless is
  invalid (except 0).
- **transform-origin**: the SVG attribute effectively rotates about the user-space
  origin (0,0); CSS transform-origin defaults to `50% 50%` — but resolved against
  the **reference box**, which for SVG defaults to `view-box` (the nearest viewport)
  [verify default: CSS Transforms says view-box for SVG without CSS layout box].
  So a naive CSS `rotate(45deg)` spins the shape around the viewBox center, not its
  own center.
- **The fix, always**: `transform-box: fill-box; transform-origin: center;` on the
  element you rotate/scale with CSS. `fill-box` = the element's own geometry bbox.
  Other values: `stroke-box`, `view-box`, `content-box`, `border-box`.
- Individual properties `translate`, `rotate`, `scale` work on SVG elements in all
  modern browsers and compose in the fixed order translate→rotate→scale [verify order].
- A CSS `transform` overrides the `transform` attribute (the attribute is a
  presentation hint at lowest specificity).

### 1.5 Units and percentages

- Unitless numbers = user units. In a viewBox-scaled SVG, "px" ≡ user unit.
- Absolute units assume 96 dpi: 1in = 96 user units, 1mm ≈ 3.7795, 1pt = 96/72 ≈ 1.333.
- Percentages resolve against the viewport: width-like → viewport width, height-like →
  viewport height, "other" lengths (r, stroke-width, dasharray) → the normalized
  diagonal `sqrt(w² + h²) / sqrt(2)`.
- Rule: write unitless user units everywhere inside the SVG. Reserve units/percentages
  for the root element's width/height.

### 1.6 userSpaceOnUse vs objectBoundingBox

Attributes taking a *Units value, with defaults:

| Attribute | Default |
|---|---|
| gradientUnits | objectBoundingBox |
| patternUnits | objectBoundingBox |
| patternContentUnits | **userSpaceOnUse** |
| clipPathUnits | **userSpaceOnUse** |
| maskUnits | objectBoundingBox |
| maskContentUnits | **userSpaceOnUse** |
| filterUnits | objectBoundingBox |
| primitiveUnits | **userSpaceOnUse** |
| markerUnits (strokeWidth/userSpaceOnUse) | strokeWidth |

Memorize the asymmetries: region units default to bbox, content units default to user
space (patterns, masks, filters).

- objectBoundingBox coordinates are **fractions 0..1** of the referencing element's
  bbox (percentages also map onto 0..1). `r="50"` in bbox units is 50× the box.
- The bounding box is the **geometry only**: no stroke, no markers, no filter output,
  no clip. (SVG 2 defines separate fill/stroke/decorated bboxes, but *Units uses the
  fill/geometry box.)
- **Degenerate bbox**: a perfectly horizontal or vertical `<line>`/path has zero
  height or width → objectBoundingBox paint servers do not render at all. A gradient
  stroke on an axis-aligned line silently disappears. Fix: `gradientUnits="userSpaceOnUse"`
  with explicit coordinates.
- Because bboxes are generally non-square, bbox units are non-uniformly scaled:
  a bbox-units circle renders as an ellipse; a 45° bbox gradient is not at 45° on
  screen. Fix with userSpaceOnUse or a compensating gradientTransform.

### 1.7 Nested `<svg>` and `<symbol>`

- A nested `<svg x y width height viewBox preserveAspectRatio>` establishes a new
  viewport + coordinate system — a scalable sub-canvas. Unlike `<g>`, it can rescale
  its content region independently. Use it to place independently-designed components
  on a canvas without recomputing their coordinates.
- Nested svg does not accept `transform` in SVG 1.1 (SVG 2 allows it [verify support]);
  wrap in `<g transform>` when needed.
- `<symbol>` also establishes a viewport (viewBox + preserveAspectRatio) but never
  renders directly — only via `<use>`. SVG 2 adds x/y/width/height and refX/refY on
  symbol [verify refX/refY browser support].
- `overflow` default is `hidden` for elements that establish viewports (root svg,
  nested svg, symbol, image, marker, pattern). Set `overflow="visible"` to let
  content escape (common on nested svg and markers).

### 1.8 DOM coordinate APIs (for SVG.js-style code)

- `el.getBBox()` — geometry bbox in local user space (no stroke/filter/transform).
- `el.getBoundingClientRect()` — screen-space axis-aligned box including transforms.
- `el.getScreenCTM()` / `getCTM()` — matrices mapping local user space to screen /
  to the nearest viewport.
- Convert pointer→SVG coords: `new DOMPoint(evt.clientX, evt.clientY).matrixTransform(svg.getScreenCTM().inverse())`.

---

## 2. Paths (`d`)

### 2.1 Command vocabulary

Uppercase = absolute; lowercase = relative to current point (CP).

| Cmd | Params | Notes |
|---|---|---|
| M/m | x y | starts subpath, sets subpath start point |
| L/l | x y | line |
| H/h | x | horizontal; keeps y |
| V/v | y | vertical; keeps x |
| C/c | x1 y1 x2 y2 x y | cubic |
| S/s | x2 y2 x y | smooth cubic |
| Q/q | x1 y1 x y | quadratic |
| T/t | x y | smooth quadratic |
| A/a | rx ry rot laf sf x y | elliptical arc |
| Z/z | — | close; CP → subpath start |

- `d` must start with M/m.
- **Implicit repeats**: extra parameter sets repeat the command letter, EXCEPT after
  M/m where repeats become L/l (same case). `M 10 10 20 20` = `M 10 10 L 20 20`.
- After `Z`, a relative `m` is relative to the subpath start point Z restored.
- Grammar: separators are whitespace and/or one comma; a minus sign or a decimal
  point (when the integer part is present) can serve as separator: `l10-20`,
  `0.5.5` = `0.5 .5`. Leading zeros optional (`.5`, `-.5`). Arc flags are single
  chars and can be packed (`a5 5 0 015 5`) — never emit packed flags.
- On a parse error, renderers draw the path up to the bad segment — don't rely on it.

### 2.2 Arcs

`A rx ry x-axis-rotation large-arc-flag sweep-flag x y` — endpoint parameterization.

- **sweep-flag=1**: positive-angle direction = clockwise on screen (y-down).
  **sweep-flag=0**: counter-clockwise.
- **large-arc-flag=1**: take the arc ≥ 180°; **0**: the arc ≤ 180°.
- The four combinations: `0 0` and `1 1` are the two arcs of one candidate ellipse;
  `0 1` and `1 0` the two arcs of the other. Flipping sweep alone mirrors the bulge
  across the chord.
- Out-of-range handling (normative, silent):
  - identical start/end points → **arc omitted entirely** (hence: no full circle
    from one A command);
  - rx=0 or ry=0 → straight line;
  - negative radii → absolute value;
  - radii too small (Λ = x₁′²/rx² + y₁′²/ry² > 1) → both radii scaled by √Λ.
    A "mystery semicircle" means your radii were silently scaled up.
- x-axis-rotation is degrees; only matters when rx ≠ ry; write 0 for circular arcs.
- **Full circle** (center cx,cy, r): two half arcs —
  `M cx-r,cy a r,r 0 1 0 2r,0 a r,r 0 1 0 -2r,0 Z`
- **Donut slice** (outer R, inner r, angles a0→a1, sweep 1 outer):
  outer arc sweep 1, line in, inner arc **sweep 0** (traversed backwards), Z.
- **Rounded rect by hand** (x,y,w,h,r, clockwise): all four corners `A r,r 0 0 1 …`:
  `M x+r,y H x+w-r A r,r 0 0 1 x+w,y+r V y+h-r A r,r 0 0 1 x+w-r,y+h H x+r A r,r 0 0 1 x,y+h-r V y+r A r,r 0 0 1 x+r,y Z`
- NaN guard: when converting endpoint→center parameterization, clamp the radicand
  at 0 (floating error makes it slightly negative). One NaN in `d` typically kills
  the whole path.

### 2.3 Curves and shorthands

- `S`: first control point = reflection of previous C/S second control point about
  CP (`P1 = 2·CP − P2_prev`). If the previous command is NOT C/c/S/s, P1 = CP —
  a silent corner. **Only chain S after C/S.**
- `T`: control point = reflection of previous Q/T control point. If previous is not
  Q/q/T/t, control = CP → `T` degenerates to a straight line. **Only chain T after Q/T.**
- The families don't cross-reflect (S after Q uses CP).
- S/T produce exactly C1 joins (collinear + equal handle length). For G1 with unequal
  handles, write full C with collinear control points.

### 2.4 Bézier craft

- **Kappa = 0.5522847498307933** = (4/3)·tan(π/8) = (4/3)(√2−1). Circle from four
  cubics, center (0,0), r, k=κr:
  `M 0,-r C k,-r r,-k r,0 C r,k k,r 0,r C -k,r -r,k -r,0 C -r,-k -k,-r 0,-r Z`
  Max radial error ≈ 2.7×10⁻⁴·r (invisible). Keep cubic arc segments ≤ 90°.
- General arc sweep θ: control distance **k = (4/3)·tan(θ/4)·r** along the tangents.
- **Quadratic → cubic (exact)**: C1 = P0 + (2/3)(Q−P0); C2 = P2 + (2/3)(Q−P2).
- **Cubic → quadratic is lossy** (t³ term); split at inflection points, then
  recursively subdivide until the third-difference error bound is under tolerance.
- Continuity: G1 = control points collinear across the anchor (opposite sides);
  C1 = collinear + equal distances. G1 suffices visually; C1 matters for motion
  along the path (speed continuity).
- Closed smooth shapes: the seam needs manual care — last segment's outgoing handle
  must be the reflection of the first segment's first handle about the start anchor
  (`c_last = 2·A0 − c_first`); S won't do it across Z.
- **Smooth polyline through points (Catmull-Rom → Bézier)**, per segment P1→P2 with
  neighbors P0, P3 and tension τ (τ=1 classic):
  B1 = P1 + (P2−P0)·τ/6, B2 = P2 − (P3−P1)·τ/6. Endpoints: reflect (P0 = 2P1−P2) or
  duplicate. Use centripetal parameterization for unevenly spaced points to avoid loops.
- de Casteljau split at t: A=lerp(P0,P1,t), B=lerp(P1,P2,t), C=lerp(P2,P3,t),
  D=lerp(A,B,t), E=lerp(B,C,t), F=lerp(D,E,t). Left: P0,A,D,F; right: F,E,C,P3.
  Tangent at t is E−D.

### 2.5 fill-rule and holes

- `nonzero` (default): signed winding count via ray; inside if ≠ 0. Holes require
  the inner contour to wind **opposite** the outer.
- `evenodd`: crossing parity; direction irrelevant; any nested contour punches a hole.
- Pentagram of 5 lines: nonzero → solid star; evenodd → star with pentagonal hole.
- Programmatic output you control → use nonzero with correct winding (matches fonts
  and boolean libraries). Unknown-winding input → evenodd.
- Inside `<clipPath>`, use **clip-rule** (on the children), not fill-rule.

### 2.6 Subpaths, Z, and direction

- Fill implicitly closes open subpaths; stroke does not.
- **Always Z a closed shape you stroke**: without Z the seam gets two linecaps
  (a notch at butt, a blob at round) instead of one proper linejoin.
- Dash patterns restart at every subpath; a closed subpath's pattern wraps (choose
  period dividing path length to hide the seam).
- Path direction controls: marker orientation (`orient="auto"` follows travel
  direction), textPath reading direction (reverse path → upside-down text),
  dash phase/draw-on direction, animateMotion/offset-path travel, getPointAtLength.

---

## 3. Reuse & structure

### 3.1 defs / use / symbol

- Put referenced-only content (`gradient`, `clipPath`, `mask`, `filter`, `marker`,
  `pattern`, `symbol`, reusable shapes) in `<defs>`. Not required, but keeps
  non-rendered content out of the render tree.
- `<use href="#id" x y width height>` clones the target into a closed shadow tree.
  x/y act as an extra translate. **width/height only have effect when the target is
  `<svg>` or `<symbol>`** (they set the viewport that the symbol's viewBox scales into).
- Styling through the shadow boundary:
  - **Inherited properties** (fill, stroke, color, font-*, etc.) set on `<use>` or
    its ancestors flow into the clone — but only where the cloned content doesn't
    set its own value. A hardcoded `fill="#333"` in the symbol wins over anything on `<use>`.
  - Outer-document CSS selectors do NOT match inside the shadow tree [verify per-browser].
  - **CSS custom properties DO inherit through**, in all modern browsers. This is
    the mechanism for multi-color themable icons:
    symbol content uses `fill="var(--icon-accent, #c00)"`; page sets `--icon-accent`.
  - `currentColor` inherits through: author symbol content with
    `fill="currentColor"`, control it via CSS `color` on the `<use>`/parent.
  - Rule for reusable icons: **do not hardcode paint** in symbol content; use
    currentColor and/or custom properties with fallbacks.
- `<symbol>` beats `<g>` for sprites because: it doesn't render at its definition
  site, it has its own viewBox/preserveAspectRatio (scalable independent of the
  consumer), and `<use width height>` works on it.
- External sprite refs `<use href="icons.svg#gear">` work in browsers (CORS-bound;
  no cross-origin without CORS headers), fail inside `<img>` and in most
  non-browser renderers [verify]. Same-document sprites are the safe default.
- **ID collisions**: inlining multiple SVGs with `id="a"` gradients makes the first
  definition win for everyone (or clash outright). Namespace every id
  (`chart1-grad-blue`), especially in generated output.

### 3.2 Gradients

- `<linearGradient x1 y1 x2 y2>` defaults 0%,0%,100%,0% (left→right).
  `<radialGradient cx cy r fx fy fr>` defaults 50%,50%,50%; fx/fy default to cx/cy;
  fr (SVG 2) defaults 0%.
- gradientUnits default objectBoundingBox → the gradient stretches with the bbox
  (non-uniform skew on non-square shapes; diagonal gradients are not at the angle
  you wrote). userSpaceOnUse for: multi-shape shared gradients, axis-aligned lines
  (degenerate bbox!), precise angles.
- To rotate a bbox gradient without skew: keep it axis-aligned and use
  `gradientTransform="rotate(a 0.5 0.5)"` (bbox units' center).
- `spreadMethod`: pad (default) | reflect | repeat — only visible when the gradient
  vector doesn't span the whole shape. Repeating stripes:
  `<linearGradient x1="0" y1="0" x2="8" y2="8" gradientUnits="userSpaceOnUse" spreadMethod="repeat">`.
- `<stop offset stop-color stop-opacity>`: offsets clamp to [0,1] and must be
  non-decreasing (violations clamp up). **Hard band**: two stops at the same offset
  with different colors.
- **href inheritance** (`href`/`xlink:href` to another gradient): inherits the
  referenced gradient's stops (only if the referrer has none) and any attributes the
  referrer doesn't set. Pattern: define stops once, re-orient many:
  `<linearGradient id="base"><stop.../></linearGradient>`
  `<linearGradient id="v" href="#base" x2="0" y2="1"/>`
- Focal point (fx/fy) off-center gives a "light source" look; SVG 1.1 clamps focal
  points to the circle edge, SVG 2 allows outside [verify]. fr > 0 makes annular gradients.
- **Mesh gradients are dead for the web**: `<meshgradient>` was dropped from the
  SVG 2 CR into a never-shipped module; no browser implements it [verify 2026].
  Inkscape can author them but exports polyfills. Fake soft multi-point color with:
  overlapping radial gradients + blur, or feTurbulence/feColorMatrix textures.
- Gradients apply to stroke (`stroke="url(#g)"`) and text fill; remember the
  degenerate-bbox trap for straight lines.

### 3.3 Patterns

- `<pattern x y width height>` defines the tile. patternUnits default
  **objectBoundingBox** (width=".25" = quarter of bbox); patternContentUnits default
  **userSpaceOnUse** — the asymmetry gotcha. Most hand-authored patterns want
  `patternUnits="userSpaceOnUse"` with absolute tile size.
- A `viewBox` on the pattern overrides patternContentUnits and scales tile content
  into the tile box.
- `patternTransform="rotate(45)"` rotates the tiling — the standard way to get
  diagonal hatching from a horizontal-stripe tile.
- Tile seams: renderers may show hairline gaps between tiles (AA). Mitigate with
  integer tile sizes, overdraw (draw content slightly beyond the tile edge), or
  `shape-rendering="crispEdges"` on pattern content.
- Recipes (all `patternUnits="userSpaceOnUse"`):
  - dots: `width="10" height="10"` + `<circle cx="5" cy="5" r="1.5"/>`
  - hatch: `width="6" height="6"` + `<path d="M0 6 L6 0" stroke-width="1"/>` — or
    horizontal line + patternTransform="rotate(45)"
  - checkerboard: 20×20 tile, two 10×10 rects at (0,0) and (10,10)
  - grid: `<path d="M w 0 H 0 V h" fill="none" stroke>` on a w×h tile.

### 3.4 Markers

- `<marker markerWidth markerHeight refX refY viewBox orient markerUnits>`.
  refX/refY = the point in marker (viewBox) coordinates placed on the vertex.
- Default `markerUnits="strokeWidth"` scales the marker with stroke-width (usually
  desirable for arrows); `userSpaceOnUse` for fixed-size markers.
- `orient="auto"` rotates to path direction (bisector at mid vertices);
  **`orient="auto-start-reverse"`** (SVG 2) flips the start marker 180° so a single
  arrowhead def serves both ends. Supported in all modern browsers [verify non-browser].
- marker-start/mid/end are properties (and presentation attributes) on path, line,
  polyline, polygon only. Mid markers land on every interior vertex (including those
  created by Z).
- Markers do not inherit path paint. SVG 2 `fill="context-stroke"` /
  `context-fill` make markers match their host's stroke/fill — works in browsers
  [verify], not in most rasterizers; fallback: currentColor or hardcode.
- Markers are clipped to their viewport by default — set `overflow="visible"` on
  the marker if content exceeds the markerWidth/Height box.
- Arrowhead recipe:
  ```xml
  <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5"
          markerWidth="7" markerHeight="7" orient="auto-start-reverse">
    <path d="M0 0 L10 5 L0 10 z" fill="context-stroke"/>
  </marker>
  <path d="..." stroke="#345" stroke-width="2" fill="none"
        marker-end="url(#arrow)"/>
  ```
  refX near the tip (9 of 10) keeps the line from poking past the arrow point;
  pull it back slightly (refX="8") so the line end hides inside the head.

### 3.5 paint-order and opacity

- `paint-order: normal | [fill || stroke || markers]`. Default paints fill, then
  stroke, then markers. **`paint-order="stroke"`** paints stroke first → the fill
  covers the inner half of the stroke. THE technique for text halos/outlines:
  ```xml
  <text paint-order="stroke" stroke="#fff" stroke-width="4"
        stroke-linejoin="round" fill="#111">Label</text>
  ```
  Widely supported in browsers; librsvg/resvg support it [verify].
- `opacity` on a group is post-composite (the group is rendered, then faded as one):
  overlapping children do NOT double-darken. `fill-opacity`/`stroke-opacity` are
  per-paint and overlaps show. Choose deliberately; group opacity creates an
  isolation/stacking context and an offscreen buffer.
- `currentColor` is usable in fill, stroke, stop-color, flood-color, lighting-color —
  a one-variable theming channel controlled by CSS `color`.

---

## 4. Paint precision: strokes

- Stroke is **centered** on the geometry: half inside, half outside. A stroke-width 4
  rect at the viewBox edge loses 2 units to clipping. Fix: inset geometry by sw/2
  (`x="2" width="96"` for sw=4 in a 100-wide viewBox) or expand the viewBox.
- `getBBox()` ignores stroke; visual extent = geometry + sw/2 (+ miter spikes).
- **linecap**: butt (default; zero added length) | round | square (each adds sw/2
  per end). Use butt when length encodes data (progress bars). Round/square caps on
  a zero-length subpath paint a dot (SVG 2); prefer `<circle>` for dots.
  Dot-dash trick: `stroke-dasharray="0 12" stroke-linecap="round"`.
  Round caps lengthen every dash by sw: for a visually even 10/10 pattern at sw=4
  write `stroke-dasharray="6 14"`.
- **linejoin**: miter (default) | round | bevel | miter-clip (SVG 2, partial support
  [verify]) | arcs (unimplemented [verify]). `stroke-miterlimit` default **4**;
  bevels when miterLength/sw = 1/sin(θ/2) > limit. Limit 4 → cutoff ≈ 29°;
  limit 10 → ≈ 11.5°; √2 → 90°. Sharp arrow/star tips need miterlimit≈10 or
  linejoin="round".
- **dasharray**: odd-count lists double (`"5 3 2"` → period 20); one negative value
  invalidates the whole list (renders solid); percentages resolve against the
  normalized viewport diagonal; dashes restart per subpath.
- **dashoffset**: positive shifts the pattern backward toward the path start;
  negative allowed.
- **Line-draw animation**: JS — L = getTotalLength(); dasharray = L; dashoffset = L → 0.
  No-JS — set `pathLength="1"` (or 100) on the path, then:
  ```css
  path { stroke-dasharray: 1; stroke-dashoffset: 1;
         animation: draw 2s ease forwards; }
  @keyframes draw { to { stroke-dashoffset: 0; } }
  @media (prefers-reduced-motion: reduce) {
    path { animation: none; stroke-dashoffset: 0; } }
  ```
  Reduced-motion state must be the FINISHED drawing, never the invisible one.
- **pathLength** rescales every along-path computation (dasharray, dashoffset,
  textPath startOffset). `pathLength="100"` makes dash values read as percentages;
  on a circle, `pathLength="60" stroke-dasharray="1 1"` = exactly 30 seam-free dashes.
  Don't mix getTotalLength() JS with pathLength on the same element [verify DOM interaction].
- **vector-effect="non-scaling-stroke"**: stroke width constant in screen px under
  any viewBox scale/transform/zoom. Use for maps, hairline gridlines, selection
  outlines, and content inside `scale()` groups. The other vector-effect values
  (non-scaling-size, non-rotation, fixed-position) are effectively unimplemented [verify].
- **Stroke alignment does not exist** (`stroke-align` was deferred from SVG 2
  [verify 2026 status]). Workarounds:
  1. Inner stroke: double the width + `clip-path` to the shape itself
     (`<clipPath><use href="#shape"/></clipPath>`); inner w ⇒ stroke-width 2w.
  2. Outer stroke: double width + mask that blacks out the shape interior; or
     evenodd clip of a big rect minus the shape.
  3. Text outer stroke: `paint-order="stroke"` + doubled width.
  4. Precise/permanent: bake a real offset path at build time.
  5. Rough glow: feMorphology dilate (rectangular kernel — corners square off).
- Non-uniform `scale()` distorts stroke width (thick/thin around a circle). Either
  bake the scale into coordinates or use non-scaling-stroke.

---

## 5. Masks & clips

- **clip-path = binary stencil**: geometry only. fill/opacity/stroke/filter on clip
  children are IGNORED; no soft edges possible. **mask = per-pixel alpha/luminance**:
  gradients, blurs, images all work.
- `<clipPath>` children: shapes, `<text>`, `<use>` of shapes; **no `<g>`** (SVG 1.1;
  wrapping children in a group silently empties the clip) [verify SVG2 relaxation].
  Multiple children union. `clip-rule` (not fill-rule) on children for evenodd holes.
  A clip-path attribute ON the clipPath element intersects.
- clipPathUnits default userSpaceOnUse; objectBoundingBox variant takes 0..1
  fractions (a full-cover circle is `cx=.5 cy=.5 r=.5`) and non-uniformly scales
  (circle → ellipse on non-square elements).
- CSS `clip-path: circle(40% at 50% 50%) | inset(10% round 8px) | polygon(...) |
  path("...")` works on HTML and SVG. On SVG elements the default reference box is
  fill-box [verify], so percentages resolve against the element's own bbox — state
  the box explicitly (`view-box`) when you mean the viewport. Basic shapes
  interpolate → animatable morphs (equal polygon vertex counts).
- Clipped-away regions receive NO pointer events (unlike opacity:0) — clip a
  transparent rect to define irregular hit areas.
- `<mask>`: maskUnits default objectBoundingBox with region default
  **x/y/width/height = -10%/-10%/120%/120%** — content beyond 120% of the bbox is
  silently cut (the #1 mask bug). maskContentUnits default userSpaceOnUse.
  When in doubt: `maskUnits="userSpaceOnUse"` + explicit generous region.
- **Luminance by default**: maskValue = luminance × alpha; white shows, black hides,
  colors count at Rec.709 linear weights 0.2125/0.7154/0.0721 (red ≈ 21% opaque!).
  Uncovered area = hidden ⇒ **start with `<rect width="100%" height="100%"
  fill="#fff"/>`**, then punch holes in black.
- **Prefer alpha over grey**: greys are subject to the sRGB-vs-linearRGB luminance
  ambiguity across renderers [verify current browsers]. Encode partial transparency
  as `stop-opacity`/`fill-opacity` on white, or set `mask-type="alpha"` on the mask
  (widely supported [verify 2026]).
- Fade-out recipe: mask containing a white rect filled with a linearGradient
  white/opacity-1 → white/opacity-0.
- Performance: masks force offscreen buffers; clip-path (especially CSS basic
  shapes) is much cheaper. Hard edge ⇒ clip. Animate transforms, not mask content.
- CSS mask on HTML: `mask-image: url(#svgMask)` uses the mask's mask-type
  (luminance default); raster/gradient mask-images default to ALPHA. Add
  `mask-repeat: no-repeat`; the `mask` shorthand resets mask-mode — shorthand
  first, longhands after.

---

## 6. Filters

### 6.1 Model and plumbing

- `<filter>` on the painted element via `filter="url(#f)"` (attribute) or CSS
  `filter: url(#f)`. Inputs: `SourceGraphic`, `SourceAlpha`; `BackgroundImage`/
  `BackgroundAlpha`/`FillPaint`/`StrokePaint` are dead — removed in Filter Effects 1,
  never reliably implemented [verify].
- Implicit chaining: first primitive with no `in` gets SourceGraphic; any later
  primitive with no `in` gets the previous primitive's result. Name intermediates
  with `result="x"` and wire explicitly (`in="x" in2="y"`) in anything non-trivial.
- **Filter region default: x/y/width/height = -10% / -10% / 120% / 120%** of the
  bbox (filterUnits=objectBoundingBox). Large blurs/shadows/glows get CLIPPED at
  that box — the flat-edge blur bug. Fix: widen, e.g.
  `x="-50%" y="-50%" width="200%" height="200%"` (scale with stdDeviation; a blur
  extends ~3×stdDeviation).
- primitiveUnits default userSpaceOnUse: stdDeviation/dx/dy/radius are user units.
  Filter output is device-pixel raster: results scale with rendering resolution but
  the parameters are in user space.

### 6.2 color-interpolation-filters — the #1 cross-renderer difference

- Spec default is **linearRGB**: primitives operate after sRGB→linear conversion.
  Browsers honor this; many tutorials and some rasterizers assume sRGB, so colors
  (especially blur halos, gradients through filters, feColorMatrix results) differ
  visibly between renderers.
- **Rule: always set `color-interpolation-filters="sRGB"` on every `<filter>`** you
  author, unless you specifically want physically-linear blending (lighting).
  It makes hand-computed matrix/transfer values behave in the color space you
  think in, and maximizes cross-renderer agreement.

### 6.3 Primitive toolkit (the useful subset)

- **feGaussianBlur** `stdDeviation="s"` or `"sx sy"`; edgeMode. Blur radius ≈ 3s.
- **feOffset** `dx dy`.
- **feFlood** `flood-color flood-opacity` — fills the (sub)region with a color.
- **feMerge**/`feMergeNode` — stack layers bottom→top. `feMergeNode in="SourceGraphic"`
  last puts the original on top.
- **feComposite** `operator="over|in|out|atop|xor|arithmetic"`; `in` = keep in2's
  silhouette of in ("clip to alpha"); `out` = subtract; `arithmetic` with k1..k4:
  result = k1·i1·i2 + k2·i1 + k3·i2 + k4 (k2=k3=1 → additive; used in gooey).
- **feColorMatrix**:
  - `type="matrix"` values = 20 numbers, 4 rows (R',G',B',A'), 5 cols (R,G,B,A,1):
    each output channel = dot(row, [R G B A 1]).
    Alpha-only tint: `0 0 0 0 cr / 0 0 0 0 cg / 0 0 0 0 cb / 0 0 0 a 0`.
    Grayscale (luma into all channels):
    `0.2126 0.7152 0.0722 0 0` ×3 rows, alpha row `0 0 0 1 0`.
    Alpha contrast (gooey): last row `0 0 0 18 -7` (steepen alpha ramp).
  - `type="saturate"` values="0..1"; `type="hueRotate"` values="deg";
    `type="luminanceToAlpha"`.
- **feComponentTransfer** + feFuncR/G/B/A, type=table (tableValues remap),
  discrete (posterize), linear (slope/intercept), gamma (amplitude/exponent/offset).
  Duotone: type="table" per channel mapping [0,1] → [shadowColor, highlightColor].
- **feMorphology** operator="erode|dilate" radius — grows/shrinks alpha with a
  rectangular kernel (squared corners).
- **feTurbulence** `type="fractalNoise|turbulence"` baseFrequency (per-axis pair
  allowed) numOctaves seed stitchTiles. fractalNoise = smooth clouds;
  turbulence = sinewy/marbled.
- **feDisplacementMap** `in in2 scale xChannelSelector yChannelSelector` — shifts
  in's pixels by in2's channel values; the organic-distortion workhorse.
- **feDropShadow** `dx dy stdDeviation flood-color flood-opacity` — one-primitive
  shadow; supported in browsers, spotty in old rasterizers [verify].
- **feImage**, **feTile**, **feBlend** (mode=multiply/screen/overlay/darken/lighten…),
  lighting primitives (feDiffuse/feSpecularLighting + feDistantLight/fePointLight/
  feSpotLight) — lighting is the least portable [verify support].

### 6.4 Recipes (all with color-interpolation-filters="sRGB")

- **Drop shadow** (manual, portable):
  ```xml
  <filter id="ds" x="-30%" y="-30%" width="160%" height="160%">
    <feGaussianBlur in="SourceAlpha" stdDeviation="3" result="b"/>
    <feOffset in="b" dx="2" dy="4" result="o"/>
    <feFlood flood-color="#000" flood-opacity=".35"/>
    <feComposite in2="o" operator="in" result="sh"/>
    <feMerge><feMergeNode in="sh"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
  ```
  Or just `<feDropShadow dx="2" dy="4" stdDeviation="3" flood-opacity=".35"/>`.
- **Glow**: same as shadow, no offset, brighter flood, optionally feMorphology
  dilate 1-2 before the blur; merge under source.
- **Gooey/metaball** (apply to the GROUP of blobs):
  ```xml
  <filter id="goo">
    <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur"/>
    <feColorMatrix in="blur" mode="matrix"
      values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" result="goo"/>
    <feComposite in="SourceGraphic" in2="goo" operator="atop"/>
  </filter>
  ```
- **Paper grain**: feTurbulence fractalNoise baseFrequency≈0.9 numOctaves=4 →
  feColorMatrix to low-opacity alpha → feComposite/feBlend multiply over source.
  Film grain: baseFrequency 0.6–1, monochrome via luminanceToAlpha.
- **Rough/watercolor edges**:
  ```xml
  <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="3" result="n"/>
  <feDisplacementMap in="SourceGraphic" in2="n" scale="8"
                     xChannelSelector="R" yChannelSelector="G"/>
  ```
  scale 4–6 subtle wobble; 10–20 hand-drawn; add slight blur+alpha-contract for
  watercolor pooling.
- **Posterize**: feComponentTransfer with feFuncR/G/B type="discrete"
  tableValues="0 .33 .66 1".
- Performance: filter cost ∝ filtered pixel area × primitives; blur is separable
  but big stdDeviation on big regions janks. Never animate filter parameters on
  large areas; pre-render to raster if static.

---

## 7. Text

- No automatic wrapping. SVG 2 inline-size/shape-inside never shipped in browsers
  [verify 2026]. Lay out lines yourself:
  ```xml
  <text x="20" y="40" font-size="16">
    <tspan x="20" dy="0">Line one</tspan>
    <tspan x="20" dy="1.4em">Line two</tspan>
  </text>
  ```
  (Reset x per line; dy is relative to the previous glyph position.)
- x/y position the first glyph's anchor point (alphabetic baseline start), not a
  box corner. Multiple values (`x="0 12 24"`) place characters individually;
  `rotate` on text/tspan rotates per character.
- `text-anchor: start|middle|end` — horizontal anchoring around x (respects
  direction/RTL: start ≠ left in RTL).
- **Vertical centering**: `dominant-baseline="central"` is geometric-center (what
  you want); `"middle"` is x-height-based (slightly different). Support in browsers
  is good but **dominant-baseline is one of the most commonly broken properties in
  non-browser renderers** [verify resvg/librsvg]. Portable fallback: keep alphabetic
  baseline and nudge with `dy="0.35em"` (≈ optical center for most Latin fonts;
  0.32em–0.36em depending on font).
- text-before-edge/text-after-edge: inconsistently implemented — avoid.
- `textLength` + `lengthAdjust="spacing"` pins rendered width — insurance when the
  viewer's font metrics differ from yours (fallback fonts). `spacingAndGlyphs`
  distorts glyphs; avoid except for deliberate effects.
- **textPath**:
  ```xml
  <defs><path id="arc" d="M 20,100 A 80,80 0 0 1 180,100"/></defs>
  <text font-size="14"><textPath href="#arc" startOffset="50%"
    text-anchor="middle">CURVED LABEL</textPath></text>
  ```
  Text past the path end is not rendered. Reading direction = path direction:
  text on the bottom of a circle needs a left-to-right-under arc (sweep 0) or it
  renders upside down. `side="right"` (SVG 2) flips sides without re-authoring
  [verify support — historically Firefox-only]. pathLength rescales startOffset.
- **Fonts — the portability problem.** Outside your page (file, <img>, rasterizer,
  design tool) your webfonts don't exist. Options:
  1. **System font stack** (`font-family="system-ui, -apple-system, 'Segoe UI',
     Roboto, sans-serif"`) — metrics vary; pair with textLength for critical layout.
  2. **Convert text to paths** — 100% portable rendering; kerning/ligatures are
     baked at conversion (what you saw is what ships); loses
     selection/search/a11y (add aria-label/<title>) and bloats the file.
     The pragmatic choice for logos and display text in files that must render
     identically everywhere.
  3. **Embed the font**: `<style>@font-face { font-family: X; src:
     url(data:font/woff2;base64,...) }</style>` inside the SVG. Works inline and —
     because data: URIs are not external — inside `<img>` in browsers [verify
     per-browser]. Rasterizers mostly ignore it (librsvg: no; resvg: no [verify]).
     Subset the font (only used glyphs, WOFF2) or the file balloons.
  4. External @font-face URLs: blocked in `<img>` context — never rely on them.
  5. SVG fonts (`<font>/<glyph>`): removed from browsers years ago. Dead.
- **Whitespace collapses** (consecutive spaces/newlines → one space) — pretty-printed
  text content renders with single spaces; xml:space="preserve" is deprecated;
  use `white-space` CSS [verify] or explicit tspans.
- Stroked text: use `paint-order="stroke"` so the outline sits under the fill;
  `stroke-linejoin="round"` to protect serif points.

---

## 8. Animation

### 8.1 SMIL status (2026)

- SMIL (`<animate>`, `<animateTransform>`, `<animateMotion>`, `<set>`) still works
  in all engines: Chrome's 2015 deprecation was reversed in 2016; Chromium, Firefox,
  and WebKit all ship it; MDN historically kept a "deprecated" banner [verify
  current MDN status and that no engine has re-deprecated it].
- Use SMIL when the animation must live inside a self-contained file that animates
  in `<img>`/background-image with zero CSS/JS wiring — and for animateMotion.
  Prefer CSS otherwise (reduced-motion control, devtools, compositor offloading).

### 8.2 SMIL essentials

- `<animate attributeName="r" values="4;7;4" keyTimes="0;.5;1" dur="1.2s"
  repeatCount="indefinite"/>` — values+keyTimes+keySplines (calcMode="spline")
  give full easing.
- begin: time offset ("0.3s"), event ("click"), syncbase ("a.end+0.2s"),
  "indefinite" (JS-triggered via beginElement()).
- `fill="freeze"` holds the end state; default "remove" snaps back.
- **animateTransform replaces the transform attribute unless `additive="sum"`**;
  stacking two animateTransforms (e.g. rotate + scale) requires additive="sum" on
  the second (and usually both). Spinner:
  ```xml
  <g transform="translate(50 50)">
    <circle r="20" fill="none" stroke="#36f" stroke-width="4"
            stroke-dasharray="90 40"/>
    <animateTransform attributeName="transform" type="rotate"
      from="0" to="360" dur="1s" repeatCount="indefinite" additive="sum"/>
  </g>
  ```
- animateMotion:
  ```xml
  <circle r="4"><animateMotion dur="3s" repeatCount="indefinite"
    rotate="auto"><mpath href="#route"/></animateMotion></circle>
  ```
  rotate="auto|auto-reverse|<deg>"; keyPoints+keyTimes control pacing.

### 8.3 CSS animation of SVG

- Animatable as CSS properties: opacity, fill, stroke, stroke-width,
  stroke-dasharray, stroke-dashoffset, transform (+ translate/rotate/scale),
  filter, and — in modern browsers — the SVG 2 geometry properties cx, cy, r, rx,
  ry, x, y, width, height as CSS [verify full list per browser], and `d:
  path("...")` (Chrome/Safari; Firefox [verify]) with same-structure paths.
- NOT CSS-animatable: viewBox, points (polygon), gradient stop offsets — SMIL or
  JS (Web Animations API) only.
- Transforms: always `transform-box: fill-box; transform-origin: center` for
  spin-in-place (§1.4).
- CSS inside `<svg><style>` travels with the file and works in `<img>` [verify];
  external stylesheets don't.

### 8.4 Motion path in CSS

- `offset-path: path("M...")` (or url(#p) [verify support]) + `offset-distance:
  0%→100%` + `offset-rotate: auto` is the modern animateMotion equivalent,
  supported across engines [verify 2026 completeness]. `offset-anchor` centers the
  mover on the line.

### 8.5 Where animation survives

| Context | SMIL | CSS in <style> | JS |
|---|---|---|---|
| inline in HTML | yes | yes | yes |
| `<img>` / CSS background | yes | yes | no |
| `<object>` / iframe | yes | yes | yes (own document) |
| rasterizers (resvg/librsvg/ImageMagick/sharp) | no — static first frame / base value [verify which] | mostly no | no |
| Figma / Illustrator import | no | mostly no | no |

Rule: the un-animated base attribute values must form the correct static image —
design the "frame zero" as the deliverable, animation as enhancement.

- **prefers-reduced-motion**: guard every CSS animation; make the reduced state the
  completed/static state. CSS media queries cannot disable SMIL — if reduced-motion
  compliance matters, use CSS animation, or JS `svg.pauseAnimations()`.

---

## 9. Accessibility & metadata

- Informative SVG (inline): `<svg role="img" aria-labelledby="t d">` with
  `<title id="t">Short name</title><desc id="d">Longer description</desc>` as the
  FIRST children. aria-labelledby is more reliable across AT than bare <title>
  [verify 2026 AT matrix]. Note <title> also produces a hover tooltip in browsers.
- Simpler alternative: `role="img" aria-label="Short name"`.
- Decorative SVG: `aria-hidden="true"` (+ `focusable="false"` for legacy IE — harmless).
- In `<img src="x.svg" alt="...">` the alt attribute wins; internal title is ignored.
- Complex graphics (charts): don't rely on per-element ARIA inside SVG (mixed
  support); provide a visually-hidden HTML text alternative or data table adjacent,
  and aria-describedby to it. Per-shape `<title>` gives tooltips at least.
- Interactive elements need tabindex="0", a role, and visible focus styling.
- Don't encode meaning in color alone; check contrast of strokes/fills against
  their actual background.

## 10. Compatibility & robustness

- **Root requirements**: `xmlns="http://www.w3.org/2000/svg"` on standalone files
  (fatal without it when served as image/svg+xml); add
  `xmlns:xlink="http://www.w3.org/1999/xlink"` ONLY if you emit xlink:href.
  No DOCTYPE, no XML prolog needed (prolog harmless).
- **href vs xlink:href**: browsers all support plain `href` on use/image/textPath/
  gradients/mpath. Older librsvg/Inkscape/Android only knew xlink:href [verify
  which versions]. Max-compat strategy: emit both (`href="#a" xlink:href="#a"`).
  Browser-only targets: href alone.
- **Presentation attributes are the portable choice** (fill="", stroke="",
  transform=""): every renderer reads them; `<style>` + selectors fail in weak
  renderers (ImageMagick's internal MSVG, old AndroidSVG, some sanitizers)
  [verify]. They also have specificity 0 — any CSS rule can override them, which
  is exactly right for theme overrides. Use `<style>` only for interactivity/
  animation/theming in browser-destined SVG.
- **Everything self-contained**: external images, CSS, fonts, and external `<use>`
  refs are blocked in `<img>` context and stripped by sanitizers. Raster images as
  `data:` URIs. `<foreignObject>`: browsers-only, dropped by every rasterizer and
  design-tool import — never in portable output; behavior even in `<img>` has
  historic engine quirks [verify].
- **Renderer support matrix** [verify ALL empirically — written from memory]:
  - **resvg**: excellent static SVG 1.1 coverage — filters (most primitives),
    masks, clips, patterns, markers, basic CSS in <style>; no SMIL, no scripting,
    no foreignObject; fonts via system lookup/provided font files [verify feImage,
    lighting, blend isolation].
  - **librsvg** (rsvg-convert, sharp): good shapes/gradients/masks/clip/filters
    coverage in modern releases (2.50+ rewrote filters in Rust); limited CSS;
    no SMIL; dominant-baseline historically weak [verify].
  - **ImageMagick**: delegates to librsvg when available — otherwise its internal
    MSVG parser which is primitive (no filters, no masks, barely CSS). Never
    target MSVG.
  - **Inkscape**: near-browser SVG 1.1 rendering; its own extensions in inkscape:
    namespace are ignorable by others.
  - **Figma import**: geometry, fills, gradients (linear/radial), basic masks-as-
    clips survive; filters dropped or approximated (drop-shadow → effect), patterns
    rasterized/dropped, text needs matching local fonts, foreignObject dropped
    [verify current].
  - **Headless Chrome/Playwright screenshot**: the gold standard — full fidelity
    incl. CSS/filters; use it when exact browser output is required.
- **mix-blend-mode / isolation**: fine in browsers, unreliable in rasterizers
  [verify resvg/librsvg]; avoid in portable files or provide a flattened fallback.
- CSS custom properties/var(): inline-in-HTML only (an <img> SVG can't see page
  variables; internal `<style>` defining them inside the SVG works in browsers).
- Media queries (prefers-color-scheme) inside SVG `<style>` evaluate in `<img>`
  context in modern browsers [verify] — usable for auto dark-mode icons.

## 11. Precision & size

- Decimal precision rule: error < half a device pixel at maximum display scale.
  viewBox 0–100 displayed ≤1000px → 2 decimals; 0–24 icons → 2; 0–1000 → 1.
  SVGO defaults to 3 significant decimals. Never emit float-noise (13+ digits).
- Path byte tricks: relative commands for small deltas; H/V for axis-aligned;
  S/T when chaining same-family curves; Z instead of closing L; `.5` not `0.5`;
  minus as separator (`10-20`); implicit repeats (remember M's repeats are L).
- transform vs baked coordinates: keep transforms for animation targets,
  readability, and reuse; BAKE them when (a) a non-uniform scale would distort
  strokes, (b) the target renderer is weak, (c) you're compressing.
  Non-uniform scale distorts stroke width and turns circles into ellipses — bake
  or use non-scaling-stroke.
- ids: shortest-unique but namespaced per document (`g1`… collides when inlined).
- SVGO: safe with preset-default EXCEPT disable removeViewBox (always keep
  viewBox); watch cleanupIds (breaks external refs/JS hooks), mergePaths
  (fill-rule interactions), convertShapeToPath (loses rect rx semantics for some
  consumers) [verify current plugin names].
- SVG gzips extremely well (~4-10×): measure compressed size; verbosity that aids
  correctness is nearly free after gzip.
- SVG in CSS data-URI: URL-encode, don't base64 (`#` → %23, quotes swapped);
  base64 is ~35% bigger and unnecessary.

## 12. Golden rules digest

1. Always viewBox; author in a clean unit space (0–24 icons, 0–100/1000 art).
2. Center-origin viewBox for radial art.
3. Set color-interpolation-filters="sRGB" on every filter; widen filter regions
   for blurs.
4. Mask content beyond 120% bbox is cut — set maskUnits/userSpaceOnUse regions.
5. White-rect base in every mask; prefer alpha over grey luminance.
6. clip for hard edges (cheap), mask for soft (expensive).
7. Stroke is centered: inset geometry by sw/2 at viewBox edges; Z closed shapes;
   miterlimit 10 for sharp tips; butt caps for data-length.
8. pathLength normalizes dash animations to CSS-only.
9. No S/T after a non-matching command; two arcs for a full circle; kappa 0.5523
   for cubic circles.
10. currentColor + CSS variables for themable <use> icons; namespace all ids.
11. paint-order="stroke" for text halos; dominant-baseline="central" in browsers,
    dy="0.35em" for portability.
12. Text→paths for identical-everywhere rendering; else system stacks + textLength.
13. Static-first: base attributes must render the correct frame-zero everywhere;
    SMIL for self-contained <img> animation; CSS + prefers-reduced-motion inline.
14. Presentation attributes for the base look; both href and xlink:href for
    max-compat; no external refs; no foreignObject in portable files.
15. 2–3 decimals; gzip decides; verify renderer targets empirically — especially
    everything marked [verify] here.
