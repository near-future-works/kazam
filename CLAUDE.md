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
| `toggle` | `boolean`                            | `header: true` → renders as an eye toggle in the section header |
| `text`   | `string`                             | |
| `image`  | `{ src(dataURL), width, height, name } \| null` | upload control; `build()` receives a decoded `{ bitmap, width, height }` (see below) |

Common field keys: `label`, `default`, `group?`, `col?` (`'full'` | `'half'` — layout
hint; see below), `showIf?(state) → bool`, `help?`.
Numeric keys: `min`, `max`, `step`, `unit?` (e.g. `'px'`, `'%'`), `format?` (`'percent'`
displays a 0–1 value as 0–100). Color keys: `optional?` (renders an "Add …/remove"
affordance; an optional colour starts `null`).

**Layout.** `col: 'half'` marks a field as eligible to share a row; the runtime packs
consecutive halves into two-up rows. Both the standalone shell and the frame honour the
hint identically (the same `buildPanel(..., pair)` path), so the panel looks the same in
either mode.

**Asset fields.** `image` is implemented (value stored as an inline base64 data URL so presets
stay portable; the runtime decodes it to an `ImageBitmap` before `build()`). `points`/`path`
remain reserved — see *Non-settings state* below.

**Animation.** A tool with `duration > 0` (seconds) and a `frame(state, t, ctx)` function is
animated: the runtime runs a `requestAnimationFrame` loop, shows a transport (play/scrub), and
exports GIF + WebM. `ctx` gains `t`, `frame` (index), `duration`, `fps`, and `live` (true only
during continuous playback — gate audio/side-effects on it, never during export or scrubbing).
Determinism holds per-frame because `ctx.random()` reseeds per frame while `ctx.random.hash(...)`
stays keyed to the base seed — so put motion in `t` and per-entity randomness in `hash`.

