/**
 * Static SVG validation — the checks that run without a rasterizer.
 *
 * Designed to actually go red: every check here corresponds to a way
 * generated SVG really breaks (NaN leaking into attributes, truncated path
 * data, bad arc flags, dangling refs, a viewBox nothing lands inside). The
 * test suite feeds each failure mode in and asserts the red verdict.
 *
 * Shared by the runner scripts and imported directly by the test suite —
 * single source, no drift.
 */

import { parseXml } from "@rgrove/parse-xml";

/** Required argument count per path command (repeats allowed in groups). */
const PATH_ARITY = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

/**
 * Lex path data the way the spec does: commands are single letters, numbers
 * are greedy but a second '.' starts a NEW number ("3.5.5" is 3.5 then .5),
 * and '-'/'+' also start a new number ("10-5" is 10 then -5). A naive
 * split-on-whitespace mislabels both shorthands as garbage.
 */
const PATH_TOKEN_RE = /([MLHVCSQTAZmlhvcsqtaz])|([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)|([\s,]+)|(.)/g;

function lexPathData(d) {
  const tokens = [];
  for (const match of d.matchAll(PATH_TOKEN_RE)) {
    if (match[1]) tokens.push({ kind: "command", value: match[1] });
    else if (match[2]) tokens.push({ kind: "number", value: match[2] });
    else if (match[4]) return { error: `illegal character "${match[4]}" in path data` };
  }
  return { tokens };
}

/** Validate path data; returns { ok, error } — never throws. */
export function checkPathData(d) {
  const lexed = lexPathData(d);
  if (lexed.error) return { ok: false, error: lexed.error };
  const tokens = lexed.tokens;
  if (tokens.length === 0) return { ok: false, error: "empty path data" };

  let i = 0;
  let sawCommand = false;
  while (i < tokens.length) {
    const token = tokens[i];
    if (token.kind !== "command") {
      return { ok: false, error: `expected a path command, got "${token.value}"` };
    }
    const command = token.value.toUpperCase();
    if (!sawCommand && command !== "M") {
      return { ok: false, error: `path must start with M, got "${token.value}"` };
    }
    sawCommand = true;
    i++;
    const arity = PATH_ARITY[command];
    if (arity === 0) continue;

    // One or more argument groups until the next command letter.
    let groups = 0;
    while (i < tokens.length && tokens[i].kind === "number") {
      for (let j = 0; j < arity; j++) {
        const current = tokens[i];
        if (!current || current.kind !== "number") {
          return { ok: false, error: `${token.value} needs ${arity} numbers per group, got ${j} trailing` };
        }
        const value = current.value;
        if (command === "A" && (j === 3 || j === 4)) {
          // Arc flags are single characters per spec — svgo emits them glued
          // to the next number ("...0 0110 10"). Peel one flag char off and
          // re-queue the remainder; anything not starting 0/1 is the classic
          // generation failure this check exists for.
          const first = value[0];
          if (first !== "0" && first !== "1") {
            return { ok: false, error: `arc flag "${value}" must be 0 or 1 (large-arc, sweep)` };
          }
          const rest = value.slice(1);
          if (rest.length > 0) {
            if (!/^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(rest)) {
              return { ok: false, error: `arc flag run "${value}" is not followed by a valid number` };
            }
            tokens.splice(i + 1, 0, { kind: "number", value: rest });
          }
        }
        if (command === "A" && (j === 0 || j === 1) && Number(value) < 0) {
          return { ok: false, error: `arc radius "${value}" must be non-negative` };
        }
        i++;
      }
      groups++;
    }
    if (groups === 0) return { ok: false, error: `${token.value} has no arguments` };
  }
  return { ok: true };
}

function walk(node, fn) {
  fn(node);
  for (const child of node.children ?? []) walk(child, fn);
}

/**
 * Validate SVG markup. Returns { ok, errors, warnings, stats } — errors mean
 * broken output, warnings mean legal-but-suspect. Never throws.
 */
export function checkSvg(markup) {
  const errors = [];
  const warnings = [];
  const stats = { elements: 0, byTag: {}, bytes: Buffer.byteLength(markup, "utf8") };

  let doc;
  try {
    doc = parseXml(markup);
  } catch (e) {
    return {
      ok: false,
      errors: [`not well-formed XML: ${e instanceof Error ? e.message : String(e)}`],
      warnings,
      stats,
    };
  }

  const root = doc.children.find((c) => c.type === "element");
  if (!root || root.name !== "svg") {
    return { ok: false, errors: ["root element is not <svg>"], warnings, stats };
  }
  if (root.attributes.xmlns !== "http://www.w3.org/2000/svg") {
    errors.push('missing or wrong xmlns (must be "http://www.w3.org/2000/svg")');
  }

  // viewBox
  let viewBox = null;
  if (root.attributes.viewBox) {
    const parts = root.attributes.viewBox.trim().split(/[\s,]+/).map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n)) || parts[2] <= 0 || parts[3] <= 0) {
      errors.push(`invalid viewBox "${root.attributes.viewBox}"`);
    } else {
      viewBox = parts;
    }
  } else if (!root.attributes.width || !root.attributes.height) {
    warnings.push("no viewBox and no width/height — scaling behavior is undefined");
  } else {
    warnings.push("no viewBox — add one so the SVG scales; width/height alone pin it");
  }

  const definedIds = new Set();
  const referencedIds = [];
  const coords = [];

  walk(root, (node) => {
    if (node.type !== "element") return;
    stats.elements++;
    stats.byTag[node.name] = (stats.byTag[node.name] ?? 0) + 1;

    for (const [name, value] of Object.entries(node.attributes ?? {})) {
      if (/\b(NaN|Infinity|undefined|null)\b/.test(value)) {
        errors.push(`<${node.name} ${name}="${value}"> contains a non-finite value`);
      }
      if (name === "id") definedIds.add(value);
      const urlRef = /url\(["']?#([^"')]+)["']?\)/.exec(value);
      if (urlRef) referencedIds.push({ id: urlRef[1], at: `<${node.name} ${name}>` });
      if ((name === "href" || name === "xlink:href") && value.startsWith("#")) {
        referencedIds.push({ id: value.slice(1), at: `<${node.name}>` });
      }
      if (["x", "y", "cx", "cy", "x1", "y1", "x2", "y2"].includes(name)) {
        const n = Number(value);
        if (Number.isFinite(n)) coords.push(n);
      }
    }

    if (node.name === "path") {
      const d = node.attributes?.d;
      if (!d) {
        warnings.push("<path> without d attribute");
      } else {
        const verdict = checkPathData(d);
        if (!verdict.ok) errors.push(`bad path data: ${verdict.error}`);
      }
    }
    if (node.name === "text" || node.name === "tspan") {
      stats.hasText = true;
    }
  });

  for (const ref of referencedIds) {
    if (!definedIds.has(ref.id)) errors.push(`dangling reference #${ref.id} at ${ref.at}`);
  }

  if (stats.hasText) {
    warnings.push(
      "contains <text> — rendering depends on viewer fonts; use text_to_path for portable output",
    );
  }

  // Cheap out-of-canvas heuristic: if every collected coordinate misses the
  // viewBox, the drawing is almost certainly offset wrong. (The render probe
  // catches the general case via blank coverage.)
  if (viewBox && coords.length >= 4) {
    const [minX, minY, w, h] = viewBox;
    const inside = coords.filter((n) => n >= minX - w && n <= minX + 2 * w).length;
    if (inside === 0) warnings.push("all element coordinates fall far outside the viewBox");
  }

  return { ok: errors.length === 0, errors, warnings, stats };
}
