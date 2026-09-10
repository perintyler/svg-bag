---
name: svg-craft
description: >-
  The craft of authoring SVG: viewBox and coordinate systems, path/arc/bézier
  rules, defs/use/gradients/patterns, strokes, masks vs clips, filter recipes,
  and text. Read before writing any nontrivial SVG.
mode: on-demand
---

# SVG Authoring Craft

Rules and recipes for generating SVG markup or SVG.js code. Claims tagged
**[verify]** need empirical re-verification; everything else is settled
SVG 1.1 / SVG 2 / CSS spec behavior.

## 1. Coordinates

### viewBox and sizing

- Always emit `viewBox="minX minY width height"`. Without it the SVG cannot scale.
- The four sizing combinations:
  - **viewBox + width/height**: intrinsic size = width/height; scale = width_attr / viewBox_width. The normal choice for a deliverable file.
  - **viewBox only**: no intrinsic size; scales to fill container (in `<img>` the aspect ratio comes from the viewBox). The normal choice for responsive inline SVG.
  - **width/height only**: fixed canvas, no scaling — avoid.
  - **neither**: 300×150 default replaced-element size [verify exact fallback per context].
- Scale factors: `sx = viewportWidth / viewBoxWidth`, `sy = viewportHeight / viewBoxHeight`; preserveAspectRatio reconciles sx ≠ sy.
- Use `minX/minY` to translate content: `viewBox="-50 -50 100 100"` puts (0,0) at center — use for radial art (clocks, spinners, polar charts).
- Negative viewBox width/height is an error (disables rendering); width or height of 0 disables rendering entirely.

### preserveAspectRatio

- Grammar: `<align> <meetOrSlice>?`. Default **`xMidYMid meet`**. Case exact: lowercase x, uppercase Y.
- `meet` = contain (letterbox); `slice` = cover (crop). `none` = non-uniform stretch — the only align that distorts; use only for stretchable decorative dividers/waves, never icons or text.
- Applies to root `<svg>`, nested `<svg>`, `<symbol>` (via `<use>`), `<image>`, `<marker>`, `<pattern>` (with viewBox), `<feImage>` [verify feImage].
- Computation: scale = meet ? min(sx,sy) : max(sx,sy); translate so the chosen alignment point maps (Min→0, Mid→half the leftover, Max→all the leftover).
- Does nothing without a viewBox.

### Transforms (attribute)

- Functions: `translate(tx [ty=0])`, `scale(sx [sy=sx])`, `rotate(a [cx cy])`, `skewX(a)`, `skewY(a)`, `matrix(a b c d e f)` = [[a c e][b d f][0 0 1]].
- **Order**: list `A B C` applies C first, then B, then A. Equivalent left-to-right model: each function nests a new coordinate system for what follows.
- `rotate(45) translate(10,0)` moves along the rotated axis (ends at 7.07, 7.07); `translate(10,0) rotate(45)` moves in screen axes then spins in place at (10,0).
- `rotate(a cx cy)` ≡ `translate(cx cy) rotate(a) translate(-cx -cy)`. Angles are degrees; positive = clockwise on screen (y-down).
- Attribute transforms are unitless. To rotate a shape about its own center with the attribute, pass the center as cx cy — the attribute has no transform-origin.

### CSS transforms on SVG

- CSS `transform` requires units: `rotate(45deg)`, `translate(10px, 0)`; unitless is invalid (except 0).
- CSS transform-origin defaults to 50% 50% of the **reference box**, which for SVG defaults to `view-box` [verify default] — a naive CSS `rotate(45deg)` spins around the viewBox center, not the shape.
- **The fix, always**: `transform-box: fill-box; transform-origin: center;` on any element you rotate/scale with CSS.
- Individual properties `translate`/`rotate`/`scale` work on SVG elements and compose in fixed order translate→rotate→scale [verify order].
- CSS `transform` overrides the `transform` attribute (the attribute is a presentation hint at lowest specificity).

### Units

