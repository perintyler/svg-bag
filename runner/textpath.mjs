/**
 * Text → path data with real font metrics.
 * Options: { text, family, style, fontFile, size, x, y, letterSpacing }
 */

import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { main } from "./lib/io.mjs";
import { textToPath } from "./lib/text.mjs";

const BAG_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

await main(async (options) => textToPath(BAG_DIR, options));
