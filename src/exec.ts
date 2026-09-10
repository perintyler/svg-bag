/**
 * The one process boundary: every tool reaches the toolkit by running a
 * runner script in a child node process from the bag directory — never by
 * importing the toolkit here.
 *
 * WHY: Barry bundles this module to plain JS in a cache directory. The
 * toolkit's dependencies include a native addon (@resvg/resvg-js) and a
 * font engine — unbundleable, and per-bag `tools.externals` are excluded from
 * the bundle but never linked into the build root's node_modules, so they
 * would not resolve at runtime. In the bag directory they resolve naturally.
 *
 * Properties guaranteed here:
 *  1. Options and results travel through files — argv-size-proof, and user
 *     code may write to stdout freely.
 *  2. Every run is bounded and killed on timeout.
 *  3. A missing result file is a crash and surfaces stderr, distinct from a
 *     handled failure (result.ok === false) which carries its own error.
 */

import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { requireBagDir } from "./bagdir.js";

const execFileAsync = promisify(execFile);

const DEFAULT_TIMEOUT_MS = 60_000;

export interface RunnerResult {
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}

export async function runRunner(
  script: "run" | "render" | "validate" | "optimize" | "textpath" | "fonts" | "probe",
  options: Record<string, unknown>,
  { timeoutMs = DEFAULT_TIMEOUT_MS }: { timeoutMs?: number } = {},
): Promise<RunnerResult> {
  const bagDir = requireBagDir();
  const workDir = mkdtempSync(join(tmpdir(), "svg-bag-"));
  const optionsFile = join(workDir, "options.json");
  const resultFile = join(workDir, "result.json");
  writeFileSync(optionsFile, JSON.stringify(options), "utf8");

  let stderr = "";
  try {
    const child = await execFileAsync(
      process.execPath,
      [join(bagDir, "runner", `${script}.mjs`), optionsFile, resultFile],
      {
        cwd: bagDir,
        timeout: timeoutMs,
        killSignal: "SIGKILL",
        maxBuffer: 16 * 1024 * 1024,
      },
    );
    stderr = child.stderr ?? "";
  } catch (e) {
    const err = e as { stderr?: string; killed?: boolean; message?: string };
    stderr = err.stderr ?? "";
    // Fall through: a handled failure still writes the result file; only a
    // real crash leaves it missing.
    if (err.killed) {
      rmSync(workDir, { recursive: true, force: true });
      return { ok: false, error: `runner timed out after ${timeoutMs}ms and was killed` };
    }
  }

  let result: RunnerResult;
  try {
    result = JSON.parse(readFileSync(resultFile, "utf8")) as RunnerResult;
  } catch {
    const detail = stderr.trim().split("\n").slice(-15).join("\n");
    result = {
      ok: false,
      error: `runner crashed without writing a result${detail ? `:\n${detail}` : ""}. If modules are missing, run \`pnpm install\` in ${requireBagDir()}.`,
    };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
  return result;
}
