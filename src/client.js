/**
 * Windows XP experience — browser half.
 *
 * Two halves in one plugin, because to the operator they are one thing: the XP
 * look and the XP chime. Keeping them in one package means one install, one row
 * on the Plugins page and one switch.
 *
 *   1. the skin      — sets `data-dsh-windowsxp` on `<body>` and mounts the Luna
 *                      stylesheet from src/windowsxp.css;
 *   2. the notifier  — when a session's turn finishes it plays a chime, shows an
 *                      in-page toast and (with permission) raises a system
 *                      notification, each headed by the session's name.
 *
 * This file is the *source*; `node scripts/build.mjs` inlines both stylesheets
 * (at `__WINDOWSXP_CSS__` and `__NOTIFY_CSS__`) and writes the shipped
 * `lib/client.js`. The wrapper is the DSH client-module protocol: a bundle only
 * registers a lazy CJS factory, and every side effect lives inside that factory
 * so it runs on materialisation and can be disposed.
 *
 * ── How "the turn finished" is detected ─────────────────────────────────────
 * From the session list, not from the DOM:
 *
 *   sessions.list.getSnapshot().byId[sessionId].running
 *
 * That is the client's session controller — fed by the host's `api-session/status`
 * stream — and it carries a running bit per session, whichever session the UI
 * happens to be showing.
 *
 * An earlier version of this notifier watched `[data-chat-running]`, the live
 * indicator in the transcript. It was wrong in both directions: switching
 * workspace unmounted the indicator of a session that was still running (spurious
 * notification), and a background workspace finishing rendered no indicator at
 * all (silent). The running state belongs to the session, not to the view. On top
 * of that, the transcript virtualises with @tanstack/virtual-core, so no scheme
 * that remembers a DOM node and checks on it later can be trusted either.
 */
