// The GIF exporter is a self-written encoder (median-cut quantise + LZW) with no
// dependency to lean on, so it's exactly the kind of hand-rolled code that earns
// a test. medianCut is checked by its invariants; lzwEncode is round-tripped
// through a decoder written here, which proves the bitstream is actually valid.
const test = require("node:test");
const assert = require("node:assert/strict");
const { medianCut, lzwEncode } = require("../frame/kazam.js");

// A minimal GIF-style variable-width LZW decoder, mirroring the encoder's dict
// growth and code-size timing. Used only to validate the encoder round-trips.
function lzwDecode(bytes, minCode) {
  const clear = 1 << minCode, eoi = clear + 1;
  let codeSize, next, dict, prev;
  const reset = () => { codeSize = minCode + 1; next = eoi + 1; dict = new Map(); prev = null; };
  reset();
  const out = [];
  let bitPos = 0;
  const total = bytes.length * 8;
  const readCode = () => {
    let c = 0;
    for (let i = 0; i < codeSize; i++) {
      const b = (bytes[bitPos >> 3] >> (bitPos & 7)) & 1;
      c |= b << i; bitPos++;
    }
    return c;
  };
  while (bitPos + codeSize <= total) {
    const code = readCode();
    if (code === clear) { reset(); continue; }
    if (code === eoi) break;
    let entry;
    if (code < clear) entry = [code];
    else if (dict.has(code)) entry = dict.get(code);
    else if (prev) entry = prev.concat(prev[0]);   // KwKwK
    else break;
    for (const v of entry) out.push(v);
    if (prev) {
      dict.set(next, prev.concat(entry[0]));
      next++;
      // GIF "early change": the decoder is one entry behind the encoder, so it
      // widens the code one step sooner (at (1<<codeSize)-1, not 1<<codeSize).
      if (next === (1 << codeSize) - 1 && codeSize < 12) codeSize++;
    }
    prev = entry;
  }
  return out;
}

test("lzwEncode → decode round-trips a simple run", () => {
  const minCode = 2;
  const indices = [0, 0, 0, 1, 2, 3, 3, 3, 2, 1, 0];
  const bytes = lzwEncode(indices, minCode);
  assert.deepEqual(lzwDecode(bytes, minCode), indices);
});

test("lzwEncode → decode round-trips varied random index streams", () => {
  // deterministic pseudo-random (no Date/Math.random reliance for reproducibility)
  let s = 1;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let trial = 0; trial < 40; trial++) {
    const minCode = 2 + (trial % 6);          // 2..7
    const range = 1 << minCode;
    const len = 1 + Math.floor(rnd() * 4000);
    const indices = Array.from({ length: len }, () => Math.floor(rnd() * range));
    const bytes = lzwEncode(indices, minCode);
    assert.deepEqual(lzwDecode(bytes, minCode), indices, `trial ${trial} (minCode ${minCode}, len ${len})`);
  }
});

test("lzwEncode survives long runs that trigger dictionary reset (>4096 codes)", () => {
  const minCode = 8;
  let s = 7;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const indices = Array.from({ length: 20000 }, () => Math.floor(rnd() * 256));
  const bytes = lzwEncode(indices, minCode);
  assert.deepEqual(lzwDecode(bytes, minCode), indices);
});

test("medianCut returns at most maxColors entries", () => {
  const pixels = Array.from({ length: 500 }, (_, i) => [i % 256, (i * 3) % 256, (i * 7) % 256]);
  const pal = medianCut(pixels, 16);
  assert.ok(pal.length <= 16, `got ${pal.length}`);
  assert.ok(pal.length > 0);
});

test("medianCut entries are valid [r,g,b] in 0..255", () => {
  const pixels = Array.from({ length: 300 }, (_, i) => [i % 256, 255 - (i % 256), (i * 5) % 256]);
  for (const c of medianCut(pixels, 32)) {
    assert.equal(c.length, 3);
    for (const ch of c) assert.ok(Number.isInteger(ch) && ch >= 0 && ch <= 255, `bad channel ${ch}`);
  }
});

test("medianCut handles an empty pixel list", () => {
  assert.deepEqual(medianCut([], 16), [[0, 0, 0]]);
});

test("medianCut preserves a small distinct palette", () => {
  const reds = Array.from({ length: 50 }, () => [255, 0, 0]);
  const blues = Array.from({ length: 50 }, () => [0, 0, 255]);
  const pal = medianCut([...reds, ...blues], 4);
  // the two clusters should be representable; averages land on the pure colours
  assert.ok(pal.some(c => c[0] > 200 && c[2] < 55), "missing red cluster");
  assert.ok(pal.some(c => c[2] > 200 && c[0] < 55), "missing blue cluster");
});
