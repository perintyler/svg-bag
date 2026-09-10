---
name: svg-generative
description: >-
  Generative technique catalog: flow fields, noise displacement, truchet and
  tiling, circle packing, poisson-disc, L-systems, voronoi, phyllotaxis, curve
  smoothing — plus palette craft and composition rules. Read before making art.
mode: on-demand
---

# Generative SVG Techniques

A generative piece is a parameter space, not an image. Build a space where most
seeds are good. Palette: constrain hue, structure value, ration the accent.
Composition: fix the margin, place a focal point off-center, vary density,
largest shapes first. Randomness: seed it, shape its distribution, clamp its
tails. Every technique below emits polylines/paths; single-stroke, fill-free
output also produces the best screen SVGs.

Conventions in this file: `random.range(a,b)`, `random.int(a,b)`,
`random.gaussian(mean, sd)`, `random.choice(arr)` are the seeded RNG.
`noise2D(x,y)` returns values in **[-1, 1]** — remap with `(noise2D(x,y)+1)/2`
when you need [0,1]. Delaunay/Voronoi via `lib.delaunay.Delaunay.from(points)`.
d3-shape curve generators via `lib.shape`. Claims the source could not confirm
are tagged [unverified].

---

## 1. Flow fields

Hair-like, sinuous bundles of near-parallel strokes that swirl and converge —
the signature contemporary generative look (Tyler Hobbs / *Fidenza* lineage
[unverified] attribution detail). A grid of precomputed angles covering an area
LARGER than the canvas; particles trace through it by stepping in the local
angle.

```js
// 1. Angle grid — extend 20-50% beyond the canvas so curves bleed cleanly
const res = W / 100;                          // cell size ~1% of canvas width
const cols = Math.ceil(gen.w / res), rows = Math.ceil(gen.h / res);
const grid = [];
for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
  // (a) noise: smooth organic swirls  (noise2D in [-1,1] → angles span ±π·curl)
  grid[j*cols+i] = noise2D(i * nf, j * nf) * Math.PI * curl;
  // (b) or geometric: angle = (j/rows) * Math.PI   (non-noise variant)
}
// 2. Trace a particle
function trace(x, y, steps, stepLen) {
  const pts = [[x, y]];
  for (let s = 0; s < steps; s++) {
    const i = Math.floor((x - gen.x) / res), j = Math.floor((y - gen.y) / res);
    if (i < 0 || j < 0 || i >= cols || j >= rows) break;
    const a = grid[j*cols + i];
    x += Math.cos(a) * stepLen; y += Math.sin(a) * stepLen;
    pts.push([x, y]);
  }
  return pts;                                  // → one <path>, smoothed (§10)
}
```

Params: cell `res` ~1% of canvas width; noise frequency `nf` 0.05–0.2 per cell
(lower = broader sweeps); `curl` 0.5 (calm) to 2+ (chaotic multi-turn); step
length 1–5px and **must be ≤ cell size** or curves polygonize; steps 50–500;
line count 200–2000.

