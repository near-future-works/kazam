# frame/

The Kazam runtime. See [`../CLAUDE.md`](../CLAUDE.md) for the full contract.

- **`kazam.js`** — the runtime included by every tool. Owns `defineTool`,
  schema→controls, the state store + serialise/deserialise, the preview host, export/copy,
  theme tokens, and the seeded RNG. Detects standalone vs framed (`window.self !== window.top`)
  and either boots a minimal shell or bridges to the frame over `postMessage`. Also injects
  the shared component CSS and theme tokens, so a tool needs only one `<script>` tag.

The host app (tool switcher, theming, presets, unified export) lives at the repo root as
[`../index.html`](../index.html) — that's the entry point you open. It embeds each tool from
`../tools/` in an iframe and references `kazam.js` here.
