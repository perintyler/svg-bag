/**
 * Reproducibility is the contract: (code, seed) → identical output depends
 * entirely on makeRandom being deterministic per seed.
 */

import { describe, expect, it } from "vitest";
import { makeRandom } from "../runner/lib/random.mjs";

describe("makeRandom", () => {
  it("same seed → identical sequence", () => {
    const a = makeRandom(1234);
    const b = makeRandom(1234);
    for (let i = 0; i < 100; i++) expect(a.random()).toBe(b.random());
  });

  it("different seeds → different sequences", () => {
    const a = makeRandom(1);
    const b = makeRandom(2);
    const same = Array.from({ length: 20 }, () => a.random() === b.random()).filter(Boolean);
    expect(same.length).toBeLessThan(3);
  });

  it("string seeds work and are deterministic", () => {
    expect(makeRandom("hello").random()).toBe(makeRandom("hello").random());
  });

  it("range stays in bounds", () => {
    const r = makeRandom(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.range(-5, 5);
      expect(v).toBeGreaterThanOrEqual(-5);
      expect(v).toBeLessThan(5);
    }
  });

  it("int covers both inclusive endpoints", () => {
    const r = makeRandom(7);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(r.int(0, 3));
    expect([...seen].sort()).toEqual([0, 1, 2, 3]);
  });

  it("gaussian is roughly centered with roughly right spread", () => {
    const r = makeRandom(99);
    const n = 5000;
    let sum = 0;
    let sumSquares = 0;
    for (let i = 0; i < n; i++) {
      const v = r.gaussian(10, 2);
      sum += v;
      sumSquares += v * v;
    }
    const mean = sum / n;
    const sd = Math.sqrt(sumSquares / n - mean * mean);
    expect(mean).toBeGreaterThan(9.8);
    expect(mean).toBeLessThan(10.2);
    expect(sd).toBeGreaterThan(1.8);
    expect(sd).toBeLessThan(2.2);
  });

  it("shuffle preserves elements and does not mutate", () => {
    const r = makeRandom(5);
    const original = [1, 2, 3, 4, 5];
    const shuffled = r.shuffle(original);
    expect(original).toEqual([1, 2, 3, 4, 5]);
    expect([...shuffled].sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("weightedIndex respects zero weights", () => {
    const r = makeRandom(11);
    for (let i = 0; i < 200; i++) expect(r.weightedIndex([0, 1, 0])).toBe(1);
  });

  it("inCircle stays inside the radius", () => {
    const r = makeRandom(3);
    for (let i = 0; i < 500; i++) {
      const [x, y] = r.inCircle(10);
      expect(Math.hypot(x, y)).toBeLessThanOrEqual(10.000001);
    }
  });
});