- Unitless numbers = user units; in a viewBox-scaled SVG, px ≡ user unit.
- Absolute units assume 96 dpi: 1in = 96 user units, 1mm ≈ 3.7795, 1pt ≈ 1.333.
- Percentages: width-like → viewport width; height-like → viewport height; other lengths (r, stroke-width, dasharray) → normalized diagonal `sqrt(w² + h²) / sqrt(2)`.
- Rule: unitless user units everywhere inside the SVG; reserve units/percentages for the root width/height.

### userSpaceOnUse vs objectBoundingBox

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
| markerUnits | strokeWidth |

Memorize the asymmetry: region units default to bbox; content units default to user space.

- objectBoundingBox coordinates are **fractions 0..1** of the referencing element's bbox (percentages map to 0..1).
- The bbox is **geometry only**: no stroke, no markers, no filter output, no clip.
- **Degenerate bbox**: an axis-aligned `<line>`/path has zero width or height → objectBoundingBox paint servers render nothing. A gradient stroke on a horizontal line silently disappears. Fix: `gradientUnits="userSpaceOnUse"` with explicit coordinates.
- Bbox units scale non-uniformly on non-square shapes: a bbox-units circle renders as an ellipse; a 45° bbox gradient is not 45° on screen. Fix with userSpaceOnUse or a compensating gradientTransform.

### Nested `<svg>` and `<symbol>`

- Nested `<svg x y width height viewBox preserveAspectRatio>` = a scalable sub-canvas; unlike `<g>` it rescales its content independently. Use to place independently-designed components without recomputing coordinates.
- Nested svg does not accept `transform` in SVG 1.1 (SVG 2 allows it [verify support]); wrap in `<g transform>`.
- `<symbol>` establishes a viewport but only renders via `<use>`. SVG 2 adds x/y/width/height and refX/refY on symbol [verify refX/refY browser support].
- `overflow` defaults to `hidden` on viewport-establishing elements (root/nested svg, symbol, image, marker, pattern). Set `overflow="visible"` to let content escape.

### DOM coordinate APIs

- `getBBox()` — geometry bbox in local user space (no stroke/filter/transform). `getBoundingClientRect()` — screen-space box including transforms. `getScreenCTM()`/`getCTM()` — local→screen / local→viewport matrices.
- Pointer→SVG coords: `new DOMPoint(evt.clientX, evt.clientY).matrixTransform(svg.getScreenCTM().inverse())`.

## 2. Paths

### Commands

Uppercase = absolute; lowercase = relative to current point (CP).

| Cmd | Params | Notes |
|---|---|---|
| M/m | x y | starts subpath, sets subpath start |
| L/l | x y | line |
| H/h | x | horizontal |
| V/v | y | vertical |
| C/c | x1 y1 x2 y2 x y | cubic |
| S/s | x2 y2 x y | smooth cubic |
| Q/q | x1 y1 x y | quadratic |
| T/t | x y | smooth quadratic |
| A/a | rx ry rot laf sf x y | elliptical arc |
| Z/z | — | close; CP → subpath start |

- `d` must start with M/m.
- **Implicit repeats**: extra parameter sets repeat the command, EXCEPT after M/m where repeats become L/l (same case). `M 10 10 20 20` = `M 10 10 L 20 20`.
- After `Z`, a relative `m` is relative to the subpath start Z restored.
- Grammar: separators are whitespace and/or one comma; a minus or a decimal point (when the integer part is present) can serve as separator: `l10-20`, `0.5.5` = `0.5 .5`. Arc flags can be packed (`a5 5 0 015 5`) — never emit packed flags.
- On a parse error, renderers draw up to the bad segment — don't rely on it.

### Arcs

`A rx ry x-axis-rotation large-arc-flag sweep-flag x y` — endpoint parameterization.

- **sweep-flag=1** = clockwise on screen (y-down); **0** = counter-clockwise.
- **large-arc-flag=1** = arc ≥ 180°; **0** = arc ≤ 180°.
- The four flag combinations: `0 0` and `1 1` are the two arcs of one candidate ellipse; `0 1` and `1 0` the two arcs of the other. Flipping sweep alone mirrors the bulge across the chord.
- Out-of-range handling (normative, silent):
  - identical start/end points → **arc omitted entirely** (hence no full circle from one A command);
  - rx or ry = 0 → straight line;
  - negative radii → absolute value;
  - radii too small (Λ = x₁′²/rx² + y₁′²/ry² > 1) → both scaled by √Λ. A "mystery semicircle" means your radii were silently scaled up.
