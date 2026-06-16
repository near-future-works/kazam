# frame/

The Kazam runtime and host app. See [`../CLAUDE.md`](../CLAUDE.md) for the full contract.

- **`kazam.js`** *(Phase 2)* — the runtime included by every tool. Owns `defineTool`,
  schema→controls, the state store + serialise/deserialise, the preview host, export/copy,
  theme tokens, and the seeded RNG. Detects standalone vs framed (`window.self !== window.top`)
  and either boots a minimal shell or bridges to the frame over `postMessage`. Also injects
  the shared component CSS and theme tokens, so a tool needs only one `<script>` tag.
- **`index.html`** *(Phase 4)* — the host app: lists tools, embeds each in an iframe, and
  adds shared chrome (tool switcher, theming, presets, unified export).

Nothing here yet — these land in later phases, pending sign-off on the contract.
