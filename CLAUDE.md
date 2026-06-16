# Kazam

Kazam is an open-source **frame for small, self-contained design tools**. Each tool
is one HTML file that generates a visual (an SVG or canvas drawing) you can tweak and
export. The frame is an optional host that runs many tools together with shared chrome:
a tool switcher, consistent theming, presets, and unified export.

This file is the **living contract**. It is the source of truth for how tools and the
runtime talk to each other. Keep it updated as the contract firms up.

---

## The core model: tools are self-contained, the frame is optional

A **tool** is a single HTML file that works on its own when opened directly — its own
controls, preview, and export. The **frame** is a separate app that embeds tools and
drives them.

The same tool file must work in **both modes, with no edits**:

- **Standalone** — double-clicked / `file://`. The runtime boots a minimal shell:
  a settings panel built from the tool's schema, a preview stage, and export buttons.
- **Framed** — loaded by the frame in an `<iframe>`. The runtime suppresses its own
  chrome, exposes the tool's schema to the parent, and renders **only the preview**.
  The frame builds the controls and drives state over `postMessage`.

**Why iframes (decision).** The frame embeds each tool in an `<iframe>` and talks to it
over `postMessage`. The runtime inside the tool detects framing with
`window.self !== window.top` and switches mode. This was chosen over mounting tools into
a shared Shadow DOM because iframes give true isolation for free — no global DOM-ID or
SVG `clipPath`/`mask` collisions, no CSS bleed, no `window` sharing — which is exactly
the failure mode this architecture exists to prevent. Tools stay portable and can run
beside any number of others. (If a cleaner mechanism emerges, revisit here first.)

---

## The tool contract

A tool includes the runtime and registers itself with one call:

```html
<script src="../frame/kazam.js"></script>
<script>
Kazam.defineTool({
  id: 'dither-shape',          // unique, kebab-case; namespaces all IDs
  name: 'Shape Generator',
  version: 1,
  render: 'svg',               // 'svg' | 'canvas'

  groups: ['Geometry', 'Dither', 'Colour', 'Stroke'],   // section order (optional)

  settings: {                  // declarative — the frame builds the controls
    shape:   { type: 'select', label: 'Shape', group: 'Geometry',
               options: ['circle','square','triangle','star'], default: 'circle' },
    width:   { type: 'number', label: 'Width',  group: 'Geometry',
               default: 400, min: 40, max: 2000, step: 10, unit: 'px' },
    density: { type: 'slider', label: 'Density', group: 'Dither',
               default: 1, min: 0, max: 1, step: 0.01, format: 'percent' },
    fg:      { type: 'color',  label: 'Foreground', group: 'Colour',
               default: { hex: '#1f2e1c', opacity: 1 } },
    bg:      { type: 'color',  label: 'Background', group: 'Colour',
               default: null, optional: true },     // → "Add background" affordance
  },

  // svg: return an SVGElement. canvas: draw into ctx.canvas.
  build(state, ctx) {
    const svg = ctx.svg('svg', { width: state.width, height: state.width,
                                 viewBox: `0 0 ${state.width} ${state.width}` });
    // ...tool's own geometry + dither maths, using ctx.random / ctx.tokens...
    return svg;
  },

  // optional, for animated tools:
  duration: 0,                 // seconds; > 0 means animated
  frame(state, t, ctx) {},     // deterministic frame at time t ∈ [0, duration)

  exportFormats: ['svg', 'png'],
});
</script>
```

A tool owns **only**: the `settings` declaration and the `build`/`frame` function. Nothing
else. No panel CSS, no control wiring, no export code, no colour-field widgets, no token
block — all of that is runtime work.

### `settings` schema — field types and value shapes

The frame renders one control per field and stores its value in `state[key]`.

| `type`   | value shape                          | notes |
|----------|--------------------------------------|-------|
| `slider` | `number`                             | shown with a fill bar + drag-to-scrub; for 0–1 proportions |
| `number` | `number`                             | plain typed field, no slider; for absolute dimensions |
| `select` | `string`                             | `options: ['a','b']` or `[{value,label}]` |
| `color`  | `{ hex: string \| null, opacity: number }` | `hex:null` = transparent; `opacity` ∈ 0–1 |
| `toggle` | `boolean`                            | |
| `text`   | `string`                             | |

