// Colour maths feeds both the swatch UI and the rasterised export. normHex and
// colorToCss are where a malformed hex or an opacity slip turns into a silently
// wrong fill, so they're worth pinning.
const test = require("node:test");
const assert = require("node:assert/strict");
const { normHex, colorToCss, isTransparent } = require("../frame/kazam.js");

test("normHex accepts #rrggbb and bare rrggbb, lowercased", () => {
  assert.equal(normHex("#AABBCC"), "#aabbcc");
  assert.equal(normHex("aabbcc"), "#aabbcc");
  assert.equal(normHex("  #1F2E1C  "), "#1f2e1c");
});

test("normHex rejects shorthand and garbage", () => {
  assert.equal(normHex("#abc"), null);     // 3-digit shorthand not supported
  assert.equal(normHex("#xyzxyz"), null);
  assert.equal(normHex(""), null);
  assert.equal(normHex("red"), null);
});

test("isTransparent recognises empty/none/null", () => {
  assert.equal(isTransparent(null), true);
  assert.equal(isTransparent(""), true);
  assert.equal(isTransparent("  "), true);
  assert.equal(isTransparent("none"), true);
  assert.equal(isTransparent("NONE"), true);
  assert.equal(isTransparent("#fff"), false);
});

test("colorToCss returns null for transparent colours", () => {
  assert.equal(colorToCss(null), null);
  assert.equal(colorToCss({ hex: null, opacity: 1 }), null);
  assert.equal(colorToCss({ hex: "none", opacity: 1 }), null);
});

test("colorToCss returns the hex when fully opaque", () => {
  assert.equal(colorToCss({ hex: "#1f2e1c", opacity: 1 }), "#1f2e1c");
  assert.equal(colorToCss({ hex: "#AABBCC" }), "#aabbcc");   // opacity omitted → opaque
});

test("colorToCss emits rgba() with rounded opacity when translucent", () => {
  assert.equal(colorToCss({ hex: "#ff0000", opacity: 0.5 }), "rgba(255, 0, 0, 0.5)");
  assert.equal(colorToCss({ hex: "#0000ff", opacity: 0.3334 }), "rgba(0, 0, 255, 0.333)");
});
