# SVG Animation Reference (verified against primary sources via curl, 2026-09-10)

Sources fetched live: MDN (prefers-reduced-motion, SVG-as-image, getAnimations, will-change), svgwg.org SVG2 drafts (styling, conform, animations), W3C SMIL Animation REC, WCAG 2.2 Understanding docs, @mdn/browser-compat-data (npm), chromestatus, registry.npmjs.org, gsap.com/pricing.

## prefers-reduced-motion + the SVG cascade

- `@media (prefers-reduced-motion)`: values `no-preference` / `reduce`; bare form ≡ `: reduce`. Support: Chrome 74, Edge 79, Firefox 63, Safari 10.1, iOS 10.3.
- SVG in `<img>` runs in SVG2 "secure animated mode": script NO, external refs NO, interactivity NO, **declarative animation YES**. Internal `<style>` honored. Media queries evaluate in the SVG's own document — so a `@media (prefers-reduced-motion: reduce)` block inside the SVG's own `<style>` is THE way a standalone/`<img>` SVG self-disables its CSS animations. (Whether every engine forwards the OS preference into the image document: verified-reported for Chromium/Firefox, test Safari.)
- SVG favicons (Chromium): rendered in secure STATIC mode, SMIL frozen at t=0.
- Presentation attributes sit at the AUTHOR level with **specificity 0** — any matching author CSS rule (even `* { fill: … }`) beats a presentation attribute (SVG2 Styling §6.6).
- SVG2 removed `attributeType`; SMIL targets the CSS property first when one exists. The practical authoring rule: **never set the same property in author CSS that you SMIL-animate** — engines historically apply SMIL values at presentation-attribute level, so an author rule can make the animation appear dead.
- CSS cannot pause SMIL. The hooks are DOM: `svg.pauseAnimations()/unpauseAnimations()/setCurrentTime()` (universal since forever) and `SVGAnimationElement.beginElement()/endElement()`. For reduced motion on inline SVG: `matchMedia('(prefers-reduced-motion: reduce)').matches && svg.pauseAnimations()`.
- SMIL events: use `addEventListener('beginEvent'|'endEvent'|'repeatEvent')` — the `onbegin`/`onend` handler PROPERTIES only reached Safari in 26.2/26.5 (2026).
- WCAG 2.2 SC 2.2.2 (A): auto-starting motion lasting >5s alongside other content needs pause/stop/hide. SC 2.3.3 (AAA): interaction-triggered motion must be disableable unless essential.

## WAAPI + CSS animation of SVG

- `Element.animate()` animates CSS properties only — no XML attributes. Works for geometry exactly where SVG2 made it CSS: `cx/cy/r/x/y` (everywhere modern), `d` (Chrome 52, Firefox 97, **Safari: parses but has NO effect** as of 2026-09 BCD — path morphing via CSS/WAAPI excludes Safari; use SMIL or JS there). `points` (polygon/polyline) is not a CSS property anywhere.
- `document.getAnimations()` does NOT include SMIL — SMIL has its own timeline outside the Web Animations model.

## Libraries (versions verified on npm 2026-09-10)

- gsap 3.15.0 — now 100% FREE incl. MorphSVG/DrawSVG/MotionPath (Webflow acquisition; all-free since 3.13, 2025).
- animejs 4.5.0 (MIT) — v4 full rewrite, modular ESM, `svg` helpers for morph/line-draw/motion-path.
- motion 13.2.0 (MIT) — merged Framer Motion + Motion One.
- lottie-web 5.13.0 (MIT); @lottiefiles/dotlottie-web 0.80.0 — the actively pushed runtime.
- DEAD: snapsvg (last publish 2017), vivus (2021). Do not build new work on them.

## Performance (verified: Chrome dev blog, css-contain-2, MDN will-change)

- CSS/WAAPI `transform`/`opacity` on SVG elements are compositor-accelerated since **Chrome 89** (Firefox earlier, OMTA). SMIL is always main-thread.
- Expensive, worst first: animating layout attributes (width/height/x/y on root) → `viewBox` animation (full-document repaint per frame; prefer a transform on an inner `<g>`) → animated SVG filter chains (feTurbulence etc. re-rasterize the subtree every frame) → `d` morphing (geometry + repaint) → `stroke-dashoffset` (paint-only; fine for one hero path, costly for dozens).
- Cheap: `transform`, `opacity` on the fewest possible nodes (one `<g>` beats n children).
- `will-change`: last resort, toggle around the animation, never blanket. On SVG it pins a fixed-scale raster — a promoted vector that is then scale-animated stays blurry (Chromium re-raster exception for will-change: transform, shipped M53).
- `contain` / `content-visibility: auto`: apply to the HTML WRAPPER around the `<svg>`; they do nothing useful on internal `<path>`/`<g>` children.
- Pause offscreen animation yourself for JS/rAF libraries (IntersectionObserver); browsers throttle offscreen SMIL but not your rAF loop.
