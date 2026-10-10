import { readFile } from "node:fs/promises";

/**
 * Host half of the Windows XP experience pack.
 *
 * Almost everything this plugin does lives in the browser bundle
 * (lib/client.js): the skin sets `data-dsh-windowsxp` on `<body>` and mounts one
 * stylesheet, and the notifier watches the session list and then plays a chime,
 * shows an in-page toast and — with permission — raises a system notification.
 *
 * The one thing the browser cannot do for itself is reach a file inside this
 * package, so the host serves the two packaged assets over a same-origin route of
 * its own. Same shape as @smalltailqwq/dsh-client-ui-skin-maid-atelier uses for
 * its artwork, and it keeps them out of the client bundle (which would otherwise
 * have to carry them as base64 data URLs).
 *
 * ── About the packaged files ────────────────────────────────────────────────
 * Both are third-party copyrighted material and neither is covered by this
 * package's MIT licence:
 *
 *   assets/bliss.jpg   the "Bliss" photograph, © Microsoft / Charles O'Rear
 *   assets/chime.wav   the classic Windows notification chime, © Microsoft
 *
 * They are here because the operator supplied them for their own machine. Both
 * are deliberately left out of `files` in package.json, so a published copy ships
 * without them: the stylesheet falls back to the pure-CSS desktop in
 * `--xp-wallpaper-fallback`, and the notifier to the synthesised bell in
 * `playSynth()`. See NOTICE.
 */

/** The only packaged files this route will ever hand out, and their types. */
const ASSETS = new Map([
  ["bliss.jpg", "image/jpeg"],
  ["chime.wav", "audio/wav"],
]);
const PREFIX = "/skin-assets/windowsxp";

/**
 * Serve exactly the allowlisted files; everything else on this prefix is a 404.
 * The allowlist is a constant rather than a directory listing, so no request can
 * walk out of the package directory.
 * @param ctx - owning host context.
 */
function installPackagedAssets(ctx) {
  const directory = new URL("../assets/", import.meta.url);

  ctx.inject(["webServer"], (webCtx) => {
    const server = webCtx.get("webServer");
    webCtx.effect(
      () =>
        server.register({
          kind: "prefix",
          path: PREFIX,
          handler: async (req, res) => {
            if (req.method !== "GET" && req.method !== "HEAD") {
              res.writeHead(405, { Allow: "GET, HEAD" }).end();
              return;
            }

            const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
            const requested = pathname.slice(PREFIX.length + 1);
            const contentType = ASSETS.get(requested);
            if (!pathname.startsWith(`${PREFIX}/`) || contentType === undefined) {
              res.writeHead(404).end();
              return;
            }

            let bytes;
            try {
              bytes = await readFile(new URL(requested, directory));
            } catch (error) {
              // A published copy has no assets: that is a 404, not a failure, and
              // both client-side fallbacks cover it.
              if (error.code !== "ENOENT") throw error;
              res.writeHead(404).end();
              return;
            }

            // These files never change without the package changing, so a strong
            // validator plus an immutable cache is the whole caching story.
            const etag = `"${requested}-${bytes.length}"`;
            const headers = {
              "Content-Type": contentType,
              "Cache-Control": "public, max-age=31536000, immutable",
              "X-Content-Type-Options": "nosniff",
              ETag: etag,
            };
            const ifNoneMatch = req.headers["if-none-match"];
            if (ifNoneMatch?.split(",").some((value) => value.trim().replace(/^W\//, "") === etag || value.trim() === "*")) {
              res.writeHead(304, headers).end();
              return;
            }

            res.writeHead(200, { ...headers, "Content-Length": bytes.length });
            res.end(req.method === "HEAD" ? void 0 : bytes);
          },
        }),
      "windowsxp: packaged assets",
    );
  });
}

/**
 * Host plugin body.
 * @param ctx - owning host context.
 */
export function apply(ctx) {
  installPackagedAssets(ctx);
}
