#!/usr/bin/env node
/**
 * Smoke test for the host half: the packaged-asset route.
 *
 * This is the only host-side code the plugin has, and it is reachable from the
 * network, so the things worth proving are the security-relevant ones — plus that
 * each asset really carries the bytes its consumer expects, because a client that
 * gets HTML back for an <img> or an Audio just falls back and nobody ever notices
 * why.
 *
 * Run: node scripts/smoke-host.mjs
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { apply } from "../lib/index.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

let failures = 0;
function check(label, condition, detail = "") {
  if (condition) console.log(`  ok   ${label}`);
  else {
    failures += 1;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

/** file, content type, and a magic-byte guard for each packaged asset. */
const ASSETS = [
  ["bliss.jpg", "image/jpeg", (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff],
  ["chime.wav", "audio/wav", (bytes) => bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WAVE"],
];

/* ---- capture the route the plugin registers ------------------------------ */
let route;
apply({
  inject(services, callback) {
    if (!services.includes("webServer")) throw new Error("expected a webServer injection");
    callback({
      get: (name) => (name === "webServer" ? { register: (r) => (route = r) } : undefined),
      effect: (fn) => void fn(),
    });
  },
});

if (route === undefined) {
  console.error("the plugin registered no route");
  process.exit(1);
}

function makeRes() {
  return {
    statusCode: 0,
    headers: {},
    body: undefined,
    writeHead(code, headers) {
      this.statusCode = code;
      if (headers !== undefined) this.headers = headers;
      return this;
    },
    end(body) {
      this.body = body;
    },
  };
}

async function request(url, { method = "GET", headers = {} } = {}) {
  const res = makeRes();
  await route.handler({ method, url, headers }, res);
  return res;
}

const prefix = route.path;
console.log(`host route: ${prefix} (prefix)\n`);

/* ---- 1. every allowlisted asset ------------------------------------------ */
for (const [file, contentType, isRightFormat] of ASSETS) {
  console.log(`the allowlisted asset ${file}`);
  const res = await request(`${prefix}/${file}`);
  check("served with 200", res.statusCode === 200, `got ${res.statusCode}`);
  check(`typed as ${contentType}`, res.headers["Content-Type"] === contentType, res.headers["Content-Type"]);
  check("marked nosniff", res.headers["X-Content-Type-Options"] === "nosniff");
  check("cached immutably", String(res.headers["Cache-Control"]).includes("immutable"));
  check("body is a Buffer", Buffer.isBuffer(res.body));
  check("body is really that format", Buffer.isBuffer(res.body) && isRightFormat(res.body));
  check(
    "Content-Length matches the body",
    Buffer.isBuffer(res.body) && res.headers["Content-Length"] === res.body.length,
    `${res.headers["Content-Length"]} vs ${res.body?.length}`,
  );
  check("body is not empty", (res.body?.length ?? 0) > 10_000, `${res.body?.length} bytes`);

  const etag = res.headers.ETag;
  check("carries a strong ETag", typeof etag === "string" && etag.startsWith('"'), String(etag));
  check("the ETag names the file it belongs to", etag.includes(file), String(etag));

  const fresh = await request(`${prefix}/${file}`, { headers: { "if-none-match": etag } });
  check("If-None-Match yields 304", fresh.statusCode === 304, `got ${fresh.statusCode}`);
  check("304 carries no body", fresh.body === undefined);
  const stale = await request(`${prefix}/${file}`, { headers: { "if-none-match": '"nope"' } });
  check("a stale validator yields 200", stale.statusCode === 200, `got ${stale.statusCode}`);
  console.log("");
}

/* ---- 2. everything else on the prefix ------------------------------------ */
console.log("traversal and unknown paths");
for (const [label, url] of [
  ["another file on the prefix", `${prefix}/../package.json`],
  ["percent-encoded traversal", `${prefix}/%2e%2e/package.json`],
  ["double-encoded traversal", `${prefix}/..%2f..%2fpackage.json`],
  ["a sibling name", `${prefix}/bliss.jpg.bak`],
  ["an arbitrary name", `${prefix}/secret.txt`],
  ["the bare prefix", prefix],
  ["a nested path", `${prefix}/sub/bliss.jpg`],
]) {
  const res = await request(url);
  check(`${label} → 404`, res.statusCode === 404, `got ${res.statusCode} for ${url}`);
}

/* ---- 3. verbs ------------------------------------------------------------ */
console.log("\nverbs");
{
  const post = await request(`${prefix}/bliss.jpg`, { method: "POST" });
  check("POST → 405", post.statusCode === 405, `got ${post.statusCode}`);
  check("405 advertises Allow", post.headers.Allow === "GET, HEAD", String(post.headers.Allow));
  const head = await request(`${prefix}/bliss.jpg`, { method: "HEAD" });
  check("HEAD → 200", head.statusCode === 200, `got ${head.statusCode}`);
  check("HEAD has no body", head.body === undefined);
  check("HEAD still reports Content-Length", Number(head.headers["Content-Length"]) > 10_000);
}

console.log(failures === 0 ? "\nPASS" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
