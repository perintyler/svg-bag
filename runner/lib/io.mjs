/**
 * Runner protocol: every runner script is `node runner/<x>.mjs <optionsFile> <resultFile>`.
 *
 * Options and results travel through files, not argv or stdout — generated
 * SVG easily exceeds argv limits, and user code is free to console.log
 * without corrupting the protocol. The parent treats a missing result file
 * as a crash and surfaces stderr.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export function outputDir(options) {
  const dir = options?.outDir ?? join(homedir(), ".barry", "svg");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function stampedName(name, extension) {
  const slug = (name ?? "svg")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "svg";
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
  return `${slug}-${stamp}${extension}`;
}

/**
 * Run a handler with the protocol wrapped around it. The handler returns the
 * result object; a thrown error becomes { ok: false, error } — still exit 0,
 * because a handled failure is a verdict, not a crash.
 */
export async function main(handler) {
  const [optionsFile, resultFile] = process.argv.slice(2);
  if (!optionsFile || !resultFile) {
    console.error("usage: node <runner>.mjs <optionsFile> <resultFile>");
    process.exit(2);
  }
  const options = JSON.parse(readFileSync(optionsFile, "utf8"));
  let result;
  try {
    result = await handler(options);
  } catch (e) {
    result = {
      ok: false,
      error: e instanceof Error ? (e.stack ?? e.message) : String(e),
    };
  }
  mkdirSync(dirname(resultFile), { recursive: true });
  writeFileSync(resultFile, JSON.stringify(result), "utf8");
}