Common field keys: `label`, `default`, `group?`, `col?` (`'full'` | `'half'` — layout
hint; see below), `showIf?(state) → bool`, `help?`.
Numeric keys: `min`, `max`, `step`, `unit?` (e.g. `'px'`, `'%'`), `format?` (`'percent'`
displays a 0–1 value as 0–100). Color keys: `optional?` (renders an "Add …/remove"
affordance; an optional colour starts `null`).

**Layout.** `col: 'half'` marks a field as eligible to share a row. The **frame** packs
consecutive halves into two-up rows (as the original packed Density|Dot-size). The
**standalone shell** may render single-column and ignore the hint — the hint is advisory,
so the same schema looks right in both, just denser in the frame.

**Reserved for asset tools** (declared now, implemented when first needed — see *Non-settings
state* below): `image`, `points`/`path`.

### `ctx` — what the runtime hands the tool

`ctx` gives the tool everything it must **not** own itself:

```text
ctx = {
  width, height,   // output size in px (from the returned SVG, tool.size(state), or stage default)
  tokens,          // resolved theme tokens: { color:{bg,fg,muted,border,…}, space, radius, font }
  random,          // seeded PRNG — NEVER use Math.random:
                   //   random()            → float [0,1)
                   //   random.int(n)        → int [0,n)
                   //   random.range(a,b)    → float [a,b)
                   //   random.hash(...keys) → stable float [0,1) keyed by coords/salts
                   //                          (for spatial dithering — order-independent)
  seed,            // integer seed behind `random`
  mode,            // 'standalone' | 'framed'
  svg(tag, attrs)  // SVGElement factory (handles the SVG namespace for you)
  // canvas tools also get: ctx.canvas (sized to width×height) and ctx.ctx2d
  // frame(state,t,ctx): t is passed as the 2nd arg; ctx.random is reseeded per frame
}
```

Determinism is mandatory: identical `state` → identical output, in preview and export,
standalone and framed. That is only possible because randomness flows through
`ctx.random`/`ctx.random.hash` seeded from `ctx.seed`.

---

## Standalone vs framed: detection + `postMessage` protocol

`const framed = window.self !== window.top;` decides the mode. Messages are versioned and
namespaced (`kazam/*`). Blobs transfer via structured clone (no data-URL bloat).

**Tool (iframe) → Frame (parent)**

| message | payload |
|---|---|
| `kazam/ready` | `{ tool:{id,name,render,duration,exportFormats}, schema, state }` (resolved defaults) |
| `kazam/size` | `{ width, height }` — emitted after a render when output size changes |
| `kazam/export-result` | `{ requestId, format, ok, payload }` — `payload`: `{kind:'text',text}` or `{kind:'blob',blob}` |
| `kazam/error` | `{ message }` |

**Frame (parent) → Tool (iframe)**

| message | payload |
|---|---|
| `kazam/state` | `{ state }` — full settings object to render (patches may come later) |
| `kazam/tokens` | `{ tokens }` — theme/token push; tool re-applies CSS variables + re-renders |
| `kazam/export` | `{ requestId, format, scale }` — tool builds the artifact and replies |
| `kazam/seed` | `{ seed }` — optional reseed (e.g. a "randomise" button in the frame) |

Handshake: on load, a framed tool posts `kazam/ready`; the parent replies with the initial
`kazam/state` + `kazam/tokens`. Origin handling: for local `file://` development we use
`targetOrigin:'*'` and ignore any message missing the protocol version; tighten to a known
origin once tools are served (TODO). The schema→controls renderer lives in `kazam.js`, so
it is the *same code* whether the panel is drawn in the standalone shell or in the frame.

---

## Non-settings state (images, drawn paths) — the seam that broke before

**Principle: if it affects the output, it lives in the single `state` object, and `state`
is JSON-serialisable.** A tool never holds hidden state outside `state`. This is what makes
serialise / reload / presets / undo work uniformly, and it is the seam that broke in earlier
tools when assets lived off to the side.

- Scalars come from the schema fields above.
- **Assets** (images, drawn paths) come from reserved field types whose *value* is
  serialisable:
  - `image` → value `{ assetId, width, height }`; the bytes live in a runtime-owned asset
    store (id → Blob); JSON/Markdown presets inline them as base64 so presets stay portable.
  - `points` / `path` → value is a plain coordinate array, edited via a frame-hosted overlay.
- `build()` receives decoded forms (e.g. an `ImageBitmap` for an `image`) resolved by the
  runtime before the call, so tools never touch the asset store directly.

