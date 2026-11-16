import test from 'node:test';
import assert from 'node:assert/strict';
import { setBoothFullscreen, handleBoothFullscreenKey } from './boothFullscreen.js';
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

test('F12 enters only in the booth; Escape exits; repeats and modifiers are ignored', () => {
  const calls = [];
  const run = (key, active, extras = {}) => {
    let prevented = false;
    handleBoothFullscreenKey({ key, preventDefault() { prevented = true; }, ...extras }, active, value => calls.push(value));
    return prevented;
  };
  assert.equal(run('F12', false), false);
  assert.equal(run('F12', true), true);
  assert.equal(run('Escape', true), true);
  assert.equal(run('F12', true, { repeat: true }), false);
  assert.equal(run('F12', true, { ctrlKey: true }), false);
  assert.equal(run('a', true), false);
  assert.deepEqual(calls, [true, false]);
});

test('Escape still exits after switching away from the booth', () => {
  const calls = [];
  handleBoothFullscreenKey({key:'Escape',preventDefault(){}}, false, value => calls.push(value));
  assert.deepEqual(calls, [false]);
});
