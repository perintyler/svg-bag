---
name: svg-compatibility
description: >-
  What survives where: renderer differences (browsers vs resvg/librsvg/Figma),
  animation support and performance, precision and SVGO safety, accessibility.
  Read before shipping an SVG anywhere unusual.
mode: on-demand
---

# SVG Compatibility, Animation, and Shipping

Animation and performance facts below are verified against primary sources
(MDN, svgwg.org SVG2 drafts, W3C SMIL REC, browser-compat-data, 2026-09).
Renderer-matrix claims tagged **[verify]** are unverified — test empirically.

## 1. Animation: what to use where

### SMIL status

- SMIL (`<animate>`, `<animateTransform>`, `<animateMotion>`, `<set>`) works in all engines: Chrome's 2015 deprecation was reversed in 2016; Chromium, Firefox, and WebKit all ship it.
- Use SMIL when the animation must live inside a self-contained file that animates in `<img>`/background-image with zero CSS/JS — and for animateMotion. Prefer CSS otherwise (reduced-motion control, devtools, compositor offloading).
- SVG2 removed `attributeType`; SMIL targets the CSS property first when one exists. **Never set the same property in author CSS that you SMIL-animate** — engines apply SMIL values at presentation-attribute level (specificity 0), so an author rule can make the animation appear dead.
- CSS cannot pause SMIL. The hooks are DOM: `svg.pauseAnimations()/unpauseAnimations()/setCurrentTime()` and `SVGAnimationElement.beginElement()/endElement()`. Reduced motion on inline SVG: `matchMedia('(prefers-reduced-motion: reduce)').matches && svg.pauseAnimations()`.
- SMIL events: use `addEventListener('beginEvent'|'endEvent'|'repeatEvent')` — the `onbegin`/`onend` handler PROPERTIES only reached Safari in 26.2/26.5 (2026).
- `document.getAnimations()` does NOT include SMIL — SMIL runs its own timeline outside the Web Animations model.

### SMIL essentials

- `<animate attributeName="r" values="4;7;4" keyTimes="0;.5;1" dur="1.2s" repeatCount="indefinite"/>`; values+keyTimes+keySplines (calcMode="spline") give full easing.
- begin: offset ("0.3s"), event ("click"), syncbase ("a.end+0.2s"), "indefinite" (JS-triggered via beginElement()).
- `fill="freeze"` holds the end state; default "remove" snaps back.
- **animateTransform replaces the transform attribute unless `additive="sum"`**; stacking two animateTransforms requires additive="sum" on the second (usually both). Spinner:
  ```xml
  <g transform="translate(50 50)">
    <circle r="20" fill="none" stroke="#36f" stroke-width="4"
            stroke-dasharray="90 40"/>
    <animateTransform attributeName="transform" type="rotate"
      from="0" to="360" dur="1s" repeatCount="indefinite" additive="sum"/>
  </g>
  ```
- animateMotion: `<animateMotion dur="3s" repeatCount="indefinite" rotate="auto"><mpath href="#route"/></animateMotion>`; rotate="auto|auto-reverse|<deg>"; keyPoints+keyTimes control pacing.

### CSS / WAAPI animation of SVG

