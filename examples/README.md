# examples/

Worked examples. Reference material, not part of your tool set.

Open [`index.html`](index.html) in this folder to run them all in the frame. It is the
same frame as the one at the repo root, pointed at this folder instead of `../tools/`.

| File | Shows |
|------|-------|
| [`_template.html`](_template.html) | The minimal tool. **Copy this to start a new one.** |
| [`dither-shape.html`](dither-shape.html) | A full SVG tool: many settings, grouped sections, dither maths |
| [`dither-gradient.html`](dither-gradient.html) | The smallest `canvas` tool |
| [`image-dither.html`](image-dither.html) | The `image` upload field |
| [`pixelator.html`](pixelator.html) | The `swatches` field, and a `select` with `presets`/`writes` |
| [`orbits.html`](orbits.html) | Animation: `duration` + `frame(state, t, ctx)`, GIF and WebM export |
| [`letterfall.html`](letterfall.html) | A dynamic timeline via `frameCount(state)`, and seeded physics |
| [`showcase.html`](showcase.html) | Several images at once: a crossfading reel, exported as GIF or WebM |

## Using them

- **Learning the format** — read `_template.html` first, then whichever example does the
  thing you need. Each one is a single file: schema, then `build()`.
- **Starting a tool** — copy `_template.html` into `../tools/`, then add it to the `TOOLS`
  array in [`../index.html`](../index.html). See [`../tools/README.md`](../tools/README.md).
- **Keeping one** — copy the file into `../tools/` and list it there. Leave the original
  here, so the examples stay intact for the next tool you build.

Deleting anything in this folder is safe. Nothing else depends on it.
