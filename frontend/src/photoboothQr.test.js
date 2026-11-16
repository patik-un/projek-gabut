import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalPhotoboothQr } from './photoboothQr.js';

test('Drive folder links generate a local 640px PNG with no remote image URL', async () => {
  const image = await createLocalPhotoboothQr('https://drive.google.com/drive/folders/example-wedding-album');
  assert.ok(image.startsWith('data:image/png;base64,'));
  const bytes = Buffer.from(image.split(',')[1], 'base64');
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(bytes.readUInt32BE(16), 640);
  assert.equal(bytes.readUInt32BE(20), 640);
});
test('missing, oversized and non-web folder values cannot produce a misleading QR', async () => {
  for (const value of [null, '', 'javascript:alert(1)', 'file:///tmp/photo', 'not-a-url', 'https://example.com/' + 'a'.repeat(2100)]) {
    await assert.rejects(createLocalPhotoboothQr(value), /tautan/i);
  }
});