- x-axis-rotation only matters when rx ≠ ry; write 0 for circular arcs.
- **Full circle** (center cx,cy, r) as two half arcs: `M cx-r,cy a r,r 0 1 0 2r,0 a r,r 0 1 0 -2r,0 Z`
- **Donut slice**: outer arc sweep 1, line inward, inner arc **sweep 0** (traversed backwards), Z.
- **Rounded rect by hand** (x,y,w,h,r, clockwise), corners all `A r,r 0 0 1 …`:
  `M x+r,y H x+w-r A r,r 0 0 1 x+w,y+r V y+h-r A r,r 0 0 1 x+w-r,y+h H x+r A r,r 0 0 1 x,y+h-r V y+r A r,r 0 0 1 x+r,y Z`
- NaN guard: converting endpoint→center parameterization, clamp the radicand at 0 (float error makes it slightly negative). One NaN in `d` typically kills the whole path.

### Curves and shorthands

- `S`: first control point = reflection of the previous C/S second control point about CP (`P1 = 2·CP − P2_prev`). If the previous command is NOT C/c/S/s, P1 = CP — a silent corner. **Only chain S after C/S.**
- `T`: reflects the previous Q/T control point; after anything else it degenerates to a straight line. **Only chain T after Q/T.** The families don't cross-reflect.
- S/T produce exactly C1 joins. For G1 with unequal handle lengths, write full C with collinear control points.

### Bézier craft

- **Kappa = 0.5522847498307933** = (4/3)·tan(π/8). Circle from four cubics, center (0,0), radius r, k = κr:
  `M 0,-r C k,-r r,-k r,0 C r,k k,r 0,r C -k,r -r,k -r,0 C -r,-k -k,-r 0,-r Z`
  Max radial error ≈ 2.7×10⁻⁴·r. Keep cubic arc segments ≤ 90°.
- General arc sweep θ: control distance **k = (4/3)·tan(θ/4)·r** along the tangents.
- **Quadratic → cubic (exact)**: C1 = P0 + (2/3)(Q−P0); C2 = P2 + (2/3)(Q−P2).
- **Cubic → quadratic is lossy**: split at inflection points, then subdivide until the third-difference error bound is under tolerance.
- Continuity: G1 = control points collinear across the anchor; C1 = collinear + equal distances. G1 suffices visually; C1 matters for motion along the path.
- Closed smooth shapes: the seam needs manual care — last outgoing handle must reflect the first handle about the start anchor (`c_last = 2·A0 − c_first`); S won't do it across Z.
- **Smooth polyline through points (Catmull-Rom → Bézier)**, segment P1→P2 with neighbors P0, P3 and tension τ (τ=1 classic): B1 = P1 + (P2−P0)·τ/6, B2 = P2 − (P3−P1)·τ/6. Endpoints: reflect (P0 = 2P1−P2) or duplicate. Use centripetal parameterization for unevenly spaced points to avoid loops.
- de Casteljau split at t: A=lerp(P0,P1,t), B=lerp(P1,P2,t), C=lerp(P2,P3,t), D=lerp(A,B,t), E=lerp(B,C,t), F=lerp(D,E,t). Left: P0,A,D,F; right: F,E,C,P3. Tangent at t = E−D.

### fill-rule and holes

- `nonzero` (default): signed winding; holes require the inner contour to wind **opposite** the outer.
- `evenodd`: crossing parity; direction irrelevant; any nested contour punches a hole.
- Pentagram of 5 lines: nonzero → solid star; evenodd → star with pentagonal hole.
- Output you control → nonzero with correct winding (matches fonts and boolean libraries). Unknown-winding input → evenodd.
- Inside `<clipPath>`, use **clip-rule** (on the children), not fill-rule.

### Subpaths, Z, direction

- Fill implicitly closes open subpaths; stroke does not.
- **Always Z a closed shape you stroke**: without Z the seam gets two linecaps (a notch at butt, a blob at round) instead of one linejoin.
- Dash patterns restart per subpath; a closed subpath's pattern wraps — choose a period dividing path length to hide the seam.
- Path direction controls: marker `orient="auto"`, textPath reading direction (reverse path → upside-down text), dash phase/draw-on direction, animateMotion/offset-path travel, getPointAtLength.