Quality moves ([unverified] as Hobbs' exact prescriptions):
- **Start points matter more than the field.** Poisson-disc starts (§7) for
  even coverage; clustered/edge starts for composition.
- Vary width and length by a second noise field or distance from a focal
  point; power-law lengths beat uniform.
- **Collision-aware variant:** keep a spatial hash of drawn points; stop a
  trace within distance `d` of an existing line → evenly spaced, non-crossing
  "topographic" bundles (evenly-spaced streamlines, Jobard & Lefer
  [unverified] attribution).
- Trace from each seed both directions to center strokes on their seeds.

Failure modes: step > cell (jagged); field too high-frequency (scribble);
uniform starts + uniform length (reads as fur); no extended generation area
(lines visibly die at the canvas edge).

Composition tip: bias trace length and stroke weight toward one off-center
focal point with a gaussian falloff — uniform coverage reads as texture, not a
piece.

## 2. Noise-displaced lines (Joy Division)

Stacked horizontal lines with a mountain-range bulge — the *Unknown Pleasures*
look. Each row is a polyline displaced upward by enveloped randomness.

```js
const rows = 40, my = 0.15 * H, mx = 0.1 * W, maxAmp = H / 8;
for (let j = 0; j < rows; j++) {
  const y0 = my + (j / (rows - 1)) * (H - 2*my);
  const pts = [];
  for (let i = 0; i <= 60; i++) {
    const x = mx + (i/60) * (W - 2*mx);
    const env = Math.max(0, Math.sin(Math.PI * i/60)) ** 3;  // bulge center, flat edges
    const amp = env * maxAmp;
    const d = -Math.abs(random.gaussian(0, amp));            // displace upward only
    pts.push([x, y0 + d * ((noise2D(i*0.15, j*0.4)+1)/2 * 0.5 + 0.5)]);
  }
  emit(smoothPath(pts));                                     // Catmull-Rom or Chaikin (§10)
}
```

Key craft: draw rows **back-to-front (top row first)** and give each line an
opaque fill in the background color below its curve — that hidden-line
occlusion makes peaks overlap like ridges. Params: rows 30–60; envelope
exponent 2–4; `maxAmp` H/10–H/5, and ≤ ~3× row spacing or ridges tangle.

Composition tip: the envelope IS the composition — try an off-center or
double-peaked envelope instead of the symmetric sine.

## 3. Domain warping

Marbled, folded, fluid distortion — noise fed through itself
(`f(p) = noise(p + a·noise(p + b·noise(p)))`; Inigo Quilez's formulation is the
common reference [unverified] exact constants).

```js
function warped(x, y) {
  const qx = noise2D(x*f, y*f),          qy = noise2D(x*f + 5.2, y*f + 1.3);
  const rx = noise2D(x*f + a*qx + 1.7,   y*f + a*qy + 9.2);
  const ry = noise2D(x*f + a*qx + 8.3,   y*f + a*qy + 2.8);
  return noise2D(x*f + a*rx, y*f + a*ry);
}
```

`a` (warp strength) 1–4; one warp level = gentle bend, two = full marbling. The
offsets (5.2, 1.3, …) just decorrelate channels — any constants work. Use it
anywhere a plain noise field feeds geometry: warp contour fields, flow-field
angles, or point positions directly (`x' = x + A*noise2D(...)`, A = 5–15% of
canvas).

Composition tip: warped fields make the best terrain contours — sample the
warped field into a grid, extract 8–25 iso-levels with marching squares
(d3: `lib.shape`-adjacent `d3.contours` if available, else hand-rolled), one
closed polyline per contour.

## 4. Truchet tiles

A square grid where each cell holds one of a few rotations of a motif; because
motifs meet edges **exactly at midpoints**, random rotations still produce
continuous winding paths — mazes (diagonal variant) or interlocking loops (arc
variant).

```js
for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
  const x = i*s, y = j*s, v = random.range(0, 1) < 0.5;
  // Diagonal variant ("10 PRINT"):
  emit(v ? line(x, y, x+s, y+s) : line(x+s, y, x, y+s));
  // Arc variant: two quarter-circles joining adjacent edge midpoints
  if (v) { arc(x, y, s/2, 0, 90);      arc(x+s, y+s, s/2, 180, 270); }
  else   { arc(x+s, y, s/2, 90, 180);  arc(x, y+s, s/2, 270, 360); }
}
```

The invariant: every tile touches each edge at its midpoint — any tile set
sharing that boundary condition mixes freely. Extensions: bias `v` by a noise
field (ordered regions emerge); double/triple concentric arcs per corner for
woven density; weave over/under by breaking one arc where two cross
[unverified] as a named standard technique.

**Multi-scale Truchet** (Christopher Carlson [unverified] attribution;
presented at Bridges ~2018): tiles may subdivide into 2×2 children at half
scale; continuity across a scale boundary needs arcs meeting edge midpoints
**plus** corner circles/edge caps so one full-size edge contact matches two
half-size contacts at 1/4 and 3/4. Recipe: subdivide cells with probability
`p(depth) ≈ 0.5^depth`, stop at depth 3–4, render leaves with arc pairs +
corner dots + caps sized proportionally to the cell. [unverified]: his exact
primitive inventory.

Related — **Wang tiles** generalize truchet (truchet = Wang tiles where all
edges share one color): tiles carry edge colors, adjacent edges must match;
scanline placement filtering the tile set by the north/west neighbors' colors.
Guarantee no dead ends by covering every (north-color, west-color) pair with at
least one tile.

Composition tip: a noise-biased `v` plus a second color for one of the two
motifs turns texture into regions — pure 50/50 randomness is the least
interesting setting.

## 5. Recursive subdivision

**Quadtree.** Subdivide squares with depth-decreasing probability; render
leaves. Driving `p` by a spatial field is what turns texture into composition.

```js
function quad(x, y, s, depth) {
  const p = pBase * Math.pow(decay, depth)            // pBase 0.9-1.0, decay 0.6-0.8
          * (0.5 + densityField(x + s/2, y + s/2));   // spatial modulation = composition
  if (depth < maxDepth && random.range(0, 1) < p) {   // maxDepth 5-7
    const h = s/2;
    quad(x,y,h,depth+1); quad(x+h,y,h,depth+1); quad(x,y+h,h,depth+1); quad(x+h,y+h,h,depth+1);
  } else drawLeaf(x, y, s, depth);                    // color/weight by depth (§14)
}
```

**Mondrian.** Recursive rect splitting with anti-sliver rules: split the long
way, split at 35–65% (never near an edge), stop by `minSize`/`maxDepth`/
`stopP` 0.1–0.25. Color mostly near-neutral leaves; primaries on ~15–25%;
heavy borders (stroke ~1–2% of canvas).

**Triangle subdivision** (Tyler Hobbs' "aesthetically pleasing triangle
subdivision" essay; specifics reproduced from memory [unverified]): (a) always
split the **longest edge** — the anti-sliver rule; (b) split at a randomized
point away from the midpoint; (c) stop by area/depth, optionally modulated
spatially.

```js
function splitTri(t, depth) {
  if (depth >= maxDepth || area(t) < minArea || random.range(0,1) < stopP) return out.push(t);
  const [a, b, c] = longestEdgeFirst(t);        // a-b is the longest edge
  const u = clamp(random.gaussian(0.5, 0.12), 0.3, 0.7);
  const p = lerp2(a, b, u);
  splitTri([a, p, c], depth+1); splitTri([p, b, c], depth+1);
}
```

Start from 2–4 big triangles covering the frame. Composition tip: color by
depth ladder + per-leaf OKLCH jitter (§14) — deeper = darker + thinner stroke
is the most reliable recursive look.

## 6. Circle packing

Organic clusters of tangent-but-not-overlapping circles; the **size hierarchy**
does the aesthetic work.

```js
const circles = [];
for (let tries = 0; tries < MAX_TRIES && circles.length < N; tries++) {
  const r = powerLaw(rMin, rMax, 2.2);          // many small, few large — crucial
  const x = m + random.range(0, W - 2*m), y = m + random.range(0, H - 2*m);
  let ok = true;
  for (const c of nearby(x, y, r + rMaxSoFar + pad))   // spatial hash!
    if (Math.hypot(x - c.x, y - c.y) < r + c.r + pad) { ok = false; break; }
  if (ok) circles.push({x, y, r});
}
// powerLaw: rMin * Math.pow(random.range(0,1), exp) scaled to [rMin,rMax]-ish;
// or draw radii descending and place big ones first while space exists.
```

**Grow-until-collision variant:** place a collision-free point at `rMin`, then
`r += dr` each step until it touches a neighbor or hits `rMax` — packs much
tighter, circles kiss.

Params: `pad` 0–2px (0 = tangent look); `rMax/rMin` ratio 10–50× for
hierarchy; MAX_TRIES 10k–500k (acceptance collapses as the canvas fills —
normal; stop after ~2000 consecutive failures). Spatial hash with cell ≈
2·rMax is mandatory past ~1k circles. Variants: pack inside a polygon mask
(reject outside centers, or clamp r to distance-to-boundary); nested packing
inside big circles; size by field value.

Composition tip: cluster the largest circles near a focal third-point and let
smalls fill outward — uniform size + uniform placement is the classic dud.

## 7. Poisson-disc sampling (Bridson 2007)

Uniform-feeling points with a guaranteed minimum distance `r` — blue noise in
O(n). The default distribution for stipples, flow-field seeds, tree
attractors, anything that should look "naturally distributed."

```js
function poissonDisc(W, H, r, k = 30) {                // k=30 is Bridson's default
  const cell = r / Math.SQRT2;                         // grid cell holds ≤ 1 point
  const gw = Math.ceil(W/cell), gh = Math.ceil(H/cell);
  const grid = new Int32Array(gw*gh).fill(-1);
  const pts = [], active = [];
  const insert = p => { pts.push(p); active.push(pts.length - 1);
    grid[Math.floor(p[1]/cell)*gw + Math.floor(p[0]/cell)] = pts.length - 1; };
  insert([random.range(0, W), random.range(0, H)]);
  while (active.length) {
    const ai = random.int(0, active.length - 1), p = pts[active[ai]];
    let placed = false;
    for (let t = 0; t < k; t++) {
      const a = random.range(0, 2*Math.PI), d = r * (1 + random.range(0, 1)); // annulus [r, 2r)
      const q = [p[0] + Math.cos(a)*d, p[1] + Math.sin(a)*d];
      if (q[0] < 0 || q[1] < 0 || q[0] >= W || q[1] >= H) continue;
      const gi = Math.floor(q[0]/cell), gj = Math.floor(q[1]/cell);
      let ok = true;
      for (let j = Math.max(0, gj-2); j <= Math.min(gh-1, gj+2) && ok; j++)
        for (let i = Math.max(0, gi-2); i <= Math.min(gw-1, gi+2) && ok; i++) {
          const idx = grid[j*gw + i];
          if (idx >= 0 && Math.hypot(q[0]-pts[idx][0], q[1]-pts[idx][1]) < r) ok = false;
        }
      if (ok) { insert(q); placed = true; break; }
    }
    if (!placed) active.splice(ai, 1);
  }
  return pts;
}
```

Variable-density version: make `r` a function `radiusAt(x,y)` driven by a
noise/image field — density variation with locally even spacing, the best of
both worlds and the right answer for §16's density-variation rule.

When each distribution looks right: **white noise** (pure `random.range`)
clumps and voids — use only when "scattered carelessly" IS the aesthetic;
**jittered grid** (`(i + 0.5 + random.range(-0.5,0.5)*jit) * cell`, jit
0.5–0.8) is a cheap blue-noise substitute; **poisson-disc** for things (trees,
dots, seeds); **Lloyd relaxation** (§9) 1–2 iterations de-clumps white noise,
10+ looks manufactured.

## 8. L-systems + turtle

Deterministic self-similar line work — space-filling mazes, crystalline
coastlines, ferns and bushes. Every stroke is a continuous turtle path.

```js
function expand(axiom, rules, iters) {
  let s = axiom;
  for (let i = 0; i < iters; i++)
    s = [...s].map(c => {
      const r = rules[c];
      if (!r) return c;
      if (typeof r === 'string') return r;
      let x = random.range(0, 1);                       // stochastic rules
      for (const o of r) if ((x -= o.p) <= 0) return o.to;
      return r[r.length - 1].to;
    }).join('');
  return s;
}
function turtle(str, {angle, step, startAngle = -90}) {
  const rad = a => a * Math.PI / 180;
  let st = {x: 0, y: 0, a: startAngle, step};
  const stack = [], paths = [];
  let cur = [{x: st.x, y: st.y}];
  for (const c of str) {
    if ('FGAB'.includes(c)) {                 // draw forward (see per-ruleset conventions!)
      st.x += Math.cos(rad(st.a)) * st.step; st.y += Math.sin(rad(st.a)) * st.step;
      cur.push({x: st.x, y: st.y});
    }
    else if (c === '+') st.a += angle;
    else if (c === '-') st.a -= angle;
    else if (c === '|') st.a += 180;
    else if (c === '[') stack.push({...st});
    else if (c === ']') {                     // pop MUST split the polyline
      if (cur.length > 1) paths.push(cur);
      st = stack.pop(); cur = [{x: st.x, y: st.y}];
    }
    else if (c === '!') st.step *= 0.8;       // taper per branch level (0.7-0.9)
  }
  if (cur.length > 1) paths.push(cur);
  return paths;
}
```

Classic rulesets (*Algorithmic Beauty of Plants* family — stable and widely
reproduced, but [unverified] verbatim; the draw convention column is the top
source of "curve comes out wrong"):

| Name | Axiom | Rules | Angle | Iters | Draw convention |
|---|---|---|---|---|---|
| Koch quadratic | `F` | `F → F+F-F-F+F` | 90° | 3–5 | F draws |
| Koch snowflake | `F--F--F` | `F → F+F--F+F` | 60° | 3–5 | F draws |
| Dragon curve | `FX` | `X → X+YF+`, `Y → -FX-Y` | 90° | 10–16 | X,Y non-drawing |
| Sierpinski arrowhead | `A` | `A → B-A-B`, `B → A+B+A` | 60° | 6–9 | A,B BOTH draw |
| Hilbert | `A` | `A → +BF-AFA-FB+`, `B → -AF+BFB+FA-` | 90° | 4–7 | only F draws |
| Fern (canonical) | `X` | `X → F+[[X]-X]-F[-FX]+X`, `F → FF` | 25° | 5–7 | X non-drawing |
| Simple bush | `F` | `F → FF+[+F-F-F]-[-F+F+F]` | 22.5° | 4–5 | F draws |
| Sparse tree | `F` | `F → F[+F]F[-F]F` | 25.7° | 4–6 | F draws |
| Symmetric bush | `F` | `F → F[+F]F[-F][F]` | 20° | 4–6 | F draws |
| Three-way branch | `F` | `F → FF-[-F+F+F]+[+F-F-F]` | 22.5° | 4–5 | F draws |

Angles 20–26° are the naturalistic band; below 15° reads as a broom, above 35°
as a shrub. **Cheapest single aesthetic upgrade — stochastic rules + angle
jitter:**

```js
rules = { F: [ {p: 0.34, to: 'F[+F]F[-F]F'}, {p: 0.33, to: 'F[+F]F'}, {p: 0.33, to: 'F[-F]F'} ] };
// and per-turn: st.a += angle * (1 + random.range(-0.2, 0.2));
```

Failure modes: string explosion (cap length ~2–5M chars); **scale is unknown
until drawn** — run the turtle at step=1, measure the bbox, rescale to fit,
never guess; guard `stack.pop()` against bracket imbalance; filter
sub-pen-width segments at high iterations; and the #1 rendering bug: not
splitting the path at `]` (spurious strokes across the drawing). Track
`stack.length` for depth-based stroke width.

Composition tip: one large plant off-center beats a row of plants; give the
canvas margin room for the crown by measuring the bbox after a dry run.

## 9. Voronoi / Delaunay

```js
const delaunay = lib.delaunay.Delaunay.from(points);   // or .from(objs, fx, fy)
const voronoi  = delaunay.voronoi([0, 0, W, H]);       // bounds REQUIRED
voronoi.cellPolygon(i);   // closed [[x,y],...] or null — for filled cells
voronoi.render();         // one path string, shared edges drawn ONCE — line art
delaunay.triangles;       // flat Uint32Array, 3 indices per triangle — mesh art
delaunay.neighbors(i);    // adjacent point indices
delaunay.find(x, y, hint);// nearest input point; hint makes raster scans fast
```

Recipes:
- **Shattered glass:** radially non-uniform points around an impact point —
  `r = Math.pow(random.range(0,1), 2.2) * maxR` (exponent 1.5–3), angle
  uniform. Fill lightness = f(distance) + 3–8% jitter; **shrink each cell 1–3%
  toward its centroid** to open hairline crack seams (this is what sells it).
- **Organic cells:** poisson-disc input points, then round each cellPolygon
  with Chaikin (2 iters, closed) — soft biological tissue.
- **Lloyd relaxation** — iteration count is the aesthetic dial: 0 raw, 1–2
  organic sweet spot, 5–10 honeycomb-ish, 50+ boring hex lattice. Use the
  shoelace-weighted polygon centroid, not the vertex mean (vertex mean biases
  relaxation).
- **Low-poly triangles:** fill each Delaunay triangle with a color sampled at
  its centroid; overlap ~0.5px or `shape-rendering="crispEdges"` to kill
  antialiasing seams between adjacent fills.
- **Euclidean MST** is a subgraph of the Delaunay triangulation (exact): pull
  edges from `delaunay.triangles`, Kruskal with union-find — neural webs over
  blue-noise points, river deltas over clustered points; stroke-width by depth
  from root.
- **Weighted Voronoi stippling** (Secord 2002): Lloyd with an image's
  `1 - luminance` as density weight; ownership by raster scan with
  `delaunay.find(x, y, hint)`; n 2k–5k for a portrait, 30–60 iterations;
  variable dot radius `r = rMin + (rMax-rMin)*sqrt(w/maxW)` sells it.

Composition tip: point distribution is the composition — the Voronoi diagram
only reveals it. Design the points first (clustered, ramped, poisson).

## 10. Curve smoothing

**Chaikin corner cutting** — limit curve is a quadratic B-spline: C¹, stays
inside the polygon hull, never overshoots. Use for contours, cells, blobs —
anywhere only the overall shape matters.

```js
function chaikin(pts, iters = 3, closed = false) {
  for (let k = 0; k < iters; k++) {
    const out = [], n = pts.length, last = closed ? n : n - 1;
    if (!closed) out.push(pts[0]);              // pin endpoints or the curve retracts
    for (let i = 0; i < last; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[(i+1) % n];
      out.push([0.75*x0 + 0.25*x1, 0.75*y0 + 0.25*y1]);
      out.push([0.25*x0 + 0.75*x1, 0.25*y0 + 0.75*y1]);
    }
    if (!closed) out.push(pts[n-1]);
    pts = out;
  }
  return pts;
}
```

Point count doubles per iteration: 1 = clipped corners, 2 = smooth at normal
stroke widths, 3–4 = fully smooth (practical max). Closed rings shrink
~1.5%/iteration — rescale about the centroid if area matters.

**Catmull-Rom → cubic bezier** — *interpolates* (points are meaningful
waypoints: flow traces, walk paths, displaced lines). Uniform form:
`B1 = P1 + (P2−P0)/6`, `B2 = P2 − (P3−P1)/6`. **Use the centripetal variant
(α = 0.5) for art** — provably no cusps/self-intersections with uneven
spacing. Easiest route in this bag:

```js
const path = lib.shape.line()
  .curve(lib.shape.curveCatmullRom.alpha(0.5))(pts);   // → d attribute string
// closed: lib.shape.curveCatmullRomClosed.alpha(0.5)
// Chaikin-like approximation: lib.shape.curveBasis / curveBasisClosed
```

[unverified]: hand-rolled non-uniform tangent scaling has several
equivalent-but-differently-scaled published forms — if you roll your own,
render a test path with uneven spacing and check for cusps; guard coincident
points (NaN). Choosing: Catmull-Rom interpolates, Chaikin/B-spline
approximates. For metaball/blob outlines prefer Chaikin — Catmull-Rom
overshoots at merge necks (pinch artifact).

## 11. Space colonization (Runions et al. 2007) — and DLA

Convincing trees and leaf venation — branching responds to available space;
the crown fills whatever region you seed with attractors. Per iteration: each
attractor pulls its single nearest node within influence radius `d_i`; each
pulled node grows one child of length `D` toward the average pull direction;
attractors within kill radius `d_k` of any node are consumed.

```js
let nodes = [root];
let attractors = poissonDisc(crownShape, ...);   // poisson-disc, NOT uniform random
// pre-phase: extend the trunk upward until some attractor is within d_i
for (let it = 0; it < MAX && attractors.length; it++) {
  const pull = new Map();
  for (const a of attractors) {                  // 1. associate: nearest node within d_i
    let best = null, bd = D_I;
    for (const n of grid.near(a, D_I)) { const d = dist(a, n); if (d < bd) { bd = d; best = n; } }
    if (best) { const v = norm(sub(a, best));
      const p = pull.get(best) ?? {x: 0, y: 0, c: 0};
      p.x += v.x; p.y += v.y; p.c++; pull.set(best, p); }
  }
  if (!pull.size) break;                         // stalled
  for (const [n, p] of pull) {                   // 2. grow one child per pulled node
    const d = norm({x: p.x/p.c + JITTER*random.range(-0.5, 0.5) + TROPISM.x,
                    y: p.y/p.c + JITTER*random.range(-0.5, 0.5) + TROPISM.y});
    const child = {x: n.x + d.x*D, y: n.y + d.y*D, parent: n};
    nodes.push(child); grid.insert(child);
  }
  attractors = attractors.filter(a => !grid.near(a, D_K).length);   // 3. prune consumed
}
```

| param | default | notes |
|---|---|---|
| node step `D` | 2–5 units | resolution knob |
| influence `d_i` | 8–20 × D | large = sweeping branches; small = twiggy; ∞ is valid and distinctive |
| kill `d_k` | 1.5–4 × D | **must be > D** or infinite oscillation |
| attractors | 500–5000, poisson-disc | uniform-random clumps → lumpy crowns |
| tropism | 0–0.3 magnitude | constant bias (gravity/light) |
| jitter | 0–0.15 | breaks degenerate symmetric forks |

[unverified]: Runions' exact recommended multiples. Branch thickness: da Vinci
rule `r_parent^n = Σ r_child^n`, n ≈ 2–3, assigned by post-order traversal
from `r_min` leaves. Render the parent-pointer tree as edge-disjoint
leaf-to-root chains:

```js
function treeStrokes(particles) {
  const visited = new Set(), hasChild = new Set();
  for (const p of particles) if (p.parent) hasChild.add(p.parent);
  const strokes = [];
  for (const leaf of particles.filter(p => !hasChild.has(p))) {
    const chain = []; let c = leaf;
    while (c && !visited.has(c)) { visited.add(c); chain.push(c); c = c.parent; }
    if (c) chain.push(c);                        // join to already-drawn trunk
    if (chain.length > 1) strokes.push(polyPath(chain));
  }
  return strokes;
}
```

**The alternative — DLA** (diffusion-limited aggregation): random walkers stick
to a growing cluster → coral/frost/Lichtenberg dendrites, fractal dimension
≈ 1.71. Slower and less controllable than space colonization (which shapes its
crown directly via the attractor region), and its practical accelerations
(spawn-on-circle + adaptive walk-on-spheres step + spatial hash) carry
[unverified] justification details in the source. If you want DLA's specific
wispy look: stickiness 1.0 = dendrites, 0.05–0.2 = dense cauliflower; snap
each particle to tangency with the particle it hit; render with the same
leaf-to-root chain code above.

Composition tip: the attractor region IS the crown silhouette — seed
attractors inside a designed blob (superellipse, noise-wobbled circle), not
the whole canvas.

## 12. Phyllotaxis (golden-angle spiral)

Vogel's formula: sunflower-head packing — the densest natural-looking radial
dot arrangement.

```js
const GA = Math.PI * (3 - Math.sqrt(5));       // golden angle ≈ 137.507°
for (let i = 0; i < N; i++) {
  const r = c * Math.sqrt(i);                  // sqrt spacing = uniform density
  const a = i * GA;
  place(cx + r*Math.cos(a), cy + r*Math.sin(a), sizeOf(i));
}
```

N 200–3000; scale `c = targetRadius / Math.sqrt(N)`. Element size: constant =
classic seed head; growing with i = sunflower; `size ∝ sqrt(i)` keeps visual
density even. Any angle ≠ GA degrades into visible spiral arms — itself
usable: GA ± 0.5° produces deliberate spiral-arm moiré. Replace dots with
petals/polygons rotated along `a` for botanical looks.

Composition tip: phyllotaxis earns a dead-center placement — it is one of the
few motifs where a centered radial composition is the strong choice (§16).

## 13. Random walks

The art is entirely in the constraints — unbiased walks read as structureless
fuzz.

```js
// Momentum / correlated walk — the single most important fix:
let a = random.range(0, 2*Math.PI);
for (let i = 0; i < steps; i++) {
  a += (noise2D(i * 0.01, walkerId * 7.3)) * TURN;   // noise-driven turning → C¹ curves
  x += Math.cos(a) * step; y += Math.sin(a) * step;  // step 1-5, TURN 0.05-0.3 for elegance
  pts.push([x, y]);
}
```

- **Lattice vs continuous:** 4/8-neighbor integer walks give circuit-board
  aesthetics + trivial self-avoidance via a `Set`; continuous gives organic
  filaments (self-avoidance needs a segment spatial hash). Hex lattice is an
  underused middle ground.
- **Self-avoiding walk:** choose among unoccupied neighbor cells; trapping is
  intrinsic (naive SAW dies within a few hundred steps) — backtrack 5–20
  levels, or restart and keep the longest run.
- **Lévy flight:** `len = Math.min(stepMin * Math.pow(random.range(0,1), -1/ALPHA), stepMax)`,
  ALPHA 1.2–2.0; clusters connected by rare long ligatures. The `stepMax`
  clamp (5–20% of canvas) is essential. Render long jumps as pen-ups for
  island clusters, or as lines for spidery webs.
- **Boundaries, worst to best:** clamp (edge pile-up) < wrap (split the
  polyline at the seam!) < reflect < **soft steering** (add a centering force
  ∝ (dist/R)² so the walk curves away from edges — best-looking) <
  kill-and-respawn.

Reliable recipe: 20–200 walkers, noise-driven turning, soft-boundary steering,
stroke opacity 0.05–0.15, **one shared noise field so walkers braid**, slight
global drift.

Composition tip: many faint walkers sharing one field reads as a coherent
current; one bold walker reads as a drawing — pick one register, not both.

---

## 14. PALETTE CRAFT

**How many colors.** 2–3 is the strongest default; 4–6 the sweet spot for
layered work; beyond 6 reads as rainbow unless the colors form one ordered
ramp. Structure: **1 background + 1 dominant + 1–2 supporting + 1 accent**.

**Generate in OKLCH, not HSL.** HSL lightness is not perceptual (yellow vs
blue at the same nominal L differ wildly), so HSL-hue-variation at fixed L is
value-chaotic. OKLCH's L is perceptually uniform: fixing L fixes value;
varying L is a real value ladder. Lightness ladder + bounded hue arc:

```js
function oklchPalette({ n = 5, hueCenter = random.range(0, 360), hueArc = 40,
                        lMin = 0.30, lMax = 0.88, chromaPeak = 0.13,
                        jitterH = 4, jitterL = 0.015 } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const L = clamp(lerp(lMin, lMax, t) + random.gaussian(0, jitterL), 0.05, 0.98);
    const H = (hueCenter + (t - 0.5) * hueArc + random.gaussian(0, jitterH) + 360) % 360;
    const taper = Math.sin(Math.PI * t);            // chroma tapers at L extremes —
    const C = chromaPeak * (0.35 + 0.65 * taper);   // extreme-L colors can't hold chroma in sRGB
    out.push(gamutClampOklch(L, C, H));             // via culori: clampChroma / toGamut
  }
  return out;
}
```

Working ranges (practiced defaults, not published constants):

| Intent | L range | C peak | Hue arc |
|---|---|---|---|
| Paper-ink / plotter | 0.25–0.92 | 0.04–0.09 | 15–30° |
| Muted editorial | 0.30–0.88 | 0.07–0.13 | 30–60° |
| Saturated poster | 0.40–0.85 | 0.15–0.22 | 40–90° |
| Near-monochrome | 0.20–0.95 | 0.02–0.06 | 5–12° |
| Duotone | two clusters | 0.10–0.18 | two arcs 150–210° apart |

Hard rules: **total L span < 0.35 = flat, always**; chroma > ~0.20 is out of
sRGB gamut for many hues at extreme L — clamp with culori, never assume;
yellows/greens (H 90–150) hold far less chroma at low L than blues/purples (H
250–320) — scale `chromaPeak` down when sweeping through yellow. **Emit
hex/rgb into SVG attributes**, not `oklch()` strings — headless rasterizers
may not parse them [unverified current support].

**Most reliable recipe — analogous + complement accent:** 3–4 analogous
members spread ~24° apart around a base hue, L laddered 0.32→0.86, C ≈ 0.10;
one accent at base + 150–210° (split-complement is safest), MID lightness
(~0.60), chroma ×1.5, used sparingly. **The accent must differ in chroma AND
value, not only hue** — a same-L accent is invisible.

**Value structure over hue.** Squint test: if everything collapses to one
grey, there is no structure. Value carries form; hue contrast resolves weakly.
A 2-color piece with strong light/dark beats a 6-mid-tone piece every time.
Retarget each member's L to even rungs on [lMin, lMax]. Area distribution
(notan / 70-20-10): ~60–70% of area in one value zone, 20–30% secondary,
5–10% accent/extreme. Health checks (heuristic thresholds): `lSpan >= 0.30`;
at least one member ≥ 4.5:1 WCAG contrast vs background (the anchor);
min adjacent ΔL ≥ 0.04 between touching fills or edges vibrate.

**Assigning color to elements:**
- Default: weighted random — dominant 0.50 / mid 0.25 / mid2 0.15 / dark 0.05
  / accent 0.05. **Accent on 3–8% of elements or ≤10% of inked area** (below
  2% reads as a mistake, above 15% becomes a second dominant).
- Better: quota + shuffle — deterministic counts kill the "seed with zero
  accents" failure class entirely.
- **Spatially clustered accent beats scattered:** 1–3 accent seed points
  (radius 8–22% of min dimension), nearby elements get accent with p ≈ 0.35.
  Scattered = confetti; clustered = intent.
- By field value: interpolate in Lab/OKLab, never RGB (mud through grey), and
  **quantize the ramp to 3–6 bands** — continuous = mush, banded = shape.
- Never `palette[i % n]` on a spatially ordered list (stripes) — shuffle the
  index map per seed.
- Micro-variation (separates "generated" from "made"): jitter every fill in
  OKLCH — σ_L ≈ 0.02, σ_C ≈ 0.01, σ_H ≈ 3°; keep jitter an order of magnitude
  below the ladder step.

**Backgrounds — near-neutral, never pure.** `#fff` reads as "no decision",
`#000` crushes darks; the tiny offset is most of what makes output look
printed rather than screenshotted. Working near-neutrals (personal defaults,
not canonical): warm `#F4F1EA` (general default), `#EFE9DD` cream, `#E8E4DA`
bone, `#DCD6C8` kraft; cool `#F2F3F5`, `#E9EBEE`; darks `#14161A` cool
off-black, `#1A1614` warm off-black, `#22252B` charcoal. Better: generate so
the bg tracks the palette — hue borrowed from the dominant ± ~12°, **chroma
0.004–0.020** (above ~0.03 the bg becomes a palette member), L 0.93–0.97
light / 0.14–0.22 dark. Dark grounds need retuning: lMin +0.10, chromaPeak
×1.2. Assert: bg ≥ 3:1 contrast vs at least one member, and **bg L outside
the ladder's span** — a mid-ladder bg makes half the palette vanish.

---

## 15. COMPOSITION RULES

**Margins first.** Establish the frame before drawing anything; never draw
outside it except deliberate bleed. As a fraction of the shorter side:
0.04–0.06 tight/poster; **0.07–0.10 general default**; 0.12–0.18 gallery/mat.
Asymmetric beats symmetric: `mTop = 0.9m, mSide = m, mBottom = 1.35m` —
bottom-heavy optical centering (standard typographic practice; 1.35 is a
working default).

**Focal point.** Uniform interest = no interest. Rule-of-thirds intersection +
gaussian wobble (σ ≈ 4% of frame) so it's never mechanically on the line.
Also good: deliberate dead center (only for radial/mandala/phyllotaxis work —
center is only weak when accidental); off-canvas implied center (excellent
for flow fields); **two-point tension** — large low-contrast mass at one
third-point, small high-contrast accent diagonally opposite — the best
default for "movement". Bias density, element scale, accent probability, and
stroke weight toward the focal point with a gaussian falloff (σ ≈ 0.22 of the
diagonal).

**Density variation.** The most common generative failure is uniform density.
Modulate existence with a very-low-frequency noise field (freq ~0.0015/px),
gamma-sharpened (`Math.pow((n+1)/2, 1.8)`), plus the focal pull. Target ~4:1
sparse-to-dense (<2:1 invisible, >10:1 needs justified blank zones). For
points, variable-radius poisson-disc (§7) gives density variation with
locally even spacing.

**Negative space is a shape — design it.** Reserve ≥ ~15% of canvas as one
contiguous empty region: carve 1–2 void blobs (circle/superellipse with a
noise-wobbled edge, `r * (0.85 + 0.3 * (noise2D(...)+1)/2)`), reject elements
whose centroid falls inside. Voids should be **off-center and open onto an
edge/margin** — a floating central hole reads as a mistake. The inverse
(dense island in sparse field) is equally valid and often stronger.

**Gaussian vs uniform.** Uniform jitter reads as mechanical rubble (right for
Schotter-style order-to-chaos ramps); gaussian reads as hand wobble. Clamp
gaussian tails (e.g. ±2σ) — one 4σ outlier ruins a composed piece. Power-law
distributions for sizes and lengths (many small, few large) beat uniform
nearly everywhere: circle radii, flow-trace lengths, subdivision depths.

**Order with a wobble** — the central aesthetic of the field (Vera Molnár
lineage; her exact titles/"1% disorder" figure [unverified]): impose rigid
structure, perturb by a small bounded amount. Magnitudes: position σ =
0.02–0.15 × cell (a grid stops reading as a grid above ~0.4); rotation σ =
1–8° hand-drawn / 15–30° energetic; scale σ = 3–12%. **Ramp the wobble**
across the canvas (linear, radial, or noise) — constant wobble reads as
sloppiness; a gradient of wobble reads as intent and IS the composition. The
template (Georg Nees, "Schotter", c. 1968 [unverified] exact date):

```js
for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
  const t = j / (rows - 1);                              // 0 top → 1 bottom: the ramp
  const rot = random.range(-1, 1) * t * MAX_ROT;         // MAX_ROT ~ 45°
  const dx  = random.range(-1, 1) * t * MAX_D * s;       // MAX_D ~ 0.3-0.5 cell
  const dy  = random.range(-1, 1) * t * MAX_D * s;
  drawSquare(mx + i*s + dx, my + j*s + dy, s, rot);      // stroke only, no fill
}
```

**Largest shapes first.** SVG document order is paint order: sort by area
descending; big value-masses first, details on top. Assign the
darkest/highest-contrast colors to the smaller, later shapes. Structure into
named groups (`bg / masses / mid / detail / accent`); for stroke work, group
by color.

**Edge treatment — one binary decision per piece; mixed looks like a bug.**
Contain: reject/shrink anything crossing the frame (but keep placing elements
*near* the edge, and inset by stroke-width/2). Bleed: generate over a region
10–20% larger than the canvas, clip with `clip-path`; elements must be
genuinely cut, not suspiciously terminating at the border. Hybrid (most
reliable): background bleeds full canvas, marks contained inside the margin —
the "print" look.

**Seeded reproducibility — non-negotiable discipline.** Same (code, seed) →
same art, always. Every random draw goes through the seeded `random.*` /
seeded noise — no `Math.random()`, ever, anywhere (one stray call breaks
reproducibility silently). Pass the seeded rng into noise construction too.
Record the seed in the SVG (e.g. a comment or `data-seed` attribute).
**Explore by seed sweep, tune by parameter change:** render 10–20 seeds at
fixed params to judge the parameter space (the piece is the space, not one
lucky seed — if most seeds are bad, fix the params, don't cherry-pick), and
change one parameter at a time at a fixed seed to see its effect. Derive
per-subsystem seeds from the master seed (e.g. `hash(seed, "palette")`) so
adding a draw in one subsystem doesn't reshuffle every other subsystem.
