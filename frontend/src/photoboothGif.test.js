import test from "node:test";
import assert from "node:assert/strict";
import { animatedStripOverlays, requestGifAssets, photoGifFrames } from "./photoboothGif.js";

test("animated overlays preserve side, position, scale, angle and padded artwork bounds", () => {
  const result = animatedStripOverlays([
    { type: "emoji", content: "✨" },
    { type: "gif", content: "data:image/gif;base64,fixture", sideIndex: 1, x: 50, y: 40, scale: 2, rotation: 20,
      style: { opacity: 60 }, artwork: { width: 204, height: 104, widthPercent: 20.4 } },
  ], { width: 1200, height: 1800 }, true);
  assert.equal(result.length, 1);
  assert.equal(result[0].x, 900);
  assert.equal(result[0].y, 720);
  assert.ok(Math.abs(result[0].width - 244.8) < .001);
  assert.ok(Math.abs(result[0].height - 124.8) < .001);
  assert.equal(result[0].rotation, 20);
  assert.equal(result[0].opacity, 60);
  assert.equal(result[0].padding_x, 2 / 204);
});

test("a failed animated strip does not discard the successful session GIF", async () => {
  const result = await requestGifAssets("http://test", { photoFrames: ["frame-a", "frame-b"], backgroundData: "strip", overlays: [{}] },
    { requestJson: async (_url, options) => {
      const payload = JSON.parse(options.body);
      if (payload.mode === "strip") throw new Error("GIF sticker invalid");
      return { success: true, data_url: "data:image/gif;base64,R0lG", filename: "photos.gif", width: 640, height: 480, frame_count: 2 };
    } });
  assert.equal(result.assets[0].kind, "photos");
  assert.equal(result.assets[0].dataBase64, "R0lG");
  assert.equal(result.errors.length, 1);
});

test("one-photo sessions skip photo animation while still generating animated strip", async () => {
  const modes = [];
  const result = await requestGifAssets("http://test", { photoFrames: ["one"], backgroundData: "strip", overlays: [{}] },
    { requestJson: async (_url, options) => { modes.push(JSON.parse(options.body).mode); return { success: true, data_url: "data:image/gif;base64,R0lG", filename: "strip.gif" }; } });
  assert.deepEqual(modes, ["strip"]);
  assert.equal(result.assets[0].kind, "animated-strip");
});

test("photo GIF frames use capture filters and keep the full source photo inside the frame", async () => {
  const draws = [], revoked = [];
  const result = await photoGifFrames([{ image_url: "one" }, { image_url: "two" }], ["sepia(1)", "grayscale(1)"], {
    loadImage: async (src) => ({ image: { src, width: 1600, height: 900 }, objectUrl: src }),
    makeCanvas: () => ({ getContext: () => ({ fillRect() {}, drawImage(image, ...args) { draws.push([image.src, this.filter, ...args]); } }), toDataURL: () => "data:image/jpeg;base64,frame" }),
    revoke: (url) => revoked.push(url),
  });
  assert.equal(result.length, 2);
  assert.deepEqual(draws[0], ["one", "sepia(1)", 0, 60, 640, 360]);
  assert.deepEqual(revoked, ["one", "two"]);
});
