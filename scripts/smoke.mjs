#!/usr/bin/env node
/**
 * Smoke test for the shipped client bundle, with no browser and no jsdom.
 *
 * The bundle is one plugin with two halves, so both are exercised:
 *
 *   1. the protocol — one lazy factory registered under the right id, no
 *      top-level side effects;
 *   2. the skin — the scope attribute and the Luna stylesheet; disposal puts the
 *      document back the way it was;
 *   3. the notifier — driven through a fake `sessions` service, not through the
 *      DOM. The DOM stubs that would be needed to watch `[data-chat-running]` are
 *      deliberately absent, so a regression back to view-scoped detection fails
 *      loudly instead of passing.
 *
 * Run: node scripts/smoke.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PKG = "dsh-theme-windowsxp";
const SCOPE = "data-dsh-windowsxp";

let failures = 0;
function check(label, condition, detail = "") {
  if (condition) console.log(`  ok   ${label}`);
  else {
    failures += 1;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

/* ---- a DOM small enough to reason about ---------------------------------- */
const attributes = new Set();
const mounted = [];
const state = { chimes: [], cues: [], notifications: [] };

function makeElement(tagName) {
  const element = {
    tagName,
    parent: undefined,
    dataset: {},
    className: "",
    textContent: "",
    attributes: {},
    children: [],
    hasAttribute: (name) => attributes.has(name),
    setAttribute(name, value) {
      // Presence and value are tracked separately: the skin sets the scope with
      // an empty string and is checked with `hasAttribute`, while the toast sets
      // real values that the assertions read back.
      attributes.add(name);
      if (value !== undefined && value !== "") element.attributes[name] = value;
    },
    removeAttribute: (name) => attributes.delete(name),
    attachShadow() {
      const shadow = makeElement("#shadow");
      element.shadow = shadow;
      return shadow;
    },
    append(...nodes) {
      for (const node of nodes) {
        node.parent = element;
        element.children.push(node);
      }
    },
    addEventListener() {},
    removeEventListener() {},
    remove() {
      const at = mounted.indexOf(element);
      if (at >= 0) mounted.splice(at, 1);
      if (element.parent !== undefined) {
        element.parent.children = element.parent.children.filter((node) => node !== element);
        element.parent = undefined;
      }
    },
  };
  return element;
}

const body = makeElement("body");

globalThis.document = {
  body,
  head: { appendChild: (node) => mounted.push(node) },
  baseURI: "http://127.0.0.1:19387/",
  documentElement: { lang: "zh-CN" },
  createElement: makeElement,
  addEventListener: () => {},
  removeEventListener: () => {},
};

globalThis.window = {
  __ModuleLoader__: {
    load(options) {
      globalThis.__registration = options;
    },
  },
  document,
  setTimeout: () => 1,
  clearTimeout: () => {},
  focus: () => {},
  AudioContext: class {
    constructor() {
      this.state = "running";
      this.currentTime = 0;
      this.destination = {};
    }
    resume() {
      return Promise.resolve();
    }
    createOscillator() {
      const oscillator = {
        type: "",
        hz: undefined,
        frequency: {
          setValueAtTime(value) {
            oscillator.hz = value;
          },
        },
        connect: () => {},
        start: () => state.chimes.push(oscillator),
        stop: () => {},
      };
      return oscillator;
    }
    createGain() {
      return {
        gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
        connect: () => {},
      };
    }
  },
  Notification: class {
    constructor(title, options) {
      state.notifications.push({ title, options });
    }
    close() {}
  },
};
window.Notification.permission = "granted";

/** A package copy with no audio file in it: the synth fallback's reason to exist. */
globalThis.Audio = class {
  constructor(url) {
    this.url = url;
    this.volume = 1;
    state.cues.push(this);
  }
  addEventListener() {}
  play() {
    return Promise.reject(Object.assign(new Error("no cue file"), { name: "NotSupportedError" }));
  }
};

