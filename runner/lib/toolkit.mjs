/**
 * The toolkit handed to every generation script — the bag's standard library.
 *
 * Everything an agent needs for serious SVG work, pre-imported and organized,
 * so a generation script starts at the interesting part. Scripts may also
 * import anything themselves (they execute from .scratch/ inside the bag, so
 * bare specifiers resolve against the bag's node_modules).
 */

import { SVG } from "@svgdotjs/svg.js";
import { createNoise2D, createNoise3D, createNoise4D } from "simplex-noise";
import { Bezier } from "bezier-js";
import * as culori from "culori";
import * as d3shape from "d3-shape";
import * as d3scale from "d3-scale";
import * as d3delaunay from "d3-delaunay";
import * as d3hierarchy from "d3-hierarchy";
import polygonClipping from "polygon-clipping";
import dagre from "@dagrejs/dagre";
import simplify from "simplify-js";
import SvgPath from "svgpath";
import SVGPathCommander from "svg-path-commander";
import rough from "roughjs";
import { createCanvas } from "./env.mjs";
import { makeRandom } from "./random.mjs";
import { textToPath } from "./text.mjs";
import { discoverFonts } from "./fonts.mjs";

/**
 * Build the context object for one generation run.
 */
export function buildContext({ width, height, seed, params, bagDir }) {
  const { canvas, window, document } = createCanvas({ width, height, bagDir });
  const random = makeRandom(seed);

  const ctx = {
    /** The SVG.js drawing canvas, viewBox 0 0 width height. */
    svg: canvas,
    /** The svg.js factory, for detached elements. */
    SVG,
    document,
    window,
    width,
    height,
    /** Seeded randomness — ALWAYS use this, never Math.random (reproducibility). */
    random,
    /** Seeded simplex noise. noise2D(x, y) in [-1, 1]. */
    noise2D: createNoise2D(random.random),
    noise3D: createNoise3D(random.random),
    noise4D: createNoise4D(random.random),
    /** Caller-supplied parameters, verbatim. */
    params: params ?? {},
    lib: {
      /** d3-shape: line/area/arc/pie generators, curves (curveBasis, curveCatmullRom...). */
      shape: d3shape,
      /** d3-scale: scaleLinear, scaleLog, scaleBand, scaleSequential... */
      scale: d3scale,
      /** d3-delaunay: Delaunay.from(points) → .voronoi([x0,y0,x1,y1]). */
      delaunay: d3delaunay,
      /** d3-hierarchy: hierarchy, treemap, pack, tree. */
      hierarchy: d3hierarchy,
      /** Boolean ops on polygons: union/intersection/difference/xor. */
      polygonClipping,
      /**
       * DAG/flowchart layout — never eyeball node positions:
       * const g = new lib.dagre.graphlib.Graph(); g.setGraph({rankdir:"TB", nodesep:24, ranksep:48});
       * g.setDefaultEdgeLabel(() => ({})); g.setNode("a", {width:120, height:40}); g.setEdge("a","b");
       * lib.dagre.layout(g); → g.node("a").x/.y (centers), g.edge("a","b").points.
       */
      dagre,
      /** Cubic/quadratic bézier math: new Bezier(...).get(t)/.split()/.offset(). */
      Bezier,
      /** Color: culori.formatHex(culori.oklch({l,c,h})), interpolate, mix... */
      culori,
      /** Path data transforms: new SvgPath(d).scale().rotate().round().toString(). */
      SvgPath,
      /** Path utilities: getTotalLength, getPointAtLength, reverse, normalize. */
      SVGPathCommander,
      /** Douglas-Peucker point simplification: simplify(points, tolerance). */
      simplify,
      /** Hand-drawn aesthetics: lib.rough(ctx.svg.node).circle(...) appends sketchy shapes. */
      rough: (svgRootNode) => rough.svg(svgRootNode),
    },
    /** Text as outline paths: text({text, family, size, x, y}) → {d, advanceWidth,...}. */
    text: (options) => textToPath(bagDir, options),
    /** Discoverable fonts on this machine. */
    fonts: () => discoverFonts(bagDir),
  };
  return ctx;
}
