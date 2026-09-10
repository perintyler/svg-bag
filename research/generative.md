# Generative SVG Technique Catalog

Compiled 2026-09-10 for an AI agent generating SVGs programmatically (server-side JS: SVG.js + d3 + noise libs).

**Provenance discipline.** Web research was blocked this session (expired OAuth + rate cap on the fetching service). Only the vpype material in §10 is sourced from live pages (marked VPYPE); everything else is written from practiced domain knowledge. Exact values, attributions, or API details that could not be confirmed are marked **[unverified]**. Standard, stable math (published algorithms, color formulas) is stated plainly. Before shipping instruction docs, verify the [unverified] ledger at the end against primary sources.

**The one-paragraph thesis.** A generative piece is a parameter space, not an image. Build a space where most seeds are good. Palette: constrain hue, structure value, ration the accent. Composition: fix the margin, place a focal point off-center, vary density, largest shapes first. Randomness: seed it, shape its distribution, clamp its tails. Every technique below emits polylines/paths; single-stroke, fill-free output (the plotter discipline, §10) also produces the best screen SVGs.

---

## 1. Noise-driven techniques

### 1.1 Flow fields (Tyler Hobbs method)

Visually: hair-like, sinuous bundles of near-parallel strokes that swirl and converge — the signature contemporary generative look (Hobbs' *Fidenza* lineage **[unverified]** attribution detail).

Core method (per Hobbs' flow-field essay, reproduced from memory **[unverified]** in exact form): a grid of precomputed angles covering an area LARGER than the canvas; particles trace through it by repeatedly stepping in the local angle.

```js
// 1. Build the angle grid (extend 20-50% beyond canvas so curves bleed cleanly)
const res = cellSize;                      // ~ canvas.width / 100
const cols = Math.ceil(gen.w / res), rows = Math.ceil(gen.h / res);
const grid = [];
for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
  // (a) Perlin/simplex: smooth organic swirls
  grid[j*cols+i] = noise2D(i * nf, j * nf) * Math.PI * 2 * curl;
  // (b) or geometric: angle = (j/rows) * PI  (Hobbs shows this non-noise variant)
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
  return pts;                              // → one <path>, smoothed (§6)
}
```

Params and defaults: cell size ~1% of canvas width; noise frequency `nf` 0.05–0.2 per cell (lower = broader sweeps); `curl` 0.5 (angles span half-turn, calm) to 2+ (full multi-turn, chaotic); step length 1–5px (must be ≤ cell size or curves polygonize); steps 50–500. Line count 200–2000.

Quality moves (Hobbs-style, **[unverified]** as his exact prescriptions):
- **Start points matter more than the field**: Poisson-disc starts for even coverage; clustered/edge starts for composition.
- **Vary width and length** by a second noise field or by distance from a focal point; power-law lengths beat uniform.
- **Collision-aware variant**: keep a spatial hash of drawn points; stop a trace when it comes within `d` of an existing line → evenly spaced, non-crossing "topographic" bundles (this is the evenly-spaced-streamlines algorithm, Jobard & Lefer **[unverified]** attribution).
- Bidirectional tracing (trace from the seed both ways) centers strokes on their seeds.
- Curl noise / rotating the gradient 90° gives divergence-free fields — particles never bunch into sinks.

Failure modes: step > cell (jagged); field too high-frequency (scribble); uniform start points + uniform length (reads as fur, no composition); tracing off-grid without the extended generation area (lines die at canvas edge visibly).

### 1.2 Domain warping

Visually: marbled, folded, fluid distortion — noise fed through itself. Standard technique (Inigo Quilez's formulation is the common reference **[unverified]** exact constants):

```js
// f(p) = noise(p + a*noise(p + b*noise(p)))
function warped(x, y) {
  const qx = noise2D(x*f, y*f),          qy = noise2D(x*f + 5.2, y*f + 1.3);
  const rx = noise2D(x*f + a*qx + 1.7,   y*f + a*qy + 9.2);
  const ry = noise2D(x*f + a*qx + 8.3,   y*f + a*qy + 2.8);
  return noise2D(x*f + a*rx, y*f + a*ry);
}
```
`a` (warp strength) 1–4; one level of warp = gentle bend, two levels = full marbling. The arbitrary offsets (5.2, 1.3…) just decorrelate channels — any constants work. Use it anywhere a plain noise field feeds geometry: warp contour fields (§1.4), warp flow-field angles, or warp point positions directly (`x' = x + A*noise(...)`, A 5–15% of canvas).

### 1.3 Noise-displaced lines (Joy Division / *Unknown Pleasures* plot)

Visually: stacked horizontal lines with a mountain-range bulge in the middle; the canonical beginner-to-classic piece (generativeartistry.com has a tutorial of this name **[unverified]** its exact code).

```js
const rows = 40, margin = 0.15 * H;
for (let j = 0; j < rows; j++) {
  const y0 = margin + (j / (rows-1)) * (H - 2*margin);
  const pts = [];
  for (let i = 0; i <= 60; i++) {
    const x = mx + (i/60) * (W - 2*mx);
    // envelope: bulge in the center, flat at edges
    const env = Math.max(0, Math.sin(Math.PI * i/60)) ** 3;   // or gaussian
    const amp = env * maxAmp;                                  // maxAmp ~ H/10..H/5
    // random peaks: |gaussian| biased upward, or 1D noise along x
    const d = Math.abs(gaussian(rng, 0, amp)) * -1;            // displace upward
    pts.push([x, y0 + d * (noise2D(i*0.15, j*0.4)*0.5+0.75)]);
  }
  emit(smoothPath(pts));    // Catmull-Rom or Chaikin (§6)
}
```
Key craft: draw rows **back-to-front (top first)** and give each line an opaque fill in the background color below its curve — that's the hidden-line occlusion that makes peaks overlap like ridges. On a plotter, do real occlusion (§10.2) instead of fills. Params: rows 30–60; envelope exponent 2–4; amplitude ≤ ~3× row spacing or ridges tangle.

### 1.4 Terrain contours from noise (marching squares)

Sample fBm noise into a grid, extract 8–25 evenly spaced iso-levels with marching squares, stitch and smooth → topographic-map line art. Full marching-squares case table, interpolation, and stitching pseudocode in §5.6; fBm defaults: 4–6 octaves, lacunarity 2.0, gain 0.5. Domain-warp the field (§1.2) first for folded, geological-looking contours. Masking the field with a radial falloff (`field -= (r/R)^2`) turns edge-noise into an island. Plot-friendly: each contour is one closed polyline; drop contours shorter than ~0.5mm equivalent (§10).

---

## 2. Tiling

*(Authored from domain knowledge — the tiling research agent did not return in time. Standard algorithms stated plainly; attributions and tutorial-specific details marked.)*

### 2.1 Truchet tiles

Visually: a square grid where each cell holds one of a few rotations of a motif; because motifs meet edge midpoints, random rotations still produce continuous winding paths — mazes (diagonal variant) or smooth interlocking loops (arc variant).

```js
for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
  const x = i*s, y = j*s, v = rng() < 0.5;
  // Diagonal variant ("10 PRINT"): one of two diagonals
  emit(v ? line(x, y, x+s, y+s) : line(x+s, y, x, y+s));
  // Arc variant: two quarter-circles joining adjacent edge midpoints
  // v=0: arcs centered at (x,y) and (x+s,y+s); v=1: other two corners
  if (v) { arc(x, y, s/2, 0, 90); arc(x+s, y+s, s/2, 180, 270); }
  else   { arc(x+s, y, s/2, 90, 180); arc(x, y+s, s/2, 270, 360); }
}
```
The invariant that makes any random assignment work: every tile touches each edge **exactly at its midpoint**. Any tile set sharing that boundary condition can be mixed freely. Extensions: bias `v` by a noise field (ordered regions emerge); add double/triple concentric arcs per corner for woven density; weave over/under by breaking one arc where two cross **[unverified]** as a named standard technique.

**Multi-scale Truchet** (Christopher Carlson **[unverified]** — attribution from memory; he presented this at Bridges ~2018): tiles may be subdivided into 2×2 children at half scale. To keep continuity across a scale boundary, the motif must meet edges in a scale-compatible way: Carlson's tile set draws arcs meeting each edge at the midpoint **plus** small circles/caps at corners so a full-size edge (one midpoint contact) matches two half-size edges (contacts at 1/4 and 3/4). Practical recipe: recursively subdivide cells with probability `p(depth) ≈ 0.5^depth` (stop at depth 3–4), then render each leaf with Carlson-style tiles: arc pairs + corner dots + edge caps sized proportionally to the cell. **[unverified]**: his exact primitive inventory; verify against his "Multi-Scale Truchet Patterns" writeup before promising exact reproduction.

### 2.2 Wang tiles

Square tiles with colored edges; placement rule: adjacent edges must match colors. Produces aperiodic-looking texture from a small tile set — good for seamless organic pattern.

```js
// tile = {n, e, s, w} edge colors + a drawing
// Build a complete stochastic set: for k colors, generating all k^4 tiles
// always tiles trivially; the art is a curated SUBSET that still tiles.
// Scanline algorithm:
for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
  const need = {
    n: j > 0 ? placed[j-1][i].s : null,      // must match tile above
    w: i > 0 ? placed[j][i-1].e : null,      // and to the left
  };
  const options = tiles.filter(t =>
    (need.n === null || t.n === need.n) && (need.w === null || t.w === need.w));
  if (!options.length) { backtrack(); }       // or restart the row
  placed[j][i] = options[(rng()*options.length)|0];
}
```
Guarantee no dead ends by ensuring: for every (north-color, west-color) pair, at least one tile exists. With 2 edge colors that means covering all 4 (n,w) combos. Draw each tile's interior so strokes terminate at edge positions determined solely by that edge's color — then continuity is automatic. This generalizes truchet: truchet = Wang tiles where all edges share one color.

### 2.3 Hex and triangular grids

Standard axial-coordinate math (Red Blob Games is the canonical reference):

```js
// pointy-top hex, axial coords (q, r), size s (center→corner)
const hexToPixel = (q, r) => [ s * Math.sqrt(3) * (q + r/2), s * 1.5 * r ];
const pixelToHex = (x, y) => {         // fractional axial, then cube-round
  const q = (Math.sqrt(3)/3 * x - 1/3 * y) / s, r = (2/3 * y) / s;
  return cubeRound(q, r, -q-r);
};
function cubeRound(x, y, z) {
  let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
  const dx = Math.abs(rx-x), dy = Math.abs(ry-y), dz = Math.abs(rz-z);
  if (dx > dy && dx > dz) rx = -ry-rz;
  else if (dy > dz) ry = -rx-rz;
  else rz = -rx-ry;
  return [rx, ry];
}
const HEX_DIRS = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];   // neighbors: q+dq, r+dr
// corners of hex (q,r): angle = 60*k - 30 (pointy-top), k=0..5, radius s
```
Iterate a hex-shaped region: `for q in -N..N: for r in max(-N,-q-N)..min(N,-q+N)`.

Triangular grid: rows of alternating up/down triangles. Row j, column i: vertices from a rhombic lattice; triangle points up when `(i+j)` even. Or simply: place equilateral rows offset by half a base, connect. Subdivision: any triangle splits into 4 by connecting edge midpoints (uniform), or use Hobbs-style randomized splitting (§2.4).

### 2.4 Recursive subdivision

**Quadtree art.** Subdivide squares with depth-decreasing probability; render leaves.

```js
function quad(x, y, s, depth) {
  const p = pBase * Math.pow(decay, depth)          // pBase 0.9-1.0, decay 0.6-0.8
          * (0.5 + densityField(x + s/2, y + s/2)); // spatial modulation = composition
  if (depth < maxDepth && rng() < p) {
    const h = s/2;
    quad(x,y,h,depth+1); quad(x+h,y,h,depth+1); quad(x,y+h,h,depth+1); quad(x+h,y+h,h,depth+1);
  } else drawLeaf(x, y, s, depth);                  // color/weight by depth (§8)
}
```
maxDepth 5–7. Driving `p` by an image's local detail or a noise field is what turns this from texture into composition.

**Mondrian.** Recursive rect splitting with anti-sliver rules:

```js
function mondrian(r, depth) {
  const canH = r.w > minSize*2, canV = r.h > minSize*2;
  if (depth >= maxDepth || (!canH && !canV) || rng() < stopP) return leaves.push(r);
  const horiz = canH && (!canV || rng() < r.w / (r.w + r.h));  // split the long way
  const t = 0.35 + rng() * 0.3;                                // split at 35-65%, never mid-extreme
  if (horiz) { mondrian({...r, w: r.w*t}, depth+1); mondrian({x: r.x + r.w*t, y: r.y, w: r.w*(1-t), h: r.h}, depth+1); }
  else       { mondrian({...r, h: r.h*t}, depth+1); mondrian({x: r.x, y: r.y + r.h*t, w: r.w, h: r.h*(1-t)}, depth+1); }
}
// Coloring: mostly white/near-neutral leaves; primary red/blue/yellow on ~15-25%;
// heavy black borders (stroke ~ 1-2% of canvas). stopP 0.1-0.25.
```

**Aesthetically pleasing triangle subdivision** (Tyler Hobbs — he has an essay by this name; method reproduced from memory **[unverified]** in its specifics): recursively split triangles, but (a) always split the **longest edge** — this is the anti-sliver rule, since splitting a short edge of an already-thin triangle makes needles; (b) split at a **randomized point away from the midpoint** — uniform in roughly the middle 30–70% of the edge (gaussian around 0.5, σ≈0.1, clamped) so the result is irregular but never degenerate; (c) stop by area threshold or depth, optionally modulated spatially.

```js
function splitTri(t, depth) {
  if (depth >= maxDepth || area(t) < minArea || rng() < stopP) return out.push(t);
  const [a, b, c] = longestEdgeFirst(t);       // a-b is the longest edge
  const u = clamp(gaussian(rng, 0.5, 0.12), 0.3, 0.7);
  const p = lerp2(a, b, u);
  splitTri([a, p, c], depth+1); splitTri([p, b, c], depth+1);
}
```
Start from 2–4 big triangles covering the frame (or a triangulated random polygon). Color by depth ladder + jitter (§8). Verify the 30–70% band and σ against Hobbs' essay when web access returns.

### 2.5 Penrose P3 (rhombus) tiling — deflation

Standard substitution scheme, stated plainly. Two rhombs: thick (72°/108°) and thin (36°/144°). Represent each as a pair of mirror-image "half-rhomb" triangles; deflate each triangle into smaller ones scaled by 1/φ (φ = (1+√5)/2):

```js
// Robinson triangle representation: type 'A' (half-thick), 'B' (half-thin),
// each as (apex v0, base v1, v2) with orientation implied by vertex order.
function deflate(tris) {
  const out = [];
  for (const {type, v0, v1, v2} of tris) {
    if (type === 'A') {                        // half-thick → 2 thick halves + 1 thin half
      const p = add(v0, scale(sub(v1, v0), 1/PHI));
      out.push({type:'A', v0: v2, v1: p,  v2: v1});
      out.push({type:'B', v0: p,  v1: v2, v2: v0});
    } else {                                   // half-thin → 1 thin + 1 thick half
      const q = add(v1, scale(sub(v0, v1), 1/PHI));
      const r = add(v1, scale(sub(v2, v1), 1/PHI));
      out.push({type:'B', v0: r,  v1: v2, v2: v0});
      out.push({type:'A', v0: q,  v1: r,  v2: v1});
      out.push({type:'B', v0: r,  v1: q,  v2: v1});   // [unverified] exact split of B — verify vertex orders against a reference implementation; getting one triangle's orientation wrong produces visible cracks
    }
  }
  return out;
}
// Seed: 10 'A' half-triangles fanned around the origin (angles k*36°), alternating mirror.
// 5-8 deflation rounds. Merge mirror-pairs back into rhombs for rendering; color by type.
```
The exact vertex bookkeeping is the notorious fiddly part — test visually: correct output has global 5-fold symmetry from the fan seed and **no** gaps/overlaps.

---

## 3. Packing & distribution

### 3.1 Circle packing

Visually: organic clusters of tangent-but-not-overlapping circles; size hierarchy does the aesthetic work.

**Progressive placement with retry (the standard art version):**

```js
const circles = [];
for (let tries = 0; tries < MAX_TRIES && circles.length < N; tries++) {
  const r = powerLaw(rng, rMin, rMax, 2.2);          // many small, few large — crucial
  const x = m + rng()*(W-2*m), y = m + rng()*(H-2*m);
  let ok = true;
  for (const c of nearby(x, y, r + rMaxSoFar + pad)) // spatial hash!
    if (Math.hypot(x-c.x, y-c.y) < r + c.r + pad) { ok = false; break; }
  if (ok) circles.push({x, y, r});
}
// Sort DESCENDING by r before the loop's radius draw if you want strict
// largest-first (place big ones early while space exists).
```

**Grow-until-collision variant:** place a point (collision-free at r=rMin), then grow `r += dr` each step until it touches a neighbor or hits rMax — packs much tighter, circles kiss.

Params: pad 0–2px (0 = tangent look); rMax/rMin ratio 10–50× for hierarchy; MAX_TRIES 10k–500k (acceptance collapses as the canvas fills — that's normal; stop when e.g. 2000 consecutive tries fail). Spatial hash with cell ≈ 2·rMax is mandatory past ~1k circles. Variants: pack inside an arbitrary polygon mask (reject centers outside, or clamp r to distance-to-boundary); nested packing (recursively pack inside big circles); size by field value.

### 3.2 Poisson-disc sampling (Bridson 2007)

Standard algorithm, stated plainly. Uniform-feeling points with guaranteed min distance r — blue noise in O(n).

```js
function poissonDisc(W, H, r, rng, k = 30) {
  const cell = r / Math.SQRT2;                        // grid cell holds ≤ 1 point
  const gw = Math.ceil(W/cell), gh = Math.ceil(H/cell);
  const grid = new Int32Array(gw*gh).fill(-1);
  const pts = [], active = [];
  const insert = p => { pts.push(p); active.push(pts.length-1);
    grid[Math.floor(p[1]/cell)*gw + Math.floor(p[0]/cell)] = pts.length-1; };
  insert([rng()*W, rng()*H]);
  while (active.length) {
    const ai = (rng()*active.length)|0, p = pts[active[ai]];
    let placed = false;
    for (let t = 0; t < k; t++) {
      const a = rng()*2*Math.PI, d = r*(1 + rng());   // annulus [r, 2r)
      const q = [p[0]+Math.cos(a)*d, p[1]+Math.sin(a)*d];
      if (q[0]<0||q[1]<0||q[0]>=W||q[1]>=H) continue;
      const gi = Math.floor(q[0]/cell), gj = Math.floor(q[1]/cell);
      let ok = true;
      for (let j = Math.max(0,gj-2); j <= Math.min(gh-1,gj+2) && ok; j++)
        for (let i = Math.max(0,gi-2); i <= Math.min(gw-1,gi+2) && ok; i++) {
          const idx = grid[j*gw+i];
          if (idx >= 0 && Math.hypot(q[0]-pts[idx][0], q[1]-pts[idx][1]) < r) ok = false;
        }
      if (ok) { insert(q); placed = true; break; }
    }
    if (!placed) active.splice(ai, 1);
  }
  return pts;
}
```
k=30 is Bridson's published default. Variable-density version: make `r` a function `radiusAt(x,y)` driven by a noise/image field (check against `radiusAt(q)`) — density variation with locally even spacing, the best of both.

### 3.3 Blue noise vs white noise vs jittered grid vs Lloyd — when each looks right

- **White noise** (uniform random): clumps and voids. Looks accidental. Use only when "scattered carelessly" IS the aesthetic, or as input to relaxation.
- **Jittered grid**: cheap blue-noise substitute; retains faint grid ghosting at low jitter.
  ```js
  for (j...) for (i...) pts.push([ (i + 0.5 + (rng()-0.5)*jit) * cell,
                                   (j + 0.5 + (rng()-0.5)*jit) * cell ]);
  // jit 0.5-0.8: even but organic; jit 1.0: near-white-noise; jit < 0.3: visible grid
  ```
- **Poisson-disc / blue noise**: even without pattern; the default for stipples, flow-field seeds, tree attractors, anything that should look "naturally distributed."
- **Lloyd relaxation** (§5.1): converges any point set toward centroidal uniformity; 1–2 iterations de-clumps white noise while keeping character; 10+ looks manufactured/honeycomb.

Rule: if points represent *things* (trees, dots, seeds) use blue noise; if they represent *accidents* (splatter, stars — real stars cluster) use white noise or clustered distributions.

### 3.4 Georg Nees, "Schotter" (c. 1968 **[unverified]** exact date)

The canonical order-to-chaos piece: a grid of squares (originally ~12 columns × ~22 rows **[unverified]**) where rotation and positional displacement increase linearly-ish from top (perfect grid) to bottom (tumbling rubble).

```js
for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
  const t = j / (rows - 1);                            // 0 top → 1 bottom: the ramp
  const rot = (rng()*2 - 1) * t * MAX_ROT;             // MAX_ROT ~ 45° (up to ~90°)
  const dx  = (rng()*2 - 1) * t * MAX_D * s;           // MAX_D ~ 0.3-0.5 cell
  const dy  = (rng()*2 - 1) * t * MAX_D * s;
  drawSquare(mx + i*s + dx, my + j*s + dy, s, rot);    // stroke only, no fill
}
```
Uniform (not gaussian) jitter matches the original's character **[unverified]**. Generalizations: ramp along any axis/radius/noise field; ramp scale or color too — this is the template for every "order with a wobble" gradient (§9.5).

---

## 4. Growth & simulation

*(From the growth-research payload — domain knowledge, [unverified] markers preserved.)*

### 4.0 Shared SVG substrate

All growth algorithms produce polylines. One `<path>` per continuous stroke, `fill:none`, stroke-width ~0.3–0.5mm; simplify before export (Douglas-Peucker ε ≈ 0.1–0.25 units) — growth algorithms emit far more nodes than needed.

```js
const P = n => `${n.x.toFixed(2)},${n.y.toFixed(2)}`;
const polyPath = (pts, closed=false) =>
  'M' + P(pts[0]) + 'L' + pts.slice(1).map(P).join('L') + (closed ? 'Z' : '');
// smoothPath: Catmull-Rom → cubic bezier, see §6.2
```

**Spatial hashing is the common dependency** (DLA, differential growth, space colonization, continuous self-avoiding walks, physarum). Write one flat-array grid (cell size = the algorithm's interaction radius, scan the 3×3 neighborhood); `Map<string,Array>` is fine to ~20k items, a bottleneck beyond.

### 4.1 L-systems

Visually: deterministic self-similar line work — space-filling mazes, crystalline coastlines, ferns and bushes. Plots beautifully: every stroke is a continuous turtle path.

```js
function expand(axiom, rules, iters) {
  let s = axiom;
  for (let i=0;i<iters;i++)
    s = [...s].map(c => {
      const r = rules[c];
      if (!r) return c;
      if (typeof r === 'string') return r;
      let x = rng(); for (const o of r) if ((x -= o.p) <= 0) return o.to;  // stochastic
      return r[r.length-1].to;
    }).join('');
  return s;
}
function turtle(str, {angle, step, startAngle=-90}) {
  const rad = a => a*Math.PI/180;
  let st = {x:0, y:0, a: startAngle, step};
  const stack = [], paths = [];
  let cur = [{x: st.x, y: st.y}];
  for (const c of str) {
    if ('FGAB'.includes(c)) {          // draw forward (see per-ruleset conventions!)
      st.x += Math.cos(rad(st.a))*st.step; st.y += Math.sin(rad(st.a))*st.step;
      cur.push({x: st.x, y: st.y});
    } else if (c === 'f') { if (cur.length>1) paths.push(cur);
      st.x += Math.cos(rad(st.a))*st.step; st.y += Math.sin(rad(st.a))*st.step;
      cur = [{x: st.x, y: st.y}]; }
    else if (c === '+') st.a += angle;
    else if (c === '-') st.a -= angle;
    else if (c === '|') st.a += 180;
    else if (c === '[') stack.push({...st});
    else if (c === ']') {              // pop MUST split the polyline (see failure modes)
      if (cur.length>1) paths.push(cur);
      st = stack.pop(); cur = [{x: st.x, y: st.y}]; }
    else if (c === '!') st.step *= 0.8;   // taper per branch level (0.7-0.9)
  }
  if (cur.length>1) paths.push(cur);
  return paths;
}
```

Classic rulesets (from *The Algorithmic Beauty of Plants* family — stable and widely reproduced, but **[unverified]** verbatim; note per-ruleset draw conventions, the top source of "curve comes out wrong"):

| Name | Axiom | Rules | Angle | Iters | Draw convention |
|---|---|---|---|---|---|
| Koch quadratic | `F` | `F → F+F-F-F+F` | 90° | 3–5 | F draws |
| Koch snowflake | `F--F--F` | `F → F+F--F+F` | 60° | 3–5 | F draws |
| Dragon curve | `FX` | `X → X+YF+`, `Y → -FX-Y` | 90° | 10–16 | X,Y non-drawing |
| Sierpinski arrowhead (single stroke — best plotter form) | `A` | `A → B-A-B`, `B → A+B+A` | 60° | 6–9 | A,B BOTH draw |
| Sierpinski triangle | `F-G-G` | `F → F-G+F+G-F`, `G → GG` | 120° | 4–7 | F,G both draw |
| Hilbert | `A` | `A → +BF-AFA-FB+`, `B → -AF+BFB+FA-` | 90° | 4–7 | A,B non-drawing; only F draws |
| Peano | `X` | `X → XFYFX+F+YFXFY-F-XFYFX`, `Y → YFXFY-F-XFYFX+F+YFXFY` | 90° | 3–4 (grows 9^n) | X,Y non-drawing |
| Fern (canonical) | `X` | `X → F+[[X]-X]-F[-FX]+X`, `F → FF` | 25° | 5–7 | X non-drawing |
| Simple bush | `F` | `F → FF+[+F-F-F]-[-F+F+F]` | 22.5° | 4–5 | F draws |
| Sparse tree | `F` | `F → F[+F]F[-F]F` | 25.7° | 4–6 | F draws |
| Symmetric bush | `F` | `F → F[+F]F[-F][F]` | 20° | 4–6 | F draws |
| Three-way branch | `F` | `F → FF-[-F+F+F]+[+F-F-F]` | 22.5° | 4–5 | F draws |

Angles 20–26° are the naturalistic band; below 15° reads as a broom, above 35° as a shrub. **Cheapest single aesthetic upgrade — stochastic rules + angle jitter:**
```js
rules = { F: [ {p:0.34, to:'F[+F]F[-F]F'}, {p:0.33, to:'F[+F]F'}, {p:0.33, to:'F[-F]F'} ] };
// and per-turn: st.a += angle * (1 + (rng()-0.5)*0.4)
```

Failure modes: string explosion (cap length ~2–5M chars); scale unknown until drawn — run turtle at step=1, measure bbox, rescale, never guess; bracket-imbalance → guard `stack.pop()`; sub-pen-width segments at high iterations → filter; and the #1 rendering bug: not splitting the path at `]` (spurious strokes across the drawing). Track `stack.length` for depth-based stroke-width.

### 4.2 Diffusion-limited aggregation (DLA)

Visually: coral/frost/Lichtenberg branching — dendritic, thick-tipped, sparse interior (outer branches screen the center). Fractal dimension ≈ 1.71 in 2D.

Practical version — spawn on circle + adaptive step + spatial hash (naive per-pixel walking is correct but unusably slow):

```js
const R_P = 2;                          // particle radius (off-lattice)
let clusterR = 0; insert({x:0, y:0, parent:null});
for (let n=0; n<N; n++) {
  const spawnR = clusterR + SPAWN_PAD, killR = spawnR * KILL_MULT;
  let a = rng()*2*Math.PI, x = Math.cos(a)*spawnR, y = Math.sin(a)*spawnR;
  for (let s=0; s<MAX_STEPS; s++) {
    const d = Math.hypot(x,y);
    if (d > killR) break;
    // ADAPTIVE STEP: far from the cluster, one uniform-angle jump of the slack
    // distance is an exact sample of the walk (walk-on-spheres) [unverified: formal justification]
    const slack = d - clusterR - R_P*2;
    const step = slack > R_P ? slack : R_P;
    a = rng()*2*Math.PI; x += Math.cos(a)*step; y += Math.sin(a)*step;
    if (step === R_P) {
      let hit = null;
      for (const p of near(x,y)) if ((x-p.x)**2+(y-p.y)**2 < (2*R_P)**2) { hit = p; break; }
      if (hit && rng() < STICKINESS) {
        const dx=x-hit.x, dy=y-hit.y, m=Math.hypot(dx,dy);   // snap to tangency
        const q = {x: hit.x+dx/m*2*R_P, y: hit.y+dy/m*2*R_P, parent: hit};
        insert(q); clusterR = Math.max(clusterR, Math.hypot(q.x,q.y)); break;
      }
    }
  }
}
```

| param | default | range | effect |
|---|---|---|---|
| STICKINESS | 1.0 | 0.02–1.0 | **the aesthetic dial**: 1.0 = wispy dendrites; 0.05–0.2 = dense cauliflower |
| SPAWN_PAD | 5–10 × R_P | | too small biases growth toward spawn |
| KILL_MULT | 1.5–3 | <1.5 visibly distorts shape | |
| N | 5k–50k | to 1M with hashing | |

Failure modes: spawn/kill radius too tight → lopsided cluster; missing adaptive step → hours; hash cell < 2×R_P → tunneling; no tangency snap → mush.

SVG rendering — DLA is a parent-pointer **tree**; best plotter form is edge-disjoint leaf-to-root chains:

```js
function dlaStrokes(particles) {
  const visited = new Set(), hasChild = new Set();
  for (const p of particles) if (p.parent) hasChild.add(p.parent);
  const strokes = [];
  for (const leaf of particles.filter(p => !hasChild.has(p))) {
    const chain = []; let c = leaf;
    while (c && !visited.has(c)) { visited.add(c); chain.push(c); c = c.parent; }
    if (c) chain.push(c);                 // join to already-drawn trunk
    if (chain.length > 1) strokes.push(polyPath(chain));
  }
  return strokes;
}
```
(Or rasterize occupancy and take the marching-squares outline, §5.6.)

### 4.3 Differential growth (Inconvergent's signature)

Visually: a circle that buckles into brain-coral / intestinal folds, never self-intersecting. Three forces per node + node insertion:

```js
function step(nodes, P) {                       // closed loop; rebuild hash EVERY frame
  const idx = buildHash(nodes, P.repulsionRadius);
  const force = nodes.map(() => ({x:0, y:0}));
  for (let i=0; i<nodes.length; i++) {
    const n = nodes[i], prev = nodes[(i-1+nodes.length)%nodes.length],
          next = nodes[(i+1)%nodes.length];
    // 1. attraction to chain neighbors (midpoint pull)
    force[i].x += ((prev.x+next.x)/2 - n.x) * P.attraction;
    force[i].y += ((prev.y+next.y)/2 - n.y) * P.attraction;
    // 2. repulsion from ALL spatially-near nodes — this creates the folding
    for (const m of idx.near(n.x, n.y)) {
      if (m === n || m === prev || m === next) continue;
      const dx = n.x-m.x, dy = n.y-m.y, d = Math.hypot(dx,dy) || 1e-6;
      if (d < P.repulsionRadius) {
        const w = 1 - d/P.repulsionRadius;
        force[i].x += dx/d * w * P.repulsion; force[i].y += dy/d * w * P.repulsion;
      }
    }
    // 3. alignment/smoothing (same midpoint pull, separate small gain)
  }
  for (let i=0;i<nodes.length;i++) {            // two-pass integrate, clamped
    const f = force[i], m = Math.hypot(f.x,f.y), s = m > P.maxDisp ? P.maxDisp/m : 1;
    nodes[i].x += f.x*s; nodes[i].y += f.y*s;
  }
  for (let i=nodes.length-1; i>=0; i--) {       // 4. subdivide long edges
    const a = nodes[i], b = nodes[(i+1)%nodes.length];
    if (Math.hypot(b.x-a.x, b.y-a.y) > P.splitLength)
      nodes.splice(i+1, 0, {x:(a.x+b.x)/2, y:(a.y+b.y)/2});
  }
}
```

| param | default | range | notes |
|---|---|---|---|
| repulsionRadius | 20 | 1.5–3 × splitLength | **must exceed splitLength** or nothing folds |
| splitLength | 10 | 5–20 | sets fold wavelength |
| attraction | 0.15 | 0.05–0.5 | too high → collapse |
| repulsion | 0.4 | 0.1–1.0 | too high → jitter explosion |
| alignment | 0.1 | 0–0.45 | high = smooth cerebral folds |
| maxDisp | 0.5–1.0/step | | the stability guarantee |
| iterations | 500–5000 | start: 10–60 nodes on a circle | |

**[unverified]** Inconvergent's own parameter values/naming (he uses near/far radii) — check inconvergent.net. Failure modes: self-intersection (maxDisp too big, stale hash — rebuild every iteration; once crossed, never recovers); O(n²) death without a hash; exclude ±2 chain-neighbors from repulsion if edges buzz; **uniform growth is boring** — modulate splitLength or insertion probability by a noise field/image (this is where the good outputs live); Jacobi (two-pass) integration, not in-place, or you get directional drift.

SVG: already a single closed polyline — the most plotter-friendly algorithm here. Drawing every Nth iteration faintly gives layered topographic stacks.

### 4.4 Space colonization (Runions et al. 2007)

Visually: convincing trees/venation — branching responds to available space; crown fills the region you seed with attractors. Per iteration: each attractor pulls its single nearest node within `d_i`; each pulled node grows one child of length `D` toward the average pull; attractors within `d_k` of any node are consumed.

```js
let nodes = [root]; let attractors = poissonDisc(crownShape, ...);  // NOT uniform random
// pre-phase: extend trunk upward until some attractor is within d_i
for (let it=0; it<MAX && attractors.length; it++) {
  const pull = new Map();
  for (const a of attractors) {                 // 1. associate
    let best = null, bd = D_I;
    for (const n of grid.near(a, D_I)) { const d = dist(a,n); if (d < bd) { bd = d; best = n; } }
    if (best) { const v = norm(sub(a, best));
      const p = pull.get(best) ?? {x:0,y:0,c:0}; p.x+=v.x; p.y+=v.y; p.c++; pull.set(best,p); }
  }
  if (!pull.size) break;                        // stalled
  for (const [n, p] of pull) {                  // 2. grow
    let d = norm({x: p.x/p.c + JITTER*(rng()-0.5) + TROPISM.x,
                  y: p.y/p.c + JITTER*(rng()-0.5) + TROPISM.y});
    const child = {x: n.x + d.x*D, y: n.y + d.y*D, parent: n};
    nodes.push(child); grid.insert(child);
  }
  attractors = attractors.filter(a => !grid.near(a, D_K).length);   // 3. prune
}
```

| param | default | notes |
|---|---|---|
| node step D | 2–5 units | resolution knob |
| influence d_i | 8–20 × D | large = sweeping branches; small = twiggy; ∞ is valid & distinctive |
| kill d_k | 1.5–4 × D | **must be > D** or infinite oscillation |
| attractors | 500–5000, Poisson-disc | uniform-random clumps → lumpy crowns |
| tropism | 0–0.3 magnitude | constant bias (gravity/light) |
| jitter | 0–0.15 | breaks degenerate symmetric forks |

**[unverified]** Runions' exact recommended multiples. Render like DLA (leaf-to-root chains). Branch thickness: da Vinci rule `r_parent^n = Σ r_child^n`, n ≈ 2–3, assigned by post-order traversal from `r_min` leaves.

### 4.5 Random walks

The art is entirely in the constraints — unbiased walks read as structureless fuzz.

- **Momentum / correlated walk** (the single most important fix): `a += (rng()-0.5)*TURN` with TURN 0.2–0.6 rad, or better `a += (noise1D(i*0.01)-0.5)*TURN` — Perlin-driven turning gives C¹ sinuous curves. Step 1–5, TURN 0.05–0.3 for elegance.
- **Lattice vs continuous**: 4/8-neighbor integer walks give circuit-board aesthetics + trivial self-avoidance via a `Set`; continuous gives organic filaments (self-avoidance needs a segment spatial hash). Hex lattice is an underused middle ground.
- **Self-avoiding walk**: choose among unoccupied neighbor cells; **trapping is intrinsic** (naive SAW dies within a few hundred steps) — backtrack 5–20 levels, or restart and keep the longest run.
- **Lévy flight**: `len = min(stepMin * u^(-1/ALPHA), stepMax)`, ALPHA 1.2–2.0; clusters connected by rare long ligatures. The stepMax clamp (5–20% of canvas) is essential. Render long jumps as pen-ups for island clusters, or as lines for spidery webs.
- **Boundaries**, worst to best: clamp (edge pile-up), wrap (split the polyline at the seam!), reflect (`a = π−a` / `a = −a`), **soft steering** (add centering force ∝ (dist/R)²; the walk curves away from edges — best-looking), kill-and-respawn.

Reliable recipe: 20–200 walkers, momentum ≈0.95, Perlin turning, soft-boundary steering, stroke opacity 0.05–0.15, one shared noise field so they braid, slight global drift.

### 4.6 Bonus: reaction-diffusion, physarum, sand

**Gray-Scott reaction-diffusion → contours.** Turing spots/stripes/mazes; extract isolines for clean plottable line work.
```js
// A,B float grids; Da=1.0, Db=0.5, dt=1.0; 9-point laplacian
// (weights 0.2 orthogonal / 0.05 diagonal / -1 center are the commonly used ones
//  [unverified — verify against Karl Sims' RD tutorial, the canonical source])
A2[i] = a + (Da*lap(A,i) - a*b*b + feed*(1-a)) * dt;
B2[i] = b + (Db*lap(B,i) + a*b*b - (kill+feed)*b) * dt;
```
(feed, kill) pairs **[unverified — from the widely-circulated Sims-derived table]**: mitosis 0.0367/0.0649; coral 0.0545/0.062; maze 0.029/0.057; spots 0.035/0.065; solitons 0.062/0.0609. Seed a small random B blob in A=1; run 5k–20k steps; wrap toroidally. Failure: NaN blow-up if dt too large (CFL); uniform decay if f/k wrong. Extract with marching squares at 3–8 levels, stitch to closed loops, simplify, smooth.

**Physarum (Jones 2010).** Agents sense a trail map at three offset sensors, turn toward the strongest, deposit, diffuse+decay the map → living transport networks that coarsen over time. Defaults **[unverified against the paper]**: sensor offset 9px, sensor/rotation angle 22.5–45°, step 1px, deposit 5, decay 0.1, agents 5–15% of grid cells; diffusion (3×3 mean) is mandatory. Failure: sensors closer than step → no network; decay too high → trails vanish; too low → saturation. Render via contours or faint agent paths.

**Sand / pixel-flow (Inconvergent).** Draw the same line hundreds of times with tiny perturbations at very low opacity; accumulated density becomes tone.
```js
for (let s=0; s<STROKES; s++)                    // STROKES 30-1000, ALPHA 0.01-0.1
  emit(polyPath(pts.map((p,i) => {
    const taper = Math.sin(Math.PI * i/(pts.length-1));   // pin endpoints
    const r = gaussian(rng, 0, SPREAD) * taper;           // SPREAD 1-3 units
    return offsetAlongNormal(pts, i, r);
  })), {opacity: ALPHA, width: 0.4});
```
Coherent grain: perturb via a noise field instead of pure gaussian. **This is a raster/screen technique — on a plotter it's a trap** (1000 faint strokes = 1000 opaque strokes, torn paper); the plotter equivalent is hatch density. Watch file size: decimate points, round coords to 1–2 decimals.

---

## 5. Geometry

*(From the geometry-research payload — domain knowledge; standard algorithms ship-as-is, four items flagged for verification.)*

### 5.1 Voronoi / Delaunay (d3-delaunay)

```js
import {Delaunay} from "d3-delaunay";               // v6+ is ESM-only [unverified: version drift]
const delaunay = Delaunay.from(points);              // or (pts, fx, fy) for objects
const voronoi  = delaunay.voronoi([0,0,W,H]);        // bounds REQUIRED
voronoi.cellPolygon(i);      // closed [[x,y],...] or null — for filled cells
voronoi.render();            // one path string, shared edges drawn ONCE — for line art
delaunay.triangles;          // flat Uint32Array, 3 indices per triangle — mesh art
delaunay.neighbors(i);       // generator of adjacent point indices
delaunay.find(x, y, hint);   // nearest input point; hint makes raster scans O(1) amortized
```

**Shattered glass**: radially non-uniform density around an impact point + per-cell variation — `r = pow(rng(), 2.2) * maxR` (exponent 1.5–3, higher = tighter core), angle uniform. Stroke cells thin in a near-background hue; fill lightness = f(distance) + 3–8% jitter; shrink each cell 1–3% toward its centroid to open hairline crack seams (this is what sells it).

**Organic cells**: blue-noise input points (Poisson-disc), then round each cellPolygon with Chaikin (2 iters, closed) or Catmull-Rom → soft biological tissue.

**Lloyd relaxation** — iteration count is the aesthetic dial: 0 = raw variety, 1–2 = organic sweet spot, 5–10 = honeycomb-ish, 50+ = boring hex lattice. Use the shoelace-weighted centroid, not the vertex mean (vertex mean biases relaxation):

```js
function polygonCentroid(poly) {          // poly closed: last == first
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < poly.length - 1; i++) {
    const [x0,y0] = poly[i], [x1,y1] = poly[i+1];
    const f = x0*y1 - x1*y0;
    a += f; cx += (x0+x1)*f; cy += (y0+y1)*f;
  }
  a *= 0.5;
  return Math.abs(a) < 1e-12 ? poly[0] : [cx/(6*a), cy/(6*a)];
}
```

**Triangle art**: fill each Delaunay triangle with a source-image color sampled at its centroid (low-poly look); overlap triangles ~0.5px or use `shape-rendering="crispEdges"` to kill antialiasing seams between adjacent SVG fills.

### 5.2 Weighted centroidal Voronoi stippling (Secord 2002)

Even blue-noise dots whose density tracks an image — the stipple-engraving look. Lloyd's algorithm with density ρ as the integration weight: move each point to the density-weighted centroid of its cell, iterate.

```js
// density[y*W+x] in [0,1]; for an image use 1 - luminance (dark = more stipples)
function stipple(density, W, H, n, iters = 40) {
  let pts = rejectionSample(density, W, H, n);      // accept (x,y) if rng() < density
  for (let k = 0; k < iters; k++) {
    const delaunay = Delaunay.from(pts);
    const sx = new Float64Array(n), sy = new Float64Array(n), sw = new Float64Array(n);
    let hint = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const w = density[y*W + x];
      if (w <= 0) continue;
      hint = delaunay.find(x, y, hint);             // the trick: cell ownership by raster scan
      sx[hint] += x*w; sy[hint] += y*w; sw[hint] += w;
    }
    for (let i = 0; i < n; i++)
      pts[i] = sw[i] > 0 ? [sx[i]/sw[i], sy[i]/sw[i]]
                         : [rng()*W, rng()*H];      // reseed starved cells
  }
  return pts;
}
```
n 1k–20k (2k–5k for a portrait); iters 10 soft / 30–60 converged (past ~80 nothing moves). Variable radius sells it: `r = rMin + (rMax-rMin) * sqrt(sw[i]/maxW)`, rMin 0.4, rMax 2.0. Work at 2–4× display resolution. This matches Bostock's Voronoi-stippling notebook approach; **[unverified]**: Secord's own summed-area-table efficiency details.

### 5.3 Convex hull (Andrew's monotone chain) + concave hull

```js
function convexHull(pts) {                 // O(n log n); returns ring without repeated endpoint
  const P = pts.slice().sort((a,b) => a[0]-b[0] || a[1]-b[1]);
  if (P.length < 3) return P;
  const cross = (o,a,b) => (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0]);
  const half = (iter) => {
    const h = [];
    for (const p of iter) {
      while (h.length >= 2 && cross(h[h.length-2], h[h.length-1], p) <= 0) h.pop();
      h.push(p);
    }
    h.pop(); return h;
  };
  return half(P).concat(half(P.slice().reverse()));
}
```
`<= 0` drops collinear points (`< 0` keeps them). In SVG's y-down coordinates this winds clockwise.

**Concave hull (concaveman approach)**: start from the convex hull; for each edge, find the nearest interior point (R-tree/kd-tree); if `dist(a,b) / max(dist(p,a), dist(p,b)) > concavity` and the two new edges intersect nothing, replace edge (a,b) with (a,p),(p,b) and recurse. **concavity is a scale-invariant ratio**: 1 = tight/spiky, 2 = natural default, ∞ = convex hull. `lengthThreshold` ≈ mean point spacing stops noise-chasing. **[unverified]**: exact comparison/defaults — check the concaveman README. Alternative: alpha shapes (delete Delaunay triangles with circumradius > α; boundary of the rest) — allows holes/multiple components; concaveman always returns one simple ring, usually what you want for a single SVG path.

### 5.4 Minimum spanning tree aesthetics

The Euclidean MST is a subgraph of the Delaunay triangulation (exact, not approximate — if an EMST edge weren't Delaunay, a point inside the diameter circle would give a cheaper reconnection). So: extract Delaunay edges (≤ 3n−6), Kruskal with union-find. O(n log n).

```js
function delaunayMST(points) {
  const d = Delaunay.from(points), seen = new Set(), edges = [];
  const T = d.triangles;
  for (let i = 0; i < T.length; i += 3)
    for (const [a,b] of [[T[i],T[i+1]],[T[i+1],T[i+2]],[T[i+2],T[i]]]) {
      const k = a < b ? a*1e7+b : b*1e7+a;
      if (!seen.has(k)) { seen.add(k);
        edges.push([a, b, Math.hypot(points[a][0]-points[b][0], points[a][1]-points[b][1])]); }
    }
  edges.sort((p,q) => p[2] - q[2]);
  const parent = points.map((_,i) => i);
  const find = x => parent[x] === x ? x : (parent[x] = find(parent[x]));
  const mst = [];
  for (const [a,b,w] of edges) {
    const ra = find(a), rb = find(b);
    if (ra !== rb) { parent[ra] = rb; mst.push([a,b,w]);
      if (mst.length === points.length - 1) break; }
  }
  return mst;
}
```
Aesthetics: stroke-width by depth from root (trunk→twigs); over blue-noise points = neural web; over clustered points = river delta; replace edges with Catmull-Rom through midpoints for vines; animate stroke-dasharray by BFS order for growth.

### 5.5 Metaballs → SVG paths

Field function summed over blobs, surface at threshold:

```js
// classic inverse-square: f = Σ r_i² / ((x-x_i)² + (y-y_i)²);  threshold 1.0 reproduces r
// 0.7-0.9 = gooier (merge from farther); 1.2-2.0 = tighter
// Wyvill polynomial kernel (finite support, smoother, spatially indexable):
//   q = d/r;  f = 1 - (4/9)q^6 + (17/9)q^4 - (22/9)q^2  for d < r, else 0
```
Sample onto a grid (cell 3–5px indistinguishable from exact; 8–12px fine after smoothing), march squares at the threshold (§5.6), then **Chaikin 2–3 iterations** — Chaikin stays inside the polyline hull so blobs never bulge; Catmull-Rom overshoots at merge necks (pinch artifact). Balls: r 20–80 on an 800px canvas.

### 5.6 Marching squares (the general contour extractor)

4-bit corner index (TL=8, TR=4, BR=2, BL=1, bit set = corner ≥ iso); linear interpolation along crossed edges — skipping interpolation is the #1 mistake (blocky output): `t = (iso - v0)/(v1 - v0)`.

```js
function marchingSquares(grid, W, H, iso, cell = 4) {
  const segs = [], V = (x,y) => grid[y*W + x];
  const interp = (x0,y0,v0, x1,y1,v1) => {
    const t = (iso - v0) / (v1 - v0 || 1e-9);
    return [(x0 + t*(x1-x0)) * cell, (y0 + t*(y1-y0)) * cell];
  };
  for (let y = 0; y < H-1; y++) for (let x = 0; x < W-1; x++) {
    const tl=V(x,y), tr=V(x+1,y), br=V(x+1,y+1), bl=V(x,y+1);
    const idx = (tl>=iso?8:0)|(tr>=iso?4:0)|(br>=iso?2:0)|(bl>=iso?1:0);
    if (idx === 0 || idx === 15) continue;
    const T = () => interp(x,y,tl, x+1,y,tr),   R = () => interp(x+1,y,tr, x+1,y+1,br);
    const B = () => interp(x,y+1,bl, x+1,y+1,br), L = () => interp(x,y,tl, x,y+1,bl);
    switch (idx) {
      case 1: case 14: segs.push([L(),B()]); break;
      case 2: case 13: segs.push([B(),R()]); break;
      case 3: case 12: segs.push([L(),R()]); break;
      case 4: case 11: segs.push([T(),R()]); break;
      case 6: case 9:  segs.push([T(),B()]); break;
      case 7: case 8:  segs.push([L(),T()]); break;
      case 5:  segs.push([L(),B()],[T(),R()]); break;   // saddle
      case 10: segs.push([L(),T()],[B(),R()]); break;   // saddle
    }
  }
  return segs;
}
```
Saddles (5, 10): both pairings are valid; disambiguate by the 4-corner average vs iso (matters for correct terrain, rarely for art). **Stitching** into polylines: quantize endpoints to a hash key (`round(coord/eps)`, eps 1e-6), map endpoint→segments, walk chains both directions, mark used. **Pad the grid with one ring of below-iso values to force all contours closed** — much simpler downstream. Off the shelf: `d3.contours().size([W,H]).thresholds([...])(values)` returns GeoJSON MultiPolygons with correct winding for `fill-rule: evenodd`; `d3.contourDensity()` contours KDE of raw points.

---

## 6. Curves

### 6.1 Chaikin corner cutting

Q = ¾P₀+¼P₁, R = ¼P₀+¾P₁ per edge; limit curve is a uniform quadratic B-spline (C¹, stays inside the polygon hull — never overshoots).

```js
function chaikin(pts, iters = 3, closed = false) {
  for (let k = 0; k < iters; k++) {
    const out = [], n = pts.length, last = closed ? n : n - 1;
    if (!closed) out.push(pts[0]);                 // pin endpoints or the curve retracts
    for (let i = 0; i < last; i++) {
      const [x0,y0] = pts[i], [x1,y1] = pts[(i+1) % n];
      out.push([0.75*x0 + 0.25*x1, 0.75*y0 + 0.25*y1]);
      out.push([0.25*x0 + 0.75*x1, 0.25*y0 + 0.75*y1]);
    }
    if (!closed) out.push(pts[n-1]);
    pts = out;
  }
  return pts;
}
```
Point count doubles per iteration. Effects: 1 = clipped corners; 2 = reads smooth at normal stroke widths; 3–4 = fully smooth (practical max); 5+ = waste. Closed rings shrink ~1.5%/iteration — rescale about the centroid if area matters.

### 6.2 Catmull-Rom → cubic Bézier

Uniform (τ=1): `B1 = P1 + (P2−P0)/6`, `B2 = P2 − (P3−P1)/6`, endpoints B0=P1, B3=P2. Tension: multiplier s=1/6 standard; s→0 straight, s>1/6 loopy. **Use the centripetal variant (α=0.5) for art** — provably no cusps/self-intersections with uneven spacing:

```js
function catmullRomToBezier(pts, alpha = 0.5, closed = false) {
  const P = closed ? [pts[pts.length-1], ...pts, pts[0], pts[1]]
                   : [pts[0], ...pts, pts[pts.length-1]];   // or reflect: 2*P0-P1
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i + 2 < P.length; i++) {
    const p0 = P[i-1], p1 = P[i], p2 = P[i+1], p3 = P[i+2];
    const t01 = Math.pow(Math.hypot(p1[0]-p0[0], p1[1]-p0[1]), alpha) || 1e-9;
    const t12 = Math.pow(Math.hypot(p2[0]-p1[0], p2[1]-p1[1]), alpha) || 1e-9;
    const t23 = Math.pow(Math.hypot(p3[0]-p2[0], p3[1]-p2[1]), alpha) || 1e-9;
    const m1 = [((p1[0]-p0[0])/t01 - (p2[0]-p0[0])/(t01+t12) + (p2[0]-p1[0])/t12) * t12,
                ((p1[1]-p0[1])/t01 - (p2[1]-p0[1])/(t01+t12) + (p2[1]-p1[1])/t12) * t12];
    const m2 = [((p2[0]-p1[0])/t12 - (p3[0]-p1[0])/(t12+t23) + (p3[0]-p2[0])/t23) * t12,
                ((p2[1]-p1[1])/t12 - (p3[1]-p1[1])/(t12+t23) + (p3[1]-p2[1])/t23) * t12];
    d += ` C ${p1[0]+m1[0]/3} ${p1[1]+m1[1]/3}, ${p2[0]-m2[0]/3} ${p2[1]-m2[1]/3}, ${p2[0]} ${p2[1]}`;
  }
  return closed ? d + " Z" : d;
}
```
**[unverified]**: the non-uniform tangent scaling has several equivalent-but-differently-scaled published forms — render a test path with uneven spacing and check for cusps. Guard coincident points (NaN). Choosing: Catmull-Rom *interpolates* (points are meaningful waypoints); Chaikin *approximates* (only overall shape matters — contours, cells).

### 6.3 Superellipse / squircle (Lamé curve)

`|x/a|^n + |y/b|^n = 1`. Parametric (note the exponent is **2/n**, the part people get wrong):

```js
const t = (i/steps) * 2*Math.PI, c = Math.cos(t), s = Math.sin(t);
pts.push([a * Math.sign(c) * Math.abs(c)**(2/n),
          b * Math.sign(s) * Math.abs(s)**(2/n)]);
```
n < 1 concave star (n=2/3 astroid); n=1 diamond; n=2 ellipse; n=2.5 Piet Hein's superellipse; n=4 squircle (Apple icons ≈ 4–5 **[unverified]**); n=8–12 rounded rect; n→∞ rectangle. Animating n 1→8 is a cheap satisfying morph.

### 6.4 Lissajous and harmonograph

Lissajous: `x = A sin(at + δ), y = B sin(bt)`. Closes iff a/b rational; 1:2 figure-eight, 2:3 trefoil, 3:4 lattice. Detune (`a/b = 3/4 + 0.001`) + 20k points → precessing woven torus, usually better than the closed figure.

Harmonograph (damped pendulums): `x(t) = Σ₂ Aᵢe^(−dᵢt) sin(fᵢt + pᵢ)`, same for y with two more terms.
Params: A 50–150; f 1–5 with frequencies *near* small-integer ratios (`f2 = f1 + ε`, ε 0.001–0.02 — the drift makes the classic spiral envelope; exact integers are static); d 0.001–0.02; `tMax ≈ 4/max(d)`; 10k–50k points, one `<path>`, stroke 0.3–0.6, opacity 0.4–0.7.

### 6.5 Spirograph (hypotrochoid / epitrochoid)

Hypotrochoid (rolling inside): `x = (R−r)cosθ + d·cos(((R−r)/r)θ)`, `y = (R−r)sinθ − d·sin(((R−r)/r)θ)`. Epitrochoid (outside): `x = (R+r)cosθ − d·cos(((R+r)/r)θ)`, `y = (R+r)sinθ − d·sin(((R+r)/r)θ)`. `d = r` gives the cusped epi/hypocycloids.

Closure: after `r/gcd(R,r)` revolutions, giving `R/gcd(R,r)` petals — R=100, r=37 → 100-petal rosette over 37 turns; irrational ratios never close (annulus texture at low opacity). Ranges: R 100–300, r 20–90 (< R), d 0–1.5r (d > r = self-crossing petals, the prettiest). Identities: r=R/2 straight line (Tusi), r=R/4 astroid, r=R/3 deltoid; epicycloid r=R cardioid, r=R/2 nephroid.

---

## 7. Repetition & symmetry

*(Authored from domain knowledge.)*

### 7.1 Rotational symmetry / mandalas

Generate ONE wedge of content, replicate by rotation — SVG makes this nearly free with `<use>`:

```js
// motif in a group; instantiate n rotated copies about the center
const n = 6;                                  // fold count: 5-12 typical; odd counts feel organic
defs.add(motifGroup.id('wedge'));
for (let k = 0; k < n; k++)
  root.use('#wedge').attr('transform', `rotate(${360*k/n} ${cx} ${cy})`);
// mirror-symmetric wedge (dihedral symmetry): also add scale(-1,1) copies
```
Craft: constrain the motif to its wedge (clip to the sector, or generate in polar coordinates `(r, θ)` with θ ∈ [0, 2π/n)); build the motif from any technique above (a flow-field trace, an L-system, packed circles) — symmetry instantly organizes chaotic content; vary element density along r (dense center or dense rim, not uniform); dihedral (mirrored) reads ornamental, pure rotation reads dynamic/pinwheel. Failure: motifs crossing the wedge boundary create visible seams — either clip hard or design the motif to end at the boundary.

### 7.2 Reflection groups / kaleidoscope

The seven frieze and 17 wallpaper groups are the complete catalog of 2D repetition; the practical subset: **p4m** (square + 4 mirrors — classic tile), **p6m** (hex kaleidoscope), **pmm** (rect mirrors). Implementation: generate content in one fundamental domain (e.g. a 45° right triangle for p4m), then apply the group's mirror/rotation transforms via `<use>`. Kaleidoscope shortcut: reflect a wedge across its own edge repeatedly — `rotate(k*θ) · (k odd ? mirror : identity)`.

### 7.3 Phyllotaxis (golden-angle spiral)

Vogel's formula (standard): sunflower-head packing.

```js
const GA = Math.PI * (3 - Math.sqrt(5));      // golden angle ≈ 137.507°
for (let i = 0; i < N; i++) {
  const r = c * Math.sqrt(i);                 // sqrt spacing = uniform density
  const a = i * GA;
  place(cx + r*Math.cos(a), cy + r*Math.sin(a), sizeOf(i));
}
```
N 200–3000; c (scale) = targetRadius / sqrt(N). Element size: constant = classic seed head; growing with i = sunflower; `size ∝ sqrt(i)` keeps visual density even. Any angle ≠ GA degrades into visible spiral arms — which is itself usable: angle = GA ± 0.5° produces deliberate spiral-arm moiré. Replace dots with rotated petals/polygons oriented along `a` for botanical looks.

### 7.4 Moiré

Two near-identical periodic patterns overlaid; the interference is the artwork. Recipes: two line gratings (spacing s and s·(1+ε), ε 0.01–0.05) → broad interference bands of wavelength ≈ s/ε; same grating rotated by 1–5° → band angle ≈ half the rotation; two concentric-circle sets with offset centers (offset 2–10% of radius) → hyperbolic families. Craft: thin strokes (≤ 1px at display scale), high line count (100–400); the effect lives at display resolution — verify at final size, it vanishes when downscaled with antialiasing **[unverified]** as a general rule but reliably observed. On plotters moiré works physically and beautifully (two overprinted layers).

---

## 8. Color & palette craft

*(From the color-research payload — domain knowledge. WCAG/OKLab math standard; numeric working defaults marked in the ledger.)*

### 8.1 How many colors

2–3 = strongest default; 4–6 = sweet spot for layered work; beyond 6 reads as rainbow/accident unless the colors form an ordered *ramp* (a 12-stop ramp is ONE color decision). Practical structure: **1 background + 1 dominant + 1–2 supporting + 1 accent**.

### 8.2 Curated palettes

Highest quality-per-effort; treat as default. Known packages: **`nice-color-palettes`** (npm; 5-color COLOURlovers palettes; **[unverified]** exact export shape / `/100` `/1000` subpaths), **`chromotome`** (**[unverified]** spelling/exports), `chroma-js` (scales, `chroma.brewer`, deltaE; **[unverified]** whether installed version has OKLCH vs only CIE LCh), `d3-scale-chromatic` (viridis/brewer — great for ordered field→color, too clinical as categorical art palettes). Bake palettes into repo JSON; pick per-seed; **always shuffle roles** (never assume index 0 is dominant). Post-process every curated palette: drop near-duplicates (ΔE ≲ 10 heuristic) and re-derive the background (§8.6).

### 8.3 Generating from OKLCH — lightness ladder + bounded hue arc

Why OKLCH not HSL: HSL lightness is not perceptual (yellow vs blue at same nominal L differ wildly), so HSL-hue-variation at fixed L is value-chaotic — the flatness failure. OKLCH's L is perceptually uniform: **fixing L fixes value; varying L is a real value ladder.**

```js
function oklchPalette(rng, { n=5, hueCenter=rng()*360, hueArc=40,
                             lMin=0.30, lMax=0.88, chromaPeak=0.13,
                             jitterH=4, jitterL=0.015 } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const L = clamp(lerp(lMin, lMax, t) + gaussian(rng, 0, jitterL), 0.05, 0.98);
    const H = (hueCenter + (t - 0.5) * hueArc + gaussian(rng, 0, jitterH) + 360) % 360;
    const taper = Math.sin(Math.PI * t);          // chroma tapers at L extremes —
    const C = chromaPeak * (0.35 + 0.65 * taper); // extreme-L colors can't hold chroma in sRGB
    out.push(gamutClampOklch(L, C, H));
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

Hard rules: **L span < 0.35 total = flat, always**; chroma > ~0.20 is out of sRGB gamut for many hues at extreme L — clamp, never assume; yellows/greens (H 90–150) hold far less chroma at low L than blues/purples (H 250–320) — scale chromaPeak down when sweeping through yellow.

Gamut clamping (required — OKLCH readily addresses colors sRGB can't show): binary-search chroma down ~24 iterations until `oklchToSrgb(L,C,H)` lands in [0,1]³. **Use `culori` or `colorjs.io` for the conversion** — the OKLab↔sRGB matrices are published (Ottosson) but reproducing 10-digit constants from memory risks silent error **[unverified as transcribed]**. **Emit hex/rgb into SVG attributes**, not `oklch()` strings — headless rasterizers (resvg, librsvg) may not parse them **[unverified current support]**.

### 8.4 Analogous + complement accent (the most reliable recipe)

```js
// nAnalog 3-4 members spread `spread`≈24° apart around baseH, L laddered 0.32→0.86, C≈0.10;
// accent at baseH + accentOffset (180 complement / 150|210 split-complement),
// MID lightness (~0.60), chroma ×1.5, used sparingly.
```
Variants by risk: split-complement (safest, nearly always works) → analogous+true-complement (punchiest) → triadic (keep 2 of 3 low-chroma) → near-monochrome+complement (spread 8°; accent does all the work). **Accent must differ in chroma AND value, not only hue** — same-L accent is invisible, same-C accent is just another family member.

### 8.5 Sampling a palette from an image

Cluster **in OKLab/Lab, never raw RGB** (RGB distance ≠ perception → muddy centroids). Downsample to ~100×100 first (`sharp .raw().toBuffer()`). Median cut: recursively split the box with the widest single-axis range at its median. K-means with k-means++ seeding (spread initial centroids by distance²-weighted selection; Lloyd iterations ≤ 20). Then mandatory post-processing: sort by L and **force the ladder** to [lMin, lMax]; drop near-greys (C < 0.02) unless one becomes the bg; boost the smallest cluster's chroma ×1.3–1.6 and promote it to accent (the rare color makes a natural accent); keep cluster weights as your weighted-pick weights.

### 8.6 Value structure

Squint test / greyscale test: if everything collapses to one grey, there is no structure. **Value carries form; hue contrast resolves weakly.** A 2-color piece with strong light/dark beats a 6-mid-tone piece every time. Equiluminant saturated pairs vibrate at edges (enforce min ΔL ≈ 0.04 between adjacent fills unless vibration is wanted).

Construct and assert the ladder: retarget each palette member's L to even rungs on [lMin, lMax] (keep hue+chroma). Area distribution — notan/70-20-10: ~60–70% of area in one value zone, 20–30% secondary, 5–10% the extreme/accent. Uniform area across three value bands reads as noise; measure it while drawing.

WCAG contrast as a *measuring instrument* (not an aesthetic gate — beauty can live at 1.8:1):
```js
// relative luminance: f(v)= v/255 <= 0.03928 ? s/12.92 : ((s+0.055)/1.055)^2.4
// L = 0.2126R + 0.7152G + 0.0722B;  ratio = (Lhi+0.05)/(Llo+0.05)  (1..21)
```
Palette health check + reject rules (heuristic thresholds): `lSpan >= 0.30` else flat; **at least one member ≥ 4.5:1 vs bg** (the anchor that draws structure); `minAdjacentDeltaL >= 0.04`. Note OKLCH L (perceptual) and WCAG luminance (photometric) are different quantities: design with L, verify with the ratio.

### 8.7 Assigning color to elements

- **Weighted random with dominant + rationed accent** (default): weights ≈ dominant 0.50 / mid 0.25 / mid2 0.15 / dark 0.05 / accent 0.05. **Accent 3–8% of elements or ≤10% of inked area** (below 2% reads as mistake, above 15% becomes a second dominant). Linear-scan pick for <50 options; alias method for 100k+ draws.
- **Better: quota + Fisher-Yates shuffle** — deterministic counts kill the "seed with zero accents" failure class entirely.
- **Spatially clustered accent beats scattered**: pick 1–3 accent seed points (radius 8–22% of min dimension); elements near a seed get the accent with p≈0.35. Scattered = confetti; clustered = intent.
- **By field value**: `d3-scale` + `interpolateLab` (never RGB interpolation — mud through grey). **Quantize the ramp to 3–6 bands** — continuous = mush, banded = shape. Noise frequency ≈ 2–6 / min(W,H).
- **By recursion depth**: monotonic deeper=darker (+ thinner stroke) is the most reliable recursive look — value structure and scale structure agree. Or alternate through the ladder with accent only at leaves (p≈0.12).
- **By index/cluster**: never `palette[i % n]` on a spatially ordered list (stripes) — k-means-cluster positions first (K 3–7) or shuffle the index map per seed.
- **Micro-variation** (separates "generated" from "made"): jitter every fill in OKLCH — σ_L ≈ 0.02, σ_C ≈ 0.01, σ_H ≈ 3°. Jitter must stay an order of magnitude below the ladder step. Also: 3–6 overlapping shapes at fill-opacity 0.6–0.85, or `mix-blend-mode: multiply` on a group for the ink look.
- **[unverified]** `simplex-noise` v4 API is `createNoise2D(rngFn)` (older: `new SimplexNoise(seed)`) — check installed version; always pass your seeded rng.

### 8.8 Backgrounds

Never `#fff`/`#000`: pure white = "no decision"/unrendered; pure black crushes dark shapes and halates; neither exists physically — the tiny offset is most of what makes output look printed rather than screenshotted.

Working near-neutrals (personal defaults, not canonical): warm — `#F4F1EA` (general default), `#EFE9DD` cream, `#E8E4DA` bone, `#F7F5F2` barely-warm, `#DCD6C8` kraft; cool — `#F2F3F5`, `#E9EBEE`; darks — `#14161A` cool off-black, `#1A1614` warm off-black, `#22252B` charcoal, `#0E1116`.

Generate instead of hard-coding so bg tracks the palette: hue borrowed from the dominant ± σ12°, **chroma 0.004–0.020** (above ~0.03 the bg becomes a palette member), L 0.93–0.97 light / 0.14–0.22 dark. Strategy weights: neutral ground 0.6 / lightest-ladder-member desaturated 60–70% as ground 0.25 / dark ground 0.15 (dark ground requires re-tuning: lMin +0.10, chromaPeak ×1.2). Assert: bg ≥ 3:1 vs at least one member, and **bg L outside the ladder's span** — a mid-ladder bg makes half the palette vanish.

Plotter case: the paper IS the background and the lightest value — emit no bg rect in plot layers (or a strippable `<g id="bg">`); palette = physical pen inventory; value = mark density (hatch spacing), not fill lightness; preview over paper-tone with realistic ink hexes (black Micron ≈ `#1B1B1E`, sepia ≈ `#5A4632` — approximations, sample real pens).

---

## 9. Composition

### 9.1 Margins

Establish the frame first; never draw outside it (except deliberate bleed). Ratios (fraction of the shorter side): 0.04–0.06 tight/poster; **0.07–0.10 general default**; 0.12–0.18 gallery/mat. 0 = full bleed, a distinct decision. Asymmetric beats symmetric: `mTop = 0.9m, mSide = m, mBottom = 1.35m` — bottom-heavier optical centering (standard typographic practice; the 1.35 factor itself is a working default).

### 9.2 Focal point

Uniform interest = no interest. Rule-of-thirds intersections + gaussian wobble (σ ≈ 4% of frame) so it's never mechanically on the line. Alternatives worth weighting into the space: phi points (0.382/0.618 — treat as "another offset that looks good," the perceptual-preference claim for φ is contested); deliberate dead center (only for radial/mandala work — center is only weak when accidental); off-canvas implied center (piece becomes a fragment — excellent for flow fields); **two-point tension** (large low-contrast mass at one third-point, small high-contrast accent diagonally opposite — the best default for "movement"); true all-over uniformity (legit, but must be *completely* uniform — near-uniform reads as failure). Bias density, element scale, accent probability, and stroke weight toward the focal point with a gaussian falloff (σ ≈ 0.22 of the diagonal).

### 9.3 Density variation

The most common generative failure is uniform density. Modulate *existence* with a very-low-frequency noise field (freq ~0.0015/px), gamma-sharpened (`pow(n, 1.8)`), plus the focal pull. Target ~4:1 density range sparse-to-dense (<2:1 invisible, >10:1 needs justified blank zones). For points, use variable-radius Poisson-disc (r = f(density field)) — density variation with locally even spacing (§3.2).

### 9.4 Negative space

Negative space is a shape — design it. Reserve ≥ ~15% of canvas as one contiguous empty region; implement by carving: 1–2 void blobs (circle/superellipse with a noise-wobbled edge, `r · (0.85 + 0.3·noise)` so it doesn't read as a stamped circle), reject elements whose centroid falls inside. Voids should be **off-center and open onto an edge/margin** — a floating central hole reads as a mistake. The inverse (dense island in sparse field) is equally valid and often stronger.

### 9.5 Order with a wobble

The central aesthetic of the field (Vera Molnár lineage — her association with ordered-plus-perturbation is established; exact titles/"1% disorder" figure **[unverified]**): impose rigid structure, perturb by a small bounded amount. Magnitudes: position σ = 0.02–0.15 × cell (grid stops reading as grid above ~0.4); rotation σ = 1–8° hand-drawn / 15–30° energetic; scale σ = 3–12%. **Ramp the wobble** across the canvas (linear/quadratic/radial/noise) — constant wobble reads as sloppiness, a gradient of wobble reads as intent and IS the composition (see Schotter §3.4).

### 9.6 Largest-shape-first layering

SVG document order is paint order. Sort by area descending; draw big value-masses first, details land on top. Assign the darkest/highest-contrast colors to the *smaller, later* shapes — large dark masses dominate, small dark marks punctuate. Structure into named groups (`bg / masses / mid / detail / accent`) — inspectable and plotter-exportable; for stroke work, group by color so a plotter does one pen pass per color.

### 9.7 Edge treatment: bleed vs contain

Binary decision made once per piece; mixed treatment looks like a bug.
- **Contain**: reject/shrink anything crossing the frame; reads composed/object-like; keep placing elements *near* the edge to avoid center-hugging; inset by stroke-width/2 (ink extends half the stroke past geometry).
- **Bleed**: generate over a region 10–20% larger than the canvas, clip with `clip-path` (hard, cheap; avoid `mask` for plotter work); reads infinite/sample-of-a-system. Elements must be genuinely cut, not suspiciously terminating at the border.
- **Hybrid (most reliable)**: background bleeds full canvas, marks contained inside the margin — the "print" look.

---

## 10. Plotter-quality line work

*(The vpype material here is SOURCED — scraped live from vpype's Fundamentals and Cookbook docs this session. Marked VPYPE. The rest is synthesis.)*

### 10.1 Plotter-ready SVG rules

**VPYPE-attested:**
- Default unit: **CSS pixel = 1/96 inch**; accepted units cm/mm/in/pt/px/etc; A4 = 793.70×1122.52 px. Angles default degrees.
- **Everything is a polyline** — curves are quantized to segments on read (a circle needs ~10–100 segments to plot well). Flatten curves yourself to control fidelity.
- **Layers = pens.** Top-level SVG groups (Inkscape-style layers) become vpype layers, one per pen/color. Stroke color survives only if identical within a layer (or use `read --attr stroke` for layer-per-color). Layer properties: `vp_color`, `vp_pen_width`, `vp_name`; pen widths like `0.15mm`, `0.05in`.
- **Fills are not a plotting concept** — vpype records `svg_fill` only informationally; a fill must be rendered as explicit hatch lines (§10.3).
- **Canonical optimization pipeline: `read → linemerge → linesort → reloop → linesimplify → write`.** Numeric tolerances from the docs: `linemerge --tolerance 0.5mm` (join endpoint-adjacent lines, fewer pen lifts); `linesimplify --tolerance 0.1mm` (fewer points, bounded error); `reloop --tolerance 0.03mm` (randomize closed-path seams so pen-down blobs don't align); `filter --min-length 0.5mm` (drop tiny lines — they "significantly increase plotting time and may be detrimental to the final look"); `splitall` before linemerge for densely connected meshes; `multipass --count 3` for weak pens; `splitdist 50cm`–`1m` for re-inking brush pens. `write --pen-up` previews travel; `layout --fit-to-margins 3cm --valign top a4` is "a generally pleasing arrangement."

Synthesis (unsourced): emit absolute coordinates with transforms baked (layer detection keys off top-level groups; transforms on them surprise); `fill="none"` + explicit `stroke` + constant `stroke-width` per layer; round coordinates to 2 decimals; **dedupe overlapping duplicate lines yourself** — linemerge joins endpoints, it does not remove a line drawn twice (double-inked lines bloom); min feature size ≈ pen width (0.3mm typical); margins 10–20mm minimum, 2–3cm for framing **[unverified against AxiDraw docs]**.

### 10.2 Occlusion / hidden-line removal

A pen has no z-buffer — every path gets drawn, so screen-correct overlaps plot as transparent wireframe mush. Painter's-order subtraction (synthesis, standard approach):

```js
let drawn = null;                                  // union of silhouettes so far
for (const shape of backToFront) {
  let strokes = shape.outlinesAndHatch;
  if (drawn) strokes = clipLinesOutsidePolygon(strokes, drawn);  // keep parts NOT covered
  emit(strokes);
  drawn = drawn ? union(drawn, shape.silhouette) : shape.silhouette;
}
```
Keep a running **union** (don't difference against N polygons separately). JS polygon boolean libs: **polygon-clipping**, **martinez-polygon-clipping**, **clipper-lib** / Clipper2 wasm (also does offsetting — useful for insetting before hatching). Line-vs-polygon clipping: intersect each segment with polygon edges, classify midpoints of the pieces by point-in-polygon, keep outside pieces.

### 10.3 Hatching as fill

The plotter answer to fills; also the best way to give SVG line art tonal range.

```js
function hatch(polygon, angle, spacing) {
  const rot = rotatePoly(polygon, -angle);          // axis-align
  const [minY, maxY] = yBounds(rot), lines = [];
  for (let y = minY + spacing/2; y < maxY; y += spacing) {
    // scanline: x-intersections with edges, sort, pair off (even-odd)
    const xs = edgeIntersections(rot, y).sort((a,b) => a-b);
    for (let i = 0; i + 1 < xs.length; i += 2) lines.push([[xs[i], y], [xs[i+1], y]]);
  }
  return rotateLines(lines, angle);
}
```
Craft: **serpentine** the scanlines (reverse alternate rows, join ends) so the pen snakes without lifting; **inset the polygon by ~½ pen width** first so strokes don't cross the outline; cross-hatch = second pass at +90° (or +60/+120 three-way); **value mapping**: `spacing = lerp(minS, maxS, 1 - value)` with minS floored at ≈ pen width (below that, ink merges solid and the tonal range collapses); spiral fill (`r += k·dθ` clipped to polygon) = one continuous stroke, zero pen-ups.

### 10.4 Why the discipline improves screen SVGs

Smaller files (simplify/filter strip redundancy); explicit semantic layer structure; no invisible-but-shipped geometry; transform-flat output composes predictably; tone from real drawn structure (hatch density, line weight) survives scaling, printing, and dark-mode recoloring in ways opacity tricks don't.

---

## 11. Seeded randomness discipline

`Math.random()` in a generative system is a bug: no reproduction, no bisection, no "seed #438", no re-render at print resolution.

```js
// mulberry32 — 32-bit, fast, good enough for art  [unverified: constants from memory —
// verify against a reference before relying on cross-machine reproducibility]
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// xmur3 string-hash → seeds (same caveat); xoshiro128** for better statistical quality
const s = xmur3(seedStr); const rng = mulberry32(s());
```

Rules:
- **One rng threaded explicitly** — no module-level singleton (refactors reorder draws and every seed changes).
- **Separate streams per concern** (`rngPalette`, `rngLayout`, `rngDetail`, each seeded from the master): changing detail code then doesn't perturb existing seeds' layouts. High leverage while iterating.
- **Seed the noise lib** from your rng (`createNoise2D(rng)`), never let it default to Math.random.
- **Stamp seed + params into the SVG** as a comment: any file on disk regenerates.

Distributions (standard math; prescriptive defaults are working values): **uniform** for categories/phases/hue-within-arc — avoid for positions (clumps) and sizes (no hierarchy); **gaussian** for wobble around a correct value — *always truncate at ~2.5σ* (one 5σ draw ruins a seed); Box-Muller polar form: sample u,v ∈ (−1,1) until s=u²+v² ∈ (0,1), return `u·sqrt(−2 ln s / s)`; **power law** for sizes/lengths — `(u·(max^(1−α) − min^(1−α)) + min^(1−α))^(1/(1−α))`, α ≈ 2 — the scale hierarchy that makes output organic; cheap alternative `min + (max−min)·rng()^p` (p 2–3 mostly-small); **exponential** for gaps (`−ln(1−u)/λ`); **bimodal** (80% small / 20% large, nothing between) for punchy contrast.

Designing spaces where most seeds are good (the actual craft, in leverage order):
1. **Randomize relationships, not values** — one margin ratio not four margins, one hue+arc not five hues. Every independent random variable multiplies failure modes. ≤ ~10 top-level parameters; derive the rest.
2. Randomize at the top of a hierarchy; deterministically elaborate below.
3. Bias sampling toward the safe end (`rng()^2` pulls to 0); extremes rare, not impossible — the rare extreme is where interesting outputs live.
4. **Correlate parameters that must agree** as derivations: dark bg ⇒ chroma ×1.2, lMin +0.10; high density ⇒ smaller elements.
5. **Validate and reject**: measure ink coverage (reject <0.08 or >0.75), value span, dead zones, accent fraction; re-roll `${seed}#${i}` up to ~20 attempts; throw if none pass (space too loose).
6. **Sweep, don't spot-check**: render 100 sequential seeds to a contact sheet; if you don't like ≥70, tighten the space — this is the only real measurement.
7. Bisect bad seeds by pinning parameters to their means; the pin that fixes it marks the over-wide range.
8. Prefer "always on, varying intensity 0.05–1.0" over "on in 50% of seeds" — keeps the family coherent.

---

## 12. Exemplary open-source projects to study

*(All [unverified] as to current URLs/state — from memory, verify links. Selection rationale is the payload.)*

1. **canvas-sketch** (Matt DesLauriers) — github.com/mattdesl/canvas-sketch — the reference framework for seeded, reproducible, print-resolution generative work; its `canvas-sketch-util` sibling has random/math/geometry helpers embodying §11's discipline. Study: seed handling, physical units (cm/in) for print/plot export, penplot export.
2. **vpype** (Antoine Beyeler) — github.com/abey79/vpype — the plotter-SVG toolchain itself; the model for §10's pipeline; **vsketch** (same author) shows a clean generative-sketch API with seeded parameter exploration.
3. **d3-delaunay / d3-contour / d3-scale-chromatic** (Bostock et al.) — github.com/d3 — production implementations of §5's geometry (Delaunator port, marching-squares contours) worth reading for numeric robustness; Bostock's Observable "Voronoi stippling" notebook is the reference for §5.2.
4. **generativeartistry.com** (Tim Holman & Ruth John) — tutorial site with minimal-code implementations of the classics (Tiled Lines, Joy Division, Cubic Disarray/Schotter, Un Deux Trois, Circle Packing, Piet Mondrian, Hypnotic Squares, Triangular Mesh) — the canonical beginner catalog; source on GitHub.
5. **jasonwebb/morphogenesis-resources** — github.com/jasonwebb/morphogenesis-resources — curated index of growth-algorithm references + implementations (differential growth, DLA, space colonization, reaction-diffusion, physarum); his `2d-differential-growth-experiments` repos are readable reference code for §4.3.
   Also worth knowing: **inconvergent's public repos** (github.com/inconvergent — `differential-line`, `sand-spline`, in Python/Lisp) for §4.3/§4.6 provenance, and **Tyler Hobbs' essays** (tylerxhobbs.com/essays) for §1.1/§2.4 provenance.

---

## Consolidated [unverified] ledger — highest-value items to check first

1. **Tyler Hobbs' triangle-subdivision specifics** (§2.4): longest-edge rule + off-midpoint split band (30–70%, σ≈0.12) — reproduced from memory of his essay; verify at tylerxhobbs.com/essays/aesthetically-pleasing-triangle-subdivision.
2. **Carlson multi-scale Truchet tile inventory** (§2.1): the edge-compatibility primitive set (corner dots/caps) — verify against his "Multi-Scale Truchet Patterns" (Bridges paper).
3. **PRNG constants** (§11): mulberry32/xmur3/xoshiro shift-multiply constants — a wrong digit silently degrades quality or breaks cross-machine reproducibility. Verify against reference implementations.
4. **OKLab↔sRGB matrix coefficients** (§8.3): use `culori`/`colorjs.io` rather than the from-memory constants.
5. **Gray-Scott f/k table + 9-point Laplacian weights** (§4.6): verify against Karl Sims' reaction-diffusion tutorial.
6. **Penrose P3 half-thin deflation vertex orders** (§2.5): one wrong orientation produces visible cracks — test against a reference implementation.
7. **Centripetal Catmull-Rom tangent scaling** (§6.2): several equivalent published forms — render an uneven-spacing test path, check for cusps.
8. **Jones physarum defaults and Runions d_i/d_k multiples** (§4.4, §4.6): widely-cited values, unconfirmed against the papers.
9. **Library API surfaces**: `simplex-noise` v4 (`createNoise2D(rng)`), `nice-color-palettes`/`chromotome` exports, `chroma-js` OKLCH availability, `oklch()` support in resvg/librsvg, d3-delaunay version drift.
10. **All aesthetic numeric defaults** (margin ratios, accent 3–8%, density 4:1, 15% negative space, wobble sigmas, L/C/H tables, coverage 0.08–0.75, Schotter's grid dimensions and uniform-jitter character, Nees dating): working heuristics stated as numbers for actionability — none are citable constants. The vpype tolerances in §10.1 are the exception: those are sourced.