/* ---- the fake session controller ---------------------------------------- */
/**
 * Two stores, published separately so each test drives exactly one watcher:
 * `sessions.list` (the running bit, and every row's name) and
 * `uiSession.sessionStatus` (the pending-interaction bit).
 */
function createController() {
  let list = { byId: {} };
  let status = new Map();
  const listListeners = new Set();
  const statusListeners = new Set();
  const fire = (set) => {
    for (const listener of [...set]) listener();
  };
  return {
    list: {
      getSnapshot: () => list,
      subscribe: (listener) => {
        listListeners.add(listener);
        return () => listListeners.delete(listener);
      },
    },
    sessionStatus: {
      getSnapshot: () => status,
      subscribe: (listener) => {
        statusListeners.add(listener);
        return () => statusListeners.delete(listener);
      },
    },
    publish(byId) {
      list = { byId };
      fire(listListeners);
    },
    /** @param entries - sessionId → partial status; the rest is defaulted. */
    publishStatus(entries) {
      status = new Map(
        Object.entries(entries).map(([id, partial]) => [id, { running: false, pendingInteraction: undefined, ...partial }]),
      );
      fire(statusListeners);
    },
    listenerCount: () => listListeners.size + statusListeners.size,
  };
}

/** A top-level session row, named the way the session list names it. */
const top = (running, name = "制作 Windows98 风格 DSH 主题") => ({ id: "s", running, displayTitle: name });
/** A subagent child row. */
const child = (running) => ({ id: "c", running, parentId: "s", origin: "subagent" });

const sessions = createController();
const disposers = [];
const ctx = {
  effect(callback) {
    const dispose = callback();
    if (typeof dispose === "function") disposers.push(dispose);
  },
  inject(services, callback) {
    const known = { sessions, uiSession: { sessionStatus: sessions.sessionStatus } };
    for (const service of services) {
      if (!(service in known)) throw new Error(`unexpected injection: ${service}`);
    }
    callback({
      get: (name) => known[name],
      effect: (callback_) => {
        const dispose = callback_();
        if (typeof dispose === "function") disposers.push(dispose);
      },
    });
  },
};

const toastHosts = () => body.children.filter((node) => node.dataset?.dshTurnNotify !== undefined);
function toastTexts() {
  const text = toastHosts()[0]?.shadow?.children[1]?.children[1];
  return { title: text?.children[0]?.textContent, body: text?.children[1]?.textContent };
}
/** The distinct frequencies a cue started since a marker, in order. */
function cueHz(from) {
  return [...new Set(state.chimes.slice(from).map((oscillator) => oscillator.hz))];
}
/** How many voices (oscillators) a cue started since a marker. */
function cueVoices(from) {
  return state.chimes.length - from;
}
/** Let the asynchronous cue→synth fallback settle. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

/* ---- 1. protocol --------------------------------------------------------- */
new Function(readFileSync(join(root, "lib", "client.js"), "utf8"))();
console.log("client module protocol");
check("a factory was registered", globalThis.__registration !== undefined);
check(`registered under "${PKG}"`, globalThis.__registration?.id === PKG, `got "${globalThis.__registration?.id}"`);
check("nothing was mounted at registration time", mounted.length === 0);

const plugin = globalThis.__registration.factory(() => {
  throw new Error("this plugin must not require any other module");
});
check("exports an apply function", typeof plugin?.apply === "function");

/* ---- 2. the skin --------------------------------------------------------- */
console.log("\nthe skin");
sessions.publish({ a: top(false) });
plugin.apply(ctx);

check(`<body> carries ${SCOPE}`, attributes.has(SCOPE));
check("exactly one stylesheet is mounted", mounted.length === 1, `got ${mounted.length}`);
check(
  "the stylesheet is tagged for the plugin manager",
  mounted[0]?.dataset?.pluginCss === `${PKG}/windowsxp.css`,
  `got "${mounted[0]?.dataset?.pluginCss}"`,
);
check(
  "the stylesheet carries the whole skin",
  typeof mounted[0]?.textContent === "string"
    && mounted[0].textContent.includes("--dsw-alias-bg-base")
    && mounted[0].textContent.includes("--xp-button"),
);
check("the notifier subscribed to the session list", sessions.listenerCount() === 2, `${sessions.listenerCount()}`);

