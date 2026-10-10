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
		const CSS = "/* ============================================================================\n * Windows XP (Luna Blue) theme for DeepSeek Harness\n * ----------------------------------------------------------------------------\n * Loaded inside `body[data-dsh-windowsxp]`. Everything the DSH design system\n * exposes as a `--dsw-*` token is re-pointed at the Windows XP Luna palette;\n * what tokens cannot express (the Luna gradient buttons, the #7F9DB9 field\n * border, the rounded blue scrollbar) is written as ordinary rules afterwards.\n *\n * Both selector variants are listed everywhere on purpose: the second one\n * (`[data-ds-dark-theme]`) outranks `body[data-ds-dark-theme]` from\n * design-platform.css, so Luna keeps its beige face even when the user picked\n * \"dark\" or \"system\". Windows XP had no dark mode.\n *\n * Luna palette reference\n *   #ECE9D8  the \"3D Objects\" face every dialog and toolbar is painted in\n *   #0054E3  Luna frame blue (logo / active title bar base)\n *   #3A93FF  the light end of the title-bar gradient\n *   #003C74  the dark blue 1px outline around Luna controls\n *   #316AC5  the selection blue (highlighted list rows, selected text)\n *   #7F9DB9  the grey-blue border of every text field\n *   #ACA899  disabled text and soft separators\n * ========================================================================= */\n\n/* ---------------------------------------------------------------------------\n * 1. The Luna palette (no --dsw-* here, only our own names)\n * ------------------------------------------------------------------------ */\nbody[data-dsh-windowsxp],\nbody[data-dsh-windowsxp][data-ds-dark-theme] {\n  --xp-face: #ece9d8;\n  --xp-face-light: #f5f4ec;\n  --xp-blue: #0054e3;\n  --xp-blue-bright: #3a93ff;\n  --xp-blue-dark: #003c74;\n  --xp-highlight: #316ac5;\n  --xp-hot: #e4edfa;\n  --xp-field: #ffffff;\n  --xp-field-border: #7f9db9;\n  /* #ACA899 is the period-correct Windows grey and it is fine for a 3D edge or a\n   * divider — but it was also doing duty as *text* colour, where it lands at\n   * 2.3:1 on white and 1.6:1 on --xp-face, i.e. genuinely unreadable. Reported\n   * from real use as \"有很多字我都看不清\".\n   *\n   * So the two jobs are split: --xp-gray stays the chrome grey, and anything that\n   * renders glyphs uses --xp-gray-ink instead — #6A6859 is still visibly dimmed,\n   * but measures 5.6:1 on white and 4.6:1 on --xp-face, both over the 4.5:1 line.\n   * It keeps the Windows habit of grey text carrying a 1px white shadow (the\n   * \"etched\" disabled look), which reads better again at small sizes. */\n  --xp-gray: #aca899;\n  --xp-gray-ink: #6a6859;\n  --xp-text: #000000;\n\n  /* The Explorer task pane is not a flat colour: it is a vertical periwinkle\n     gradient, and the pane's own labels sit on it in dark blue. */\n  --xp-pane: linear-gradient(180deg, #7ba2e7 0%, #6c86dc 55%, #5f78d6 100%);\n  /* ...and this is its middle stop, which is what the token below has to use. */\n  --xp-pane-flat: #6c86dc;\n  --xp-pane-ink: #00309c;\n  /* The XP task pane is a stack of white cards floating on that gradient. */\n  --xp-pane-card: #ffffff;\n  --xp-pane-card-hover: #eef4ff;\n  --xp-pane-card-border: #b8c8ea;\n\n  /* The \"Bliss\" desktop.\n   *\n   * Three separate properties on purpose, so any one of them can be swapped\n   * without touching the others:\n   *\n   *   --xp-wallpaper-image     the photograph, served by this plugin's own\n   *                            same-origin route (lib/index.js). The URL is\n   *                            left relative so it resolves against the document\n   *                            base, which keeps it correct behind a\n   *                            reverse-proxy mount. The preview page repoints\n   *                            this one property at the file on disk.\n   *   --xp-wallpaper-fallback  a pure-CSS recreation of the same composition —\n   *                            deep blue sky, four cloud puffs, and a rolling\n   *                            hill cut from an ellipse whose centre is pushed\n   *                            below the box. It shows whenever the bitmap is\n   *                            missing, which is the case for a published copy\n   *                            of this package: the photo is third-party\n   *                            copyrighted artwork and is deliberately kept out\n   *                            of `files` in package.json.\n   *   --xp-wallpaper-veil      how much white is laid over the scene before text\n   *                            sits on top. This is the only knob worth turning:\n   *                            0 is the bare photograph (and black body text on\n   *                            the shaded grass drops to ~2.5:1), 0.8 is a\n   *                            barely-there tint. 0.32 keeps the hill vivid while\n   *                            body text still clears ~5.8:1 at its darkest. */\n  --xp-wallpaper-veil: 0.32;\n  --xp-wallpaper-image: url(\"skin-assets/windowsxp/bliss.jpg\") center / cover no-repeat;\n  --xp-wallpaper-fallback:\n    radial-gradient(closest-side at 24% 20%, #ffffffd9, #ffffff00 72%),\n    radial-gradient(closest-side at 38% 13%, #ffffffb3, #ffffff00 70%),\n    radial-gradient(closest-side at 76% 17%, #ffffffcc, #ffffff00 74%),\n    radial-gradient(closest-side at 60% 30%, #ffffff8c, #ffffff00 70%),\n    radial-gradient(125% 82% at 50% 120%, #9ad95c 0%, #6cbb32 34%, #478f1f 62%, #336f16 84%, #336f1600 88%),\n    linear-gradient(180deg, #1f6fc4 0%, #3f8fd0 36%, #8ec4e8 62%, #d8ecf8 100%);\n  --xp-wallpaper:\n    linear-gradient(rgba(255, 255, 255, var(--xp-wallpaper-veil)), rgba(255, 255, 255, var(--xp-wallpaper-veil))),\n    var(--xp-wallpaper-image),\n    var(--xp-wallpaper-fallback);\n\n  /* The Luna button is a four-stop vertical gradient, not a flat fill. */\n  --xp-button: linear-gradient(180deg, #ffffff 0%, #f4f3ec 46%, #e9e6d8 52%, #ece9d8 100%);\n  --xp-button-hover: linear-gradient(180deg, #fffef8 0%, #fdf4d3 46%, #f8e6a4 52%, #fbf2d3 100%);\n  --xp-button-active: linear-gradient(180deg, #cdcabb 0%, #dcd9cc 50%, #e6e3d6 100%);\n}\n\n/* ---------------------------------------------------------------------------\n * 2. Token layer: every semantic slot points at the palette above\n * ------------------------------------------------------------------------ */\nbody[data-dsh-windowsxp],\nbody[data-dsh-windowsxp][data-ds-dark-theme] {\n  /* -- surfaces ---------------------------------------------------------- */\n  /* bg-base paints the window frame *and* the conversation root (ui-layout's\n     `.frame` and ui-conversation's `.root` both read it). Explorer's content\n     pane is white, so that is what this is; the beige moves to the toolbar\n     band (`header`) and to popups, and the blue moves to the task pane. */\n  --dsw-alias-bg-base: var(--xp-field);\n  --dsw-alias-bg-layer-1: var(--xp-field);\n  --dsw-alias-bg-layer-2: var(--xp-face-light);\n  --dsw-alias-bg-layer-3: var(--xp-face);\n  --dsw-alias-bg-overlay: var(--xp-face);\n  --dsw-alias-bg-module-platform: var(--xp-face-light);\n  --dsw-alias-bg-multi-select: var(--xp-face);\n  --dsw-alias-bg-document-preview: var(--xp-field);\n  --dsw-alias-bg-document-selection: var(--xp-highlight);\n  --dsw-alias-bg-skeleton: #7f9db940;\n  --dsw-alias-bg-mask-1: #00000040;\n  --dsw-alias-bg-mask-2: #00000020;\n  --dsw-alias-bg-mask-3: #00000080;\n  --dsw-alias-bg-mask-drop: #ece9d8b3;\n  --dsw-alias-bg-mask-photo: #000000e0;\n\n  /* -- borders ----------------------------------------------------------- */\n  --dsw-alias-border-l1: var(--xp-gray);\n  --dsw-alias-border-l2: #d6d2c2;\n  --dsw-alias-border-l2-darkmode-thin: #d6d2c2;\n  --dsw-alias-border-l3: var(--xp-blue-dark);\n  --dsw-alias-border-l4: var(--xp-gray);\n  --dsw-alias-border-inverted: #ffffff00;\n  --dsw-alias-border-inverted2: #ffffff26;\n\n  /* -- text -------------------------------------------------------------- */\n  --dsw-alias-label-primary: var(--xp-text);\n  --dsw-alias-label-primary-bluish: var(--xp-text);\n  --dsw-alias-label-primary-dimmed: var(--xp-text);\n  --dsw-alias-label-primary-foreground: #ffffff;\n  --dsw-alias-label-primary-inverted: #ffffff;\n  --dsw-alias-label-secondary: #1a1a1a;\n  --dsw-alias-label-tertiary: #4a4a44;\n  --dsw-alias-label-caption: var(--xp-gray-ink);\n  --dsw-alias-label-dimmed: var(--xp-gray-ink);\n  --dsw-alias-label-document-preview: var(--xp-text);\n  --dsw-alias-label-shimmer: #0000004d;\n  --dsw-alias-label-deep-diving: var(--xp-blue);\n  --dsw-alias-label-deep-diving-shimmer: var(--xp-blue-bright);\n  --dsw-alias-link: #0000ee;\n\n  /* -- brand & states ---------------------------------------------------- */\n  --dsw-alias-brand-primary: var(--xp-blue);\n  --dsw-alias-brand-primary-invert: var(--xp-blue);\n  --dsw-alias-brand-primary-new-colorprimary-new-color: var(--xp-blue);\n  --dsw-alias-brand-text: var(--xp-text);\n  --dsw-alias-state-business-primary: var(--xp-blue);\n  --dsw-alias-state-business-tertiary: #dbe6f7;\n  --dsw-alias-state-error-primary: #cc0000;\n  --dsw-alias-state-error-secondary: #e8503a;\n  --dsw-alias-state-idle-primary: var(--xp-gray);\n  --dsw-alias-state-success-primary: #1a8a1a;\n  --dsw-alias-state-success-secondary: #3aa93a;\n  --dsw-alias-state-success-tertiary: #e2f5e2;\n  --dsw-alias-state-warn-label: #8a6000;\n  --dsw-alias-state-warn-primary: #ffc800;\n  --dsw-alias-state-warn-secondary: #ffe08a;\n  --dsw-alias-state-warn-tertiary: #fff7db;\n\n  /* -- buttons & interaction --------------------------------------------- */\n  /* The primary fill stays Luna blue because `label-primary-foreground` is\n     white in this skin: a beige primary button would render white-on-beige. */\n  --dsw-alias-button-contrast-fill: var(--xp-blue);\n  --dsw-alias-button-elevated-fill: var(--xp-face);\n  --dsw-alias-button-floating-fill: var(--xp-face);\n  --dsw-alias-button-floating-hover: var(--xp-face-light);\n  --dsw-alias-button-ghost-active-border: var(--xp-blue);\n  --dsw-alias-button-ghost-active-fill: var(--xp-face);\n  --dsw-alias-button-ghost-active-hover: var(--xp-face-light);\n  --dsw-alias-button-info-fill: var(--xp-blue);\n  --dsw-alias-button-info-hover: #1a66f0;\n  --dsw-alias-button-primary-dimmed: #a8bee8;\n  --dsw-alias-button-primary-fill: var(--xp-blue);\n  --dsw-alias-button-primary-hover: #1a66f0;\n  --dsw-alias-button-tool-bar-fill: #ece9d8cc;\n  --dsw-alias-button-tool-bar-fill-invisible: #ece9d800;\n  --dsw-alias-button-tool-bar-hover: #f5f4ece6;\n  --dsw-alias-interactive-bg-hover: var(--xp-hot);\n  --dsw-alias-interactive-bg-active: #c7d8f0;\n  --dsw-alias-interactive-bg-hover-accent: #d3e2f7;\n  --dsw-alias-interactive-bg-hover-danger: #cc000026;\n  --dsw-alias-interactive-bg-hover-solid: var(--xp-hot);\n\n  /* -- markdown & diff --------------------------------------------------- */\n  --dsw-alias-markdown-citation: var(--xp-face);\n  --dsw-alias-markdown-code-block: var(--xp-field);\n  --dsw-alias-markdown-code-block-banner: var(--xp-face);\n  --dsw-alias-markdown-code-segment-selected: var(--xp-field);\n  --dsw-alias-markdown-code-segment-unselected: var(--xp-face);\n  --dsw-alias-markdown-inline-code: var(--xp-field);\n  --dsw-alias-markdown-placeholder: var(--xp-face);\n  --dsw-alias-markdown-tag: var(--xp-face);\n  --dsw-alias-code-diff-added: #1a8a1a1f;\n  --dsw-alias-code-diff-deleted: #cc00001f;\n  --dsw-alias-file-diff-added-bg: #e2f7e2;\n  --dsw-alias-file-diff-added-gutter: #eefbee;\n  --dsw-alias-file-diff-added-marker: #1a8a1a;\n  --dsw-alias-file-diff-deleted-bg: #fde6e2;\n  --dsw-alias-file-diff-deleted-gutter: #fdf0ee;\n  --dsw-alias-file-diff-deleted-marker: #cc0000;\n\n  /* -- menus, popups, tooltips, toasts ----------------------------------- */\n  --dsw-menu-surface-fill: #ece9d8fa;\n  --dsw-specific-menu: var(--xp-face);\n  --dsw-specific-selector: var(--xp-face);\n  --dsw-specific-tip: #ffffe1;\n  --dsw-specific-input-major: var(--xp-field);\n  --dsw-specific-login-input: var(--xp-field);\n  --dsw-specific-bubble: #f2f6ff;\n  --dsw-specific-bubble-highlight: #dce9f9;\n  /* MUST be a solid colour — the pane gradient cannot live here.\n   *\n   * Two consumers read this one token:\n   *   ui-sidebar        `background: var(--dsw-specific-sidebar-fill)`   — gradient OK\n   *   Desktop preload   `background-color: var(--dsw-specific-sidebar-fill)` on a\n   *                     hidden probe, measured with a canvas and sent over\n   *                     `dsh-desktop:windows-appearance` to the main process,\n   *                     which calls `setTitleBarOverlay({ color })`.\n   *\n   * `background-color: linear-gradient(…)` is an invalid declaration, so with a\n   * gradient here the probe returns transparent and the Windows caption strip\n   * silently falls back to the OS default (#f9fafb) — a pale band that matches\n   * nothing else in this skin. Feeding it the flat middle stop makes the caption\n   * strip Luna blue instead, and the gradient is re-applied to the pane itself in\n   * the chrome layer below, where only ui-sidebar can see it. */\n  --dsw-specific-sidebar-fill: var(--xp-pane-flat);\n  --dsw-specific-sidebar-nav-item-active: var(--xp-pane-card);\n  --dsw-specific-sidebar-nav-item-active-accent: var(--xp-pane-card);\n  --dsw-specific-sidebar-nav-item-hover: #ffffff99;\n  --dsw-alias-menu-group-header-fill: #ece9d8f0;\n  --dsw-alias-menu-icon: #1a1a1a;\n  --dsw-alias-toast-bg: #ffffe1;\n  --dsw-alias-toast-label: var(--xp-text);\n  --dsw-alias-tooltip-bg: #ffffe1;\n  --dsw-alias-tooltip-key-bg: #fff7c0;\n  --dsw-alias-turn-trigger-bg: var(--xp-face);\n  --dsw-alias-turn-trigger-bg-hover: var(--xp-face-light);\n\n  /* -- scrollbars & switch ----------------------------------------------- */\n  --dsw-alias-scrollbar-bg-l1: #c9d5ee;\n  --dsw-alias-scrollbar-bg-l2: #c9d5ee;\n  --dsw-alias-scrollbar-hover-l1: #b4c6e8;\n  --dsw-alias-scrollbar-hover-l2: #b4c6e8;\n  --dsw-alias-switch-thumb: #ffffff;\n\n  /* -- geometry: Luna controls are rounded, unlike its predecessor ------- */\n  --dsw-radius-xs: 3px;\n  --dsw-radius-sm: 3px;\n  --dsw-radius-md: 4px;\n  --dsw-radius-lg: 6px;\n  --dsw-radius-xl: 8px;\n  --dsw-radius-panel: 8px;\n  /* Luna's corners are circular arcs, not superellipses. */\n  --dsw-corner-shape: round;\n\n  /* -- typography: Tahoma is the XP UI face ------------------------------ */\n  --dsw-font-family: Tahoma, \"Microsoft YaHei\", \"MS Sans Serif\", SimSun, sans-serif;\n  --dsw-font-family-brand: Tahoma, \"Microsoft YaHei\", \"MS Sans Serif\", SimSun, sans-serif;\n  --ds-font-family-code: \"Lucida Console\", Consolas, \"Courier New\", monospace;\n\n  /* -- focus ring: XP still draws the Win9x dotted rectangle ------------ */\n  --dsw-focus-ring-width: 1px;\n  --dsw-focus-ring-color: var(--xp-text);\n\n  /* -- XP drops soft shadows again after the flat 9x era ---------------- */\n  --dsw-shadow-lv1: 0 1px 2px #0000001a;\n  --dsw-shadow-lv1-blur: 0 2px 6px #00000014;\n  --dsw-shadow-lv2: 0 2px 8px #00000024;\n  --dsw-shadow-lv3: 0 4px 16px #00000033;\n  --dsw-menu-backdrop-filter: none;\n\n  /* -- scrollbar geometry ------------------------------------------------ */\n  --dsh-scrollbar-width: 17px;\n  --dsh-scrollbar-thumb: #c9d5ee;\n  --dsh-scrollbar-thumb-hover: #b4c6e8;\n  --dsh-scrollbar-thumb-border: 0px;\n  --dsh-scrollbar-track-margin: 0px;\n\n  /* -- syntax highlighting ---------------------------------------------- */\n  --shiki-token-constant: #0000ff;\n  --shiki-token-string: #1a8a1a;\n  --shiki-token-comment: #7f7f6f;\n  --shiki-token-keyword: #0000ff;\n  --shiki-token-parameter: #808000;\n  --shiki-token-function: #800080;\n  --shiki-token-string-expression: #1a8a1a;\n  --shiki-token-punctuation: var(--xp-text);\n  --shiki-token-link: #0000ee;\n}\n\n/* The elevation tokens are re-declared per element by\n   gradient-shadow-text.css (`body, body *`), so they must be re-bound on\n   every element too — otherwise the built-in glow wins on descendants. */\nbody[data-dsh-windowsxp],\nbody[data-dsh-windowsxp] *,\nbody[data-dsh-windowsxp][data-ds-dark-theme],\nbody[data-dsh-windowsxp][data-ds-dark-theme] * {\n  --dsw-elevation-stroke-color: var(--xp-gray);\n  --dsw-elevation-stroke: 0 0 0 1px var(--dsw-elevation-stroke-color);\n  --dsw-elevation-panel: 0 0 0 1px var(--xp-gray), 0 2px 8px #0000001f;\n  --dsw-elevation-prominent: 0 0 0 1px var(--xp-gray), 0 4px 16px #0000002e;\n  --dsw-elevation-soft: 0 0 0 1px var(--xp-gray), 0 2px 10px #0000001a;\n}\n\n/* ---------------------------------------------------------------------------\n * 3. Chrome layer: the things tokens cannot express\n * ------------------------------------------------------------------------ */\n\nbody[data-dsh-windowsxp],\nbody[data-dsh-windowsxp][data-ds-dark-theme] {\n  background-color: var(--xp-face);\n  color: var(--xp-text);\n  font-family: var(--dsw-font-family);\n}\n\nbody[data-dsh-windowsxp] ::selection {\n  background: var(--xp-highlight);\n  color: #ffffff;\n}\n\n/* Text fields: white with XP's unmistakable #7F9DB9 hairline and square corners. */\nbody[data-dsh-windowsxp] :is(input:not([type='checkbox']):not([type='radio']), textarea, select) {\n  background: var(--xp-field);\n  border: 1px solid var(--xp-field-border);\n  border-radius: 1px;\n  box-shadow: none;\n  color: var(--xp-text);\n  font-family: inherit;\n}\n\n/* Buttons: the Luna gradient, the #003C74 outline, a warm hover glow and a\n   pressed state.\n *\n * Widget-shaped buttons are excluded on purpose. They are <button> elements too,\n * but their appearance belongs to the list, menu or picker that owns them, and a\n * component's own state rule is far weaker than this one — so painting over them\n * does not restyle them, it *erases* their states:\n *\n *   - ui-user-questions' choices are `role=\"radio\"` / `role=\"checkbox\"`, and\n *     \"selected\" is nothing but `background: var(--dsw-alias-interactive-bg-hover)`\n *     plus a border. Painting over it made selecting an option look exactly like\n *     hovering it, i.e. like nothing happened at all;\n *   - ui-conversation's view tabs are borderless underline tabs\n *     (`.tab { background: 0 0; border: none; padding: 0 0 9px }` plus a 2px\n *     `:after` underline), so the Luna gradient and a 1px border turned them into\n *     chunky boxes on the beige toolbar band *and* added 2px of height.\n *\n * The role list is empirical, not guessed: grep the client bundles for\n * `role: \"…\"` and these are the values that land on an interactive element.\n *\n * Excluded rather than overridden: forcing `background: transparent` back onto\n * these roles would also flatten the selected-item highlight of every menu and\n * listbox in the app, because a component's own `.item[aria-selected]` rule is\n * far weaker than this one. `:not()` simply leaves them alone. `[class*=\n * 'iconButton']` covers the other half of the same problem — DSH's CSS-module\n * names keep their readable suffix (`Mbwy4a_iconButton`), and those are bare\n * 24px hit targets whose whole point is having no chrome.\n *\n * The `:where()` wrapper around the exclusions is load-bearing. Each\n * `:not([attr])` adds a class-level unit of specificity, so the plain chained\n * form would lift this rule from (0,2,2) to (0,5,2) — above the sidebar's\n * white-card rules at (0,3,2), silently undoing them. `:where()` contributes\n * zero, so this keeps its original (0,2,2) and the sidebar keeps winning. */\nbody[data-dsh-windowsxp] button:not(:disabled):where(:not([role='tab']):not([role='menuitem']):not([role='option']):not([role='treeitem'])\n    :not([role='radio']):not([role='checkbox']):not([role='switch'])\n    :not([role='menuitemradio']):not([role='menuitemcheckbox']):not([class*='iconButton']):not([class*='_primary'])\n  ) {\n  background: var(--xp-button);\n  border: 1px solid var(--xp-blue-dark);\n  border-radius: 3px;\n  font-family: inherit;\n}\nbody[data-dsh-windowsxp] button:not(:disabled):where(:not([role='tab']):not([role='menuitem']):not([role='option']):not([role='treeitem'])\n    :not([role='radio']):not([role='checkbox']):not([role='switch'])\n    :not([role='menuitemradio']):not([role='menuitemcheckbox']):not([class*='iconButton']):not([class*='_primary'])\n  ):hover {\n  background: var(--xp-button-hover);\n}\nbody[data-dsh-windowsxp] button:not(:disabled):where(:not([role='tab']):not([role='menuitem']):not([role='option']):not([role='treeitem'])\n    :not([role='radio']):not([role='checkbox']):not([role='switch'])\n    :not([role='menuitemradio']):not([role='menuitemcheckbox']):not([class*='iconButton']):not([class*='_primary'])\n  ):active {\n  background: var(--xp-button-active);\n  border-color: #7d7d7d;\n}\n/* Same widget exclusions as above: a disabled choice must still look disabled\n   *and* not look like a Luna button, and a busy question composer disables every\n   one of its options. */\nbody[data-dsh-windowsxp] button:disabled:where(:not([role='tab']):not([role='menuitem']):not([role='option']):not([role='treeitem'])\n    :not([role='radio']):not([role='checkbox']):not([role='switch'])\n    :not([role='menuitemradio']):not([role='menuitemcheckbox']):not([class*='iconButton']):not([class*='_primary'])\n  ) {\n  background: var(--xp-face);\n  border: 1px solid var(--xp-gray);\n  /* Readable, not invisible. The real Windows disabled colour (#ACA899) is only\n   * 1.6:1 on this fill; --xp-gray-ink is 4.6:1 and still reads as disabled, the\n   * more so with XP's 1px white etch underneath it. The market's card actions sit\n   * disabled whenever a plugin is already installed, so this is not an edge case. */\n  color: var(--xp-gray-ink);\n  text-shadow: 1px 1px 0 #ffffff;\n}\n\n/* The chosen answer in a question, which upstream distinguishes from *hover* by a\n * border colour and nothing else:\n *\n *   .option:hover:not(:disabled), .optionSelected { background: var(--dsw-alias-interactive-bg-hover) }\n *   .optionSelected                              { border-color: var(--dsw-alias-border-l2) }\n *\n * Deliberate upstream, but on a Luna card it is not enough to answer \"which one\n * did I pick?\" — especially once the pointer has moved away. So a selected option\n * picks up the selection blue as an inset ring, and it has to outrank the\n * component's own `:hover:not(:disabled)` (0,3,0) as well as its selected rule\n * (0,1,0) — hence (0,3,1), and hence `:not(:disabled)`, which is also what keeps\n * a mid-submit disabled option from lighting up. */\nbody[data-dsh-windowsxp] [class*='optionSelected']:not(:disabled) {\n  background: #dbe6f7;\n  border-color: var(--xp-highlight);\n  box-shadow: inset 0 0 0 1px var(--xp-highlight);\n}\n\n/* The composer's primary action — send / queue / steer, and stop during a run —\n * owns its treatment, so it is carved back out of the generic button rules above.\n *\n * ui-conversation paints it `background: var(--dsw-alias-button-info-fill)` with\n * a hard-coded `color: #fff` glyph:\n *\n *   .primary      { background: var(--dsw-alias-button-info-fill); color: #fff;\n *                   border-radius: 999px; width: 34px; height: 34px }\n *   .primary:disabled { opacity: .4 }\n *\n * The generic rule repainted the *fill* beige but cannot touch that hard-coded\n * glyph colour, leaving white-on-beige: the send arrow and the stop square became\n * an unreadable smudge exactly when the button mattered most — mid-run, when it\n * becomes the stop control. Restoring the component's own paint fixes it, and\n * costs nothing aesthetically because `--dsw-alias-button-info-fill` is already\n * Luna blue in this skin: a solid blue circle with a white glyph, which is as XP\n * as it gets.\n *\n * Both states share this one element and one class, so the skin cannot colour\n * \"stop\" differently from \"send\"; what it can do is make the glyph legible in\n * both. */\nbody[data-dsh-windowsxp] [data-composer-seat] button[class*='_primary'] {\n  background: var(--dsw-alias-button-info-fill);\n  border: 0;\n  border-radius: 999px;\n  box-shadow: none;\n}\nbody[data-dsh-windowsxp] [data-composer-seat] button[class*='_primary']:hover:not(:disabled) {\n  background: var(--dsw-alias-button-info-hover);\n}\nbody[data-dsh-windowsxp] [data-composer-seat] button[class*='_primary']:active:not(:disabled) {\n  background: var(--xp-blue-dark);\n}\nbody[data-dsh-windowsxp] [data-composer-seat] button[class*='_primary']:disabled {\n  background: var(--dsw-alias-button-info-fill);\n  border: 0;\n  color: var(--dsw-alias-label-primary-foreground);\n}\n\n/* The conversation's view tabs ship without any hover feedback, so the only thing\n   this skin adds is the colour. Everything else — the 2px underline, the active\n   colour — already resolves through `--dsw-alias-state-business-primary`, which\n   this skin points at Luna blue. */\nbody[data-dsh-windowsxp] [data-conversation-tabs] [role='tab']:not(:disabled):hover {\n  color: var(--xp-blue);\n}\n\n/* Overwriting box-shadow/border removes whatever focus ring a control carried,\n   so XP's dotted focus rectangle is restored — only on the controls this\n   stylesheet restyled, never globally. */\nbody[data-dsh-windowsxp] :is(button, input, textarea, select):focus-visible {\n  outline: 1px dotted var(--xp-text);\n  outline-offset: -4px;\n}\n\n/* ---------------------------------------------------------------------------\n * 4. Explorer chrome\n *\n * The look in a Windows XP Explorer window is three bands, and each one is a\n * different material:\n *   beige toolbar band  |  blue task pane  |  white content pane\n * DSH maps onto that as header / sidebar column / conversation root. The\n * sidebar hooks are class substrings (`sidebarCol` comes from ui-layout) rather\n * than whole hashed class names, because the hash changes on every DSH rebuild\n * while the semantic suffix does not.\n * ------------------------------------------------------------------------ */\n\n/* The toolbar / menu band above the content. */\nbody[data-dsh-windowsxp] header {\n  background: var(--xp-face);\n}\n\n/* The desktop wallpaper behind the conversation.\n *\n * Deliberately NOT on `--dsw-alias-bg-base`. That token is consumed as a plain\n * colour by fifteen-odd components — attachment chips, thumbnails, inline\n * editors, sticky row headers, the browser iframe, the schedule panes — so a\n * wallpaper value would sprout a miniature hill inside every one of them.\n * (ui-theme even reads it with `background-color:` on `body`, where a gradient\n * is simply invalid.)\n *\n * `[data-conversation-scroll]` is the conversation's scroll body: it wraps the\n * message views *and* the composer seat, so it covers exactly the reading area.\n * A scroll container paints its own background once, outside the scrolling\n * content, which gives the desktop-behind-windows feel — messages slide over a\n * stationary wallpaper.\n *\n * If a white band ever shows around this area, add\n * `body[data-dsh-windowsxp] [class*='centerCol']` to this selector list to cover\n * the whole centre column. It is left out on purpose: that column also hosts the\n * terminal / browser / schedule panels, which should keep their own surfaces. */\nbody[data-dsh-windowsxp] [data-conversation-scroll] {\n  background: var(--xp-wallpaper);\n}\n\n/* The task pane: a list of white cards floating on the periwinkle gradient.\n *\n * Two traps are worth naming, because both bit this skin:\n *\n *  1. The workspace list's hover AND selected state come from one single token.\n *     ui-workspace writes `.projectRow:hover, .sessionRow:hover,\n *     .sessionRow.selected { background: var(--dsw-alias-interactive-bg-hover) }`,\n *     so whatever this skin does for hover it also does for \"selected\".\n *  2. Flipping `--dsw-alias-label-*` to white here — the obvious way to make\n *     text readable on the blue — makes it disappear again on every white card.\n *\n * The first version of this skin did both and produced white-on-#E4EDFA selected\n * rows. The fix is to stop flipping the ink and let the cards carry it (which is\n * what XP's task pane actually does), and to re-bind the *interactive* tokens\n * inside this scope so hover/selected stay light enough for dark ink.\n *\n * Popovers are portalled to <body>, so they are not caught by this scope.\n */\nbody[data-dsh-windowsxp] [class*='sidebarCol'] {\n  --dsw-alias-interactive-bg-hover: #dce9f9;\n  --dsw-alias-interactive-bg-active: #c7d8f0;\n  --dsw-alias-interactive-bg-hover-solid: #dce9f9;\n  --dsw-alias-interactive-bg-hover-accent: #d3e2f7;\n  --dsw-specific-sidebar-nav-item-active: var(--xp-pane-card);\n  --dsw-specific-sidebar-nav-item-active-accent: var(--xp-pane-card);\n  --dsw-specific-sidebar-nav-item-hover: var(--xp-pane-card-hover);\n  --dsh-scrollbar-thumb: #ffffffb3;\n  --dsh-scrollbar-thumb-hover: #ffffff;\n}\n\n/* Put the pane gradient back on top of the solid token (see the note on\n   `--dsw-specific-sidebar-fill`): the token carries the flat middle stop so the\n   Windows caption strip can read it, and the gradient is painted here instead,\n   where only ui-sidebar is listening. `background-image` rather than\n   `background`, so the solid colour underneath stays intact.\n *\n * The `>` is load-bearing: only the sidebar's own root sits directly inside the\n * layout column, so panels hosted *within* the sidebar keep their own surfaces.\n * If that structure ever changes this silently degrades to a flat blue pane,\n * which is still correct — just less pretty. */\nbody[data-dsh-windowsxp] [class*='sidebarCol'] > [class*='_root'] {\n  background-image: var(--xp-pane);\n}\n\n/* Task-pane buttons (`新会话`, the panel rows, the rail icons) are white cards. */\nbody[data-dsh-windowsxp] [class*='sidebarCol'] button:not(:disabled) {\n  background: var(--xp-pane-card);\n  border: 1px solid var(--xp-pane-card-border);\n  border-radius: 4px;\n  color: var(--xp-pane-ink);\n}\nbody[data-dsh-windowsxp] [class*='sidebarCol'] button:not(:disabled):hover {\n  background: var(--xp-pane-card-hover);\n}\nbody[data-dsh-windowsxp] [class*='sidebarCol'] button:not(:disabled):active {\n  background: #e2ebfb;\n  border-color: var(--xp-field-border);\n}\nbody[data-dsh-windowsxp] [class*='sidebarCol'] :is(input, textarea, select) {\n  border-radius: 3px;\n}\n\n/* One white card per list row. This is what gives the pane its separation:\n   ui-workspace's rows are transparent and borderless, so without this a column\n   of sessions reads as one undifferentiated block of text. `box-shadow` rather\n   than `border` on purpose — the rows set their own height and padding, and a\n   border would push the layout around.\n\n   These rules come AFTER the button rules above and repeat the button variant in\n   the selector list on purpose: a row that happens to be a <button> (search\n   results are) would otherwise tie on specificity and lose to the button rule,\n   painting a Luna gradient over the card. */\nbody[data-dsh-windowsxp] [class*='sidebarCol'] :is([class*='projectRow'], [class*='sessionRow'], [class*='searchResultRow']),\nbody[data-dsh-windowsxp] [class*='sidebarCol'] button:is([class*='projectRow'], [class*='sessionRow'], [class*='searchResultRow']) {\n  background: var(--xp-pane-card);\n  border-color: var(--xp-pane-card-border);\n  box-shadow: inset 0 0 0 1px var(--xp-pane-card-border);\n  color: var(--xp-pane-ink);\n  margin-bottom: 3px;\n}\n\n/* \"Which session am I in?\"\n *\n * ui-workspace marks it with `.sessionRow.selected`, but that rule is only\n * (0,2,0) — the plain row card above is (0,3,1) and flattens it, which is exactly\n * how one revision of this skin made every row look identical. Restored here,\n * and deliberately with the classic Windows solid selection rather than another\n * subtle tint: the current session has to be obvious at a glance.\n *\n * The label tokens are re-bound ON THE ROW, not via `color`, because descendants\n * read them directly — `.time` uses `--dsw-alias-label-tertiary`. */\nbody[data-dsh-windowsxp] [class*='sidebarCol'] :is([class*='projectRow'], [class*='sessionRow'], [class*='searchResultRow']):is([class*='selected'], [class*='folderActive']),\nbody[data-dsh-windowsxp] [class*='sidebarCol'] button:is([class*='projectRow'], [class*='sessionRow'], [class*='searchResultRow']):is([class*='selected'], [class*='folderActive']) {\n  background: var(--xp-highlight);\n  border-color: #1b4a94;\n  box-shadow: inset 0 0 0 1px #1b4a94;\n  color: #ffffff;\n  --dsw-alias-label-primary: #ffffff;\n  --dsw-alias-label-primary-bluish: #ffffff;\n  --dsw-alias-label-secondary: #eaf0ff;\n  --dsw-alias-label-tertiary: #eaf0ff;\n  --dsw-alias-label-caption: #dce9f9;\n  --dsw-alias-label-dimmed: #dce9f9;\n}\n\n/* Menus, dialogs and popovers: a beige Luna panel with a soft shadow. */\nbody[data-dsh-windowsxp] :is([data-menu-material], [role='menu'], [role='listbox'], [role='dialog'], [data-radix-popper-content-wrapper] > *) {\n  background: var(--xp-face);\n  border: 1px solid var(--xp-gray);\n  border-radius: 3px;\n  box-shadow: 0 3px 10px #00000033;\n  backdrop-filter: none;\n}\n\n/* ...but tooltips kept the pale yellow of the 9x era. */\nbody[data-dsh-windowsxp] :is([role='tooltip'], [data-tooltip], [data-dsw-tooltip]) {\n  background: #ffffe1;\n  border: 1px solid var(--xp-text);\n  border-radius: 0;\n  box-shadow: none;\n  color: var(--xp-text);\n}\n\n/* The rounded, gradient, blue Luna scrollbar. */\nbody[data-dsh-windowsxp] ::-webkit-scrollbar {\n  width: var(--dsh-scrollbar-width);\n  height: var(--dsh-scrollbar-width);\n}\nbody[data-dsh-windowsxp] ::-webkit-scrollbar-track {\n  background: #f1efe2;\n  box-shadow: inset 1px 0 #d6d2c2;\n}\nbody[data-dsh-windowsxp] ::-webkit-scrollbar-thumb {\n  background: linear-gradient(90deg, #dce4f5 0%, #c3d0ec 50%, #afc0e6 100%);\n  background-clip: border-box;\n  border: 1px solid #8fa5ce;\n  border-radius: 3px;\n}\nbody[data-dsh-windowsxp] ::-webkit-scrollbar-thumb:hover {\n  background: linear-gradient(90deg, #d2def7 0%, #b4c6ee 50%, #9fb4e4 100%);\n}\nbody[data-dsh-windowsxp] ::-webkit-scrollbar-corner {\n  background: var(--xp-face);\n}\n\n/* The boot screen before plugins mount. */\nbody[data-dsh-windowsxp] [data-dsh-boot] {\n  background-color: var(--xp-face);\n  color: var(--xp-text);\n}\n";

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
		const TOAST_CSS = "/* ============================================================================\n * In-page toast — the popup half of the Windows XP experience pack.\n *\n * Injected into a shadow root of the plugin's own host element, so the app's\n * stylesheets cannot reach it and it cannot leak styles back. It stays on-theme\n * anyway because colour, radius, shadow and font all read `--dsw-*` tokens:\n * custom properties inherit through a shadow boundary, so this card follows\n * whatever theme is active — including this package's own Luna palette.\n *\n * Two tones share the card. Green dot = a turn finished; amber dot = the agent\n * stopped and is waiting for an answer, matching the cue that plays with it.\n * ========================================================================= */\n\n:host {\n  position: fixed;\n  right: 16px;\n  bottom: 16px;\n  z-index: 2147483000;\n  pointer-events: auto;\n  animation: dsh-notify-in 160ms var(--ds-ease-in-out, ease-out);\n}\n\n@keyframes dsh-notify-in {\n  from {\n    opacity: 0;\n    transform: translateY(6px);\n  }\n  to {\n    opacity: 1;\n    transform: none;\n  }\n}\n\n.card {\n  box-sizing: border-box;\n  display: flex;\n  align-items: flex-start;\n  gap: 10px;\n  min-width: 232px;\n  max-width: 340px;\n  padding: 10px 12px;\n  border-radius: var(--dsw-radius-lg, 12px);\n  background: var(--dsw-alias-bg-overlay, #ffffff);\n  color: var(--dsw-alias-label-primary, #000000);\n  border: 1px solid var(--dsw-alias-border-l2, #0000001a);\n  box-shadow: var(--dsw-elevation-panel, 0 4px 16px #00000026);\n  font-family: var(--dsw-font-family, system-ui, sans-serif);\n  font-size: 13px;\n  line-height: 20px;\n  cursor: pointer;\n}\n\n.dot {\n  flex: none;\n  width: 8px;\n  height: 8px;\n  margin-top: 6px;\n  border-radius: 999px;\n  background: var(--dsw-alias-state-success-primary, #22c55e);\n}\n\n/* Waiting for an answer, not reporting a result. */\n.card.approval .dot {\n  background: var(--dsw-alias-state-warn-primary, #f59e0b);\n}\n\n.title {\n  font-weight: 500;\n}\n\n.body {\n  color: var(--dsw-alias-label-secondary, #000000a6);\n}\n";

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
