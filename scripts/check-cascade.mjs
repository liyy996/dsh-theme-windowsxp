#!/usr/bin/env node
/**
 * Cascade guard.
 *
 * Three times now this skin broke the same way: a rule was added, it silently
 * outranked a rule that was already doing its job, and nothing in the build or
 * the smoke tests noticed — the first symptom was a screenshot from the operator
 * ("the selected row is invisible", "every row looks the same", "the tabs look
 * wrong"). So the orderings that matter are asserted here, against a real
 * specificity calculation rather than mental arithmetic.
 *
 * Run: node scripts/check-cascade.mjs
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/* ---------------------------------------------------------------------------
 * Specificity: (ids, classes+attrs+pseudo-classes, elements).
 * CSS Selectors 4: `:is()`/`:not()` take their most specific argument,
 * `:where()` and `*` contribute nothing.
 * ------------------------------------------------------------------------ */

function findClose(text, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    else if (ch === "," && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

/** Lexicographic maximum, which is how CSS compares specificity tuples. */
function maxOf(tuples) {
  let best = [0, 0, 0];
  for (const tuple of tuples) {
    for (let i = 0; i < 3; i++) {
      if (tuple[i] > best[i]) {
        best = tuple;
        break;
      }
      if (tuple[i] < best[i]) break;
    }
  }
  return best;
}

function specificity(selector) {
  let text = selector;

  // Peel off each functional pseudo-class, replacing it with a marker of equal
  // weight: `.isx` per class unit, `isx` per element unit.
  for (;;) {
    const match = /:(is|not|where)\(/i.exec(text);
    if (match === null) break;
    const open = match.index + match[0].length - 1;
    const close = findClose(text, open);
    if (close < 0) throw new Error(`unbalanced pseudo-class in "${selector}"`);
    const args = splitTopLevel(text.slice(open + 1, close));
    const inner = match[1].toLowerCase() === "where" ? [0, 0, 0] : maxOf(args.map(specificity));
    const marker = ".isx".repeat(inner[1]) + "isx".repeat(inner[2]) + "#isx".repeat(inner[0]);
    text = text.slice(0, match.index) + marker + text.slice(close + 1);
  }

  let ids = 0;
  let classes = 0;

  ids += (text.match(/#[a-zA-Z_-][\w-]*/g) ?? []).length;
  text = text.replace(/#[a-zA-Z_-][\w-]*/g, " ");

  // Attribute selectors. A `[` inside an attribute value would be pathological
  // here; the selectors in this skin never contain one.
  classes += (text.match(/\[/g) ?? []).length;
  text = text.replace(/\[[^\]]*\]/g, " ");

  classes += (text.match(/::?[a-z-]+/gi) ?? []).length;
  text = text.replace(/::?[a-z-]+/gi, " ");

  classes += (text.match(/\.[a-zA-Z_-][\w-]*/g) ?? []).length;
  text = text.replace(/\.[a-zA-Z_-][\w-]*/g, " ");

  const elements = (text.match(/(^|[\s>+~(,])([a-zA-Z][\w-]*)/g) ?? []).length;

  return [ids, classes, elements];
}

const show = ([i, c, e]) => `(${i},${c},${e})`;
function beats(a, b) {
  for (let k = 0; k < 3; k++) {
    if (a[k] !== b[k]) return a[k] > b[k];
  }
  return false;
}

let failures = 0;

/* ---------------------------------------------------------------------------
 * 1. The calculator itself
 * ------------------------------------------------------------------------ */
function unit(selector, expected) {
  const actual = show(specificity(selector));
  const want = show(expected);
  if (actual === want) console.log(`  ok   ${selector} → ${actual}`);
  else {
    failures += 1;
    console.log(`  FAIL ${selector} → ${actual}, expected ${want}`);
  }
}

console.log("specificity calculator");
unit("body", [0, 0, 1]);
unit(".a", [0, 1, 0]);
unit("body[x]", [0, 1, 1]);
unit("body[x] button:not(:disabled)", [0, 2, 2]);
unit("body[x] [y] button:not(:disabled)", [0, 3, 2]);
unit(":where([role='tab'])", [0, 0, 0]);
unit("button:where(:not([role='tab']):not([role='option']))", [0, 0, 1]);
unit(":is(.a, .b.c)", [0, 2, 0]);
unit(":not(#x)", [1, 0, 0]);
unit(".a:is(.b, #c)", [1, 1, 0]);
unit(":where(.a, #b) .c", [0, 1, 0]);

/* ---------------------------------------------------------------------------
 * 2. The orderings the skin depends on
 * ------------------------------------------------------------------------ */
// Comments carry CSS snippets with braces in them, which would otherwise be
// mistaken for real rules by the rule scanner below.
const css = (await readFile(join(root, "src", "windowsxp.css"), "utf8")).replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

const STATE_PSEUDO = /:(hover|active|focus|focus-visible|focus-within)\b/;

/**
 * Every rule whose selector list satisfies `predicate`.
 * @param options.states - when false, skip state rules so that base declarations
 * are compared against base declarations instead of against each other's :hover.
 * @returns the most specific match, plus where it sits in the file so a tie can
 * be resolved the way the cascade does.
 */
function best(label, predicate, options = {}) {
  const { states = false } = options;
  let tuple = [0, 0, 0];
  let order = -1;
  const rule = /([^{}]+)\{/g;
  let match;
  while ((match = rule.exec(css))) {
    // Selectors may be wrapped over several lines for readability, so collapse
    // whitespace before the predicates below do their `includes` — otherwise a
    // reformatted rule silently stops being checked at all.
    const list = match[1].replace(/\s+/g, " ").trim();
    if (!predicate(list)) continue;
    for (const selector of splitTopLevel(list)) {
      const s = selector.trim();
      if (!states && STATE_PSEUDO.test(s)) continue;
      const t = specificity(s);
      if (beats(t, tuple) || show(t) === show(tuple)) {
        if (beats(t, tuple)) {
          tuple = t;
          order = match.index;
        } else if (show(t) === show(tuple)) {
          order = Math.max(order, match.index);
        }
      }
    }
  }
  if (order < 0) throw new Error(`no base rule matched "${label}"`);
  return { name: label, tuple, order };
}

const generic = best("generic Luna button", (s) => s.includes("where(:not([role='tab'])"));
const genericHover = best("generic Luna button :hover", (s) => s.includes("where(:not([role='tab'])") && s.includes(":hover"), { states: true });
const genericDisabled = best("generic button :disabled", (s) => s.includes("body[data-dsh-windowsxp] button:disabled"), { states: true });
const sidebarButton = best("sidebar white-card button", (s) => s.includes("[class*='sidebarCol'] button:not(:disabled)"));
const sidebarHover = best("sidebar white-card :hover", (s) => s.includes("[class*='sidebarCol'] button:not(:disabled)") && s.includes(":hover"), { states: true });
const sidebarRow = best("sidebar row card", (s) => s.includes("searchResultRow']") && !s.includes("folderActive"));
const selectedRow = best("current-session row", (s) => s.includes("folderActive"));
const tabCard = best(
  "tab card",
  (s) => s.includes("[data-conversation-tabs]") && s.includes("[role='tab']") && !s.includes("aria-selected"),
);
const tabActive = best(
  "active tab",
  (s) => s.includes("[data-conversation-tabs]") && s.includes("aria-selected") && !s.includes(":hover"),
);
const tabHover = best(
  "tab hover",
  (s) => s.includes("[data-conversation-tabs]") && s.includes(":hover") && !s.includes("aria-selected"),
  { states: true },
);
const tabActiveHover = best(
  "active tab hover",
  (s) => s.includes("[data-conversation-tabs]") && s.includes("aria-selected") && s.includes(":hover"),
  { states: true },
);
const primaryAction = best(
  "composer primary action",
  (s) => s.includes("[data-composer-seat] button[class*='_primary']") && !/:(hover|active|disabled)\b/.test(s),
);
const primaryDisabled = best(
  "composer primary action :disabled",
  (s) => s.includes("[data-composer-seat] button[class*='_primary']:disabled"),
);
const componentRow = { name: "ui-workspace .sessionRow", tuple: [0, 1, 0], order: -1 };

const equal = (a, b) => show(a) === show(b);
/** The cascade: specificity first, document order on a tie. */
function wins(winner, loser) {
  if (beats(winner.tuple, loser.tuple)) return "specificity";
  if (equal(winner.tuple, loser.tuple) && winner.order > loser.order) return "order";
  return null;
}

function ordered(label, winner, loser) {
  const why = wins(winner, loser);
  if (why !== null) {
    console.log(`  ok   ${label}: ${show(winner.tuple)} > ${show(loser.tuple)} — wins on ${why}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}: ${show(winner.tuple)} does NOT beat ${show(loser.tuple)}, and order does not save it`);
  }
}

console.log("\nthe orderings this skin depends on");
for (const rule of [generic, sidebarButton, sidebarRow, selectedRow]) {
  console.log(`       ${rule.name.padEnd(28)} ${show(rule.tuple)}  @${rule.order}`);
}
ordered("sidebar card outranks the generic button", sidebarButton, generic);
ordered("sidebar rows keep their card over the generic button", sidebarRow, generic);
ordered("sidebar rows beat the component's own row rule", sidebarRow, componentRow);
ordered("the current session beats the plain row card", selectedRow, sidebarRow);
ordered("the current session beats the sidebar button card", selectedRow, sidebarButton);
console.log("\nthe hover pair");
for (const rule of [genericHover, sidebarHover]) {
  console.log(`       ${rule.name.padEnd(28)} ${show(rule.tuple)}  @${rule.order}`);
}
ordered("sidebar hover outranks the generic hover", sidebarHover, genericHover);
ordered("generic hover still outranks the generic base", genericHover, generic);
ordered("sidebar base outranks the generic hover", sidebarButton, genericHover);

console.log("\nthe composer's primary action");
for (const rule of [primaryAction, generic, primaryDisabled, genericDisabled]) {
  console.log(`       ${rule.name.padEnd(34)} ${show(rule.tuple)}  @${rule.order}`);
}
// The white-glyph bug: the generic rule repainted the fill beige but could not
// touch the component's hard-coded white glyph, so the send/stop button went
// white-on-beige. These two assertions are what stop that from coming back.
ordered("composer primary outranks the generic button", primaryAction, generic);
ordered("composer primary outranks the generic hover", primaryAction, genericHover);
ordered("composer primary :disabled outranks the generic :disabled", primaryDisabled, genericDisabled);
ordered("composer primary :disabled outranks the generic button", primaryDisabled, generic);

console.log("\nthe chosen answer in a question");
const optionSelected = best("selected question option", (s) => s.includes("[class*='optionSelected']"));
console.log(`       ${optionSelected.name.padEnd(34)} ${show(optionSelected.tuple)}  @${optionSelected.order}`);
// The component's own hover rule is `.option:hover:not(:disabled)` = (0,3,0), and
// it shares its background with `.optionSelected`. If the skin's ring does not
// outrank it, a chosen option stops looking chosen the moment the pointer is over
// it — which is exactly the report this rule exists to answer.
const [optionIds, optionClasses, optionTypes] = optionSelected.tuple;
check(
  "the chosen answer outranks the component's own :hover:not(:disabled) (0,3,0)",
  optionIds > 0 || optionClasses > 3 || (optionClasses === 3 && optionTypes > 0),
  show(optionSelected.tuple),
);
ordered("the chosen answer outranks the generic button", optionSelected, generic);
// Deliberately *not* compared against genericHover, which is (0,3,2) and would
// win on paper: that rule excludes `[role='radio']`, so the two can never match
// the same element. Section 3 below is what keeps that exclusion in place, and
// the assertion above covers the rule that genuinely competes — the component's
// own hover at (0,3,0).
ordered("the chosen answer outranks the generic :disabled", optionSelected, genericDisabled);

console.log("\nthe conversation's view tabs");
for (const rule of [tabCard, tabActive, tabHover, tabActiveHover]) {
  console.log(`       ${rule.name.padEnd(28)} ${show(rule.tuple)}  @${rule.order}`);
}
ordered("the active tab outranks the resting card", tabActive, tabCard);
ordered("hovering the active tab keeps it looking active", tabActiveHover, tabHover);
// The component's own rules are `.tab` at (0,1,0) and `.tabActive` at (0,2,0), so
// the skin has to clear both — which is why these carry two attribute selectors.
check("the tab card outranks the component's bare tab (0,1,0)", tabCard.tuple[1] > 1 || tabCard.tuple[0] > 0, show(tabCard.tuple));
check("the active tab outranks the component's own active rule (0,2,0)", tabActive.tuple[1] > 2 || tabActive.tuple[0] > 0, show(tabActive.tuple));

/** One boolean assertion, counted the same way `unit`/`ordered` count. */
function check(label, condition, detail = "") {
  if (condition) console.log(`  ok   ${label}`);
  else {
    failures += 1;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

/* ---------------------------------------------------------------------------
 * 3. The widget roles the generic button rules must leave alone
 *
 * Specificity cannot save these: a component's own state rule is a single class
 * (`.Mbwy4a_optionSelected`, (0,1,0)) while the generic rule is (0,2,2), so the
 * only fix is `:not()`. Each of these roles was found by grepping the DSH client
 * bundles for `role: "…"` — the question composer's choices are `radio` and
 * `checkbox`, and painting them erased the only thing that says which one is
 * selected. Asserting the exclusions here is what stops a future edit from
 * quietly dropping one.
 * ------------------------------------------------------------------------ */
console.log("\nthe generic button rules exclude every widget role");
const WIDGET_ROLES = [
  "tab",
  "menuitem",
  "menuitemradio",
  "menuitemcheckbox",
  "option",
  "radio",
  "checkbox",
  "switch",
  "treeitem",
];
// Only the *generic* rules — the ones whose `button` sits directly under the
// scope attribute. The carve-outs that follow them (`[data-composer-seat]
// button[…]`, `[class*='sidebarCol'] button[…]`) are deliberately narrower and
// are checked by the orderings above.
const buttonRules = [...css.matchAll(/(body\[data-dsh-windowsxp\] button[^{}]*)\{/g)].map((match) =>
  match[1].replace(/\s+/g, " ").trim(),
);
check(
  "four generic button rules were found (base, hover, active, disabled)",
  buttonRules.length === 4,
  `${buttonRules.length}: ${buttonRules.map((rule) => rule.slice(0, 28)).join(" | ")}`,
);
for (const role of WIDGET_ROLES) {
  const missing = buttonRules.filter((rule) => !rule.includes(`[role='${role}']`));
  check(
    `every generic button rule excludes role="${role}"`,
    missing.length === 0,
    `${missing.length} rule(s) do not: ${missing[0] ?? ""}`,
  );
}
check(
  "and the catch-all class exclusion is still there",
  buttonRules.every((rule) => rule.includes("[class*='iconButton']")),
);
// Filled buttons — the composer's send/stop, and every `variant="primary"` the
// primitives draw, such as the market's card actions — carry their own fill and a
// hard-coded white glyph. Repainting that fill leaves white-on-beige, which is
// effectively invisible. Whether the app's own class really contains `_primary`
// cannot be read from here, so the guard is only that the exclusion never
// silently disappears.
check(
  "and filled buttons stay excluded",
  buttonRules.every((rule) => rule.includes("[class*='_primary']")),
);

console.log(failures === 0 ? "\nPASS" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
