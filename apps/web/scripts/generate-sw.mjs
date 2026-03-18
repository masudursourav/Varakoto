/**
 * generate-sw.mjs
 * Reads sw-template.js, replaces $SW_VERSION with the package.json version,
 * and writes the result to public/sw.js.
 *
 * Run automatically via the `prebuild` npm script.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const { version } = JSON.parse(
  readFileSync(join(root, "package.json"), "utf-8"),
);

const template = readFileSync(join(__dirname, "sw-template.js"), "utf-8");
const output = template.replaceAll("$SW_VERSION", version);

writeFileSync(join(root, "public", "sw.js"), output);

console.log(`[generate-sw] public/sw.js → cache keys stamped with v${version}`);