/* ---- 3. the notifier: a run starts and ends ------------------------------ */
console.log("\nthe notifier: a run starting and ending");
sessions.publish({ a: top(true) });
check("starting a run announces nothing", state.chimes.length === 0, `${state.chimes.length}`);

sessions.publish({ a: top(false) });
await settle();
check("the cue was requested from the host route", state.cues.length === 1, `${state.cues.length}`);
check(
  "the cue URL is this plugin's own asset route",
  state.cues[0]?.url === "http://127.0.0.1:19387/skin-assets/windowsxp/chime.wav",
  state.cues[0]?.url,
);
check("the fallback bell played three notes in two partials", state.chimes.length === 6, `${state.chimes.length}`);
check("a toast was appended to <body>", toastHosts().length === 1, `${toastHosts().length}`);
const toast = toastHosts()[0];
check("the toast carries the toast stylesheet", toast?.shadow?.children.some((node) => node.tagName === "style"));
check("the toast has a status role", toast?.shadow?.children[1]?.attributes?.role === "status");
check("a system notification was raised", state.notifications.length === 1, `${state.notifications.length}`);
check(
  "the notification is headed by the session name",
  state.notifications[0]?.title === "制作 Windows98 风格 DSH 主题",
  state.notifications[0]?.title,
);
check("and says the turn finished", String(state.notifications[0]?.options?.body).includes("本轮已完成"), state.notifications[0]?.options?.body);
check("the in-page card names the session too", toastTexts().title === "制作 Windows98 风格 DSH 主题", toastTexts().title);

/* ---- 4. the two view-related misreports ---------------------------------- */
console.log("\nswitching workspace while a run continues");
sessions.publish({ a: top(true), b: top(false) });
check("a second session appearing announces nothing", state.chimes.length === 6, `${state.chimes.length}`);
sessions.publish({ a: { id: "a", running: true, title: "renamed" }, b: top(false) });
check("an unrelated list change announces nothing", state.chimes.length === 6, `${state.chimes.length}`);

console.log("\na session that is not on screen finishing");
sessions.publish({ a: top(true), b: top(true) });
sessions.publish({ a: top(true), b: top(false) });
await settle();
check("the background completion announced", state.chimes.length === 12, `${state.chimes.length}`);
check("and raised a notification", state.notifications.length === 2, `${state.notifications.length}`);

/* ---- 5. subagents and removed sessions stay silent ----------------------- */
console.log("\nsubagents and removals");
sessions.publish({ a: top(true), c: child(true) });
sessions.publish({ a: top(true), c: child(false) });
await settle();
check("a subagent finishing announces nothing", state.chimes.length === 12, `${state.chimes.length}`);

sessions.publish({ a: top(true) });
sessions.publish({});
await settle();
check("a running session leaving the list announces nothing", state.chimes.length === 12, `${state.chimes.length}`);

/* ---- 6. which session finished ------------------------------------------- */
console.log("\nwhich session finished");
sessions.publish({ a: { id: "a", running: true }, b: { id: "b", running: false, displayTitle: "会话 B" } });
sessions.publish({ a: { id: "a", running: false }, b: { id: "b", running: false, displayTitle: "会话 B" } });
await settle();
check("a nameless session falls back to its id", state.notifications.at(-1)?.title === "a", state.notifications.at(-1)?.title);

sessions.publish({ a: top(true, "会话 A"), b: { id: "b", running: true, displayTitle: "会话 B" } });
sessions.publish({ a: top(false, "会话 A"), b: { id: "b", running: false, displayTitle: "会话 B" } });
await settle();
check("two finishing together are summarised by count", String(state.notifications.at(-1)?.title).includes("2 个会话"), state.notifications.at(-1)?.title);
check(
  "and both names are listed",
  String(state.notifications.at(-1)?.options?.body).includes("会话 A") && String(state.notifications.at(-1)?.options?.body).includes("会话 B"),
  state.notifications.at(-1)?.options?.body,
);

