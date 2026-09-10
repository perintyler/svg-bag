/**
 * SVG generation tools.
 *
 * The design center is a closed loop: `generate` executes agent-authored code
 * against a curated toolkit (SVG.js on svgdom, d3, seeded noise/random,
 * rough, bézier and boolean-op math), then validates and rasterizes the
 * result in the same round trip — so the agent SEES what it made and iterates
 * on evidence, not hope. Craft knowledge lives in this bag's instructions
 * (search_instructions "svg").
 *
 * All heavy work runs in a child node process from the bag directory (see
 * exec.ts for why the bundle cannot host it).
 */

import { defineTool, type ToolContext } from "@barry-rocks/tools";
import { z } from "zod";
import { findBagDir } from "./bagdir.js";
import { runRunner } from "./exec.js";
import { existsSync } from "node:fs";
import { join } from "node:path";

const SCRIPT_CONTRACT =
  "The code is an ESM module: `export default (ctx) => { ... }` (async ok). " +
  "ctx: { svg (SVG.js canvas with viewBox 0 0 width height), SVG, width, height, " +
  "random (seeded: .range/.int/.gaussian/.choice/.shuffle/.weightedIndex — never Math.random), " +
  "noise2D/3D/4D (seeded simplex, [-1,1]), text({text,family,size,x,y}) → {d,...} outline paths, " +
  "params, lib: {shape,scale,delaunay,hierarchy (d3), Bezier, culori, polygonClipping, SvgPath, " +
  "SVGPathCommander, simplify, rough} }. Draw on ctx.svg, or return a raw <svg> string. " +
  "Bare imports also resolve (d3-shape, culori, ...). Same (code, seed) → identical output.";

export const status = defineTool({
  namespace: "svg",
  access: "read",
  name: "status",
  description:
    "Check the SVG toolkit end to end: runs a real generate→validate→render smoke test with " +
    "built-in negative controls (broken and blank SVGs must be rejected). Reports shipped fonts.",
  schema: {},
  handler: async (_params, _context?: ToolContext) => {
    const bagDir = findBagDir();
    if (!bagDir) {
      return {
        status: "broken",
        reason:
          "bag directory not found — reinstall with `barry install ~/repos/bags/svg --as svg`",
      };
    }
    if (!existsSync(join(bagDir, "node_modules", "@svgdotjs"))) {
      return {
        status: "broken",
        reason: `dependencies not installed — run \`pnpm install\` in ${bagDir}`,
      };
    }
    const probe = await runRunner("probe", {}, { timeoutMs: 45_000 });
    if (!probe.ok) {
      return { status: "broken", reason: probe.error ?? "probe failed", failures: probe.failures ?? [] };
    }
    return {
      status: "ok",
      renderCoverage: probe.coverage,
      shippedFonts: probe.shippedFonts,
      note: probe.note ?? undefined,
    };
  },
  cliFormat: (r: any) =>
    r.status === "ok"
      ? `ok — render coverage ${r.renderCoverage}, ${r.shippedFonts} shipped font(s)${r.note ? `\nnote: ${r.note}` : ""}`
      : `BROKEN: ${r.reason}${r.failures?.length ? `\n${r.failures.join("\n")}` : ""}`,
});

export const generate = defineTool({
  namespace: "svg",
  access: "write",
  name: "generate",
  description:
    "Generate an SVG by executing JS against the full toolkit, with validation and a rendered " +
    "PNG preview in one round trip. View the returned pngPath (media view_image) to see the " +
    "result, then iterate. " +
    SCRIPT_CONTRACT +
    " Read this bag's instructions (search_instructions \"svg\") for craft and technique.",
  schema: {
    code: z.string().min(1).describe("ESM module source. Must `export default (ctx) => ...`."),
    name: z.string().optional().describe("Slug for output filenames (default 'art')"),
    seed: z.number().int().optional().describe("Random seed (default 1). Same code+seed → identical SVG."),
    width: z.number().int().min(1).max(16384).optional().describe("viewBox width (default 800)"),
    height: z.number().int().min(1).max(16384).optional().describe("viewBox height (default 800)"),
    // A JSON string rather than z.record: a record schema is "too complex"
    // for the CLI adapter, which would silently exclude the whole tool from
    // `barry svg generate` (verified — the CLI bridge said "Unknown tool").
    params: z
      .string()
      .optional()
      .describe('JSON object of parameters, exposed parsed as ctx.params (e.g. \'{"rings": 8}\')'),
    preview: z.boolean().optional().describe("Also render a PNG preview (default true)"),
    background: z.string().optional().describe("Preview background color (e.g. '#fff') for transparent art"),
    outDir: z.string().optional().describe("Output directory (default ~/.barry/svg)"),
    timeoutMs: z.number().int().min(1000).max(300_000).optional().describe("Script time budget (default 60s)"),
  },
  handler: async ({ timeoutMs, params, ...options }) => {
    let parsedParams: unknown;
    if (params) {
      try {
        parsedParams = JSON.parse(params);
      } catch {
        return { ok: false, error: "params is not valid JSON" };
      }
    }
    return runRunner("run", { ...options, params: parsedParams }, { timeoutMs: timeoutMs ?? 60_000 });
  },
  cliFormat: (r: any) =>
    r.ok
      ? `${r.svgPath}${r.pngPath ? `\npreview: ${r.pngPath} (coverage ${r.render?.coverage})` : ""}${r.warnings?.length ? `\nwarnings:\n  ${r.warnings.join("\n  ")}` : ""}`
      : `FAILED: ${r.error}${r.warnings?.length ? `\n${r.warnings.join("\n")}` : ""}${r.logs?.length ? `\nlogs:\n  ${r.logs.join("\n  ")}` : ""}`,
});

