/**
 * The validator is the bag's safety net, so these tests are mostly NEGATIVE
 * controls: each known way generated SVG breaks must turn the verdict red.
 * A validator whose broken state looks like its healthy state is worse than
 * none.
 */

import { describe, expect, it } from "vitest";
import { checkPathData, checkSvg } from "../runner/lib/checks.mjs";

const wrap = (body: string, attrs = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"${attrs}>${body}</svg>`;

describe("checkSvg — healthy input stays green", () => {
  it("passes a minimal valid document", () => {
    const verdict = checkSvg(wrap('<circle cx="50" cy="50" r="40" fill="red"/>'));
    expect(verdict.ok).toBe(true);
    expect(verdict.errors).toEqual([]);
  });

  it("passes gradients with resolving references", () => {
    const verdict = checkSvg(
      wrap('<defs><linearGradient id="g"><stop offset="0" stop-color="#000"/></linearGradient></defs><rect width="100" height="100" fill="url(#g)"/>'),
    );
    expect(verdict.ok).toBe(true);
  });

  it("accepts negative-number shorthand in path data", () => {
    expect(checkPathData("M10-5L-3.5.5").ok).toBe(true);
  });

  it("accepts repeated coordinate groups", () => {
    expect(checkPathData("M 0 0 L 10 10 20 20 30 30 Z").ok).toBe(true);
  });
});

describe("checkSvg — every known breakage goes red", () => {
  it("rejects malformed XML", () => {
    expect(checkSvg("<svg><circle").ok).toBe(false);
  });

  it("rejects a non-svg root", () => {
    expect(checkSvg("<div>hi</div>").ok).toBe(false);
  });

  it("rejects missing xmlns", () => {
    const verdict = checkSvg('<svg viewBox="0 0 10 10"><rect width="1" height="1"/></svg>');
    expect(verdict.ok).toBe(false);
    expect(verdict.errors.join()).toContain("xmlns");
  });

  it("rejects NaN in attributes", () => {
    const verdict = checkSvg(wrap('<circle cx="NaN" cy="50" r="4"/>'));
    expect(verdict.ok).toBe(false);
    expect(verdict.errors.join()).toContain("non-finite");
  });

  it("rejects undefined leaking into attributes", () => {
    expect(checkSvg(wrap('<rect x="undefined" width="10" height="10"/>')).ok).toBe(false);
  });

  it("rejects a zero-size viewBox", () => {
    expect(checkSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 0 0"><rect width="1" height="1"/></svg>').ok).toBe(false);
  });

  it("rejects dangling url(#id) references", () => {
    const verdict = checkSvg(wrap('<rect width="10" height="10" fill="url(#nope)"/>'));
    expect(verdict.ok).toBe(false);
    expect(verdict.errors.join()).toContain("#nope");
  });

  it("rejects dangling href references", () => {
    expect(checkSvg(wrap('<use href="#missing"/>')).ok).toBe(false);
  });
});

describe("checkPathData — the classic generation failures", () => {
  it("rejects an empty d", () => {
    expect(checkPathData("").ok).toBe(false);
  });

  it("rejects a path not starting with M", () => {
    expect(checkPathData("L 10 10").ok).toBe(false);
  });

  it("rejects truncated argument groups", () => {
    expect(checkPathData("M 0 0 C 1 2 3 4 5").ok).toBe(false);
  });

  it("rejects non-numeric arguments", () => {
    expect(checkPathData("M 0 zero").ok).toBe(false);
  });

  it("rejects arc flags that are not 0/1 — the #1 LLM arc failure", () => {
    // rx ry rot large-arc sweep x y — flags here are 2 and 5
    expect(checkPathData("M 0 0 A 10 10 0 2 5 20 20").ok).toBe(false);
  });

  it("accepts valid arcs", () => {
    expect(checkPathData("M 0 0 A 10 10 0 0 1 20 20").ok).toBe(true);
  });

  it("accepts svgo-style glued arc flags (single-char lexing)", () => {
    expect(checkPathData("M0 0A10 10 0 0120 20").ok).toBe(true);
    expect(checkPathData("M0 0a1 1 0 011.5.5").ok).toBe(true);
  });

  it("rejects negative arc radii", () => {
    expect(checkPathData("M 0 0 A -10 10 0 0 1 20 20").ok).toBe(false);
  });
});

describe("warnings — legal but suspect", () => {
  it("warns on <text> (font portability)", () => {
    const verdict = checkSvg(wrap('<text x="10" y="20">hi</text>'));
    expect(verdict.ok).toBe(true);
    expect(verdict.warnings.join()).toContain("text");
  });

  it("warns when viewBox is absent", () => {
    const verdict = checkSvg('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="1" height="1"/></svg>');
    expect(verdict.warnings.join()).toContain("viewBox");
  });
});
