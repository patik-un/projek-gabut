import test from 'node:test';
import assert from 'node:assert/strict';
import { setBoothFullscreen } from './boothFullscreen.js';
test('desktop fullscreen uses the native window without browser calls', async () => {
  const values = [];
  await setBoothFullscreen(true, { nativeWindow: { setFullscreen: async value => values.push(value) }, document: {} });
  await setBoothFullscreen(false, { nativeWindow: { setFullscreen: async value => values.push(value) }, document: {} });
  assert.deepEqual(values, [true, false]);
});
test('browser fullscreen enters the document and can exit with session intact', async () => {
  let entered = false, exited = false;
  const document = { documentElement: { requestFullscreen: async () => { entered = true; } }, fullscreenElement: {}, exitFullscreen: async () => { exited = true; } };
  await setBoothFullscreen(true, { document }); await setBoothFullscreen(false, { document });
  assert.ok(entered && exited);
});
test('unsupported and rejected fullscreen operations produce an actionable failure', async () => {
  await assert.rejects(setBoothFullscreen(true, { document: { documentElement: {} } }), /fullscreen/i);
  await assert.rejects(setBoothFullscreen(true, { nativeWindow: { setFullscreen: async () => { throw Error('Ditolak'); } } }), /Ditolak/);
});
