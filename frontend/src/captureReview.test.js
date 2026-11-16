import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCaptureReview, advanceCaptureReview } from './captureReview.js';
test('review defaults and invalid limits stay usable', () => {
  assert.deepEqual(normalizeCaptureReview(), { enabled: true, seconds: 5, allowRetake: true, maxRetakes: 1 });
  assert.deepEqual(normalizeCaptureReview({ enabled: false, seconds: -2, allowRetake: false, maxRetakes: 99 }),
    { enabled: false, seconds: 5, allowRetake: false, maxRetakes: 1 });
  assert.equal(normalizeCaptureReview({ seconds: 30, maxRetakes: 5 }).seconds, 30);
});
test('review clock pauses and accepts at zero', () => {
  assert.equal(advanceCaptureReview(500, 250, true), 500);
  assert.equal(advanceCaptureReview(500, 250, false), 250);
  assert.equal(advanceCaptureReview(200, 250, false), 0);
});
