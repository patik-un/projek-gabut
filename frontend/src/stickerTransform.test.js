import assert from "node:assert/strict";
import test from "node:test";
import { beginStickerTransform, transformSticker, stickerActionCorrection } from "./stickerTransform.js";

test("clipped controls shift inside the strip even when the sticker is rotated and scaled", () => {
  const bounds = { left: 0, top: 0, right: 400, bottom: 600 };
  const controls = { left: 180, top: -40, right: 240, bottom: -12 };
  assert.deepEqual(stickerActionCorrection(controls, bounds, 0, 1), { x: 0, y: 48 });
  const rotated = stickerActionCorrection(controls, bounds, 90, 2);
  assert.ok(Math.abs(rotated.x - 24) < 1e-9);
  assert.ok(Math.abs(rotated.y) < 1e-9);
  assert.deepEqual(stickerActionCorrection({ left: 8, top: 8, right: 68, bottom: 36 }, bounds, 0, 1), { x: 0, y: 0 });
});

test("resizing a rotated sticker preserves its center, rotation and aspect ratio", () => {
  const sticker = { id: "one", x: 40, y: 60, scale: 1.2, rotation: 45, artwork: { width: 200, height: 100 } };
  for (const [x, y] of [[30, 40], [-30, 40], [30, -40], [-30, -40]]) {
    const patch = transformSticker(sticker, "resize", { x: 100, y: 200 },
      { x: 100 + x, y: 200 + y }, { x: 100 + x * 1.5, y: 200 + y * 1.5 });
    assert.ok(Math.abs(patch.scale - 1.8) < 1e-9);
    assert.deepEqual(Object.keys(patch), ["scale"]);
  }
  assert.equal(sticker.scale, 1.2);
});

test("resize limits and degenerate pointers never produce invalid sticker sizes", () => {
  const sticker = { scale: 1 };
  const center = { x: 0, y: 0 }, start = { x: 10, y: 0 };
  assert.deepEqual(transformSticker(sticker, "resize", center, start, { x: 1000, y: 0 }), { scale: 2.8 });
  assert.deepEqual(transformSticker(sticker, "resize", center, start, center), { scale: 0.4 });
  assert.deepEqual(transformSticker(sticker, "resize", center, center, start), {});
  assert.deepEqual(transformSticker(sticker, "resize", center, start, { x: NaN, y: 1 }), {});
});

test("rotation follows pointer angle across the 180-degree seam", () => {
  const center = { x: 100, y: 200 };
  assert.deepEqual(transformSticker({ rotation: 30 }, "rotate", center,
    { x: 100, y: 150 }, { x: 150, y: 200 }), { rotation: 120 });
  const point = (degrees) => ({ x: 100 + 50 * Math.cos(degrees * Math.PI / 180), y: 200 + 50 * Math.sin(degrees * Math.PI / 180) });
  const { rotation } = transformSticker({ rotation: 45 }, "rotate", center, point(179), point(-179));
  assert.ok(Math.abs(rotation - 47) < 1e-9);
});

function gestureFixture() {
  const events = new EventTarget();
  const captures = new Set();
  const target = { setPointerCapture: (id) => captures.add(id), hasPointerCapture: (id) => captures.has(id),
    releasePointerCapture: (id) => captures.delete(id),
    closest: () => ({ getBoundingClientRect: () => ({ left: 50, top: 100, width: 100, height: 200 }) }) };
  const changes = [];
  let stopped = false;
  const event = { pointerId: 4, button: 0, clientX: 150, clientY: 200, currentTarget: target,
    stopPropagation() { stopped = true; }, preventDefault() {} };
  const send = (type, point = {}) => events.dispatchEvent(Object.assign(new Event(type), { pointerId: 4, clientX: 175, clientY: 200, ...point }));
  return { events, captures, changes, event, send, get stopped() { return stopped; } };
}

test("a handle drag uses screen-space center, ignores other pointers and ends on cancel", () => {
  const f = gestureFixture();
  beginStickerTransform(f.event, { scale: 1, rotation: 45 }, "resize", (patch) => f.changes.push(patch), f.events);
  assert.ok(f.stopped);
  f.send("pointermove", { pointerId: 99 });
  assert.equal(f.changes.length, 0);
  f.send("pointermove");
  assert.deepEqual(f.changes, [{ scale: 1.5 }]);
  f.send("pointercancel");
  f.send("pointermove");
  assert.equal(f.changes.length, 1);
  assert.equal(f.captures.size, 0);
});

test("cleanup on deselection removes the gesture and pointer capture", () => {
  const f = gestureFixture();
  const cleanup = beginStickerTransform(f.event, { rotation: 0 }, "rotate", (patch) => f.changes.push(patch), f.events);
  cleanup();
  cleanup();
  f.send("pointermove");
  assert.equal(f.changes.length, 0);
  assert.equal(f.captures.size, 0);
});

test("pointer release applies its final position and stops future updates", () => {
  const f = gestureFixture();
  beginStickerTransform(f.event, { rotation: 10 }, "rotate", (patch) => f.changes.push(patch), f.events);
  f.send("pointerup", { clientX: 100, clientY: 250 });
  assert.deepEqual(f.changes.at(-1), { rotation: 100 });
  f.send("pointermove");
  assert.equal(f.changes.length, 1);
});

test("right-click never starts a transform", () => {
  const f = gestureFixture();
  f.event.button = 2;
  beginStickerTransform(f.event, { scale: 1 }, "resize", (patch) => f.changes.push(patch), f.events);
  f.send("pointermove");
  assert.equal(f.changes.length, 0);
  assert.equal(f.captures.size, 0);
});