export const render = defineTool({
  namespace: "svg",
  access: "read",
  name: "render",
  description:
    "Rasterize an SVG (file path or markup) to PNG via resvg, reporting pixel coverage so a " +
    "blank render is a visible verdict, not a silent success. View the PNG with view_image.",
  schema: {
    svgPath: z.string().optional().describe("Path to an .svg file"),
    svg: z.string().optional().describe("Inline SVG markup (alternative to svgPath)"),
    width: z.number().int().min(1).max(16384).optional().describe("Output width in px (default: intrinsic)"),
    background: z.string().optional().describe("Background color (default: transparent)"),
    outPath: z.string().optional().describe("Where to write the PNG (default ~/.barry/svg)"),
  },
  handler: async (options) => {
    if (!options.svg && !options.svgPath) return { ok: false, error: "pass svg or svgPath" };
    return runRunner("render", options);
  },
  cliFormat: (r: any) =>
    r.ok ? `${r.pngPath} (${r.width}x${r.height}, coverage ${r.coverage})` : `FAILED: ${r.error}`,
});

export const validate = defineTool({
  namespace: "svg",
  access: "read",
  name: "validate",
  description:
    "Validate an SVG: XML well-formedness, path-data syntax (incl. arc flags), NaN/Infinity in " +
    "attributes, dangling url(#id)/href refs, viewBox sanity — plus a real render probe that " +
    "fails on unrenderable or fully blank output.",
  schema: {
    svgPath: z.string().optional().describe("Path to an .svg file"),
    svg: z.string().optional().describe("Inline SVG markup (alternative to svgPath)"),
  },
  handler: async (options) => {
    if (!options.svg && !options.svgPath) return { ok: false, error: "pass svg or svgPath" };
    return runRunner("validate", options);
  },
  cliFormat: (r: any) =>
    r.ok
      ? `valid — ${r.stats?.elements} elements, ${r.stats?.bytes} bytes${r.warnings?.length ? `\nwarnings:\n  ${r.warnings.join("\n  ")}` : ""}`
      : `INVALID:\n  ${(r.errors ?? [r.error]).join("\n  ")}`,
});

export const optimizeTool = defineTool({
  namespace: "svg",
  access: "write",
  name: "optimize",
  description:
    "Optimize an SVG with svgo (multipass, viewBox always preserved). Reports byte savings. " +
    "Writes in place unless outPath is given.",
  schema: {
    svgPath: z.string().optional().describe("Path to an .svg file (optimized in place by default)"),
    svg: z.string().optional().describe("Inline SVG markup (alternative to svgPath; returns optimized markup)"),
    outPath: z.string().optional().describe("Write result here instead of in place"),
    precision: z.number().int().min(0).max(6).optional().describe("Decimal precision (default 2)"),
    keepIds: z.boolean().optional().describe("Preserve all ids (for CSS/JS hooks)"),
    pretty: z.boolean().optional().describe("Pretty-print output"),
  },
  handler: async (options) => {
    if (!options.svg && !options.svgPath) return { ok: false, error: "pass svg or svgPath" };
    return runRunner("optimize", options);
  },
  cliFormat: (r: any) =>
    r.ok
      ? `${r.bytesBefore} → ${r.bytesAfter} bytes (saved ${r.savedPercent}%)${r.outPath ? ` → ${r.outPath}` : ""}`
      : `FAILED: ${r.error}`,
});

export const textToPathTool = defineTool({
  namespace: "svg",
  access: "read",
  name: "text_to_path",
  description:
    "Convert text to SVG path outlines with real font metrics (fontkit) — the portable answer " +
    "to <text>, which depends on viewer fonts. Returns path data positioned at (x, y=baseline) " +
    "plus advanceWidth/ascent/descent/capHeight for layout math.",
  schema: {
    text: z.string().min(1).describe("The text to outline"),
    family: z.string().optional().describe("Font family (default Inter; see the fonts tool)"),
    style: z.string().optional().describe("Subfamily, e.g. Bold, Italic (default Regular)"),
    fontFile: z.string().optional().describe("Explicit .ttf/.otf path (overrides family)"),
    size: z.number().min(1).optional().describe("Font size in SVG units (default 72)"),
    x: z.number().optional().describe("Pen start x (default 0)"),
    y: z.number().optional().describe("Baseline y (default 0)"),
    letterSpacing: z.number().optional().describe("Extra spacing between glyphs, SVG units"),
  },
  handler: async (options) => runRunner("textpath", options),
  cliFormat: (r: any) =>
    r.ok
      ? `advance ${r.advanceWidth}, cap ${r.capHeight} (${r.font?.family} ${r.font?.subfamily})\nd: ${String(r.d).slice(0, 120)}...`
      : `FAILED: ${r.error}`,
});

export const fonts = defineTool({
  namespace: "svg",
  access: "read",
  name: "fonts",
  description:
    "List fonts usable by text_to_path and <text> rendering: the bag's shipped OFL fonts " +
    "(deterministic) plus system fonts.",
  schema: {
    includeSystem: z.boolean().optional().describe("Include system fonts (default true)"),
  },
  handler: async (options) => runRunner("fonts", options),
  cliFormat: (r: any) =>
    r.ok
      ? Object.entries(r.families ?? {})
          .map(([family, styles]: [string, any]) => `${family}: ${styles.join(", ")}`)
          .join("\n")
      : `FAILED: ${r.error}`,
});
