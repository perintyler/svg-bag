# Create an SVG

Deliver `{{brief}}` as a finished, verified SVG. Kind: `{{kind}}` (infer from
the brief if unset). Size: `{{size}}` (default 800x800; icons default 24x24).

## 1. Load the right expertise first

Always skim `svg-workflow` guidance (the loop below). Then, by kind, call
`get_instructions` for:

- art / illustration → `svg-generative` + `svg-craft`
- icon / logo → `svg-design` + `svg-craft`
- diagram / chart → `svg-design` + `svg-craft`
- anything shipping outside a browser → add `svg-compatibility`

Do not skip this: the instructions carry the exact numbers (grids, kappa,
margins, palette ranges) that separate competent output from generic output.

## 2. Plan before code

Three sentences, written down: what is the focal structure, what is the
palette (pick 3–5 colors, OKLCH-reasoned, near-neutral background), what
algorithm or layout produces the geometry. For diagrams: list nodes/edges and
compute layout, never eyeball. For icons: name the grid and stroke discipline.

## 3. Generate

One `generate` call with an ESM script. Compute all coordinates in code from
`width`/`height` — no magic absolute numbers that break when size changes.
Use `ctx.random`/`ctx.noise2D` (seeded — never Math.random), `ctx.lib` for
d3/bezier/color/boolean-ops, `ctx.text(...)` for any text (outline paths, real
metrics — never `<text>` in the deliverable).

## 4. LOOK at it

View the returned `pngPath` with `view_image`. Judge it against the brief:
composition, palette, legibility at target size (icons: also render at 16px
width via `render` and look again). Check `warnings` and `render.coverage`.
An SVG you have not looked at is not done.

## 5. Iterate

Fix the code, or sweep seeds (`seed: 2, 3, ...`) and pick the best — same
(code, seed) regenerates identically, so record the winning seed. Two or
three iterations is normal; stop when the render matches the plan, not when
the code runs.

## 6. Finish

`optimize` the final SVG (default precision 2; `keepIds: true` if ids are a
contract). Run `validate` if the SVG was assembled from raw strings. Report:
final .svg path, .png preview path, winning seed, the generating code, and
what was verified.