## 3. Reuse and structure

### defs / use / symbol

- Put referenced-only content (gradients, clipPaths, masks, filters, markers, patterns, symbols) in `<defs>`.
- `<use href="#id" x y width height>` clones into a closed shadow tree; x/y act as an extra translate. **width/height only apply when the target is `<svg>` or `<symbol>`**.
- Styling through the shadow boundary:
  - Inherited properties (fill, stroke, color, font-*) on `<use>` flow in — but a hardcoded `fill="#333"` inside the symbol wins.
  - Outer-document CSS selectors do NOT match inside the shadow tree [verify per-browser].
  - **CSS custom properties DO inherit through** — the mechanism for multi-color themable icons: symbol content uses `fill="var(--icon-accent, #c00)"`; the page sets `--icon-accent`.
  - `currentColor` inherits through: author symbol content with `fill="currentColor"`, control via CSS `color`.
  - Rule: **do not hardcode paint** in reusable symbol content; use currentColor and/or custom properties with fallbacks.
- `<symbol>` beats `<g>` for sprites: doesn't render at its definition site, has its own viewBox/preserveAspectRatio, and `<use width height>` works on it.
- External sprite refs (`<use href="icons.svg#gear">`) work in browsers (CORS-bound), fail inside `<img>` and most non-browser renderers [verify]. Same-document sprites are the safe default.
- **Namespace every id** (`chart1-grad-blue`): inlining multiple SVGs with colliding ids makes the first definition win for everyone.

### Gradients

- `<linearGradient x1 y1 x2 y2>` defaults 0%,0%,100%,0% (left→right). `<radialGradient cx cy r fx fy fr>` defaults 50%,50%,50%; fx/fy default to cx/cy; fr (SVG 2) defaults 0%.
- gradientUnits default objectBoundingBox → stretches with the bbox (diagonal gradients not at the written angle on non-square shapes). Use userSpaceOnUse for: multi-shape shared gradients, axis-aligned lines (degenerate bbox!), precise angles.
- To rotate a bbox gradient without skew: keep it axis-aligned and use `gradientTransform="rotate(a 0.5 0.5)"`.
- `spreadMethod`: pad (default) | reflect | repeat — visible only when the gradient vector doesn't span the shape. Repeating stripes: `<linearGradient x1="0" y1="0" x2="8" y2="8" gradientUnits="userSpaceOnUse" spreadMethod="repeat">`.
- `<stop>` offsets clamp to [0,1], must be non-decreasing. **Hard band**: two stops at the same offset with different colors.
- **href inheritance**: a gradient with `href="#base"` inherits the base's stops (if it has none) and unset attributes. Define stops once, re-orient many:
  `<linearGradient id="v" href="#base" x2="0" y2="1"/>`
- Off-center fx/fy gives a light-source look; SVG 1.1 clamps focal points to the circle edge, SVG 2 allows outside [verify]. fr > 0 makes annular gradients.
- **Mesh gradients are dead for the web**: no browser implements `<meshgradient>` [verify 2026]. Fake soft multi-point color with overlapping radial gradients + blur, or feTurbulence/feColorMatrix textures.
- Gradients apply to stroke (`stroke="url(#g)"`) and text fill; remember the degenerate-bbox trap on straight lines.

### Patterns

- patternUnits default **objectBoundingBox**, patternContentUnits default **userSpaceOnUse** — the asymmetry gotcha. Most hand-authored patterns want `patternUnits="userSpaceOnUse"` with absolute tile size.
- A `viewBox` on the pattern overrides patternContentUnits and scales tile content into the tile box.
- `patternTransform="rotate(45)"` rotates the tiling — the standard route to diagonal hatching from a horizontal-stripe tile.
- Tile seams (AA hairlines): mitigate with integer tile sizes, overdraw past tile edges, or `shape-rendering="crispEdges"` on pattern content.
- Recipes (all `patternUnits="userSpaceOnUse"`):
  - dots: `width="10" height="10"` + `<circle cx="5" cy="5" r="1.5"/>`
  - hatch: `width="6" height="6"` + `<path d="M0 6 L6 0" stroke-width="1"/>`
  - checkerboard: 20×20 tile, two 10×10 rects at (0,0) and (10,10)
  - grid: `<path d="M w 0 H 0 V h" fill="none" stroke>` on a w×h tile.

