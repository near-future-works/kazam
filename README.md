# Kazam

An open-source **frame for small, self-contained design tools**. Each tool is one HTML file
that generates a visual you can tweak and export; the frame is an optional host that runs
many tools together with a shared switcher, theming, presets, and export.

See **[`CLAUDE.md`](CLAUDE.md)** for the contract (the source of truth for how tools and the
runtime talk), and [`tools/_template.html`](tools/_template.html) for the minimal tool shape.

## Layout

- `frame/` — the runtime (`kazam.js`) and host app (`index.html`).
- `tools/` — single-file tools (Shape Generator, Pixelator, Letterfall, …) plus the
  `_template.html` starter.
- `tests/` — runtime tests (`npm test`); `tsconfig.json` drives `npm run typecheck`.

## Running

No build step. Open any tool directly (e.g. `tools/dither-shape.html`), or serve the host
to switch between tools, theme, and export:

```sh
python3 -m http.server 4173   # then visit http://localhost:4173/frame/index.html
```
