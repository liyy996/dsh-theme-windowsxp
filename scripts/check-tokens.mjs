#!/usr/bin/env node
/**
 * Lint the skin against the real design-system token inventory.
 *
 * A misspelled token name is the worst kind of bug here: the stylesheet still
 * parses, DSH still loads, and the only symptom is that one colour silently
 * keeps its old value. So every `--dsw-*` name this skin assigns is checked
 * against `token-inventory.json`, which is a verbatim dump of the tokens the
 * shipped ui-theme stylesheets define.
 *
 * Run: node scripts/check-tokens.mjs
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const inventory = new Set(
  Object.keys(JSON.parse(await readFile(join(root, "token-inventory.json"), "utf8"))),
);
const css = (await readFile(join(root, "src", "windowsxp.css"), "utf8")).replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

const assigned = new Set(css.match(/--dsw-[a-z0-9-]+(?=\s*:)/g) ?? []);
const unknown = [...assigned].filter((name) => !inventory.has(name)).sort();

const semantic = [...inventory].filter(
  (name) =>
    name.startsWith("--dsw-alias-") ||
    name.startsWith("--dsw-specific-") ||
    name === "--dsw-menu-surface-fill",
);
const uncovered = semantic.filter((name) => !assigned.has(name)).sort();

console.log(`token inventory      ${inventory.size}`);
console.log(`assigned by the skin ${assigned.size}`);
console.log(`semantic tokens      ${semantic.length - uncovered.length}/${semantic.length} covered`);

if (unknown.length > 0) {
  console.error(`\nFAIL — ${unknown.length} assigned token(s) do not exist in the design system:`);
  for (const name of unknown) console.error(`  ${name}`);
  process.exit(1);
}

if (uncovered.length > 0) {
  console.log(`\nnot overridden yet (still on the stock palette, ${uncovered.length}):`);
  for (const name of uncovered) console.log(`  ${name}`);
}

console.log(`\nPASS — every assigned token exists`);
