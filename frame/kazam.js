/*
 * Kazam runtime. See ../CLAUDE.md for the contract.
 *
 * One file, included by every tool via <script src="../frame/kazam.js">. It:
 *   - exposes Kazam.defineTool(def)
 *   - injects theme tokens (based on shadcn/ui) + component CSS
 *   - detects standalone vs framed (window.self !== window.top)
 *   - standalone: builds a settings panel from the schema, a preview stage, export/copy
 *   - framed (lean here; host arrives in Phase 4): renders preview only, bridges via postMessage
 *   - owns the state store (serialise/deserialise), seeded RNG, and SVG/PNG export
 *
 * Tools own only their settings declaration and build()/frame() function.
 */
(function () {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const PROTOCOL = 1;

  // ----------------------------------------------------------------- tokens
  // shadcn/ui default (neutral) palette. :root = light, .dark = dark overrides.
  const TOKEN_CSS = `
  .kz-root {
    --background: 0 0% 100%;
    --foreground: 240 10% 3.9%;
    --card: 0 0% 100%;
    --muted: 240 4.8% 95.9%;
    --muted-foreground: 240 3.8% 46.1%;
    --border: 240 5.9% 90%;
    --input: 240 5.9% 90%;
    --ring: 240 5.9% 10%;
    --primary: 240 5.9% 10%;
    --primary-foreground: 0 0% 98%;
    --secondary: 240 4.8% 95.9%;
    --secondary-foreground: 240 5.9% 10%;
    --radius: 0.5rem;
  }
  .kz-root.dark {
    --background: 240 10% 3.9%;
    --foreground: 0 0% 98%;
    --card: 240 10% 3.9%;
    --muted: 240 3.7% 15.9%;
    --muted-foreground: 240 5% 64.9%;
    --border: 240 3.7% 15.9%;
    --input: 240 3.7% 15.9%;
    --ring: 240 4.9% 83.9%;
    --primary: 0 0% 98%;
    --primary-foreground: 240 5.9% 10%;
    --secondary: 240 3.7% 15.9%;
    --secondary-foreground: 0 0% 98%;
  }`;

  // ------------------------------------------------------------- component CSS
  const COMPONENT_CSS = `
  .kz-root, .kz-root * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  .kz-app {
    font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    background: hsl(var(--background)); color: hsl(var(--foreground));
    display: grid; grid-template-columns: 340px 1fr; height: 100vh;
  }
  .kz-panel { background: hsl(var(--card)); border-right: 1px solid hsl(var(--border)); overflow-y: auto; }
  .kz-head { padding: 14px 16px 12px; }
  .kz-head h1 { font-size: 13px; font-weight: 600; margin: 0; }
  .kz-head .kz-sub { color: hsl(var(--muted-foreground)); font-size: 11px; line-height: 1.4; margin-top: 4px; }
  .kz-head .kz-titlerow { display: flex; align-items: center; gap: 8px; }
  .kz-badge { font-size: 10px; line-height: 1; letter-spacing: .3px; color: hsl(var(--muted-foreground) / .8);
    border: 1px solid hsl(var(--border)); border-radius: 999px; padding: 3px 7px; }
  .kz-section { padding: 14px 16px; border-top: 1px solid hsl(var(--border)); }
  .kz-section > * { margin: 0 0 12px; }
  .kz-section > *:last-child { margin-bottom: 0; }
  .kz-sechead { display: flex; align-items: center; justify-content: space-between; min-height: 22px; }
  .kz-sechead h2 { font-size: 13px; font-weight: 600; margin: 0; }
  .kz-vis { width: 24px; height: 24px; padding: 0; border: none; background: none; border-radius: 5px;
    display: inline-flex; align-items: center; justify-content: center; color: hsl(var(--muted-foreground)); cursor: pointer; }
  .kz-vis:hover { background: hsl(var(--secondary)); color: hsl(var(--foreground)); }
  .kz-vis svg { width: 15px; height: 15px; }
  .kz-vis[aria-pressed="false"] svg { opacity: .35; }
  .kz-flabel { display: block; font-size: 11px; color: hsl(var(--muted-foreground)); margin: 0 0 6px; }

  .kz-field {
    position: relative; overflow: hidden; display: flex; align-items: center; gap: 6px; height: 30px;
    background: hsl(var(--secondary)); border: 1px solid transparent;
    border-radius: calc(var(--radius) - 2px); padding: 0 8px;
  }
  .kz-field:focus-within { border-color: hsl(var(--ring)); }
  .kz-field .kz-pfx { color: hsl(var(--muted-foreground)); font-size: 12px; }
  .kz-field .kz-sfx { color: hsl(var(--muted-foreground)); font-size: 11px; }
  .kz-field input {
    flex: 1; min-width: 0; background: none; border: none; color: hsl(var(--foreground));
    font: inherit; padding: 0; font-variant-numeric: tabular-nums;
  }
  .kz-field input:focus { outline: none; }
  .kz-field.kz-scrub input { cursor: ew-resize; }
  .kz-field.kz-scrub input:focus { cursor: text; }
  .kz-field.kz-scrub::after {
    content: ""; position: absolute; left: 0; bottom: 0; height: 2px;
    width: var(--fill, 0%); background: hsl(var(--muted-foreground) / .5); pointer-events: none;
  }
  .kz-field.kz-scrubbing::after, .kz-field:focus-within.kz-scrub::after { background: hsl(var(--ring)); }
  body.kz-scrubbing, body.kz-scrubbing * { user-select: none; cursor: ew-resize !important; }

  input[type="number"].kz-num { appearance: textfield; -moz-appearance: textfield; }
  input[type="number"].kz-num::-webkit-outer-spin-button,
  input[type="number"].kz-num::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }

  .kz-select {
    width: 100%; height: 30px; padding: 0 26px 0 8px;
    appearance: none; -webkit-appearance: none; -moz-appearance: none;
    background-color: hsl(var(--secondary));
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none' stroke='%23a1a1aa' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 4.5 6 7.5 9 4.5'/%3E%3C/svg%3E");
    background-repeat: no-repeat; background-position: right 8px center;
    border: 1px solid transparent; color: hsl(var(--foreground));
    border-radius: calc(var(--radius) - 2px); font: inherit; cursor: pointer;
  }
  .kz-select:focus { outline: none; border-color: hsl(var(--ring)); }

  .kz-toggle { display: flex; align-items: center; justify-content: space-between; }
  .kz-toggle .kz-tlabel { color: hsl(var(--foreground)); }
  .kz-switch { width: 34px; height: 20px; border-radius: 999px; background: hsl(var(--input));
    position: relative; cursor: pointer; border: none; padding: 0; transition: background .15s; }
  .kz-switch::after { content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px;
    border-radius: 50%; background: hsl(var(--background)); transition: left .15s; }
  .kz-switch[aria-checked="true"] { background: hsl(var(--primary)); }
  .kz-switch[aria-checked="true"]::after { left: 16px; }

  /* colour field: swatch · hex | opacity */
  .kz-color-row { display: flex; align-items: center; gap: 8px; }
  .kz-cfield {
    position: relative; overflow: hidden; flex: 1; min-width: 0; height: 30px;
    display: flex; align-items: center; padding: 0 0 0 5px;
    background: hsl(var(--secondary)); border: 1px solid transparent; border-radius: calc(var(--radius) - 2px);
  }
  .kz-cfield:focus-within { border-color: hsl(var(--ring)); }
  .kz-swatch { width: 18px; height: 18px; flex: none; margin-right: 7px; padding: 0; cursor: pointer;
    border: 1px solid hsl(var(--input)); border-radius: 4px; background-clip: padding-box; }
  .kz-cfield .kz-hex { flex: 1; min-width: 0; background: none; border: none; color: hsl(var(--foreground));
    font: inherit; padding: 0 8px 0 0; text-transform: lowercase; }
  .kz-cfield .kz-hex:focus { outline: none; }
  .kz-divline { width: 1px; align-self: stretch; flex: none; background: hsl(var(--background)); }
  .kz-opwrap { position: relative; align-self: stretch; flex: none; width: 64px; display: flex; align-items: center; padding: 0 8px; }
  .kz-opwrap::after { content: ""; position: absolute; left: 0; bottom: 0; height: 2px;
    width: var(--fill, 100%); background: hsl(var(--muted-foreground) / .5); pointer-events: none; }
  .kz-opwrap.kz-scrubbing::after, .kz-cfield:focus-within .kz-opwrap::after { background: hsl(var(--ring)); }
  .kz-opwrap .kz-opac { flex: 1; min-width: 0; background: none; border: none; color: hsl(var(--foreground));
    font: inherit; padding: 0; text-align: left; cursor: ew-resize; font-variant-numeric: tabular-nums; }
  .kz-opwrap .kz-opac:focus { outline: none; cursor: text; }
  .kz-opwrap .kz-sfx { color: hsl(var(--muted-foreground)); font-size: 11px; }
  .kz-picker { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; border: none; }
  .kz-add {
    display: flex; align-items: center; gap: 7px; width: 100%; height: 30px; padding: 0 10px;
    background: none; border: 1px dashed hsl(var(--border)); border-radius: calc(var(--radius) - 2px);
    color: hsl(var(--muted-foreground)); font: inherit; cursor: pointer; text-align: left;
  }
  .kz-add:hover { border-color: hsl(var(--ring)); color: hsl(var(--foreground)); }
  .kz-add .kz-plus { font-size: 15px; line-height: 1; }
  .kz-rm { width: 22px; height: 22px; flex: none; display: inline-flex; align-items: center; justify-content: center;
    background: none; border: none; border-radius: 4px; color: hsl(var(--muted-foreground)); font-size: 16px; cursor: pointer; }
  .kz-rm:hover { background: hsl(var(--secondary)); color: hsl(var(--foreground)); }

  .kz-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }

  .kz-btnrow { display: flex; gap: 8px; align-items: center; }
  .kz-btn { flex: 1; height: 32px; background: hsl(var(--secondary)); color: hsl(var(--secondary-foreground));
    border: 1px solid transparent; border-radius: calc(var(--radius) - 2px); padding: 0 10px; font: inherit; cursor: pointer; }
  .kz-btn:hover { border-color: hsl(var(--ring)); }
  .kz-btn.kz-primary { background: hsl(var(--primary)); border-color: hsl(var(--primary)); color: hsl(var(--primary-foreground)); font-weight: 600; }
  .kz-scale { width: auto; flex: 0 0 auto; }
  .kz-mini { background: none; border: none; color: hsl(var(--muted-foreground)); font: inherit; cursor: pointer; padding: 2px 4px; }
  .kz-mini:hover { color: hsl(var(--foreground)); }

  /* stage */
  .kz-stage {
    position: relative; display: flex; align-items: center; justify-content: center; padding: 40px; overflow: auto;
    background:
      linear-gradient(45deg, hsl(240 6% 9%) 25%, transparent 25%),
      linear-gradient(-45deg, hsl(240 6% 9%) 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, hsl(240 6% 9%) 75%),
      linear-gradient(-45deg, transparent 75%, hsl(240 6% 9%) 75%);
    background-size: 22px 22px; background-position: 0 0, 0 11px, 11px -11px, -11px 0;
    background-color: hsl(240 8% 6%);
  }
  .kz-fill { position: absolute; inset: 0; z-index: 0; pointer-events: none; }
  .kz-mount { position: relative; z-index: 1; line-height: 0; }
  .kz-mount svg, .kz-mount canvas { display: block; max-width: 100%; }

  /* preview backdrop control (the artwork's stage colour; not exported) */
  .kz-pbg { position: absolute; top: 10px; left: 10px; z-index: 2; display: flex; align-items: center; gap: 4px;
    background: hsl(var(--card) / .25); border: 1px solid hsl(var(--border) / .5); border-radius: calc(var(--radius) - 2px); padding: 4px; }
  .kz-pbg-sw { width: 20px; height: 20px; flex: none; padding: 0; cursor: pointer; border: 1px solid hsl(var(--input)); border-radius: 4px; background-clip: padding-box; }
  .kz-pbg-clear { width: 18px; height: 20px; border: none; background: none; color: hsl(var(--muted-foreground)); cursor: pointer; font-size: 14px; }
  .kz-pbg-clear:hover { color: hsl(var(--foreground)); }

  /* playback transport (animated tools only) */
  .kz-transport { position: absolute; left: 50%; bottom: 16px; transform: translateX(-50%); z-index: 3;
    display: flex; align-items: center; gap: 10px; padding: 6px 12px 6px 8px; min-width: 280px; max-width: 70%;
    background: hsl(var(--card) / .82); border: 1px solid hsl(var(--border)); border-radius: 999px; }
  .kz-tbtn { width: 26px; height: 26px; flex: none; display: inline-flex; align-items: center; justify-content: center;
    background: none; border: none; color: hsl(var(--foreground)); cursor: pointer; padding: 0; border-radius: 50%; }
  .kz-tbtn:hover { background: hsl(var(--secondary)); }
  .kz-tscrub { flex: 1; min-width: 120px; accent-color: hsl(var(--primary)); }
  .kz-ttime { color: hsl(var(--muted-foreground)); font-size: 11px; font-variant-numeric: tabular-nums; min-width: 70px; text-align: right; }`;

  let stylesInjected = false;
  function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    document.documentElement.classList.add("kz-root", "dark");
    const style = document.createElement("style");
    style.textContent = TOKEN_CSS + COMPONENT_CSS;
    document.head.appendChild(style);
  }

  function resolveTokens() {
    const cs = getComputedStyle(document.documentElement);
    const t = k => `hsl(${cs.getPropertyValue("--" + k).trim()})`;
    return {
      color: {
        background: t("background"), foreground: t("foreground"),
        muted: t("muted"), mutedForeground: t("muted-foreground"),
        border: t("border"), primary: t("primary"), secondary: t("secondary"),
      },
      radius: cs.getPropertyValue("--radius").trim(),
    };
  }

  // ------------------------------------------------------------- seeded RNG
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function makeRandom(streamSeed, hashSeed) {
    streamSeed = streamSeed >>> 0;
    hashSeed = (hashSeed == null ? streamSeed : hashSeed) >>> 0;
    const next = mulberry32(streamSeed);
    const random = () => next();
    random.int = n => Math.floor(next() * n);
    random.range = (a, b) => a + next() * (b - a);
    // order-independent spatial hash, keyed by integer coords/salts. Uses the
    // base (frame-independent) seed, so per-entity randomness stays stable while
    // an animation plays — motion should come from `t`, not from a reseed.
    random.hash = function (...keys) {
      let h = (hashSeed ^ 0x9e3779b9) >>> 0;
      for (let i = 0; i < keys.length; i++) {
        h = (Math.imul(h ^ (keys[i] | 0), 0x01000193) >>> 0);
        h ^= h >>> 13;
      }
      h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
      return (h >>> 0) / 4294967296;
    };
    return random;
  }

  // ------------------------------------------------------------- colour utils
  const isTransparent = v => !v || (typeof v === "string" && (!v.trim() || v.trim().toLowerCase() === "none"));
  function normHex(v) {
    v = (v || "").trim();
    if (/^#?[0-9a-fA-F]{6}$/.test(v)) return (v[0] === "#" ? v : "#" + v).toLowerCase();
    return null;
  }
  const CHECKER = "repeating-conic-gradient(#9aa0ac 0% 25%, #f5f6f8 0% 50%) 50% / 12px 12px";
  function colorToCss(c) {
    if (!c || isTransparent(c.hex)) return null;
    const h = normHex(c.hex) || c.hex;
    if (c.opacity == null || c.opacity >= 1) return h;
    const n = parseInt(h.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.round(c.opacity * 1000) / 1000})`;
  }

  // ------------------------------------------------------------- field display
  function fieldDecimals(field) {
    const step = field.format === "percent" ? (field.step || 1) * 100 : (field.step || 1);
    const s = String(step);
    return s.includes(".") ? s.split(".")[1].length : 0;
  }
  function toDisplay(field, v) {
    let d = field.format === "percent" ? v * 100 : v;
    const dec = fieldDecimals(field);
    return dec ? +d.toFixed(dec) : Math.round(d);
  }
  const fromDisplay = (field, d) => (field.format === "percent" ? d / 100 : d);
  const fieldUnit = field => field.unit || (field.format === "percent" ? "%" : "");

  // ------------------------------------------------------------- state store
  function resolveDefaults(settings) {
    const state = {};
    for (const key in settings) {
      const f = settings[key];
      state[key] = f.default !== undefined ? clone(f.default) : null;
    }
    return state;
  }
  const clone = v => (v && typeof v === "object" ? JSON.parse(JSON.stringify(v)) : v);

  function createStore(defaults) {
    let state = clone(defaults);
    const subs = new Set();
    const emit = key => subs.forEach(fn => fn(state, key));
    return {
      get: () => state,
      set(key, value) { state = Object.assign({}, state, { [key]: value }); emit(key); },
      replace(next) { state = Object.assign({}, clone(defaults), next); emit(null); },
      subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
      serialise: () => JSON.stringify(state, null, 2),
      deserialise(json) { try { this.replace(JSON.parse(json)); return true; } catch (e) { return false; } },
    };
  }

  // ------------------------------------------------------------- drag-to-scrub
  function attachScrub(input, container, handle, getV, setV, getFill) {
    const refreshFill = () => { const f = getFill(); if (f != null) container.style.setProperty("--fill", f * 100 + "%"); };
    refreshFill();
    handle.addEventListener("pointerdown", e => {
      if (e.button !== 0) return;
      const startX = e.clientX, startV = getV();
      let scrubbing = false;
      const move = ev => {
        const dx = ev.clientX - startX;
        if (!scrubbing) { if (Math.abs(dx) < 3) return; scrubbing = true; container.classList.add("kz-scrubbing"); document.body.classList.add("kz-scrubbing"); input.blur(); }
        ev.preventDefault();
        setV(startV, dx);
        refreshFill();
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        container.classList.remove("kz-scrubbing"); document.body.classList.remove("kz-scrubbing");
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    });
    return refreshFill;
  }

  // ------------------------------------------------------------- field renderers
  // Each returns { node, refresh } — refresh() pulls the value back from the store.
  function renderNumeric(key, field, store, isSlider) {
    const wrap = document.createElement("div");
    if (field.col) wrap.dataset.col = field.col;
    const label = document.createElement("label"); label.className = "kz-flabel"; label.textContent = field.label || key;
    const fieldEl = document.createElement("div"); fieldEl.className = "kz-field" + (isSlider ? " kz-scrub" : "");
    const input = document.createElement("input"); input.type = "number"; input.className = "kz-num";
    input.min = field.format === "percent" ? field.min * 100 : field.min;
    input.max = field.format === "percent" ? field.max * 100 : field.max;
    input.step = field.format === "percent" ? (field.step || 1) * 100 : (field.step || 1);
    const sfx = fieldUnit(field);
    fieldEl.appendChild(input);
    if (sfx) { const s = document.createElement("span"); s.className = "kz-sfx"; s.textContent = sfx; fieldEl.appendChild(s); }
    wrap.appendChild(label); wrap.appendChild(fieldEl);

    const setFromDisplay = d => {
      let v = fromDisplay(field, d);
      v = Math.max(field.min, Math.min(field.max, v));
      store.set(key, v);
    };
    const fillFrac = () => (store.get()[key] - field.min) / (field.max - field.min);

    input.addEventListener("input", () => { if (input.value !== "") setFromDisplay(+input.value); });
    if (isSlider) {
      const step = field.step || 1;
      const dec = String(step).includes(".") ? String(step).split(".")[1].length : 0;
      attachScrub(input, fieldEl, fieldEl,
        () => store.get()[key],
        (startV, dx) => {
          const pxStep = (field.max - field.min) / 260;
          let v = Math.round((startV + dx * pxStep) / step) * step;
          v = Math.max(field.min, Math.min(field.max, v));
          v = dec ? +v.toFixed(dec) : v;
          store.set(key, v);
          input.value = toDisplay(field, v);
        },
        fillFrac);
    }
    const refresh = () => {
      if (document.activeElement !== input) input.value = toDisplay(field, store.get()[key]);
      if (isSlider) fieldEl.style.setProperty("--fill", Math.max(0, Math.min(1, fillFrac())) * 100 + "%");
    };
    refresh();
    return { node: wrap, refresh };
  }

  function renderSelect(key, field, store) {
    const wrap = document.createElement("div");
    if (field.col) wrap.dataset.col = field.col;
    const label = document.createElement("label"); label.className = "kz-flabel"; label.textContent = field.label || key;
    const sel = document.createElement("select"); sel.className = "kz-select";
    (field.options || []).forEach(opt => {
      const o = document.createElement("option");
      const value = typeof opt === "object" ? opt.value : opt;
      o.value = value; o.textContent = typeof opt === "object" ? opt.label : opt;
      sel.appendChild(o);
    });
    sel.addEventListener("change", () => store.set(key, sel.value));
    wrap.appendChild(label); wrap.appendChild(sel);
    const refresh = () => { sel.value = store.get()[key]; };
    refresh();
    return { node: wrap, refresh };
  }

  function renderToggle(key, field, store) {
    const wrap = document.createElement("div"); wrap.className = "kz-toggle";
    const label = document.createElement("span"); label.className = "kz-tlabel"; label.textContent = field.label || key;
    const sw = document.createElement("button"); sw.type = "button"; sw.className = "kz-switch";
    sw.addEventListener("click", () => store.set(key, !store.get()[key]));
    wrap.appendChild(label); wrap.appendChild(sw);
    const refresh = () => sw.setAttribute("aria-checked", String(!!store.get()[key]));
    refresh();
    return { node: wrap, refresh };
  }

  const EYE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>';
  // a toggle mounted in the section header (e.g. an eye to enable/disable a section)
  function renderHeaderToggle(key, field, store) {
    const btn = document.createElement("button"); btn.type = "button"; btn.className = "kz-vis"; btn.title = field.label || key;
    btn.innerHTML = EYE_SVG;
    btn.addEventListener("click", () => store.set(key, !store.get()[key]));
    const refresh = () => btn.setAttribute("aria-pressed", String(!!store.get()[key]));
    refresh();
    return { node: btn, refresh };
  }

  function renderText(key, field, store) {
    const wrap = document.createElement("div");
    const label = document.createElement("label"); label.className = "kz-flabel"; label.textContent = field.label || key;
    const fieldEl = document.createElement("div"); fieldEl.className = "kz-field";
    const input = document.createElement("input"); input.type = "text";
    input.addEventListener("input", () => store.set(key, input.value));
    fieldEl.appendChild(input); wrap.appendChild(label); wrap.appendChild(fieldEl);
    const refresh = () => { if (document.activeElement !== input) input.value = store.get()[key] || ""; };
    refresh();
    return { node: wrap, refresh };
  }

  function renderColor(key, field, store) {
    const row = document.createElement("div"); row.className = "kz-color-row";
    const clabel = document.createElement("span"); clabel.className = "kz-flabel"; clabel.style.margin = "0"; clabel.style.width = "84px"; clabel.style.flex = "none"; clabel.textContent = field.label || key;

    const cfield = document.createElement("div"); cfield.className = "kz-cfield";
    const swatch = document.createElement("button"); swatch.type = "button"; swatch.className = "kz-swatch";
    const hex = document.createElement("input"); hex.type = "text"; hex.className = "kz-hex"; hex.placeholder = "None";
    const divline = document.createElement("span"); divline.className = "kz-divline";
    const opwrap = document.createElement("span"); opwrap.className = "kz-opwrap";
    const opac = document.createElement("input"); opac.type = "number"; opac.className = "kz-num kz-opac"; opac.min = 0; opac.max = 100;
    const opsfx = document.createElement("span"); opsfx.className = "kz-sfx"; opsfx.textContent = "%";
    const picker = document.createElement("input"); picker.type = "color"; picker.className = "kz-picker"; picker.value = "#ffffff";
    opwrap.appendChild(opac); opwrap.appendChild(opsfx);
    cfield.append(swatch, hex, divline, opwrap, picker);

    // optional colour: "Add …" affordance. Removal is non-destructive — clearing the
    // hex field sets it to None, which collapses the row back to the add button.
    const addBtn = document.createElement("button"); addBtn.type = "button"; addBtn.className = "kz-add";
    addBtn.innerHTML = `<span class="kz-plus">+</span>${field.addLabel || ("Add " + (field.label || key).toLowerCase())}`;

    const get = () => store.get()[key];
    const present = () => { const c = get(); return c && !isTransparent(c.hex); };
    const setColor = patch => { const c = get() || { hex: "#ffffff", opacity: 1 }; store.set(key, Object.assign({}, c, patch)); };

    swatch.addEventListener("click", () => picker.click());
    picker.addEventListener("input", () => setColor({ hex: picker.value }));
    hex.addEventListener("input", () => {
      const n = normHex(hex.value);
      if (isTransparent(hex.value)) store.set(key, field.optional ? null : { hex: null, opacity: (get() && get().opacity) ?? 1 });
      else setColor({ hex: n || hex.value });
    });
    opac.addEventListener("input", () => { if (opac.value !== "") setColor({ opacity: Math.max(0, Math.min(1, +opac.value / 100)) }); });
    attachScrub(opac, opwrap, opwrap,
      () => (get() ? (get().opacity ?? 1) : 1),
      (startV, dx) => { let v = Math.max(0, Math.min(1, startV + dx / 260)); v = Math.round(v * 100) / 100; setColor({ opacity: v }); opac.value = Math.round(v * 100); },
      () => (get() ? (get().opacity ?? 1) : 1));
    addBtn.addEventListener("click", () => store.set(key, { hex: picker.value || "#ffffff", opacity: 1 }));

    row.append(clabel, cfield);

    const container = document.createElement("div");
    container.append(row);
    if (field.optional) container.append(addBtn);

    const refresh = () => {
      const c = get();
      const transparent = !present();
      swatch.style.background = transparent ? CHECKER : (normHex(c.hex) || c.hex);
      if (document.activeElement !== hex) hex.value = transparent ? "" : (c.hex || "");
      const op = c ? (c.opacity ?? 1) : 1;
      if (document.activeElement !== opac) opac.value = Math.round(op * 100);
      opwrap.style.setProperty("--fill", Math.round(op * 100) + "%");
      if (field.optional) {
        const has = c !== null && c !== undefined;
        row.style.display = has ? "flex" : "none";
        addBtn.style.display = has ? "none" : "flex";
      }
    };
    refresh();
    return { node: container, refresh };
  }

  function renderField(key, field, store) {
    switch (field.type) {
      case "slider": return renderNumeric(key, field, store, true);
      case "number": return renderNumeric(key, field, store, false);
      case "select": return renderSelect(key, field, store);
      case "color": return renderColor(key, field, store);
      case "toggle": return renderToggle(key, field, store);
      case "text": return renderText(key, field, store);
      default: { const d = document.createElement("div"); d.textContent = "Unsupported field: " + field.type; return { node: d, refresh() {} }; }
    }
  }

  // ------------------------------------------------------------- panel
  function inferGroups(settings, declared) {
    if (declared && declared.length) return declared;
    const seen = [];
    for (const k in settings) { const g = settings[k].group || "Settings"; if (!seen.includes(g)) seen.push(g); }
    return seen;
  }

  function buildPanel(panel, tool, store, pair) {
    const settings = tool.settings || {};
    const groups = inferGroups(settings, tool.groups);
    const byKey = {};
    groups.forEach(group => {
      const keys = Object.keys(settings).filter(k => (settings[k].group || "Settings") === group);
      if (!keys.length) return;
      const section = document.createElement("div"); section.className = "kz-section";
      const head = document.createElement("div"); head.className = "kz-sechead";
      const h2 = document.createElement("h2"); h2.textContent = group; head.appendChild(h2);
      // header-mounted toggles (e.g. an eye that enables/disables the section)
      keys.filter(k => settings[k].header).forEach(k => {
        const r = renderHeaderToggle(k, settings[k], store); byKey[k] = r.refresh; head.appendChild(r.node);
      });
      section.appendChild(head);

      // Pack consecutive 'half' body fields into two-up rows.
      const bodyKeys = keys.filter(k => !settings[k].header);
      let i = 0;
      while (i < bodyKeys.length) {
        const key = bodyKeys[i], field = settings[key];
        const r = renderField(key, field, store); byKey[key] = r.refresh;
        if (pair && field.col === "half" && i + 1 < bodyKeys.length && settings[bodyKeys[i + 1]].col === "half") {
          const k2 = bodyKeys[i + 1];
          const r2 = renderField(k2, settings[k2], store); byKey[k2] = r2.refresh;
          const pairEl = document.createElement("div"); pairEl.className = "kz-pair";
          pairEl.append(r.node, r2.node); section.appendChild(pairEl); i += 2;
        } else { section.appendChild(r.node); i += 1; }
      }
      panel.appendChild(section);
    });
    // refresh a field's DOM whenever its own value changes, or all on a full replace
    store.subscribe((_s, changedKey) => {
      if (changedKey === null) Object.keys(byKey).forEach(k => byKey[k]());
      else if (byKey[changedKey]) byKey[changedKey]();
    });
    return byKey;
  }

  // ------------------------------------------------------------- preview + ctx
  function sizeFromSvg(el) {
    const w = +el.getAttribute("width"), h = +el.getAttribute("height");
    return { width: w || 0, height: h || 0 };
  }
  function makeCtx(tool, state, mode, opts) {
    opts = opts || {};
    const baseSeed = (state.seed != null ? state.seed : (tool.seed != null ? tool.seed : 1)) >>> 0;
    // animated frames get a per-frame stream seed (so ctx.random() noise varies
    // per frame); ctx.random.hash stays keyed to the base seed (stable per entity).
    const streamSeed = opts.animated ? ((baseSeed ^ Math.imul((opts.frameIndex | 0) + 1, 0x9e3779b9)) >>> 0) : baseSeed;
    let uid = 0;
    return {
      tokens: resolveTokens(),
      random: makeRandom(streamSeed, baseSeed),
      seed: baseSeed, mode,
      t: opts.t || 0, frame: opts.frameIndex || 0, duration: tool.duration || 0, fps: tool.fps || 30,
      uid: (name) => `${tool.id}-${name || "id"}-${uid++}`,
      svg: (tag, attrs) => { const el = document.createElementNS(SVG_NS, tag); if (attrs) for (const k in attrs) el.setAttribute(k, attrs[k]); return el; },
      colorToCss,
    };
  }

  function createPreview(mount, tool, store, mode) {
    const animated = (tool.duration || 0) > 0 && typeof tool.frame === "function";
    const fps = tool.fps || 30;
    const totalFrames = Math.max(1, Math.round((tool.duration || 0) * fps));
    const sub = new Set();               // frame listeners (transport sync)
    let current = null, canvas = null, ctx2d = null, cw = 0, ch = 0;
    let pos = 0, playing = false, rafId = null, lastTs = 0;

    function sizeOf(state, el) {
      if (tool.size) return tool.size(state);
      if (tool.render === "canvas") return { width: 600, height: 600 };
      return el ? sizeFromSvg(el) : { width: 600, height: 600 };
    }
    // Render a specific frame index. Static tools (animated=false) ignore idx.
    function renderAt(idx) {
      const state = store.get();
      const t = animated ? idx / fps : 0;
      const ctx = makeCtx(tool, state, mode, { frameIndex: idx, t, animated });
      if (tool.render === "canvas") {
        const s = sizeOf(state);
        if (!canvas) { canvas = document.createElement("canvas"); ctx2d = canvas.getContext("2d"); }
        if (cw !== s.width || ch !== s.height) { canvas.width = s.width; canvas.height = s.height; cw = s.width; ch = s.height; }
        ctx.width = s.width; ctx.height = s.height; ctx.canvas = canvas; ctx.ctx2d = ctx2d;
        if (animated) tool.frame(state, t, ctx); else if (tool.build) tool.build(state, ctx); else tool.frame(state, 0, ctx);
        if (current !== canvas) { mount.replaceChildren(canvas); current = canvas; } // mount once; reuse across frames
      } else {
        const el = animated ? tool.frame(state, t, ctx) : (tool.build ? tool.build(state, ctx) : tool.frame(state, 0, ctx));
        const s = sizeOf(state, el); ctx.width = s.width; ctx.height = s.height;
        mount.replaceChildren(el); current = el;
      }
      sub.forEach(fn => fn(idx, totalFrames, t));
      return current;
    }
    function render() { return renderAt(animated ? Math.floor(pos) % totalFrames : 0); }
    function tick(ts) {
      if (!playing) return;
      if (!lastTs) lastTs = ts;
      pos = (pos + ((ts - lastTs) / 1000) * fps) % totalFrames; lastTs = ts;
      renderAt(Math.floor(pos));
      rafId = requestAnimationFrame(tick);
    }
    function play() { if (!animated || playing) return; playing = true; lastTs = 0; rafId = requestAnimationFrame(tick); }
    function pause() { playing = false; if (rafId) cancelAnimationFrame(rafId); rafId = null; }
    function seek(idx) { pause(); pos = idx; renderAt(idx); }

    return {
      render, renderAt, get current() { return current; },
      animated, totalFrames, fps,
      play, pause, seek, onFrame(fn) { sub.add(fn); }, get playing() { return playing; },
    };
  }

  // ------------------------------------------------------------- export
  function svgString(el) {
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(el.cloneNode(true));
  }
  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function rasterise(el, scale, cb) {
    const str = svgString(el);
    const url = URL.createObjectURL(new Blob([str], { type: "image/svg+xml;charset=utf-8" }));
    const img = new Image();
    img.onload = () => {
      const w = (+el.getAttribute("width") || el.viewBox.baseVal.width) * scale;
      const h = (+el.getAttribute("height") || el.viewBox.baseVal.height) * scale;
      const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      canvas.toBlob(b => { cb(b); URL.revokeObjectURL(url); }, "image/png");
    };
    img.src = url;
  }
  // Produce an export artifact for either render target; cb gets {kind:'text',text} | {kind:'blob',blob} | null.
  function exportArtifact(tool, el, format, scale, cb) {
    if (format === "svg") { if (tool.render === "canvas" || !el) return cb(null); return cb({ kind: "text", text: svgString(el) }); }
    if (tool.render === "canvas") { el.toBlob(b => cb({ kind: "blob", blob: b }), "image/png"); return; }
    rasterise(el, scale || 2, b => cb({ kind: "blob", blob: b }));
  }
  // ---- animated export: WebM via the built-in MediaRecorder (zero dependency) ----
  // Drives the player frame-by-frame through one loop, recording the canvas.
  function exportWebM(preview, cb) {
    const canvas = preview.current;
    if (!preview.animated || !(canvas instanceof HTMLCanvasElement) || typeof MediaRecorder === "undefined") return cb(null);
    const fps = preview.fps;
    const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]
      .find(m => { try { return MediaRecorder.isTypeSupported(m); } catch (e) { return false; } }) || "video/webm";
    const stream = canvas.captureStream(0);
    const track = stream.getVideoTracks()[0];
    const manual = track && typeof track.requestFrame === "function";
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12000000 });
    const chunks = [];
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = () => cb({ kind: "blob", blob: new Blob(chunks, { type: "video/webm" }) });
    preview.pause();
    rec.start();
    const total = preview.totalFrames;
    let i = 0;
    (function step() {
      preview.renderAt(i % total);
      if (manual) track.requestFrame();
      i++;
      if (i <= total) setTimeout(step, 1000 / fps);
      else setTimeout(() => rec.stop(), 1000 / fps);
    })();
  }

  // ---- GIF export: self-contained encoder (median-cut quantise + LZW), no deps ----
  function colRange(px) {
    let rmin = 255, rmax = 0, gmin = 255, gmax = 0, bmin = 255, bmax = 0;
    for (let i = 0; i < px.length; i++) { const p = px[i]; if (p[0] < rmin) rmin = p[0]; if (p[0] > rmax) rmax = p[0]; if (p[1] < gmin) gmin = p[1]; if (p[1] > gmax) gmax = p[1]; if (p[2] < bmin) bmin = p[2]; if (p[2] > bmax) bmax = p[2]; }
    const dr = rmax - rmin, dg = gmax - gmin, db = bmax - bmin, max = Math.max(dr, dg, db);
    return { max, axis: max === dr ? 0 : max === dg ? 1 : 2 };
  }
  function medianCut(pixels, maxColors) {
    if (!pixels.length) return [[0, 0, 0]];
    let boxes = [pixels];
    while (boxes.length < maxColors) {
      let bi = -1, best = -1, axis = 0;
      for (let i = 0; i < boxes.length; i++) { if (boxes[i].length < 2) continue; const r = colRange(boxes[i]); if (r.max > best) { best = r.max; bi = i; axis = r.axis; } }
      if (bi < 0) break;
      const px = boxes[bi]; px.sort((a, b) => a[axis] - b[axis]);
      const mid = px.length >> 1;
      boxes.splice(bi, 1, px.slice(0, mid), px.slice(mid));
    }
    return boxes.map(px => { let r = 0, g = 0, b = 0; for (const p of px) { r += p[0]; g += p[1]; b += p[2]; } const n = px.length || 1; return [Math.round(r / n), Math.round(g / n), Math.round(b / n)]; });
  }
  function lzwEncode(indices, minCode) {
    const clearCode = 1 << minCode, eoiCode = clearCode + 1, out = [];
    let cur = 0, bits = 0;
    const put = (code, size) => { cur |= code << bits; bits += size; while (bits >= 8) { out.push(cur & 255); cur >>>= 8; bits -= 8; } };
    let codeSize = minCode + 1, next = eoiCode + 1, dict = new Map();
    put(clearCode, codeSize);
    let prev = indices[0];
    for (let i = 1; i < indices.length; i++) {
      const k = indices[i], key = prev * 256 + k, got = dict.get(key);
      if (got !== undefined) { prev = got; continue; }
      put(prev, codeSize);
      dict.set(key, next++);
      if (next === (1 << codeSize) && codeSize < 12) codeSize++;
      if (next === 4096) { put(clearCode, codeSize); dict = new Map(); next = eoiCode + 1; codeSize = minCode + 1; }
      prev = k;
    }
    put(prev, codeSize); put(eoiCode, codeSize);
    if (bits > 0) out.push(cur & 255);
    return out;
  }
  // One global palette + a cached nearest-colour grid across all frames. Runs the
  // heavy work synchronously after a short defer (so the button repaints) — internal
  // per-frame yields get throttled to ~1s each in a background tab, which is far
  // slower than the ~2s encode itself.
  function exportGIF(preview, cb) {
    const src = preview.current;
    if (!preview.animated || !(src instanceof HTMLCanvasElement)) return cb(null);
    const scale = Math.min(1, 360 / Math.max(src.width, src.height));
    const W = Math.max(1, Math.round(src.width * scale)), H = Math.max(1, Math.round(src.height * scale)), N = W * H;
    const total = preview.totalFrames;
    const stride = Math.max(Math.round(preview.fps / 12), Math.ceil(total / 40));   // ≤40 frames
    const delayCs = Math.max(2, Math.round(100 * stride / preview.fps));
    preview.pause();

    setTimeout(() => {
      const off = document.createElement("canvas"); off.width = W; off.height = H;
      const octx = off.getContext("2d");
      const frames = [];
      for (let i = 0; i < total; i += stride) {
        preview.renderAt(i);
        octx.clearRect(0, 0, W, H); octx.drawImage(src, 0, 0, W, H);
        frames.push(octx.getImageData(0, 0, W, H).data);
      }

      // global palette from a sample across every frame
      const samples = [], step = Math.max(1, Math.floor(N / 1500));
      for (const d of frames) for (let p = 0; p < N; p += step) { const o = p * 4; samples.push([d[o], d[o + 1], d[o + 2]]); }
      const palette = medianCut(samples, 256);
      let bits = 1; while ((1 << bits) < palette.length) bits++;
      const tableSize = 1 << bits, minCode = Math.max(2, bits);
      const grid = new Int16Array(32768).fill(-1);
      const indexOf = (r, g, b) => {
        const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
        let pi = grid[key];
        if (pi < 0) { let bd = 1e9; for (let k = 0; k < palette.length; k++) { const c = palette[k], dd = (c[0] - r) * (c[0] - r) + (c[1] - g) * (c[1] - g) + (c[2] - b) * (c[2] - b); if (dd < bd) { bd = dd; pi = k; } } grid[key] = pi; }
        return pi;
      };

      const out = [];
      const str = s => { for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i)); };
      str("GIF89a"); out.push(W & 255, W >> 8, H & 255, H >> 8, 0x80 | (bits - 1), 0, 0);     // global color table
      for (let i = 0; i < tableSize; i++) { const c = palette[i] || [0, 0, 0]; out.push(c[0], c[1], c[2]); }
      out.push(0x21, 0xff, 0x0b); str("NETSCAPE2.0"); out.push(0x03, 0x01, 0x00, 0x00, 0x00); // loop forever

      for (const data of frames) {
        const indices = new Uint8Array(N);
        for (let p = 0; p < N; p++) { const o = p * 4; indices[p] = indexOf(data[o], data[o + 1], data[o + 2]); }
        out.push(0x21, 0xf9, 0x04, 0x00, delayCs & 255, delayCs >> 8, 0x00, 0x00);           // graphic control (delay)
        out.push(0x2c, 0, 0, 0, 0, W & 255, W >> 8, H & 255, H >> 8, 0x00);                  // image descriptor (no local table)
        out.push(minCode);
        const lzw = lzwEncode(indices, minCode);
        for (let q = 0; q < lzw.length;) { const len = Math.min(255, lzw.length - q); out.push(len); for (let k = 0; k < len; k++) out.push(lzw[q + k]); q += len; }
        out.push(0x00);
      }
      out.push(0x3b);                                                                         // trailer
      cb({ kind: "blob", blob: new Blob([new Uint8Array(out)], { type: "image/gif" }) });
    }, 30);
  }

  function exporter(tool, preview) {
    return {
      downloadSVG() { exportArtifact(tool, preview.current, "svg", 1, a => a && download(new Blob([a.text], { type: "image/svg+xml" }), `${tool.id}.svg`)); },
      copySVG() { exportArtifact(tool, preview.current, "svg", 1, a => a && navigator.clipboard.writeText(a.text)); },
      downloadPNG(scale) { scale = scale || 2; exportArtifact(tool, preview.current, "png", scale, a => a && download(a.blob, `${tool.id}@${scale}x.png`)); },
      copyPNG(scale) { exportArtifact(tool, preview.current, "png", scale || 2, a => a && navigator.clipboard.write([new ClipboardItem({ "image/png": a.blob })]).catch(() => {})); },
      downloadWebM(done) { exportWebM(preview, a => { if (a) download(a.blob, `${tool.id}.webm`); done && done(); }); },
      downloadGIF(done) { exportGIF(preview, a => { if (a) download(a.blob, `${tool.id}.gif`); done && done(); }); },
    };
  }

  // playback transport for animated tools (lives in the stage, drives the player)
  const PLAY_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  const PAUSE_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';
  function addTransport(stage, player) {
    if (!player.animated) return null;
    const bar = document.createElement("div"); bar.className = "kz-transport";
    const btn = document.createElement("button"); btn.className = "kz-tbtn"; btn.innerHTML = PLAY_SVG; btn.title = "Play / pause";
    const scrub = document.createElement("input"); scrub.type = "range"; scrub.className = "kz-tscrub";
    scrub.min = 0; scrub.max = player.totalFrames - 1; scrub.step = 1; scrub.value = 0;
    const time = document.createElement("span"); time.className = "kz-ttime";
    const dur = (player.totalFrames - 1) / player.fps;
    time.textContent = "0.00 / " + dur.toFixed(2) + "s";
    bar.append(btn, scrub, time);
    btn.addEventListener("click", () => {
      if (player.playing) { player.pause(); btn.innerHTML = PLAY_SVG; }
      else { player.play(); btn.innerHTML = PAUSE_SVG; }
    });
    scrub.addEventListener("input", () => { player.seek(+scrub.value); btn.innerHTML = PLAY_SVG; });
    player.onFrame((idx, total, t) => {
      if (document.activeElement !== scrub) scrub.value = idx;
      time.textContent = t.toFixed(2) + " / " + dur.toFixed(2) + "s";
    });
    stage.appendChild(bar);
    return { autoplay() { player.play(); btn.innerHTML = PAUSE_SVG; } };
  }

  // preview backdrop (the stage colour behind the artwork; preview-only, not exported)
  function addPreviewBg(stage, fill, def) {
    let value = def && !isTransparent(def) ? (normHex(def) || def) : null;
    const wrap = document.createElement("div"); wrap.className = "kz-pbg";
    const sw = document.createElement("button"); sw.type = "button"; sw.className = "kz-pbg-sw"; sw.title = "Preview background";
    const picker = document.createElement("input"); picker.type = "color"; picker.className = "kz-picker"; picker.value = value || "#ebf1e5";
    const clear = document.createElement("button"); clear.type = "button"; clear.className = "kz-pbg-clear"; clear.textContent = "×"; clear.title = "Transparent";
    wrap.append(sw, picker, clear);
    const apply = () => { sw.style.background = value || CHECKER; fill.style.background = value || "transparent"; };
    sw.addEventListener("click", () => picker.click());
    picker.addEventListener("input", () => { value = picker.value; apply(); });
    clear.addEventListener("click", () => { value = null; apply(); });
    apply();
    stage.appendChild(wrap);
  }

  // ------------------------------------------------------------- standalone shell
  function bootStandalone(tool) {
    injectStyles();
    const defaults = resolveDefaults(tool.settings);
    const store = createStore(defaults);

    const app = document.createElement("div"); app.className = "kz-app";
    const panel = document.createElement("aside"); panel.className = "kz-panel";
    const head = document.createElement("div"); head.className = "kz-head";
    head.innerHTML =
      `<div class="kz-titlerow"><h1>${tool.name || tool.id}</h1><span class="kz-badge">Standalone</span></div>` +
      (tool.tagline ? `<div class="kz-sub">${tool.tagline}</div>` : "");
    panel.appendChild(head);

    buildPanel(panel, tool, store, /* pair */ true); // same two-up pairing as the frame

    // export + presets section
    const exportSection = document.createElement("div"); exportSection.className = "kz-section";
    const exHead = document.createElement("div"); exHead.className = "kz-sechead";
    exHead.innerHTML = "<h2>Export</h2>"; exportSection.appendChild(exHead);
    const formats = tool.exportFormats || ["svg", "png"];
    const row = document.createElement("div"); row.className = "kz-btnrow";
    const scaleSel = document.createElement("select"); scaleSel.className = "kz-select kz-scale";
    [1, 2, 4].forEach(s => { const o = document.createElement("option"); o.value = s; o.textContent = s + "×"; if (s === 2) o.selected = true; scaleSel.appendChild(o); });

    const stage = document.createElement("main"); stage.className = "kz-stage";
    const fill = document.createElement("div"); fill.className = "kz-fill";
    const mount = document.createElement("div"); mount.className = "kz-mount";
    stage.append(fill, mount);

    addPreviewBg(stage, fill, tool.preview && tool.preview.background);

    const preview = createPreview(mount, tool, store, "standalone");
    const ex = exporter(tool, preview);

    if (formats.includes("svg")) {
      const b = document.createElement("button"); b.className = "kz-btn"; b.textContent = "SVG";
      b.addEventListener("click", () => ex.downloadSVG()); row.appendChild(b);
    }
    if (formats.includes("png")) {
      const b = document.createElement("button"); b.className = "kz-btn kz-primary"; b.textContent = "PNG";
      b.addEventListener("click", () => ex.downloadPNG(+scaleSel.value)); row.appendChild(b);
      row.appendChild(scaleSel);
    }
    exportSection.appendChild(row);

    if (preview.animated) {
      const arow = document.createElement("div"); arow.className = "kz-btnrow"; arow.style.marginTop = "8px";
      const g = document.createElement("button"); g.className = "kz-btn"; g.textContent = "GIF";
      g.addEventListener("click", () => { if (g.disabled) return; g.disabled = true; g.textContent = "Encoding…"; ex.downloadGIF(() => { g.disabled = false; g.textContent = "GIF"; }); });
      const w = document.createElement("button"); w.className = "kz-btn"; w.textContent = "WebM";
      w.addEventListener("click", () => { if (w.disabled) return; w.disabled = true; w.textContent = "Recording…"; ex.downloadWebM(() => { w.disabled = false; w.textContent = "WebM"; }); });
      arow.append(g, w);
      exportSection.appendChild(arow);
    }

    const copyRow = document.createElement("div"); copyRow.className = "kz-btnrow"; copyRow.style.marginTop = "8px";
    if (formats.includes("svg")) { const c = document.createElement("button"); c.className = "kz-mini"; c.textContent = "Copy SVG"; c.addEventListener("click", () => ex.copySVG()); copyRow.appendChild(c); }
    if (formats.includes("png")) { const c = document.createElement("button"); c.className = "kz-mini"; c.textContent = "Copy PNG"; c.addEventListener("click", () => ex.copyPNG(+scaleSel.value)); copyRow.appendChild(c); }
    const cj = document.createElement("button"); cj.className = "kz-mini"; cj.textContent = "Copy state"; cj.addEventListener("click", () => navigator.clipboard.writeText(store.serialise())); copyRow.appendChild(cj);
    const lj = document.createElement("button"); lj.className = "kz-mini"; lj.textContent = "Load state"; lj.addEventListener("click", () => { const j = prompt("Paste state JSON"); if (j) store.deserialise(j); }); copyRow.appendChild(lj);
    exportSection.appendChild(copyRow);
    panel.appendChild(exportSection);

    app.append(panel, stage);
    document.body.appendChild(app);

    const transport = addTransport(stage, preview);
    store.subscribe(() => preview.render());
    preview.render();
    if (transport) transport.autoplay();
  }

  // ------------------------------------------------------------- framed shell (lean; host = Phase 4)
  function bootFramed(tool) {
    injectStyles();
    const defaults = resolveDefaults(tool.settings);
    const store = createStore(defaults);
    document.body.style.margin = "0";
    const stage = document.createElement("main"); stage.className = "kz-stage"; stage.style.height = "100vh";
    const fill = document.createElement("div"); fill.className = "kz-fill";
    const mount = document.createElement("div"); mount.className = "kz-mount";
    stage.append(fill, mount); document.body.appendChild(stage);

    const preview = createPreview(mount, tool, store, "framed");
    const ex = exporter(tool, preview);
    store.subscribe(() => preview.render());

    const post = msg => parent.postMessage(Object.assign({ v: PROTOCOL }, msg), "*");
    function schemaForWire() {
      const out = {};
      for (const k in tool.settings) {
        const f = tool.settings[k]; const o = {};
        for (const p in f) if (typeof f[p] !== "function") o[p] = f[p];
        out[k] = o;
      }
      return out;
    }
    window.addEventListener("message", e => {
      const d = e.data; if (!d || d.v !== PROTOCOL) return;
      if (d.type === "kazam/state") store.replace(d.state);
      else if (d.type === "kazam/tokens") { document.documentElement.classList.toggle("dark", !!d.dark); preview.render(); }
      else if (d.type === "kazam/preview-bg") { fill.style.background = d.color || "transparent"; }
      else if (d.type === "kazam/export") {
        const reply = payload => post({ type: "kazam/export-result", requestId: d.requestId, format: d.format, ok: !!payload, payload: payload });
        if (d.format === "webm") exportWebM(preview, reply);
        else if (d.format === "gif") exportGIF(preview, reply);
        else exportArtifact(tool, preview.current, d.format, d.scale || 2, reply);
      }
    });
    if (tool.preview && tool.preview.background) fill.style.background = tool.preview.background;
    const transport = addTransport(stage, preview);
    preview.render();
    if (transport) transport.autoplay();
    post({
      type: "kazam/ready",
      tool: { id: tool.id, name: tool.name, tagline: tool.tagline || "", render: tool.render, duration: tool.duration || 0, exportFormats: tool.exportFormats || ["svg", "png"], preview: tool.preview || null },
      schema: schemaForWire(), groups: tool.groups || null, state: store.get(),
    });
  }

  // ------------------------------------------------------------- entry
  function defineTool(tool) {
    if (!tool || !tool.id || (typeof tool.build !== "function" && typeof tool.frame !== "function")) {
      throw new Error("Kazam.defineTool: requires { id, settings, and build() and/or frame() }");
    }
    const framed = window.self !== window.top;
    const boot = () => (framed ? bootFramed(tool) : bootStandalone(tool));
    if (document.body) boot();
    else window.addEventListener("DOMContentLoaded", boot);
    return tool;
  }

  // Inject tokens + component CSS as soon as the runtime loads, so both tools
  // and the frame host (which includes this file without calling defineTool) are styled.
  injectStyles();

  // Host-side helpers: the frame app (frame/index.html) includes this same file
  // and uses these to build the controls panel + state store around tool iframes.
  window.Kazam = {
    defineTool, version: PROTOCOL,
    host: { createStore, resolveDefaults, buildPanel, resolveTokens, download },
  };
})();