- CSS-animatable: opacity, fill, stroke, stroke-width, stroke-dasharray, stroke-dashoffset, transform (+ translate/rotate/scale), filter, and the SVG2 geometry properties `cx/cy/r/x/y` (everywhere modern).
- `d: path("...")`: Chrome 52, Firefox 97, **Safari parses it but it has NO effect** (BCD 2026-09) — path morphing via CSS/WAAPI excludes Safari; use SMIL or JS there. Paths must share command structure.
- NOT CSS-animatable anywhere: viewBox, `points` (polygon/polyline), gradient stop offsets — SMIL or JS only.
- `Element.animate()` (WAAPI) animates CSS properties only — never XML attributes.
- Transforms: always `transform-box: fill-box; transform-origin: center` for spin-in-place.
- CSS inside `<svg><style>` travels with the file and is honored in `<img>`; external stylesheets are not.
- Motion path in CSS: `offset-path: path("M...")` (url(#p) [verify support]) + `offset-distance: 0%→100%` + `offset-rotate: auto`; `offset-anchor` centers the mover.

### Choosing the animation tech

- Self-contained file that must animate in `<img>`/background/email-safe contexts → **SMIL** (only declarative option with motion-along-path everywhere).
- Inline in a page, simple loops/transitions → **CSS** in the SVG's `<style>`: reduced-motion controllable, compositor-offloaded transform/opacity, debuggable.
- Path morphing that must include Safari → **SMIL `<animate attributeName="d">`** or a JS library — not CSS `d:` (no effect in Safari).
- Orchestrated sequences, scrub/timeline control, interactive triggers → **JS** (gsap / animejs / motion / WAAPI).
- Anything destined for a rasterizer, favicon, or design-tool import → **no animation at all**; ship the correct static frame.

### Survival matrix per context

| Context | SMIL | CSS in `<style>` | JS |
|---|---|---|---|
| inline in HTML | yes | yes | yes |
| `<img>` / CSS background | yes | yes | no |
| `<object>` / iframe | yes | yes | yes (own document) |
| SVG favicon (Chromium) | frozen at t=0 (secure static mode) | static | no |
| rasterizers (resvg/librsvg/ImageMagick/sharp) | no — static base values | mostly no | no |
| Figma / Illustrator import | no | mostly no | no |

- SVG in `<img>` runs in SVG2 "secure animated mode": script NO, external refs NO, interactivity NO, **declarative animation YES**; internal `<style>` honored.
- **Rule: the un-animated base attribute values must form the correct static image.** Design frame zero as the deliverable; animation is enhancement.

### Reduced motion

- `@media (prefers-reduced-motion: reduce)`: Chrome 74, Edge 79, Firefox 63, Safari 10.1, iOS 10.3.
- Media queries evaluate in the SVG's own document — so a reduced-motion block inside the SVG's own `<style>` is THE way a standalone/`<img>` SVG self-disables its CSS animations (verified for Chromium/Firefox forwarding the OS preference into the image document; test Safari):
  ```css
  @media (prefers-reduced-motion: reduce) {
    * { animation: none !important; transition: none !important; }
  }
  ```
  Make the reduced state the completed/static state, never the invisible one (e.g. a line-draw ends at dashoffset 0, not the blank start).
- CSS cannot disable SMIL — if reduced-motion compliance matters, use CSS animation or JS `pauseAnimations()`.
- WCAG 2.2 SC 2.2.2 (A): auto-starting motion lasting >5s alongside other content needs pause/stop/hide. SC 2.3.3 (AAA): interaction-triggered motion must be disableable unless essential.

### Libraries (versions verified on npm 2026-09-10)

- gsap 3.15.0 — 100% free incl. MorphSVG/DrawSVG/MotionPath (all-free since 3.13, 2025).
- animejs 4.5.0 (MIT) — v4 rewrite, modular ESM, svg helpers for morph/line-draw/motion-path.
- motion 13.2.0 (MIT) — merged Framer Motion + Motion One.
- lottie-web 5.13.0 (MIT); @lottiefiles/dotlottie-web 0.80.0 is the actively pushed runtime.
- DEAD: snapsvg (2017), vivus (2021). Do not build new work on them.

## 2. Animation performance (verified)

- CSS/WAAPI `transform`/`opacity` on SVG elements are compositor-accelerated since **Chrome 89** (Firefox earlier, OMTA). SMIL is always main-thread.
- Cost ranking, worst first:
  1. animating layout attributes (width/height/x/y on the root)
  2. `viewBox` animation — full-document repaint per frame; prefer a transform on an inner `<g>`
  3. animated filter chains (feTurbulence etc.) — re-rasterize the subtree every frame
  4. `d` morphing — geometry + repaint
  5. `stroke-dashoffset` — paint-only; fine for one hero path, costly for dozens
- Cheap: `transform` and `opacity` on the fewest possible nodes — animating one `<g>` beats animating n children.
- `will-change`: last resort; toggle it around the animation, never blanket. On SVG it pins a fixed-scale raster — a promoted vector that is then scale-animated stays blurry (Chromium re-raster exception for will-change: transform shipped M53).
- `contain` / `content-visibility: auto`: apply to the HTML WRAPPER around the `<svg>`; they do nothing useful on internal `<path>`/`<g>` children.
- Pause offscreen animation yourself for JS/rAF libraries (IntersectionObserver); browsers throttle offscreen SMIL but not your rAF loop.
- Never animate filter parameters on large areas; pre-render to raster if the effect is static.

## 3. Accessibility

- Informative inline SVG: `<svg role="img" aria-labelledby="t d">` with `<title id="t">Short name</title><desc id="d">Longer description</desc>` as the FIRST children. aria-labelledby is more reliable across AT than bare `<title>` [verify 2026 AT matrix]. `<title>` also produces a hover tooltip.
- Simpler: `role="img" aria-label="Short name"`.
- Decorative: `aria-hidden="true"` (+ `focusable="false"` for legacy IE — harmless).
- In `<img src="x.svg" alt="...">` the alt attribute wins; internal title is ignored.
- Charts/complex graphics: don't rely on per-element ARIA inside SVG (mixed support); provide a visually-hidden HTML alternative or adjacent data table + aria-describedby. Per-shape `<title>` gives tooltips at least.
- Interactive elements need tabindex="0", a role, and visible focus styling.
- Don't encode meaning in color alone; check stroke/fill contrast against the actual background.

## 4. Robustness and renderer compatibility

### File hygiene

- Standalone files need `xmlns="http://www.w3.org/2000/svg"` (fatal without it as image/svg+xml). Add `xmlns:xlink` ONLY if you emit xlink:href. No DOCTYPE or XML prolog needed.
- **href vs xlink:href**: all browsers support plain `href` on use/image/textPath/gradients/mpath; older librsvg/Inkscape/Android only knew xlink:href [verify which versions]. Max-compat: emit both (`href="#a" xlink:href="#a"`). Browser-only targets: href alone.
- **Presentation attributes are the portable choice** (fill=""/stroke=""/transform=""): every renderer reads them; `<style>` + selectors fail in weak renderers (ImageMagick MSVG, old AndroidSVG, some sanitizers) [verify]. They sit at author level with **specificity 0** (SVG2 Styling §6.6) — even `* { fill: … }` beats them, which is exactly right for theme overrides. Use `<style>` only for interactivity/animation/theming in browser-destined SVG.
- **Everything self-contained**: external images, CSS, fonts, and external `<use>` refs are blocked in `<img>` and stripped by sanitizers. Raster images as `data:` URIs. `<foreignObject>`: browsers-only, dropped by every rasterizer and design-tool import — never in portable output.
- CSS custom properties/var(): an `<img>` SVG cannot see page variables; a `<style>` defining them inside the SVG works in browsers.
- Media queries (prefers-color-scheme) inside SVG `<style>` evaluate in `<img>` context in modern browsers — usable for auto dark-mode icons (prefers-reduced-motion verified; color-scheme [verify]).
- mix-blend-mode / isolation: fine in browsers, unreliable in rasterizers [verify resvg/librsvg]; avoid in portable files or ship a flattened fallback.

### Renderer matrix

- **resvg 2.6.2 — VERIFIED empirically** (this bag's own rasterizer; battery: `research/resvg-battery.mjs`, 2026-09-10):
  - **Works**: CSS in `<style>` (class selectors), linear/radial gradients incl. `href` stop-inheritance, `<pattern>`, clip-path, luminance masks, feGaussianBlur, feDropShadow, feTurbulence, feDisplacementMap, `<text>` (with fontDirs) and `<textPath>`, `currentColor`, `paint-order`, `<marker orient="auto-start-reverse">`, `<use>` via both `href` and `xlink:href`, `fill-rule="evenodd"`, nested `<svg>`, stroke-dasharray. SMIL elements: ignored, the BASE value renders (element kept) — static-first authoring works as designed.
  - **Does NOT work**: `oklch()` (and modern CSS color functions) as paint — **falls back to BLACK silently**, so always emit hex/rgb (compute OKLCH via `lib.culori.formatHex`); CSS custom properties `var()`; CSS `transform` in a `style` attribute (use the transform *attribute*); `vector-effect="non-scaling-stroke"` (stroke scales with the group — bake stroke widths instead).
  - The first battery run misread feGaussianBlur/feDisplacementMap as unsupported because the probe pixels fell outside the **default -10%/120% filter region** — the region trap is real in resvg exactly as in browsers; always widen filter regions.
- **librsvg** (rsvg-convert, sharp): good shapes/gradients/masks/clips/filters in modern releases (2.50+ Rust filters); limited CSS; no SMIL; dominant-baseline historically weak [verify].
- **ImageMagick**: delegates to librsvg when available; otherwise its internal MSVG parser (no filters, no masks, barely CSS). Never target MSVG.
- **Inkscape**: near-browser SVG 1.1; its inkscape: namespace extensions are ignorable.
- **Figma import**: geometry, fills, linear/radial gradients, basic masks-as-clips survive; filters dropped or approximated, patterns rasterized/dropped, text needs matching local fonts, foreignObject dropped [verify current].
- **Headless Chrome/Playwright screenshot**: the gold standard — full fidelity incl. CSS/filters; use when exact browser output is required.

## 5. Precision and SVGO

- Decimal precision rule: error < half a device pixel at maximum display scale. viewBox 0–100 shown ≤1000px → 2 decimals; 0–24 icons → 2; 0–1000 → 1. SVGO defaults to 3 significant decimals. Never emit float-noise (13+ digits).
- Path byte tricks: relative commands for small deltas; H/V for axis-aligned; S/T when chaining same-family curves; Z instead of a closing L; `.5` not `0.5`; minus as separator (`10-20`); implicit repeats (M's repeats are L).
- Transform vs baked coordinates: keep transforms for animation targets, readability, reuse. BAKE them when (a) a non-uniform scale would distort strokes, (b) the target renderer is weak, (c) you're compressing. Non-uniform scale distorts stroke width and turns circles into ellipses — bake or use vector-effect="non-scaling-stroke".
- ids: shortest-unique but namespaced per document (`g1` collides when inlined).
- SVGO: safe with preset-default EXCEPT:
  - **always disable removeViewBox** (keep the viewBox);
  - watch cleanupIds (breaks external refs and JS hooks);
  - watch mergePaths (fill-rule interactions);
  - watch convertShapeToPath (loses rect rx semantics for some consumers) [verify current plugin names].
- SVG gzips ~4–10×: measure compressed size; verbosity that aids correctness is nearly free after gzip.
- SVG in a CSS data-URI: URL-encode, don't base64 (`#` → %23, swap quote styles); base64 is ~35% bigger for nothing.

## 6. Pre-ship checklists per destination

### Any standalone .svg file

- `xmlns` present; viewBox present; no external refs (images as data: URIs).
- Base attribute values render the correct static image with all animation stripped.
- Every filter carries `color-interpolation-filters="sRGB"` and a widened region.
- ids namespaced; 2–3 decimal precision; no NaN/float-noise in `d`.

### `<img>` / CSS background

- No scripts, no interactivity, no external refs (all silently dead in secure animated mode).
- Fonts: text converted to paths, or a data:-URI @font-face [verify per-browser], or a system stack + textLength.
- CSS animations guarded by an in-file `@media (prefers-reduced-motion: reduce)` block ending on the finished state.
- Alt text on the `<img>` (internal `<title>` is ignored there).

### Favicon

- Static-correct at t=0 (Chromium freezes SMIL, secure static mode).
- Legible at 16×16: drop fine strokes, hairlines, and filters; solid shapes only.
- Optional auto dark-mode via prefers-color-scheme in internal `<style>` [verify].

### Rasterizers (resvg / librsvg / sharp / ImageMagick)

- No SMIL, no CSS animation, no foreignObject, no external `<use>` (resvg verified: SMIL ignored, base values render).
- Prefer presentation attributes over `<style>` for maximum portability (resvg itself DOES honor `<style>` class selectors — verified); emit both href and xlink:href for older librsvg [verify versions] (resvg verified: both work).
- Avoid dominant-baseline (use dy="0.35em"); avoid mix-blend-mode; feDropShadow verified working in resvg 2.6.2.
- **Colors as hex/rgb only** — resvg renders `oklch()` as BLACK with no error, and ignores `var()`. Compute fancy color in code (`lib.culori.formatHex`), emit plain values.
- CSS `transform` in style attributes is ignored by resvg — use the `transform` attribute. `vector-effect="non-scaling-stroke"` is ignored too.
- Text→paths unless the render host demonstrably has the font.

### Figma / design-tool import

- Flatten filters to baked effects or accept their loss; expect patterns rasterized/dropped [verify current].
- Bake transforms where possible; convert text to paths unless matching local fonts are guaranteed.
- Keep masks simple (they import as clips at best).

## 7. Golden rules digest

1. Always viewBox; author in a clean unit space (0–24 icons, 0–100/1000 art). Center-origin viewBox for radial art.
2. Set color-interpolation-filters="sRGB" on every filter; widen filter regions for blurs (default region is only -10%/120%).
3. Mask content beyond 120% bbox is cut — set userSpaceOnUse regions. White-rect base in every mask; prefer alpha over grey luminance.
4. clip for hard edges (cheap), mask for soft (expensive).
5. Stroke is centered: inset geometry by sw/2 at viewBox edges; Z closed shapes; miterlimit 10 for sharp tips; butt caps when length encodes data.
6. pathLength normalizes dash animations to CSS-only.
7. No S/T after a non-matching command; two arcs for a full circle; kappa 0.5523 for cubic circles.
8. currentColor + CSS custom properties for themable `<use>` icons; namespace all ids.
9. paint-order="stroke" for text halos; dominant-baseline="central" in browsers, dy="0.35em" for portability.
10. Text→paths for identical-everywhere rendering (use the bag's `text_to_path` tool); else system stacks + textLength.
11. Static-first: base attributes must render the correct frame zero everywhere; SMIL for self-contained `<img>` animation; CSS + an in-file prefers-reduced-motion block otherwise.
12. Animate transform/opacity on one `<g>`, not n children; never animate viewBox or filter params on large areas.
13. Presentation attributes for the base look; both href and xlink:href for max-compat; no external refs; no foreignObject in portable files.
14. 2–3 decimals; gzip decides; verify renderer targets empirically — especially everything tagged [verify].
