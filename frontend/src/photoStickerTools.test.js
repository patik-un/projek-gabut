import test from "node:test";
import assert from "node:assert/strict";
import { normalizeRect, fitDimensions, paintAlphaStroke, pushHistory, stepHistory, hasVisiblePixels, backgroundRemovalPayload } from "./photoStickerTools.js";

test("crop geometry rejects nonfinite inputs and bounds selection", () => {
  assert.deepEqual(normalizeRect({ x: NaN, y: Infinity, width: -5, height: 2 }), { x: 0, y: 0, width: .01, height: 1 });
  assert.deepEqual(normalizeRect({ x: .9, y: .8, width: .8, height: .9 }), { x: .9, y: .8, width: 1-.9, height: 1-.8 });
  assert.deepEqual(fitDimensions(2400,1200,512), { width:512, height:256 });
  assert.throws(() => fitDimensions(Infinity,2,512));
});
test("erase and restore follow original alpha and ignore invalid strokes", () => {
 const original = new Uint8ClampedArray(8*8*4).fill(200);
 const pixels = original.slice();
 assert.equal(paintAlphaStroke(pixels, original, 8,8,{x:3,y:3},{x:3,y:3},2,"erase"),true);
 assert.equal(pixels[(3*8+3)*4+3],0);
 assert.equal(pixels[3],200);
 assert.equal(paintAlphaStroke(pixels,original,8,8,{x:NaN,y:0},{x:2,y:2},2,"erase"),false);
 assert.equal(paintAlphaStroke(pixels,original,8,8,{x:3,y:3},{x:3,y:3},2,"restore"),true);
 assert.deepEqual(pixels,original);
 assert.equal(hasVisiblePixels(new Uint8ClampedArray(12)),false);
 assert.equal(hasVisiblePixels(pixels),true);
});
test("history excludes noops, caps snapshots and truncates redo branch", () => {
 let h = { entries:["a"], index:0 };
 assert.equal(pushHistory(h,"a"),h);
 for(let i=0;i<25;i++) h=pushHistory(h,String(i));
 assert.equal(h.entries.length,20);
 h=stepHistory(h,-1);
 h=pushHistory(h,"branch");
 assert.equal(h.entries.at(-1),"branch");
 assert.equal(stepHistory(h,1),h);
 assert.equal(h.entries.includes("24"),false);
});

test("background removal omits a full-image guide and retains bounded subject guides", () => {
 assert.deepEqual(backgroundRemovalPayload("image",{x:0,y:0,width:1,height:1}),{image_data:"image"});
 assert.deepEqual(backgroundRemovalPayload("image",{x:.2,y:.1,width:.5,height:.7}),{image_data:"image",rect:{x:.2,y:.1,width:.5,height:.7}});
 assert.deepEqual(backgroundRemovalPayload("image",{x:NaN,y:NaN,width:Infinity,height:Infinity}),{image_data:"image"});
});
