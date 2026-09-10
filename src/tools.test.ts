/**
 * Shape tests: the manifest's tool-metadata and the exported tools must agree,
 * or a stale build grants the wrong namespace and tools silently vanish.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { AnyToolDefinition } from "@barry-rocks/tools";
import * as toolModules from "./tools.js";

const HERE = dirname(fileURLToPath(import.meta.url));

function exportedTools(): AnyToolDefinition[] {
  return Object.values(toolModules).filter(
    (t): t is AnyToolDefinition => !!t && typeof t === "object" && "namespace" in t && "handler" in t,
  );
}

describe("tool shape", () => {
  it("every tool lives in the svg namespace", () => {
    for (const tool of exportedTools()) expect(tool.namespace).toBe("svg");
  });

  it("no tool repeats the namespace in its name", () => {
    for (const tool of exportedTools()) expect(tool.name).not.toMatch(/^svg[_-]/);
  });

  it("bag.yaml tool-metadata matches the exported tools exactly", () => {
    const manifest = readFileSync(join(HERE, "..", "bag.yaml"), "utf8");
    const declared = [...manifest.matchAll(/toolName:\s*(\w+),\s*namespace:\s*(\w+),\s*access:\s*(\w+)/g)].map(
      (m) => ({ name: m[1], namespace: m[2], access: m[3] }),
    );
    const actual = exportedTools().map((t) => ({ name: t.name, namespace: t.namespace, access: t.access }));

    const key = (t: { name: string; namespace: string; access: string }) =>
      `${t.namespace}/${t.name}:${t.access}`;
    expect(declared.map(key).sort()).toEqual(actual.map(key).sort());
  });

  it("read tools never write, by declaration", () => {
    const writers = new Set(["generate", "variations", "optimize"]);
    for (const tool of exportedTools()) {
      expect(tool.access).toBe(writers.has(tool.name) ? "write" : "read");
    }
  });
});
