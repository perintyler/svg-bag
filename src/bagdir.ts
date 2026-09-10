/**
 * Locate the bag directory at runtime.
 *
 * Barry bundles a bag's tools into ~/Library/Caches/Barry/bags/<name>-<hash>/
 * before running them, so `import.meta.url` resolves into the cache in
 * production and a path relative to it points at nothing. The runner scripts
 * and the toolkit's node_modules stay in the bag, so the bag directory has to
 * be found rather than assumed (same pattern as macos-app-testing's probe).
 *
 * Every candidate is verified by probing for the runner entry, so a wrong
 * guess falls through instead of failing later as "module not found".
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/** The file whose presence proves a candidate really is this bag. */
const MARKER = "runner/run.mjs";

function candidateRoots(): string[] {
  // An explicit override is AUTHORITATIVE, not merely first: falling through
  // to another checkout would run code the caller did not point at.
  const fromEnv = process.env.SVG_BAG_DIR ?? process.env.BARRY_BAG_DIR;
  if (fromEnv) return [fromEnv];
  return [
    resolve(HERE, ".."), // dev: running from src/
    HERE, // a bundle that happens to sit in the bag
    resolve(homedir(), "repos/bags/svg"), // conventional checkout
  ];
}

export function findBagDir(): string | null {
  return candidateRoots().find((root) => existsSync(resolve(root, MARKER))) ?? null;
}

/**
 * The bag dir, or a thrown error whose text carries its own remedy — a bare
 * "not found" reads as a dead end to an agent.
 */
export function requireBagDir(): string {
  const dir = findBagDir();
  if (!dir) {
    throw new Error(
      "svg bag directory not found (looked for runner/run.mjs). " +
        "Set SVG_BAG_DIR to the bag checkout, or reinstall with " +
        "`barry install ~/repos/bags/svg --as svg` and run `pnpm install` inside it.",
    );
  }
  return dir;
}