/* ---- 7. the copy follows <html lang> ------------------------------------- */
console.log("\nthe interface language");
document.documentElement.lang = "en-US";
sessions.publish({ a: top(true) });
sessions.publish({ a: top(false) });
await settle();
check("an English UI gets English copy", String(state.notifications.at(-1)?.options?.body).includes("Turn finished"), state.notifications.at(-1)?.options?.body);
check("but the session name is not translated", state.notifications.at(-1)?.title === "制作 Windows98 风格 DSH 主题", state.notifications.at(-1)?.title);
document.documentElement.lang = "zh-CN";

/* ---- 8. the agent asking for approval ------------------------------------ */
console.log("\nthe agent asking for approval");
sessions.publish({ a: top(true), c: child(true) });
sessions.publishStatus({ a: { pendingInteraction: undefined } });
await settle();
const beforeApproval = state.chimes.length;
check("nothing waiting is silent", state.chimes.length === beforeApproval, `${state.chimes.length}`);

sessions.publishStatus({ a: { pendingInteraction: { kind: "approval" } } });
await settle();
const approvalHz = cueHz(beforeApproval);
check("a pending interaction plays a cue", cueVoices(beforeApproval) > 0, `${cueVoices(beforeApproval)} voices`);
// Three notes, three partials each — but the middle note repeats, so only six of
// the nine voices land on a distinct frequency.
check("nine voices: three notes, three partials", cueVoices(beforeApproval) === 9, `${cueVoices(beforeApproval)}`);
check("spread over six distinct frequencies", approvalHz.length === 6, approvalHz.join(", "));
check("it never uses the completion chime's root", !approvalHz.includes(880), approvalHz.join(", "));
check("and does use a note the chime does not", approvalHz.includes(987.8), approvalHz.join(", "));
check(
  "the toast is toned for approval",
  toastHosts()[0]?.dataset?.dshTurnNotify === "approval",
  String(toastHosts()[0]?.dataset?.dshTurnNotify),
);
check("and says it is waiting", String(toastTexts().body).includes("等待你的确认"), toastTexts().body);
check("the notification says so too", String(state.notifications.at(-1)?.options?.body).includes("等待你的确认"), state.notifications.at(-1)?.options?.body);

const afterApproval = state.chimes.length;
sessions.publishStatus({ a: { pendingInteraction: { kind: "approval" } } });
await settle();
check("a re-render of the same request does not replay the cue", state.chimes.length === afterApproval, `${state.chimes.length}`);

sessions.publishStatus({ a: { pendingInteraction: undefined } });
sessions.publishStatus({ a: { pendingInteraction: { kind: "approval" } } });
await settle();
check("a genuinely new request plays again", state.chimes.length > afterApproval, `${state.chimes.length}`);

const beforeChild = state.chimes.length;
sessions.publishStatus({ a: { pendingInteraction: undefined }, c: { pendingInteraction: { kind: "approval" } } });
await settle();
check("a subagent waiting is not the operator's problem", state.chimes.length === beforeChild, `${state.chimes.length}`);

sessions.publishStatus({});

/* ---- 9. disposal is a true inverse --------------------------------------- */
console.log("\ndispose");
for (const dispose of disposers.splice(0)) dispose();
check(`<body> no longer carries ${SCOPE}`, !attributes.has(SCOPE));
check("the stylesheet was removed", mounted.length === 0, `${mounted.length} left behind`);
check("the toast was removed", toastHosts().length === 0, `${toastHosts().length} left behind`);
check("the session list was unsubscribed", sessions.listenerCount() === 0, `${sessions.listenerCount()} left`);

console.log(failures === 0 ? "\nPASS" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
