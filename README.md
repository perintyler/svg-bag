# svg

Programmatic SVG generation for agents — built to be the strongest possible
loop: **write code → validate → see the render → iterate**.

## Why code, not markup

LLMs writing raw SVG markup fail in predictable ways: arc-flag mistakes,
coordinate arithmetic drift, text that only renders on machines with the right
fonts. Writing a *program* that computes coordinates fixes the arithmetic;
this bag supplies the rest — a curated toolkit, seeded reproducibility, real
font metrics, and a rasterizer so the agent can look at what it made.

## Tools

| tool | what it does |
|---|---|
| `generate` | Execute an ESM script against the toolkit (SVG.js on svgdom, d3-shape/scale/delaunay/hierarchy, seeded simplex noise + RNG, rough.js, bezier-js, polygon-clipping, svgpath/SVGPathCommander, culori, text→outline). Validates + renders a PNG preview in the same round trip. |
| `render` | SVG → PNG via resvg, with pixel-coverage stats so a blank render is a verdict, not a silent success. |
| `validate` | XML well-formedness, path-data syntax (incl. arc flags), NaN/Infinity, dangling refs, viewBox sanity, plus a real render probe. |
| `optimize` | svgo multipass, viewBox always preserved, byte report. |
| `text_to_path` | Text → outline paths with real metrics (fontkit + shipped OFL fonts). |
| `fonts` | List usable fonts (shipped + system). |
| `status` | End-to-end smoke test **with negative controls** — a broken validator or renderer goes red, not green. |

## Script contract

```js
// generate({ code, seed, width, height, params })
export default ({ svg, width, height, random, noise2D, text, lib, params }) => {
  svg.rect(width, height).fill("#101020");
  for (let i = 0; i < 100; i++) {
    svg.circle(random.gaussian(20, 5))
       .center(random.range(0, width), random.range(0, height))
       .fill(lib.culori.formatHex({ mode: "oklch", l: 0.7, c: 0.12, h: random.range(20, 60) }));
  }
  // or: return a raw "<svg>...</svg>" string instead of drawing on ctx.svg
};
```

Same `(code, seed)` → byte-identical output. Never use `Math.random`.

## Craft knowledge

The instructions shipped with this bag (`search_instructions "svg"`) carry the
distilled expertise: coordinate systems and path craft, paint/filters/masks,
text and fonts, generative technique (flow fields, truchet, packing, L-systems,
phyllotaxis…), design principles for icons/diagrams/composition, and renderer
compatibility. The `create-svg` action walks the full workflow.

## Layout

- `src/` — bundled tool definitions (thin; spawns the runner)
- `runner/` — plain-JS runner scripts executed with `node` from the bag dir,
  where the toolkit's node_modules (incl. native resvg) resolve naturally
- `assets/fonts/` — OFL fonts (Inter, Lora, JetBrains Mono) for deterministic text
- `instructions/`, `actions/` — the shipped expertise

## Setup

```bash
pnpm install
pnpm test
barry install ~/repos/bags/svg --as svg
barry pack svg
```