### Markers

- `refX/refY` = the point in marker (viewBox) coordinates placed on the vertex.
- Default `markerUnits="strokeWidth"` scales the marker with stroke-width (usually right for arrows); `userSpaceOnUse` for fixed-size markers.
- `orient="auto"` follows path direction (bisector at mid vertices); **`orient="auto-start-reverse"`** (SVG 2) flips the start marker 180° so one arrowhead def serves both ends — all modern browsers [verify non-browser].
- marker-start/mid/end apply to path, line, polyline, polygon only. Mid markers land on every interior vertex (including those created by Z).
- Markers do not inherit path paint. SVG 2 `fill="context-stroke"`/`context-fill` match the host's stroke/fill — works in browsers [verify], not most rasterizers; fallback: currentColor or hardcode.
- Markers clip to their viewport by default — set `overflow="visible"` if content exceeds the markerWidth/Height box.
- Arrowhead recipe:
  ```xml
  <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5"
          markerWidth="7" markerHeight="7" orient="auto-start-reverse">
    <path d="M0 0 L10 5 L0 10 z" fill="context-stroke"/>
  </marker>
  <path d="..." stroke="#345" stroke-width="2" fill="none"
        marker-end="url(#arrow)"/>
  ```
  refX near the tip (9 of 10) keeps the line from poking past the point; pull back to refX="8" to hide the line end inside the head.

### paint-order and opacity

- `paint-order: [fill || stroke || markers]`; default paints fill→stroke→markers. **`paint-order="stroke"`** paints stroke first so fill covers its inner half — THE technique for text halos:
  ```xml
  <text paint-order="stroke" stroke="#fff" stroke-width="4"
        stroke-linejoin="round" fill="#111">Label</text>
  ```
  Wide browser support; librsvg/resvg support it [verify].
- Group `opacity` is post-composite: overlapping children do NOT double-darken; it also creates an isolation/stacking context and an offscreen buffer. `fill-opacity`/`stroke-opacity` are per-paint and overlaps show. Choose deliberately.
- `currentColor` works in fill, stroke, stop-color, flood-color, lighting-color — a one-variable theming channel via CSS `color`.

## 4. Strokes

- Stroke is **centered**: half inside, half outside. A stroke-width-4 rect at the viewBox edge loses 2 units to clipping. Inset geometry by sw/2 (`x="2" width="96"` for sw=4 in a 100-wide viewBox) or expand the viewBox.
- `getBBox()` ignores stroke; visual extent = geometry + sw/2 (+ miter spikes).
- **linecap**: butt (default; adds nothing) | round | square (each adds sw/2 per end). Use butt when length encodes data (progress bars). Round/square caps on a zero-length subpath paint a dot (SVG 2); prefer `<circle>` for dots. Dot-dash trick: `stroke-dasharray="0 12" stroke-linecap="round"`. Round caps lengthen every dash by sw: for a visually even 10/10 pattern at sw=4 write `stroke-dasharray="6 14"`.
- **linejoin**: miter (default) | round | bevel | miter-clip (SVG 2, partial [verify]) | arcs (unimplemented [verify]). `stroke-miterlimit` default **4**; bevels when 1/sin(θ/2) > limit. Limit 4 → cutoff ≈ 29°; limit 10 → ≈ 11.5°; √2 → 90°. Sharp arrow/star tips need miterlimit ≈ 10 or linejoin="round".
- **dasharray**: odd-count lists double (`"5 3 2"` → period 20); one negative value invalidates the whole list (renders solid); percentages resolve against the normalized viewport diagonal; dashes restart per subpath.
- **dashoffset**: positive shifts the pattern backward toward the path start; negative allowed.
- **Line-draw animation**: JS — L = getTotalLength(); dasharray = L; dashoffset = L → 0. No-JS — `pathLength="1"` then:
  ```css
  path { stroke-dasharray: 1; stroke-dashoffset: 1;
         animation: draw 2s ease forwards; }
  @keyframes draw { to { stroke-dashoffset: 0; } }
  @media (prefers-reduced-motion: reduce) {
    path { animation: none; stroke-dashoffset: 0; } }
  ```
  Reduced-motion state must be the FINISHED drawing, never the invisible one.
