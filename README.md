# Diagram Tools

Small, self-contained design generators. No build step — open the HTML file in a browser.

## Dither Shape Generator

[`dither-shape.html`](dither-shape.html) — generate a shape filled with ordered or organic dithered dots, then export it as a scalable SVG or a high-res PNG.

### Features

- **Shapes** — circle/ellipse, square, rectangle, triangle, diamond, pentagon, hexagon, star, with independent width and height.
- **Dither** — Uniform (ordered Bayer matrix) or Random (organic, jittered) patterns, with controls for density, dot size, grid spacing, and opacity. Density packs in a second interleaved lattice toward 100% for near-solid fills.
- **Fade** — directional or radial gradients (top/bottom/left/right, edges, centre) with adjustable amount and a curve control for tight edge/centre concentration.
- **Stroke** — toggle, width, and Inside / Center / Outside alignment that works on polygons as well as circles.
- **Colours** — Canvas, Background, and Foreground (dots + stroke) slots. Figma-style: clear a field to make it transparent.
- **Export** — SVG keeps every dot as a vector (`<circle>`) inside a real `<polygon>`/`<ellipse>`, so it scales cleanly in Figma; PNG exports at 1×/2×/4×.

### Usage

Open the file directly, or serve the folder locally:

```sh
python3 -m http.server 4173
# then visit http://localhost:4173/dither-shape.html
```
