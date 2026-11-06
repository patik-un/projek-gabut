import test from "node:test";
import assert from "node:assert/strict";
import { createTextArtwork, createStickerArtwork, decorationStyle } from "./decorationArtwork.js";

function canvasFactory() {
  const calls = [];
  const context = {
    measureText: (text) => ({ width: text.length * 55 }),
    save() {}, restore() {}, beginPath() {}, roundRect(...args) { calls.push(["roundRect", ...args]); },
    fill() { calls.push(["fill", this.fillStyle]); },
    fillText(text) { calls.push(["text", text, this.fillStyle, this.font, this.globalAlpha]); },
    strokeText(text) { calls.push(["outline", text, this.strokeStyle, this.lineWidth]); },
    drawImage(...args) { calls.push(["image", ...args]); calls.push(["imageAlpha", this.globalAlpha]); }, fillRect() {},
  };
  return { calls, makeCanvas: () => ({ width: 0, height: 0, getContext: () => context, toDataURL: () => "data:image/png;base64,artwork" }) };
}

test("text artwork uses the admin font, color, outline, background and opacity", () => {
  const { calls, makeCanvas } = canvasFactory();
  const art = createTextArtwork({ text: "Hello", style: { font: "serif", color: "#ff0088", weight: 600, italic: true,
    outlineWidth: 3, outlineColor: "#ffffff", background: "pill", backgroundColor: "#110033", opacity: 70 } }, makeCanvas);
  assert.equal(art.src, "data:image/png;base64,artwork");
  const text = calls.find((call) => call[0] === "text");
  assert.equal(text[2], "#ff0088");
  assert.match(text[3], /italic 600 .*Georgia/);
  assert.equal(text[4], 1);
  assert.ok(calls.some((call) => call[0] === "imageAlpha" && call[1] === 0.7));
  assert.ok(calls.some((call) => call[0] === "outline" && call[2] === "#ffffff"));
  assert.ok(calls.some((call) => call[0] === "fill" && call[1] === "#110033"));
  assert.ok(art.widthPercent > 0 && art.widthPercent <= 88);
});

test("long text stays within strip bounds and a larger font increases artwork height", () => {
  const small = createTextArtwork({ text: "Hi", style: { size: 3 } }, canvasFactory().makeCanvas);
  const large = createTextArtwork({ text: "Hi", style: { size: 10 } }, canvasFactory().makeCanvas);
  const long = createTextArtwork({ text: "A long event message to remember", style: { size: 14 } }, canvasFactory().makeCanvas);
  assert.ok(large.height > small.height);
  assert.ok(long.widthPercent <= 88);
});

test("sticker artwork preserves image aspect and admin size/opacity", async () => {
  const { calls, makeCanvas } = canvasFactory();
  const image = { width: 200, height: 100 };
  const art = await createStickerArtwork({ kind: "image", content: "data:image/png;base64,fixture", style: { size: 24, opacity: 50, shadow: "none", outlineWidth: 0 } },
    { makeCanvas, loadImage: async () => image });
  assert.ok(art.width > art.height);
  assert.equal(art.widthPercent, art.width / 10);
  assert.ok(calls.some((call) => call[0] === "image" && call[1] === image && call[4] === 240 && call[5] === 120));
  assert.equal(decorationStyle("sticker", {}).opacity, 100);
});

test("sticker opacity is applied once after all overlapping outline layers are composited", async () => {
  const { calls, makeCanvas } = canvasFactory();
  await createStickerArtwork({ kind: "image", content: "fixture", style: { opacity: 20, outlineWidth: 5 } },
    { makeCanvas, loadImage: async () => ({ width: 200, height: 100 }) });
  const alphas = calls.filter((call) => call[0] === "imageAlpha").map((call) => call[1]);
  assert.equal(alphas.filter((alpha) => alpha === 0.2).length, 1);
  assert.ok(alphas.slice(0, -1).every((alpha) => alpha === 1));
});
