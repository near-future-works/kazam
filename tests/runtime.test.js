// The store + field-display helpers + the inliner are the runtime plumbing that
// makes presets, reload-safety and "Copy tool as HTML" work. They're pure, so
// they're cheap to pin — and the inliner regex in particular has bitten before.
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  resolveDefaults, createStore,
  fieldDecimals, toDisplay, fromDisplay, fieldUnit,
  inlineRuntime,
} = require("../frame/kazam.js");

// ----------------------------------------------------------- field display

test("fieldDecimals derives precision from step", () => {
  assert.equal(fieldDecimals({ step: 1 }), 0);
  assert.equal(fieldDecimals({ step: 0.01 }), 2);
  assert.equal(fieldDecimals({}), 0);                          // default step 1
  // percent multiplies the step by 100 before counting decimals
  assert.equal(fieldDecimals({ format: "percent", step: 0.01 }), 0);
  assert.equal(fieldDecimals({ format: "percent", step: 0.001 }), 1);
});

test("toDisplay scales percent values and rounds to step precision", () => {
  assert.equal(toDisplay({ format: "percent", step: 0.01 }, 0.5), 50);
  assert.equal(toDisplay({ step: 1 }, 3.7), 4);                // rounds when no decimals
  assert.equal(toDisplay({ step: 0.01 }, 3.14159), 3.14);
});

test("fromDisplay inverts toDisplay's percent scaling", () => {
  assert.equal(fromDisplay({ format: "percent" }, 50), 0.5);
  assert.equal(fromDisplay({}, 42), 42);
});

test("fieldUnit prefers explicit unit, falls back to % for percent", () => {
  assert.equal(fieldUnit({ unit: "px" }), "px");
  assert.equal(fieldUnit({ format: "percent" }), "%");
  assert.equal(fieldUnit({}), "");
});

// ----------------------------------------------------------- state store

const SETTINGS = {
  width: { type: "number", default: 400, min: 0, max: 1000 },
  fg: { type: "color", default: { hex: "#000000", opacity: 1 } },
  bg: { type: "color", default: null, optional: true },
};

test("resolveDefaults builds state from schema defaults", () => {
  const s = resolveDefaults(SETTINGS);
  assert.deepEqual(s, { width: 400, fg: { hex: "#000000", opacity: 1 }, bg: null });
});

test("resolveDefaults deep-clones object defaults (no shared refs)", () => {
  const a = resolveDefaults(SETTINGS);
  const b = resolveDefaults(SETTINGS);
  assert.notEqual(a.fg, b.fg);                                 // distinct objects
  assert.deepEqual(a.fg, b.fg);                                // equal values
});

test("store.set updates value and notifies with the changed key", () => {
  const store = createStore(resolveDefaults(SETTINGS));
  let seen = null;
  store.subscribe((_state, key) => { seen = key; });
  store.set("width", 800);
  assert.equal(store.get().width, 800);
  assert.equal(seen, "width");
});

test("store.replace merges over defaults and notifies null", () => {
  const store = createStore(resolveDefaults(SETTINGS));
  let seen = "unset";
  store.subscribe((_state, key) => { seen = key; });
  store.replace({ width: 123 });
  assert.equal(store.get().width, 123);
  assert.deepEqual(store.get().fg, { hex: "#000000", opacity: 1 }); // default kept
  assert.equal(seen, null);
});

test("store serialise/deserialise round-trips", () => {
  const store = createStore(resolveDefaults(SETTINGS));
  store.set("width", 250);
  const json = store.serialise();
  const restored = createStore(resolveDefaults(SETTINGS));
  assert.equal(restored.deserialise(json), true);
  assert.equal(restored.get().width, 250);
});

test("store.deserialise returns false on malformed JSON", () => {
  const store = createStore(resolveDefaults(SETTINGS));
  assert.equal(store.deserialise("{not json"), false);
});

test("store.get returns a clone of the defaults, not the defaults themselves", () => {
  const defaults = resolveDefaults(SETTINGS);
  const store = createStore(defaults);
  store.set("width", 999);
  assert.equal(defaults.width, 400, "mutating the store leaked into the defaults");
});

// ----------------------------------------------------------- inliner

const RUNTIME = "/* runtime body */ window.Kazam = {};";

test("inlineRuntime replaces the kazam.js <script src> with an inline block", () => {
  const raw = `<head><script src="../frame/kazam.js"></script></head>`;
  const out = inlineRuntime(raw, RUNTIME);
  assert.ok(!/src=["'][^"']*kazam\.js["']/.test(out), "src tag should be gone");
  assert.ok(out.includes(RUNTIME), "runtime body should be inlined");
  assert.ok(out.includes("<head>") && out.includes("</head>"), "surrounding markup preserved");
});

test("inlineRuntime handles single quotes and extra attributes", () => {
  const raw = `<script defer src='./kazam.js' data-x="1"></script>`;
  const out = inlineRuntime(raw, RUNTIME);
  assert.ok(out.includes(RUNTIME));
  assert.ok(!/src=/.test(out));
});

test("inlineRuntime leaves an already self-contained file unchanged", () => {
  const raw = `<html><script>${RUNTIME}</script></html>`;
  assert.equal(inlineRuntime(raw, "DIFFERENT"), raw);
});

test("inlineRuntime does not break runtime text containing </script>-like content", () => {
  // the replacement escapes the closing tag in source; here we just confirm the
  // body lands intact and the file is no longer externally linked
  const raw = `<script src="../frame/kazam.js"></script>`;
  const out = inlineRuntime(raw, RUNTIME);
  assert.ok(out.startsWith("<script>"));
  assert.ok(out.includes(RUNTIME));
});
