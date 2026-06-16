// Determinism is the load-bearing guarantee of the whole contract: identical
// state must give identical output, in preview and export, standalone and framed.
// That only holds if the seeded RNG is itself deterministic and its spatial hash
// is order-independent. These tests pin both.
const test = require("node:test");
const assert = require("node:assert/strict");
const { mulberry32, makeRandom } = require("../frame/kazam.js");

test("mulberry32 is deterministic for a given seed", () => {
  const a = mulberry32(12345);
  const b = mulberry32(12345);
  const seqA = Array.from({ length: 8 }, () => a());
  const seqB = Array.from({ length: 8 }, () => b());
  assert.deepEqual(seqA, seqB);
});

test("mulberry32 differs across seeds", () => {
  const a = mulberry32(1)();
  const b = mulberry32(2)();
  assert.notEqual(a, b);
});

test("mulberry32 output stays in [0,1)", () => {
  const r = mulberry32(99);
  for (let i = 0; i < 1000; i++) {
    const v = r();
    assert.ok(v >= 0 && v < 1, `out of range: ${v}`);
  }
});

test("makeRandom().int(n) returns ints in [0,n)", () => {
  const r = makeRandom(7);
  for (let i = 0; i < 500; i++) {
    const v = r.int(10);
    assert.ok(Number.isInteger(v) && v >= 0 && v < 10, `bad int: ${v}`);
  }
});

test("makeRandom().range(a,b) stays within bounds", () => {
  const r = makeRandom(7);
  for (let i = 0; i < 500; i++) {
    const v = r.range(5, 9);
    assert.ok(v >= 5 && v < 9, `out of range: ${v}`);
  }
});

test("random.hash is order-independent and stable for the same keys", () => {
  const r = makeRandom(42);
  // same coords queried in different orders must give the same per-key value
  const first = r.hash(3, 7);
  r.hash(99, 1);
  r.hash(0, 0);
  const again = r.hash(3, 7);
  assert.equal(first, again, "hash drifted after intervening calls");
});

test("random.hash is keyed to the base seed, not the per-frame stream", () => {
  // animated frames reseed the stream but keep the same base/hash seed → per-entity
  // randomness stays stable across frames. Simulate two frames of the same tool.
  const base = 1234;
  const frame0 = makeRandom((base ^ Math.imul(1, 0x9e3779b9)) >>> 0, base);
  const frame1 = makeRandom((base ^ Math.imul(2, 0x9e3779b9)) >>> 0, base);
  assert.equal(frame0.hash(5, 5), frame1.hash(5, 5), "hash should not vary by frame");
  // but the streamed sequence should differ between frames
  assert.notEqual(frame0(), frame1(), "stream should vary by frame");
});

test("random.hash varies across different keys", () => {
  const r = makeRandom(42);
  assert.notEqual(r.hash(1, 1), r.hash(1, 2));
  assert.notEqual(r.hash(1, 1), r.hash(2, 1));
});
