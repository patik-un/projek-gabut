import test from "node:test";
import assert from "node:assert/strict";
import { sceneReducer, transformLayer, renderScene } from "./studioScene.js";

const layer = (id = "a") => ({ id, name: id, artwork: { src: id, width: 200, height: 100 }, x: 50, y: 50, width: 40, rotation: 0, opacity: 100, visible: true });
test("scene undo and redo preserve layers, ordering and visibility; new edits discard redo", () => {
  let state = { layers: [], past: [], future: [] };
  state = sceneReducer(state, { type: "set", layers: [layer()] });
  state = sceneReducer(state, { type: "set", layers: [layer(), layer("b")] });
  state = sceneReducer(state, { type: "undo" });
  assert.deepEqual(state.layers.map((item) => item.id), ["a"]);
  state = sceneReducer(state, { type: "redo" });
  assert.deepEqual(state.layers.map((item) => item.id), ["a", "b"]);
  state = sceneReducer(state, { type: "undo" });
  state = sceneReducer(state, { type: "set", layers: [{ ...layer(), visible: false }] });
  assert.equal(state.future.length, 0);
  assert.equal(state.layers[0].visible, false);
});
test("scene history and layer count are bounded", () => {
  let state = { layers: [], past: [], future: [] };
  for (let index = 0; index < 30; index += 1) state = sceneReducer(state, { type: "set", layers: [layer(String(index))] });
  assert.equal(state.past.length, 20);
  assert.throws(() => sceneReducer(state, { type: "set", layers: Array.from({ length: 25 }, (_, i) => layer(String(i))) }), /24/);
});
test("canvas transforms move, resize and rotate without introducing nonfinite or unbounded values", () => {
  assert.deepEqual(transformLayer(layer(), "move", { x: 50, y: 50 }, { x: 160, y: -80 }), { x: 100, y: 0 });
  assert.equal(transformLayer(layer(), "resize", { x: 70, y: 50 }, { x: 90, y: 50 }).width, 80);
  assert.equal(transformLayer(layer(), "rotate", { x: 70, y: 50 }, { x: 50, y: 70 }).rotation, 90);
  assert.throws(() => transformLayer(layer(), "move", { x: 0, y: 0 }, { x: NaN, y: 5 }), /koordinat/i);
});
test("scene export draws visible layers in order with matching center, aspect, rotation and opacity", async () => {
  const calls = [];
  const ctx = { save() {}, restore() {}, translate(...args) { calls.push(["translate", ...args]); }, rotate(value) { calls.push(["rotate", value]); },
    drawImage(image, ...args) { calls.push(["draw", image.src, this.globalAlpha, ...args]); }, getImageData: () => ({ data: new Uint8ClampedArray([0,0,0,255]) }) };
  const result = await renderScene([layer(), { ...layer("hidden"), visible: false }, { ...layer("b"), opacity: 50, rotation: 90 }],
    { makeCanvas: () => ({ getContext: () => ctx, toDataURL: () => "data:image/png;base64,result" }), loadImage: async (src) => ({ src }) });
  assert.equal(result, "data:image/png;base64,result");
  assert.deepEqual(calls.filter((call) => call[0] === "draw").map((call) => call.slice(1,3)), [["a",1],["b",0.5]]);
  assert.deepEqual(calls.find((call) => call[0] === "translate"), ["translate",256,256]);
  assert.deepEqual(calls.find((call) => call[0] === "draw").slice(3), [-102.4,-51.2,204.8,102.4]);
});

test("a completely transparent or off-canvas composition cannot be saved as a blank sticker", async () => {
  const ctx = { save() {}, restore() {}, translate() {}, rotate() {}, drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(16) }) };
  await assert.rejects(renderScene([layer()], { makeCanvas: () => ({ getContext: () => ctx, toDataURL: () => "blank" }), loadImage: async () => ({}) }), /kosong|transparan/);
});