A tool with no fixed length can define `frameCount(state) → integer` to size the timeline
**dynamically**: the runtime uses it (recomputed on state change) for the transport range, the
exported frame count, and `ctx.duration` (= `frameCount/fps`). `duration` then only acts as a
hint that the tool is animated. Letterfall uses this to run until its physics settle. Set
`autoplay: false` on the tool to open paused instead of auto-playing.

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
├── index.html            # the frame host app: tool switcher, theming, presets — the entry point
│                         #   ("hit go" file after unzipping). References frame/kazam.js + tools/*.
├── frame/
│   └── kazam.js          # the runtime: defineTool, schema→controls, store, preview,
│                         #   export/copy, tokens, seeded RNG, standalone shell + iframe bridge
│                         #   (also injects component CSS + theme tokens — one <script> per tool)
├── tools/
│   ├── _template.html    # minimal worked example — copy this to start a new tool
│   └── dither-shape.html # the Shape generator, ported onto the runtime          (Phase 3)
└── .claude/launch.json   # local static-server config for the preview tooling
```

The host app lives at the repo **root** (`index.html`) so that unzipping the folder and
double-clicking it is the obvious way to start; it pulls in `frame/kazam.js` and embeds each
`tools/*.html` in an iframe.

A tool includes the runtime with a single relative `<script src="../frame/kazam.js">`,
which also injects the shared CSS and theme tokens — so the only thing in a tool's `<head>`
is that one tag. Opening a tool on `file://` works because the path is relative and intact
within the repo. (A truly portable *single-file* build — runtime inlined — is an optional
authoring step, never required to run; see open question below.)

**Standalone fallback.** Each tool ends with a tiny inline guard before `</body>`: if the
runtime global is missing (`typeof Kazam === 'undefined'` — e.g. the file was shared on its
own, away from its Kazam folder), it replaces the blank page with a short note explaining
what the file is and linking the repo. It is a no-op whenever the runtime loaded, and is the
one piece of boilerplate every tool carries beyond the `<head>` include. The blessed way to
share a single tool remains the frame's "Copy tool as HTML" (runtime inlined → needs nothing).

---

## The bundled tools are examples (delete freely)

The tools in `tools/` (Shape Generator, Pixelator, Image Dither, Orbits, Gradient Dither,
Letterfall) ship as **worked examples** — reference material, not a fixed product. A user is
expected to keep the ones they like, delete the rest, and fill `tools/` with their own. When
a user asks to remove an example tool, delete its `tools/*.html` file and its entry in the
`TOOLS` array in `index.html` — that's all it takes. Never treat the examples as load-bearing.

---

## Importing an existing tool a user already has

A common starting point: a user already has a single-file HTML generator (an SVG/canvas
"toy" they built with an agent, a CodePen export, a standalone widget) and wants it living
inside Kazam. Importing means **rewriting it onto the contract**, not pasting it in as-is:
pull its tweakable values up into a `settings` schema, move its drawing code into `build`
(or `frame` if it animates), and route all randomness through `ctx.random`. The original
control wiring, export code, and panel CSS are deleted — the runtime owns all of that now.

**What ports cleanly** (suggest these freely):

- Self-contained generators that draw an **SVG or `<canvas>`** from a handful of numbers,
  colours, and toggles — dither/pattern/gradient/poster/geometry tools. This is the sweet spot.
- Tools whose output is **deterministic** or can be made so by swapping `Math.random` for a
  seed. Determinism is mandatory here, so this swap is part of every import.
- Single-file tools with **no build step and no framework** — plain HTML/CSS/JS.
- Tools that take **one uploaded image** (use the `image` field) or that animate on a clock
  (use `duration` + `frame`).

**What fights the format** (flag honestly before starting):

- Anything needing a **build step, npm packages, or many source files** — React/Vue/Svelte
  apps, TypeScript projects, bundled dependencies. Porting means reimplementing in vanilla JS.
- Tools that **fetch from a network**, need an API key, or talk to a backend at runtime.
- **Heavy non-determinism or external state** (live data feeds, the system clock as input,
  persistent storage) — these break the "same settings → same output" guarantee.
- Rich **direct-manipulation canvases** (free drawing, node graphs) — the `points`/`path`
  input types are reserved for this but not built yet, so there's nothing to hang them on.
- Large CDN libraries (three.js, p5, etc.) — possible if flagged first (a CDN dep must be
  raised before adding), but it costs the single-file portability the format exists for.

**Sample prompts** a user can paste to their agent (and the shape to expect):

```text
Import the attached HTML tool into Kazam as tools/<name>.html. Read CLAUDE.md first,
copy tools/_template.html as the starting shape, and rewrite it onto the contract:
lift every value I might tweak into the settings schema, move the drawing into build(),
and replace any Math.random with ctx.random so it stays deterministic. Then add it to
the TOOLS list in index.html so the frame picks it up.
```

```text
I made this generator with another agent — here's the file. Before porting, tell me what
will and won't survive the move to Kazam's single-file, deterministic, no-build format,
and flag anything that needs a CDN library or a network call.
```

When importing, work in the same small, reviewable steps as building from scratch: schema
first, then `build`, then wire it into `index.html`, then check parity against the original.

---

## Conventions & constraints

- Vanilla HTML/CSS/JS, runtime and tools. **No framework, no build step to run a tool.**
- Tools are single files. External deps: none by default; a CDN dep must be flagged first.
- Scope/namespace all DOM and SVG IDs — assume a tool runs beside others.
- **Determinism is mandatory**: seeded RNG only; never `Math.random` / `Date.now` in a tool.
- Keep this file the source of truth, with the minimal worked example always runnable.

---

## Dev tooling (type-checking + tests — never ships)

The "no server, no terminal, no install to *run* a tool" promise is about the **shipped
files**. Authoring may use dev-only tooling, as long as the output stays plain HTML/JS/CSS.
Two checks exist; both are optional to run and invisible to a tool user:

- **Type-checking the contract.** `frame/contract.d.ts` is the machine-checkable form of this
  document — the settings `Field` union, `ToolDef`, `Ctx`, the store, and the `postMessage`
  messages as discriminated unions. `frame/kazam.js` opts in with `// @ts-check` and is checked
  against it (a typo'd `kazam/*` message name or a wrong `payload.kind` is now a type error, not
  a silent failure). Run `npm run typecheck` — `tsc` (fetched on demand via `npx`) emits nothing.
  Checking is **opt-in per file** via `// @ts-check`; `noImplicitAny` is off so internal closures
  stay terse, while `strictNullChecks` still catches the silent-failure class. **When you change
  the contract, update `contract.d.ts` and CLAUDE.md together** — they must agree.
- **Tests for the pure logic.** `tests/*.test.js` use Node's built-in test runner (zero deps):
  `npm test` (or `node --test`). They cover the seeded RNG determinism + hash order-independence,
  colour maths, the GIF encoder (LZW round-trip + median-cut), the field-display + store helpers,
  and the inliner. To make this possible without a build, `frame/kazam.js` is `require()`-able in
  Node: its two top-level DOM side-effects are guarded (`typeof document`/`window`), and it
  `module.exports` the pure helpers — all behind guards that are dead code in a browser, so the
  shipped/inlined path is byte-for-byte unaffected.

`package.json` holds only `devDependencies` (TypeScript) + these two scripts; `node_modules/`
is git-ignored. Nothing here is needed to open a tool.

---

## Resolved decisions

1. **Runtime include / distribution.** Dev: tools reference `../frame/kazam.js` (relative,
   works on `file://`, no build). Shipping a truly portable single file is an **optional
   inliner** step that bundles the runtime in — never required to run. Editing the runtime
   stays painless because dev uses the shared include.
2. **Settings layout.** The schema carries a `col: 'half'` hint, packed into two-up rows by
   the runtime. Standalone and frame share the same pairing path — no divergence (the brief
   single-column standalone was unified once it proved to add complexity, not remove it).
3. **Port fidelity (Phase 3).** The ported `tools/dither-shape.html` must reach **visual and
   feature parity** with the original `dither-shape.html` — same artwork, same controls —
   driven entirely by the runtime. That is the proof the contract is sufficient.

### Still open (not blocking)

- **Conditional fields.** `showIf(state)` is reserved but unused until a tool needs it.

---

## Build order / status

1. **Scaffold + contract** — this file, repo layout, worked example. ✅
2. **Runtime** (`frame/kazam.js`), standalone-first: `defineTool`, schema→controls, store +
   serialise, preview host, export/copy, tokens, seeded RNG. ✅
3. **Port the Shape generator** to `tools/dither-shape.html` — only `buildSVG` + its geometry
   and dither maths; full visual + feature parity when opened directly. ✅
4. **Frame host** (`index.html`, repo root): tool switcher, iframe + `postMessage`, two-up pairing,
   theming, presets, unified export. Same tool file works both ways, unchanged. ✅
5. **Generalise**: `canvas` render target + a minimal canvas tool
   (`tools/dither-gradient.html`). ✅

### Also built since

- **Frame host extras** — "Tool settings" disclosure (copy current settings as a Claude-ready
  prompt, copy/download the tool as a self-contained HTML, import a tool, load settings). The
  inliner ships via "Copy/Download tool as HTML".
- **Animation** — `duration` + `frame(state, t, ctx)`, transport, deterministic per-frame RNG,
  and **GIF (self-written encoder) + WebM (MediaRecorder)** export. Demo: `tools/orbits.html`.
- **Image upload** — the `image` asset field. Demo: `tools/image-dither.html`.
- **Swatches + preset launcher** — the `swatches` field (editable colour chips) and a `select`
  with `presets`/`writes` that seeds another field. Demo: `tools/pixelator.html`.
- **Dynamic timelines** — `frameCount(state)` sizes an animation to its content. Demo:
  `tools/letterfall.html`, a physics-driven poster generator (per-glyph outline + SAT collision)
  that precomputes its whole trajectory once per state (seeded, never `Math.random`) and runs
  until every letter settles.

### Not yet built (future)

- **`points`/`path` asset fields** — reserved; build when a drawing tool needs them.
- **Animated SVG export** — GIF/WebM currently cover canvas frames; SVG-animated tools rasterise
  per frame is a TODO.
- **Tighten `postMessage` origin** once tools are served from a known origin.

> Tools live in `tools/`; each is one HTML file = `defineTool({ settings, build })` + its maths.
> Everything else is the runtime. Work in small, reviewable steps; pause for sign-off between phases.
