/**
 * Seeded randomness for reproducible generation.
 *
 * Every generated artwork is a function of (code, seed): the same pair must
 * produce byte-identical SVG, so exploration is "try seeds", and a good result
 * can always be regenerated. sfc32 seeded via splitmix32 — tiny, fast, and
 * good enough distribution for visual work (not cryptography).
 */

function splitmix32(a) {
  return function () {
    a |= 0;
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t = t ^ (t >>> 15);
    t = Math.imul(t, 0x735a2d97);
    return ((t = t ^ (t >>> 15)) >>> 0) / 4294967296;
  };
}

function sfc32(a, b, c, d) {
  return function () {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = (a + b | 0) + d | 0;
    d = d + 1 | 0;
    a = b ^ (b >>> 9);
    b = c + (c << 3) | 0;
    c = (c << 21) | (c >>> 11);
    c = c + t | 0;
    return (t >>> 0) / 4294967296;
  };
}

/** A seeded random toolkit. `seed` may be any number or string. */
export function makeRandom(seed = 1) {
  let numeric = 0;
  if (typeof seed === "string") {
    for (let i = 0; i < seed.length; i++) numeric = (numeric * 31 + seed.charCodeAt(i)) | 0;
  } else {
    numeric = seed | 0;
  }
  const mix = splitmix32(numeric);
  const rand = sfc32(mix() * 4294967296, mix() * 4294967296, mix() * 4294967296, mix() * 4294967296);
  // Warm up: first few sfc32 outputs correlate with the seed.
  for (let i = 0; i < 12; i++) rand();

  let spareGaussian = null;

  const r = {
    seed,
    /** Uniform in [0, 1). */
    random: rand,
    /** Uniform in [min, max). */
    range: (min, max) => min + rand() * (max - min),
    /** Integer in [min, max] inclusive. */
    int: (min, max) => Math.floor(min + rand() * (max - min + 1)),
    /** True with probability p (default 0.5). */
    bool: (p = 0.5) => rand() < p,
    /** -1 or +1. */
    sign: () => (rand() < 0.5 ? -1 : 1),
    /** Normally distributed (Box–Muller). Use for organic variation. */
    gaussian: (mean = 0, sd = 1) => {
      if (spareGaussian !== null) {
        const v = spareGaussian;
        spareGaussian = null;
        return mean + sd * v;
      }
      let u, v, s;
      do {
        u = rand() * 2 - 1;
        v = rand() * 2 - 1;
        s = u * u + v * v;
      } while (s >= 1 || s === 0);
      const m = Math.sqrt((-2 * Math.log(s)) / s);
      spareGaussian = v * m;
      return mean + sd * (u * m);
    },
    /** One element of the array. */
    choice: (arr) => arr[Math.floor(rand() * arr.length)],
    /** Index drawn according to `weights` (need not sum to 1). */
    weightedIndex: (weights) => {
      const total = weights.reduce((a, b) => a + b, 0);
      let t = rand() * total;
      for (let i = 0; i < weights.length; i++) {
        t -= weights[i];
        if (t <= 0) return i;
      }
      return weights.length - 1;
    },
    /** New shuffled copy (Fisher–Yates). */
    shuffle: (arr) => {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    /** Uniform point ON a circle of radius r. */
    onCircle: (radius = 1) => {
      const a = rand() * Math.PI * 2;
      return [Math.cos(a) * radius, Math.sin(a) * radius];
    },
    /** Uniform point IN a disc of radius r (sqrt for area-uniformity). */
    inCircle: (radius = 1) => {
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * radius;
      return [Math.cos(a) * d, Math.sin(a) * d];
    },
  };
  return r;
}
