/**
 * List discoverable fonts (shipped + system).
 * Options: { includeSystem }
 */

import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { main } from "./lib/io.mjs";
import { discoverFonts } from "./lib/fonts.mjs";

const BAG_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

await main(async (options) => {
  const fonts = discoverFonts(BAG_DIR, { includeSystem: options.includeSystem !== false });
  const families = {};
  for (const font of fonts) {
    (families[font.family] ??= []).push(font.subfamily);
  }
  return { ok: true, count: fonts.length, families };
});