- **pathLength** rescales every along-path computation (dasharray, dashoffset, textPath startOffset). `pathLength="100"` makes dash values read as percentages; on a circle, `pathLength="60" stroke-dasharray="1 1"` = exactly 30 seam-free dashes. Don't mix getTotalLength() JS with pathLength on the same element [verify DOM interaction].
- **vector-effect="non-scaling-stroke"**: constant screen-px stroke width under any viewBox scale/transform/zoom. Use for maps, hairline gridlines, selection outlines, content inside `scale()` groups. Other vector-effect values are effectively unimplemented [verify].
- **Stroke alignment does not exist** (`stroke-align` deferred from SVG 2 [verify 2026 status]). Workarounds:
  1. Inner stroke: double the width + `clip-path` to the shape itself (`<clipPath><use href="#shape"/></clipPath>`).
  2. Outer stroke: double width + mask blacking out the interior, or evenodd clip of a big rect minus the shape.
  3. Text outer stroke: `paint-order="stroke"` + doubled width.
  4. Precise/permanent: bake a real offset path at build time.
  5. Rough glow: feMorphology dilate (rectangular kernel — corners square off).
- Non-uniform `scale()` distorts stroke width (thick/thin around a circle). Bake the scale into coordinates or use non-scaling-stroke.

## 5. Masks vs clips

