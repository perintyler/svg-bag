/**
 * Minimal typings for the plain-JS runner libraries the tests import.
 * The runner runs under plain node and stays untyped; tests still get
 * structure on the boundary they assert against.
 */

declare module "*/checks.mjs" {
  export function checkPathData(d: string): { ok: boolean; error?: string };
  export function checkSvg(markup: string): {
    ok: boolean;
    errors: string[];
    warnings: string[];
    stats: { elements: number; byTag: Record<string, number>; bytes: number; hasText?: boolean };
  };
}

declare module "*/random.mjs" {
  export function makeRandom(seed?: number | string): {
    seed: number | string;
    random: () => number;
    range: (min: number, max: number) => number;
    int: (min: number, max: number) => number;
    bool: (p?: number) => boolean;
    sign: () => number;
    gaussian: (mean?: number, sd?: number) => number;
    choice: <T>(arr: T[]) => T;
    weightedIndex: (weights: number[]) => number;
    shuffle: <T>(arr: T[]) => T[];
    onCircle: (radius?: number) => [number, number];
    inCircle: (radius?: number) => [number, number];
  };
}
