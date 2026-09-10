/**
 * End-to-end pipeline tests through the real child-process runner — the same
 * path production takes. These prove the loop closes: generate → validate →
 * render, and prove the failure paths are distinguishable from success.
 *
 * They need `pnpm install` to have run (native resvg, svgdom); vitest runs
 * from the bag dir so that is already true wherever tests run at all.
 */

import { describe, expect, it } from "vitest";
import { runRunner } from "./exec.js";

describe("probe (status smoke test)", () => {
  it("passes end to end, negative controls included", async () => {
    const result = await runRunner("probe", {}, { timeoutMs: 60_000 });
    expect(result.failures ?? []).toEqual([]);
    expect(result.ok).toBe(true);
  }, 90_000);
});

describe("generate", () => {
  it("runs a toolkit script and returns a validated, rendered result", async () => {
    const result = await runRunner(
      "run",
      {
        code: `export default ({ svg, width, height, random, noise2D }) => {
          svg.rect(width, height).fill("#0f0f23");
          for (let i = 0; i < 20; i++) {
            svg.circle(random.range(10, 40))
              .center(random.range(0, width), random.range(0, height))
              .fill("#e94560")
              .opacity(0.5 + noise2D(i * 0.1, 0) * 0.3);
          }
        }`,
        name: "test-art",
        seed: 7,
        width: 200,
        height: 200,
      },
      { timeoutMs: 60_000 },
    );
    expect(result.ok).toBe(true);
    expect(result.svgPath).toMatch(/test-art.*\.svg$/);
    expect(result.pngPath).toMatch(/\.png$/);
    expect((result.render as { coverage: number }).coverage).toBeGreaterThan(0.9);
  }, 90_000);

  it("same code + seed → byte-identical SVG", async () => {
    const code = `export default ({ svg, random }) => {
      for (let i = 0; i < 10; i++) svg.circle(random.range(5, 20)).center(random.range(0, 100), random.range(0, 100)).fill("#333");
    }`;
    const options = { code, seed: 42, width: 100, height: 100, preview: false };
    const a = await runRunner("run", options, { timeoutMs: 60_000 });
    const b = await runRunner("run", options, { timeoutMs: 60_000 });
    expect(a.ok).toBe(true);
    expect(a.svg).toBeDefined();
    expect(a.svg).toEqual(b.svg);
  }, 120_000);

  it("NaN leaking into markup is caught by validation, not shipped silently", async () => {
    // NOTE: svg.js itself coerces NaN to 0 in setters (verified — center(NaN, 50)
    // serializes cx="0"), silently mispositioning instead of erroring. Raw
    // markup is where NaN survives to the document, so that is what the
    // pipeline must catch; the coercion gotcha is documented in instructions.
    const result = await runRunner(
      "run",
      {
        code: `export default ({ width, height }) => \`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 \${width} \${height}"><circle cx="\${NaN}" cy="50" r="20"/></svg>\`;`,
        width: 100,
        height: 100,
        preview: false,
      },
      { timeoutMs: 60_000 },
    );
    expect(result.ok).toBe(false);
  }, 90_000);

  it("a broken script surfaces its error", async () => {
    const result = await runRunner(
      "run",
      { code: `export default () => { throw new Error("deliberate"); }`, width: 100, height: 100 },
      { timeoutMs: 60_000 },
    );
    expect(result.ok).toBe(false);
    expect(String(result.error)).toContain("deliberate");
  }, 90_000);
});

describe("validate", () => {
  it("greens a good SVG", async () => {
    const result = await runRunner("validate", {
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#123"/></svg>',
    });
    expect(result.ok).toBe(true);
  }, 60_000);

  it("reds a blank-rendering SVG", async () => {
    const result = await runRunner("validate", {
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>',
    });
    expect(result.ok).toBe(false);
    expect((result.errors as string[]).join()).toContain("blank");
  }, 60_000);
});

describe("text_to_path", () => {
  it("produces valid path data with metrics", async () => {
    const result = await runRunner("textpath", { text: "Hi", size: 100 });
    // Passes with shipped fonts OR falls back to a clear failure — both are
    // legible; silent garbage is not. If fonts ship, assert the full contract.
    if (result.ok) {
      expect(String(result.d)).toMatch(/^M/);
      expect(result.advanceWidth as number).toBeGreaterThan(0);
    } else {
      expect(String(result.error)).toContain("font");
    }
  }, 60_000);
});

describe("optimize", () => {
  it("shrinks verbose markup and keeps the viewBox", async () => {
    const verbose =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><!-- comment --><g><rect x="10.000000" y="10.000000" width="50.000000" height="50.000000" fill="#ff0000"/></g></svg>';
    const result = await runRunner("optimize", { svg: verbose });
    expect(result.ok).toBe(true);
    expect(result.bytesAfter as number).toBeLessThan(result.bytesBefore as number);
    expect(String(result.svg)).toContain("viewBox");
  }, 60_000);
});