- **clip-path = binary stencil**: geometry only; fill/opacity/stroke/filter on clip children are IGNORED; no soft edges. **mask = per-pixel alpha/luminance**: gradients, blurs, images all work.
- `<clipPath>` children: shapes, `<text>`, `<use>` of shapes; **no `<g>`** in SVG 1.1 — wrapping children in a group silently empties the clip [verify SVG2 relaxation]. Multiple children union. Use `clip-rule` on children for evenodd holes. A clip-path attribute ON the clipPath element intersects.
- clipPathUnits default userSpaceOnUse; the objectBoundingBox variant takes 0..1 fractions (full-cover circle = `cx=.5 cy=.5 r=.5`) and scales non-uniformly (circle → ellipse).
- CSS `clip-path: circle(40% at 50% 50%) | inset(10% round 8px) | polygon(...) | path("...")` works on HTML and SVG. On SVG the default reference box is fill-box [verify] — percentages resolve against the element's own bbox; state `view-box` explicitly when you mean the viewport. Basic shapes interpolate → animatable morphs (equal polygon vertex counts).
- Clipped-away regions receive NO pointer events (unlike opacity:0) — clip a transparent rect to define irregular hit areas.
- `<mask>` region default: **x/y/width/height = -10%/-10%/120%/120%** of the bbox — content beyond 120% is silently cut (the #1 mask bug). When in doubt: `maskUnits="userSpaceOnUse"` + an explicit generous region.
- **Luminance by default**: maskValue = luminance × alpha; white shows, black hides; colors weigh at Rec.709 linear 0.2125/0.7154/0.0721 (pure red ≈ 21% opaque!). Uncovered area = hidden ⇒ **start every mask with `<rect width="100%" height="100%" fill="#fff"/>`**, then punch holes in black.
- **Prefer alpha over grey**: greys hit the sRGB-vs-linearRGB luminance ambiguity across renderers [verify current browsers]. Encode partial transparency as `stop-opacity`/`fill-opacity` on white, or set `mask-type="alpha"` [verify 2026 support].
- Fade-out recipe: mask containing a white rect filled with a linearGradient white/opacity-1 → white/opacity-0.
- Performance: masks force offscreen buffers; clip-path (especially CSS basic shapes) is much cheaper. Hard edge ⇒ clip. Animate transforms, not mask content.
- CSS mask on HTML: `mask-image: url(#svgMask)` uses the mask's mask-type (luminance default); raster/gradient mask-images default to ALPHA. Add `mask-repeat: no-repeat`; the `mask` shorthand resets mask-mode — shorthand first, longhands after.

## 6. Filters

### Plumbing

- Inputs: `SourceGraphic`, `SourceAlpha`. `BackgroundImage`/`BackgroundAlpha`/`FillPaint`/`StrokePaint` are dead — removed in Filter Effects 1, never reliably implemented [verify].
- Implicit chaining: first primitive with no `in` gets SourceGraphic; later ones get the previous result. Name intermediates with `result="x"` and wire explicitly in anything non-trivial.
- **Filter region default: x/y/width/height = -10% / -10% / 120% / 120%** of the bbox. Large blurs/shadows/glows get CLIPPED at that box — the flat-edge blur bug. Widen: `x="-50%" y="-50%" width="200%" height="200%"` (a blur extends ~3×stdDeviation; scale the region with it).
- primitiveUnits default userSpaceOnUse: stdDeviation/dx/dy/radius are user units. Output is device-pixel raster; parameters stay in user space.

### color-interpolation-filters — the #1 cross-renderer difference

- Spec default is **linearRGB**; browsers honor it, many rasterizers/tutorials assume sRGB — blur halos, gradients through filters, and feColorMatrix results differ visibly between renderers.
- **Rule: set `color-interpolation-filters="sRGB"` on every `<filter>` you author**, unless you specifically want physically-linear blending (lighting). It makes hand-computed matrix/transfer values behave in the space you think in and maximizes cross-renderer agreement.

### Primitive toolkit

- **feGaussianBlur** `stdDeviation="s"` or `"sx sy"`; blur radius ≈ 3s.
- **feOffset** `dx dy`. **feFlood** `flood-color flood-opacity`.
- **feMerge**/feMergeNode — stack bottom→top; `feMergeNode in="SourceGraphic"` last puts the original on top.
- **feComposite** `operator="over|in|out|atop|xor|arithmetic"`; `in` = clip to in2's alpha; `out` = subtract; `arithmetic` k1..k4: result = k1·i1·i2 + k2·i1 + k3·i2 + k4 (k2=k3=1 → additive).
- **feColorMatrix**:
  - `type="matrix"`: 20 numbers, 4 rows (R',G',B',A') × 5 cols (R,G,B,A,1).
    Alpha-only tint: `0 0 0 0 cr / 0 0 0 0 cg / 0 0 0 0 cb / 0 0 0 a 0`.
    Grayscale: `0.2126 0.7152 0.0722 0 0` ×3 rows, alpha row `0 0 0 1 0`.
    Alpha contrast (gooey): last row `0 0 0 18 -7`.
  - `type="saturate"` 0..1; `type="hueRotate"` deg; `type="luminanceToAlpha"`.
- **feComponentTransfer** + feFuncR/G/B/A: table (remap), discrete (posterize), linear (slope/intercept), gamma. Duotone: type="table" per channel mapping [0,1] → [shadowColor, highlightColor].
- **feMorphology** erode|dilate radius — rectangular kernel (squared corners).
- **feTurbulence** `type="fractalNoise|turbulence"` baseFrequency (per-axis pair allowed) numOctaves seed stitchTiles. fractalNoise = smooth clouds; turbulence = sinewy/marbled.
- **feDisplacementMap** `in in2 scale xChannelSelector yChannelSelector` — the organic-distortion workhorse.
- **feDropShadow** `dx dy stdDeviation flood-color flood-opacity` — one-primitive shadow; browsers yes, old rasterizers spotty [verify].
- feImage, feTile, feBlend (multiply/screen/overlay/…), lighting primitives — lighting is the least portable [verify support].

### Recipes (all with color-interpolation-filters="sRGB")

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
- **Glow**: shadow with no offset, brighter flood, optionally feMorphology dilate 1–2 before the blur; merge under source.
- **Gooey/metaball** (apply to the GROUP of blobs):
  ```xml
  <filter id="goo">
    <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur"/>
    <feColorMatrix in="blur" mode="matrix"
      values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" result="goo"/>
    <feComposite in="SourceGraphic" in2="goo" operator="atop"/>
  </filter>
  ```
- **Paper grain**: feTurbulence fractalNoise baseFrequency≈0.9 numOctaves=4 → feColorMatrix to low-opacity alpha → feComposite/feBlend multiply over source. Film grain: baseFrequency 0.6–1, monochrome via luminanceToAlpha.
- **Rough/watercolor edges**:
  ```xml
  <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="3" result="n"/>
  <feDisplacementMap in="SourceGraphic" in2="n" scale="8"
                     xChannelSelector="R" yChannelSelector="G"/>
  ```
  scale 4–6 subtle wobble; 10–20 hand-drawn; add slight blur + alpha-contract for watercolor pooling.
- **Posterize**: feComponentTransfer, feFuncR/G/B type="discrete" tableValues="0 .33 .66 1".
- Performance: cost ∝ filtered pixel area × primitives. Never animate filter parameters on large areas; pre-render to raster if static.

## 7. Text

- No automatic wrapping; SVG 2 inline-size/shape-inside never shipped in browsers [verify 2026]. Lay out lines yourself:
  ```xml
  <text x="20" y="40" font-size="16">
    <tspan x="20" dy="0">Line one</tspan>
    <tspan x="20" dy="1.4em">Line two</tspan>
  </text>
  ```
  Reset x per line; dy is relative to the previous glyph position.
- x/y position the first glyph's alphabetic-baseline anchor, not a box corner. Multi-value `x="0 12 24"` places characters individually; `rotate` rotates per character.
- `text-anchor: start|middle|end` anchors horizontally around x (respects direction: start ≠ left in RTL).
- **Vertical centering**: `dominant-baseline="central"` is geometric center (what you want; "middle" is x-height-based). Good in browsers, but **dominant-baseline is one of the most commonly broken properties in non-browser renderers** [verify resvg/librsvg]. Portable fallback: keep alphabetic baseline and nudge with `dy="0.35em"` (≈ optical center for most Latin fonts; 0.32–0.36em depending on font).
- text-before-edge/text-after-edge: inconsistently implemented — avoid.
- `textLength` + `lengthAdjust="spacing"` pins rendered width — insurance when the viewer's font metrics differ. `spacingAndGlyphs` distorts glyphs; avoid.
- **textPath**:
  ```xml
  <defs><path id="arc" d="M 20,100 A 80,80 0 0 1 180,100"/></defs>
  <text font-size="14"><textPath href="#arc" startOffset="50%"
    text-anchor="middle">CURVED LABEL</textPath></text>
  ```
  Text past the path end is not rendered. Reading direction = path direction: text on the bottom of a circle needs a left-to-right-under arc (sweep 0) or it renders upside down. `side="right"` (SVG 2) flips sides [verify support — historically Firefox-only]. pathLength rescales startOffset.
- **Fonts — the portability problem.** Outside your page (file, `<img>`, rasterizer, design tool) your webfonts don't exist. Options, best first for standalone output:
  1. **Convert text to paths** — 100% portable; kerning/ligatures baked; loses selection/search/a11y (add aria-label/`<title>`) and bloats the file. **This bag's `text_to_path` tool does this using shipped OFL fonts (Inter, Lora, JetBrains Mono) — prefer it over `<text>` for standalone output.**
  2. **System font stack** (`font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"`) — metrics vary; pair with textLength for critical layout.
  3. **Embed the font** via `<style>@font-face { src: url(data:font/woff2;base64,...) }` — works inline and in `<img>` in browsers [verify per-browser]; rasterizers mostly ignore it (librsvg: no; resvg: no [verify]). Subset to used glyphs (WOFF2) or the file balloons.
  4. External @font-face URLs: blocked in `<img>` — never rely on them.
  5. SVG fonts (`<font>/<glyph>`): removed from browsers. Dead.
- **Whitespace collapses** (runs of spaces/newlines → one space) — pretty-printed text content renders with single spaces. xml:space="preserve" is deprecated; use `white-space` CSS [verify] or explicit tspans.
- Stroked text: `paint-order="stroke"` so the outline sits under the fill; `stroke-linejoin="round"` protects serif points.

## SVG.js note

SVG.js numeric setters coerce NaN to 0 silently (verified). A NaN produced upstream (degenerate bbox, bad arc math) becomes a shape quietly parked at the origin. Compute values, validate them (`Number.isFinite`), then set — never trust the setter to catch bad math.