Phase 1 reserves these types and fixes the principle; they're implemented when the first
asset tool needs them.

---

## What the runtime owns (so tools stay tiny)

- **Settings panel** rendered from the schema (`slider`, `number`, `select`, `color`+opacity,
  `toggle`, `text` to start). Deletes the hand-wired control plumbing every tool re-implemented.
- **State store** holding the current settings object, with serialise / deserialise →
  reload-safety, undo/redo, and presets in one feature.
- **Presets**: export current state to JSON or Markdown (clipboard); load a state object back
  into the controls (the *apply-state-to-controls* path the Shape generator lacked).
- **Preview host**: a stage that mounts the tool's SVG/canvas and re-renders on state change.
- **Export & copy**: `download` and `copy` for SVG and PNG (later GIF/video). Owns the
  SVG→canvas rasterise path so no tool scrapes the DOM or touches the clipboard.
- **Theming & tokens**: one token set (shadcn-style HSL custom properties) for colour,
  spacing, type, radius, in light + dark; injected into tools so they reference tokens.
- **Seeded RNG** exposed via `ctx.random`.

---

## Repo layout

```text
/
├── CLAUDE.md              # this file — the living contract + worked example
├── README.md             # project overview
├── frame/
│   ├── kazam.js          # the runtime: defineTool, schema→controls, store, preview,
│   │                     #   export/copy, tokens, seeded RNG, standalone shell + iframe bridge
│   │                     #   (also injects component CSS + theme tokens — one <script> per tool)
│   └── index.html        # the frame host app: tool switcher, theming, presets  (Phase 4)
├── tools/
│   ├── _template.html    # minimal worked example — copy this to start a new tool
│   └── dither-shape.html # the Shape generator, ported onto the runtime          (Phase 3)
├── dither-shape.html     # the ORIGINAL monolith — reference/spec, ported then retired
└── .claude/launch.json   # local static-server config for the preview tooling
```

A tool includes the runtime with a single relative `<script src="../frame/kazam.js">`,
which also injects the shared CSS and theme tokens — so the only thing in a tool's `<head>`
is that one tag. Opening a tool on `file://` works because the path is relative and intact
within the repo. (A truly portable *single-file* build — runtime inlined — is an optional
authoring step, never required to run; see open question below.)

---

## Conventions & constraints

- Vanilla HTML/CSS/JS, runtime and tools. **No framework, no build step to run a tool.**
- Tools are single files. External deps: none by default; a CDN dep must be flagged first.
- Scope/namespace all DOM and SVG IDs — assume a tool runs beside others.
- **Determinism is mandatory**: seeded RNG only; never `Math.random` / `Date.now` in a tool.
- Keep this file the source of truth, with the minimal worked example always runnable.

---

## Resolved decisions

1. **Runtime include / distribution.** Dev: tools reference `../frame/kazam.js` (relative,
   works on `file://`, no build). Shipping a truly portable single file is an **optional
   inliner** step that bundles the runtime in — never required to run. Editing the runtime
   stays painless because dev uses the shared include.
2. **Settings layout.** The schema carries a `col: 'half'` hint. The **frame** uses it to
   pack two-up rows; the **standalone shell** may stay single-column (acceptable, and keeps
   the standalone file simple). Same schema, denser in the frame.
3. **Port fidelity (Phase 3).** The ported `tools/dither-shape.html` must reach **visual and
   feature parity** with the original `dither-shape.html` — same artwork, same controls —
   driven entirely by the runtime. That is the proof the contract is sufficient.

### Still open (not blocking)

- **Conditional fields.** `showIf(state)` is reserved but unused until a tool needs it.

---

## Build order / status

1. **Scaffold + contract** — this file, repo layout, worked example.  ← *current; awaiting sign-off*
2. Runtime, standalone first (`frame/kazam.js`): `defineTool`, schema→controls, store +
   serialise, preview host, export/copy, tokens, seeded RNG; render a standalone shell for a
   trivial tool.
3. Port the Shape generator to `tools/dither-shape.html` — keep only `buildSVG` + its geometry
   and dither maths; must match the original when opened directly.
4. Frame host (`frame/index.html`): list tools, embed via iframe + `postMessage`, add switcher,
   theming, presets. Same tool file works both ways, unchanged.
5. Generalise: add the `canvas` render target + a minimal canvas example.

> Work in small, reviewable steps and pause for sign-off between phases.
