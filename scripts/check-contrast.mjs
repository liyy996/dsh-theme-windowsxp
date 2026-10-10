#!/usr/bin/env node
/**
 * Contrast check for the skin's text tokens.
 *
 * The bug this exists for: the palette's period-correct Windows grey (#ACA899)
 * was doing double duty as a *text* colour. It is a perfectly good 3D edge or
 * divider, but as glyphs it lands at 1.6:1 on the face colour — invisible. It
 * shipped, and came back from real use as "有很多字我都看不清".
 *
 * So the rule is mechanical rather than a matter of care: every
 * `--dsw-alias-label-*` declared at the root scope must clear 4.5:1 against both
 * light backgrounds it can sit on. Tokens that name their own background —
 * `*-foreground`, `*-inverted` — are exempt, because white-on-a-filled-button is
 * their whole point. Rules scoped to the sidebar are exempt too: they
 * deliberately paint light ink over the Luna blue pane, which this checker has no
 * way to model.
 *
 * Run: node scripts/check-contrast.mjs
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// Comments carry CSS snippets with braces in them, which would otherwise throw
// the rule walker below off the scent.
const css = (await readFile(join(root, "src", "windowsxp.css"), "utf8")).replace(/\/\*[\s\S]*?\*\//g, "");

/* ---- walk the top-level rules so each one keeps its own selector --------- */
const rules = [];
{
  let depth = 0;
  let selectorStart = 0;
  let bodyStart = -1;
  let selector = "";
  for (let i = 0; i < css.length; i += 1) {
    const char = css[i];
    if (char === "{") {
      if (depth === 0) {
        selector = css.slice(selectorStart, i).trim();
        bodyStart = i + 1;
      }
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        rules.push({ selector, body: css.slice(bodyStart, i) });
        selectorStart = i + 1;
      }
    }
  }
}

/** Declarations from every rule at the root scope — the palette plus the tokens. */
const declared = new Map();
let contributing = 0;
for (const rule of rules) {
  if (!/^body\[data-dsh-windowsxp\]/.test(rule.selector)) continue;
  if (rule.selector.includes("sidebarCol")) continue;
  contributing += 1;
  for (const [, name, value] of rule.body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    declared.set(name, value.trim());
  }
}
if (contributing === 0) throw new Error("no root-scope rules matched; this checker needs updating");

/** Resolve `var(--x)` chains down to a literal, or undefined. */
function resolve(name, seen = new Set()) {
  if (seen.has(name)) return undefined;
  seen.add(name);
  const value = declared.get(name);
  if (value === undefined) return undefined;
  const reference = /^var\(\s*(--[a-z0-9-]+)\s*(?:,\s*([^)]+))?\)$/i.exec(value.trim());
  if (reference === null) return value.trim();
  return resolve(reference[1], seen) ?? (reference[2] === undefined ? undefined : reference[2].trim());
}

/* ---- WCAG relative luminance + contrast ratio ---------------------------- */
function luminance(hex) {
  const text = String(hex).trim().replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(text)) return undefined;
  const channels = [0, 2, 4].map((at) => {
    const value = Number.parseInt(text.slice(at, at + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function ratio(a, b) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

/* ---- the surfaces text can land on --------------------------------------- */
const SURFACES = [
  ["face", "--xp-face"], // panels, toolbars, disabled buttons
  ["white", "--dsw-alias-bg-base"], // the file area
];
const MINIMUM = 4.5;

let failures = 0;
console.log(`text tokens against the ${SURFACES.length} surfaces they can sit on\n`);

for (const [name, value] of declared) {
  if (!name.startsWith("--dsw-alias-label-")) continue;
  // `*-foreground` / `*-inverted` name their own (filled) background, and
  // `*-shimmer` is the faint pulse of a loading animation rather than something
  // anyone reads. Both are exempt on purpose, not by oversight.
  if (/(foreground|inverted|shimmer)$/.test(name)) continue;
  const ink = resolve(name);
  if (ink === undefined || luminance(ink) === undefined) {
    failures += 1;
    console.log(`  FAIL ${name.padEnd(42)} → could not resolve "${value}"`);
    continue;
  }
  const measured = SURFACES.map(([label, variable]) => {
    const surface = resolve(variable) ?? "#ffffff";
    const value_ = ratio(ink, surface);
    return { label, value: value_, text: `${label} ${value_.toFixed(2)}:1` };
  });
  const worst = Math.min(...measured.map((entry) => entry.value));
  const ok = worst >= MINIMUM;
  if (!ok) failures += 1;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name.padEnd(42)} ${ink.padEnd(9)} ${measured.map((entry) => entry.text).join("   ")}`);
}

console.log(
  failures === 0
    ? `\nPASS — every text token clears ${MINIMUM}:1`
    : `\n${failures} text token(s) below ${MINIMUM}:1 — those glyphs will be hard to read`,
);
process.exit(failures === 0 ? 0 : 1);