window.__ModuleLoader__.load({
	id: "dsh-theme-windowsxp",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const PACKAGE_NAME = "dsh-theme-windowsxp";
		/** Scope attribute every rule in the skin hangs off. */
		const SCOPE_ATTRIBUTE = "data-dsh-windowsxp";

		/** The whole skin, inlined by the build step. */
		const CSS = "__WINDOWSXP_CSS__";

		/* ====================================================================
		 * 1. The skin
		 * ================================================================= */

		/**
		 * Mount the stylesheet for exactly the owning plugin's lifetime.
		 * @param ctx - owning client context.
		 */
		function installStylesheet(ctx) {
			if (typeof document === "undefined") return;
			ctx.effect(() => {
				const tag = document.createElement("style");
				tag.dataset.plugin = PACKAGE_NAME;
				tag.dataset.pluginCss = `${PACKAGE_NAME}/windowsxp.css`;
				tag.textContent = CSS;
				document.head.appendChild(tag);
				return () => {
					tag.remove();
				};
			}, "windowsxp: stylesheet");
		}

		/**
		 * Put the scope attribute on `<body>`. Registered before the stylesheet
		 * so the first frame after materialisation is already Luna.
		 * @param ctx - owning client context.
		 */
		function installScope(ctx) {
			if (typeof document === "undefined") return;
			ctx.effect(() => {
				const body = document.body;
				if (body === null) return;
				const alreadyOurs = body.hasAttribute(SCOPE_ATTRIBUTE);
				body.setAttribute(SCOPE_ATTRIBUTE, "");
				return () => {
					if (!alreadyOurs) body.removeAttribute(SCOPE_ATTRIBUTE);
				};
			}, "windowsxp: body scope");
		}

		/* ====================================================================
		 * 2. The notifier
		 * ================================================================= */

		/**
		 * The packaged cue, served by this plugin's own host route (lib/index.js)
		 * next to the desktop wallpaper. Left relative so it resolves against the
		 * document base, which keeps it correct behind a reverse-proxy mount.
		 */
		const CUE_PATH = "skin-assets/windowsxp/chime.wav";
		const CUE_VOLUME = 0.6;

		/** How long the toast stays on screen. */
		const TOAST_MS = 6000;

		/**
		 * The synthesised cues, as [frequency multiple, gain multiple, decay
		 * multiple] partials plus a timing envelope.
		 *
		 * Both are synthesised, so a copy of this package with no audio files in it
		 * still notifies audibly. The two must be tellable apart with your eyes
		 * closed, so they differ in every dimension that matters: direction, rhythm,
		 * timbre and length.
		 */
		const CHIME = {
			// A rising A-major arpeggio — A5, C#6, E6 — with an inharmonic 2.76×
			// partial, which is what makes it read as a struck bell rather than a
			// test tone. Integers sound like an organ; non-integers sound like metal.
			hz: [880, 1108.7, 1318.5],
			step: 0.17,
			decay: 1,
			gain: 0.25,
			partials: [
				[1, 1, 1],
				[2.76, 0.32, 0.45],
			],
		};

		/**
		 * The approval cue. Where the chime rises and rings, this repeats the same
		 * high note and then drops — a "ping ping, your turn" figure — and it
		 * carries a third, brighter partial with a much shorter tail, so it reads
		 * as a call to come back rather than a sigh of relief.
		 */
		const APPROVAL = {
			hz: [1318.5, 1318.5, 987.8],
			step: 0.18,
			decay: 0.45,
			gain: 0.22,
			partials: [
				[1, 1, 1],
				[2, 0.35, 0.5],
				[3.01, 0.14, 0.35],
			],
		};

		/** The toast stylesheet, inlined by the build step. */
		const TOAST_CSS = "__NOTIFY_CSS__";

		const MESSAGES = {
			zh: {
				finished: "本轮已完成",
				detail: "可以回来看看结果。",
				many: "{count} 个会话已完成",
				waiting: "等待你的确认",
				waitingDetail: "智能体停在这里，等你处理。",
				waitingMany: "{count} 个会话在等你",
			},
			en: {
				finished: "Turn finished",
				detail: "Come take a look.",
				many: "{count} sessions finished",
				waiting: "Waiting for you",
				waitingDetail: "The agent has paused until you respond.",
				waitingMany: "{count} sessions are waiting",
			},
		};

		/**
		 * Copy for the interface language. The Desktop shell rewrites
		 * `<html lang>` as the user switches language, so this follows along.
		 * @returns the message set to use.
		 */
		function messages() {
			const lang = (document.documentElement.lang || navigator.language || "en").toLowerCase();
			return lang.startsWith("zh") ? MESSAGES.zh : MESSAGES.en;
		}

		/**
		 * What to put on the popup: which session, and what it wants from you.
		 *
		 * Naming the session is the whole point — with several workspaces open,
		 * "Turn finished" on its own says nothing about which one came back. The
		 * name is data, so it is never translated; only the sentence is.
		 * @param names - display names of the sessions concerned.
		 * @param tone - "done" for a finished turn, "approval" for a pending one.
		 * @returns the heading and body for the toast and the system notification.
		 */
		function describe(names, tone) {
			const copy = messages();
			const approval = tone === "approval";
			const subject = approval ? copy.waiting : copy.finished;
			const detail = approval ? copy.waitingDetail : copy.detail;
			if (names.length === 0) return { title: subject, body: detail };
			if (names.length === 1) return { title: names[0], body: `${subject} · ${detail}` };
			const many = approval ? copy.waitingMany : copy.many;
			return { title: many.replace("{count}", String(names.length)), body: names.join(" · ") };
		}

		/**
		 * The name shown for a session, falling back through the list row's own
		 * fields to the id so the popup is never blank.
		 * @param row - session list row.
		 * @param id - session id.
		 * @returns a non-empty display name.
		 */
		function nameOf(row, id) {
			for (const candidate of [row?.displayTitle, row?.title, id]) {
				if (typeof candidate === "string" && candidate.trim() !== "") return candidate;
			}
			return id;
		}

		/* -- sound ------------------------------------------------------------- */

		/** Lazily created; undefined once we know the browser has no Web Audio. */
		let audio;
		let audioUnavailable = false;

		/**
		 * The shared AudioContext, or undefined when Web Audio is missing.
		 * @returns the context, created on first use.
		 */
		function audioContext() {
			if (audio !== undefined || audioUnavailable) return audio;
			const Ctor = window.AudioContext ?? window.webkitAudioContext;
			if (Ctor === undefined) {
				audioUnavailable = true;
				return undefined;
			}
			try {
				audio = new Ctor();
			} catch {
				audioUnavailable = true;
				return undefined;
			}
			return audio;
		}

		/**
		 * Play one synthesised cue.
		 *
		 * Nothing to ship, nothing to license, and it cannot 404. An AudioContext
		 * created without a user gesture starts suspended, which is why the gesture
		 * arming below exists — by the time a cue is due the operator has certainly
		 * clicked or typed at least once.
		 * @param cue - one of the cue descriptors above.
		 */
		function playSynth(cue) {
			const context = audioContext();
			if (context === undefined) return;
			if (context.state === "suspended") void context.resume().catch(() => {});
			const start = context.currentTime;
			cue.hz.forEach((hz, note) => {
				const at = start + note * cue.step;
				for (const [ratio, loudness, length] of cue.partials) {
					const oscillator = context.createOscillator();
					const gain = context.createGain();
					const peak = cue.gain * loudness;
					const decay = cue.decay * length;
					oscillator.type = "sine";
					oscillator.frequency.setValueAtTime(hz * ratio, at);
					// Exponential ramps cannot touch zero, hence the tiny floor.
					gain.gain.setValueAtTime(0.0001, at);
					gain.gain.exponentialRampToValueAtTime(peak, at + 0.012);
					gain.gain.exponentialRampToValueAtTime(0.0001, at + decay);
					oscillator.connect(gain);
					gain.connect(context.destination);
					oscillator.start(at);
					oscillator.stop(at + decay + 0.05);
				}
			});
		}

		/** Set once the packaged cue is known to be unusable, so it is not retried. */
		let cueUnavailable = false;

		/**
		 * Play the packaged cue, if this copy of the package has one.
		 * @returns a promise that rejects when the file is missing or undecodable.
		 */
		function playCue() {
			return new Promise((resolve, reject) => {
				const player = new Audio(new URL(CUE_PATH, document.baseURI).href);
				player.volume = CUE_VOLUME;
				player.addEventListener("error", () => reject(new Error("cue unavailable")), { once: true });
				player.play().then(resolve, reject);
			});
		}

		/**
		 * Sound the completion: the packaged cue when it is there, the synth bell
		 * otherwise. A cue that is merely blocked by the autoplay policy must not
		 * disable it for good, so only a real load failure is remembered.
		 */
		function playChime() {
			if (cueUnavailable) {
				playSynth(CHIME);
				return;
			}
			playCue().catch((error) => {
				if (error?.name !== "NotAllowedError") cueUnavailable = true;
				playSynth(CHIME);
			});
		}

		/**
		 * Sound the approval request. Always synthesised, and deliberately not the
		 * packaged cue: the whole point is that it cannot be mistaken for the
		 * completion chime, and no asset can guarantee that the way a different
		 * figure does.
		 */
		function playApprovalSound() {
			playSynth(APPROVAL);
		}

		/** Unlock and keep the context alive across every user gesture. */
		function installAudioArming(ctx) {
			if (typeof document === "undefined") return;
			ctx.effect(() => {
				const resume = () => {
					const context = audioContext();
					if (context !== undefined && context.state === "suspended") void context.resume().catch(() => {});
				};
				document.addEventListener("pointerdown", resume, true);
				document.addEventListener("keydown", resume, true);
				return () => {
					document.removeEventListener("pointerdown", resume, true);
					document.removeEventListener("keydown", resume, true);
				};
			}, "windowsxp: audio arming");
		}

		/* -- popups ------------------------------------------------------------ */

		/** The in-page card host and its dismissal timer. */
		let toast;
		let toastTimer;

		/**
		 * The in-page card, rendered into a shadow root so the app's stylesheets
		 * cannot reach it and it cannot leak back. It stays on-theme anyway:
		 * colour, radius, shadow and font all read `--dsw-*` tokens, and custom
		 * properties inherit through a shadow boundary — which is also why the XP
		 * skin styles its own notification.
		 * @param names - display names of the sessions concerned.
		 * @param tone - "done" for a finished turn, "approval" for a pending one.
		 */
		function showToast(names, tone) {
			if (typeof document === "undefined" || document.body === null) return;
			dismissToast();

			const host = document.createElement("div");
			host.dataset.dshTurnNotify = tone;
			const shadow = host.attachShadow({ mode: "open" });
			const style = document.createElement("style");
			style.textContent = TOAST_CSS;

			const card = document.createElement("div");
			card.className = tone === "approval" ? "card approval" : "card";
			card.setAttribute("role", "status");
			card.setAttribute("aria-live", "polite");

			const dot = document.createElement("span");
			dot.className = "dot";

			const text = document.createElement("div");
			const title = document.createElement("div");
			title.className = "title";
			const body = document.createElement("div");
			body.className = "body";
			const copy = describe(names, tone);
			title.textContent = copy.title;
			body.textContent = copy.body;
			text.append(title, body);
			card.append(dot, text);

			card.addEventListener("click", () => {
				window.focus();
				dismissToast();
			});

			shadow.append(style, card);
			document.body.append(host);
			toast = host;
			toastTimer = window.setTimeout(dismissToast, TOAST_MS);
		}

		function dismissToast() {
			if (toastTimer !== undefined) {
				window.clearTimeout(toastTimer);
				toastTimer = undefined;
			}
			if (toast !== undefined) {
				toast.remove();
				toast = undefined;
			}
		}

		/**
		 * The OS-level notification, used only if the platform already granted
		 * permission. Never prompts from here: a browser rejects a permission
		 * request that is not tied to a gesture, and the in-page card covers the
		 * case where permission is refused. The session name is the notification's
		 * heading, so a stack of them stays readable in the Action Center.
		 * @param names - display names of the sessions concerned.
		 * @param tone - "done" for a finished turn, "approval" for a pending one.
		 */
		function showSystemNotification(names, tone) {
			const Ctor = window.Notification;
			if (Ctor === undefined || Ctor.permission !== "granted") return;
			try {
				const copy = describe(names, tone);
				const notification = new Ctor(copy.title, {
					body: copy.body,
					tag: `${PACKAGE_NAME}:turn-complete`,
					// The chime above is the sound; a second one from the OS would
					// be a double-blink.
					silent: true,
				});
				notification.onclick = () => {
					window.focus();
					notification.close();
				};
			} catch {
				/* A refused notification must never break the turn. */
			}
		}

		/** Ask for notification permission once, on the first gesture. */
		function installNotificationArming(ctx) {
			if (typeof document === "undefined") return;
			const Ctor = window.Notification;
			if (Ctor === undefined || Ctor.permission !== "default") return;
			ctx.effect(() => {
				const ask = () => {
					try {
						void Ctor.requestPermission().catch(() => {});
					} catch {
						/* ignore */
					}
				};
				document.addEventListener("pointerdown", ask, { once: true, capture: true });
				document.addEventListener("keydown", ask, { once: true, capture: true });
				return () => {
					document.removeEventListener("pointerdown", ask, true);
					document.removeEventListener("keydown", ask, true);
				};
			}, "windowsxp: notification permission");
		}

		/**
		 * Everything that happens when one or more turns end.
		 * @param names - display names of the sessions that just stopped.
		 */
		function announce(names) {
			playChime();
			showToast(names, "done");
			showSystemNotification(names, "done");
		}

		/**
		 * Everything that happens when the agent stops and waits for the operator.
		 * A different sound, so the two are never confused from across the room.
		 * @param names - display names of the sessions that are waiting.
		 */
		function announceApproval(names) {
			playApprovalSound();
			showToast(names, "approval");
			showSystemNotification(names, "approval");
		}

		/* -- detection --------------------------------------------------------- */

		/**
		 * Watch every session's running bit.
		 *
		 * The running state lives on the session, not on the view, so reading the
		 * session list makes this view-independent in both directions: no view
		 * change can fake a completion, and no completion can hide behind a view
		 * that is showing something else.
		 *
		 * Baseline: the first snapshot only records what is already running, so
		 * mounting mid-run does not announce for turns that started before the
		 * plugin came up.
		 * @param ctx - owning client context.
		 */
		function installWatcher(ctx) {
			ctx.inject(["sessions"], (sessionCtx) => {
				const sessions = sessionCtx.get("sessions");
				/** sessionId → last observed running bit. */
				const seen = new Map();
				let primed = false;

				const evaluate = () => {
					const byId = sessions.list.getSnapshot().byId ?? {};
					const present = new Set();
					const finished = [];

					for (const [id, row] of Object.entries(byId)) {
						// Subagent children carry their own running bit; a subagent
						// finishing is not the turn the operator is waiting on.
						if (row?.parentId !== undefined) continue;
						present.add(id);
						const running = row.running === true;
						const was = seen.get(id);
						seen.set(id, running);
						if (primed && was === true && !running) finished.push(nameOf(row, id));
					}

					// A session that left the list was removed, not necessarily
					// finished: drop it silently.
					for (const id of [...seen.keys()]) if (!present.has(id)) seen.delete(id);

					if (!primed) {
						primed = true;
						return;
					}
					if (finished.length > 0) announce(finished);
				};

				sessionCtx.effect(() => {
					const unsubscribe = sessions.list.subscribe(evaluate);
					evaluate();
					return () => {
						unsubscribe();
						dismissToast();
					};
				}, "windowsxp: session running bits");
			});
		}

		/**
		 * Watch for the agent stopping to ask the operator something.
		 *
		 * `ui-session` maintains one status record per session — `running`,
		 * `pendingInteraction` and `completionUnread` — exposed as the
		 * `uiSession.sessionStatus` snapshot store, and `pendingInteraction` is set
		 * while an approval or a question is on screen waiting for an answer.
		 *
		 * Two things make this the right source rather than the approval panel's
		 * own `[data-approval-key]`:
		 *
		 *   - it is per session, so the popup can name the workspace that is waiting
		 *     rather than describing whichever one happens to be on screen;
		 *   - the approval panel only exists in the DOM while you are looking at
		 *     that conversation, so a blocked background session would be silent.
		 *
		 * The rising edge is what announces: a re-render of the same pending
		 * interaction must not replay the cue.
		 * @param ctx - owning client context.
		 */
		function installApprovalWatcher(ctx) {
			ctx.inject(["sessions", "uiSession"], (sessionCtx) => {
				const sessions = sessionCtx.get("sessions");
				const sessionStatus = sessionCtx.get("uiSession").sessionStatus;
				/** sessionId → whether something was already waiting. */
				const seen = new Map();
				let primed = false;

				const evaluate = () => {
					const byId = sessions.list.getSnapshot().byId ?? {};
					const present = new Set();
					const waiting = [];

					for (const [id, status] of sessionStatus.getSnapshot()) {
						const row = byId[id];
						// Subagents and sessions that have left the list are not the
						// operator's to answer.
						if (row === undefined || row.parentId !== undefined) continue;
						present.add(id);
						const pending = status?.pendingInteraction != null;
						const was = seen.get(id);
						seen.set(id, pending);
						if (primed && pending && was !== true) waiting.push(nameOf(row, id));
					}

					for (const id of [...seen.keys()]) if (!present.has(id)) seen.delete(id);

					if (!primed) {
						primed = true;
						return;
					}
					if (waiting.length > 0) announceApproval(waiting);
				};

				sessionCtx.effect(() => {
					const unsubscribe = sessionStatus.subscribe(evaluate);
					evaluate();
					return unsubscribe;
				}, "windowsxp: pending interactions");
			});
		}

		/**
		 * Client plugin body. Disabling the plugin in the plugin manager runs the
		 * disposers, which removes the attribute, the stylesheet, the watchers and
		 * any toast on screen.
		 * @param ctx - owning client context.
		 */
		function apply(ctx) {
			installScope(ctx);
			installStylesheet(ctx);
			installAudioArming(ctx);
			installNotificationArming(ctx);
			installWatcher(ctx);
			installApprovalWatcher(ctx);
		}

		exports.apply = apply;
		return module.exports;
	}
});
