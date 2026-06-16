# Kazam

An open-source **frame for small, self-contained design tools**. Each tool is one HTML file
that generates a visual you can tweak and export; the frame is an optional host that runs
many tools together with a shared switcher, theming, presets, and export.

See **[`CLAUDE.md`](CLAUDE.md)** for the contract (the source of truth for how tools and the
runtime talk), and [`tools/_template.html`](tools/_template.html) for the minimal tool shape.

## Layout

- `frame/` — the runtime (`kazam.js`) and host app (`index.html`).
- `tools/` — single-file tools, including the `_template.html` starter.
- `dither-shape.html` — the original monolithic Shape Generator. It implies this
  architecture and is the reference being extracted into the frame, then ported to
  `tools/dither-shape.html` as the first tool to run on the runtime.

## Status

Phase 1 (scaffold + contract). The runtime and ported tool land in later phases — see the
build order at the end of `CLAUDE.md`.

## The original tool (reference)

[`dither-shape.html`](dither-shape.html) generates a shape filled with ordered or organic
dithered dots and exports scalable SVG / high-res PNG. Open it directly, or serve locally:

```sh
python3 -m http.server 4173   # then visit http://localhost:4173/dither-shape.html
```
