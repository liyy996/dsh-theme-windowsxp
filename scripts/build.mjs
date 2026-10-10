#!/usr/bin/env node
/**
 * Inline the two stylesheets into src/client.js and emit lib/client.js.
 *
 *   src/windowsxp.css → the `__WINDOWSXP_CSS__` marker   (the Luna skin)
 *   src/notify.css    → the `__NOTIFY_CSS__` marker      (the toast card)
 *
 * There is no bundler here on purpose: DSH's client-module protocol is a single
 * self-contained file that registers one lazy CJS factory, so string substitution
 * is the whole build. `lib/client.js` is committed, which means the plugin also
 * works when it is copied into a profile by hand.
 *
 * The build fails loudly on the mistakes that are otherwise invisible until you
 * reload DSH: a missing marker, unbalanced braces, and a skin stylesheet that no
 * longer overrides any --dsw-* token at all.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** @type {[label: string, file: string, marker: string, role: "skin" | "toast"][]} */
const SHEETS = [
  ["the Luna skin", "windowsxp.css", '"__WINDOWSXP_CSS__"', "skin"],
  ["the toast card", "notify.css", '"__NOTIFY_CSS__"', "toast"],
];

let source = await readFile(join(root, "src", "client.js"), "utf8");
const summary = [];

for (const [label, file, marker, role] of SHEETS) {
  if (!source.includes(marker)) {
    throw new Error(`src/client.js no longer contains the ${marker} marker (${label})`);
  }

  const css = await readFile(join(root, "src", file), "utf8");
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");

  const open = (stripped.match(/\{/g) ?? []).length;
  const close = (stripped.match(/\}/g) ?? []).length;
  if (open !== close) {
    throw new Error(`src/${file} has unbalanced braces: ${open} "{" vs ${close} "}"`);
  }

  if (role === "skin") {
    const overridden = new Set(stripped.match(/--dsw-[a-z0-9-]+(?=\s*:)/g) ?? []);
    if (overridden.size === 0) {
      throw new Error("src/windowsxp.css overrides no --dsw-* token; the skin would do nothing");
    }
    summary.push(`overriding ${overridden.size} --dsw-* tokens`);
  }

  // JSON.stringify yields a valid double-quoted JS string literal for any CSS,
  // so no escaping rules have to be maintained by hand.
  source = source.replace(marker, JSON.stringify(css));
  summary.push(`${file} ${css.length} bytes`);
}

await mkdir(join(root, "lib"), { recursive: true });
await writeFile(join(root, "lib", "client.js"), source, "utf8");

console.log(`lib/client.js written (${(Buffer.byteLength(source) / 1024).toFixed(1)} KiB)`);
for (const line of summary) console.log(line);
