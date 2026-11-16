import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBoothAppearance, boothAppearanceStyle, createBoothAppearanceController } from './boothAppearance.js';

const image = '/watermark-files/booth_background_0123456789abcdef0123456789abcdef.jpg';
test('appearance defaults preserve original UI and accept only controlled preset values and image paths', () => {
  assert.deepEqual(normalizeBoothAppearance(null), { theme: 'default', dim: 35, image_url: null, has_image: false });
  assert.equal(normalizeBoothAppearance({ theme: 'pink', dim: 0 }).dim, 0);
  assert.equal(normalizeBoothAppearance({ theme: 'floral', dim: 100 }).dim, 35);
  assert.equal(normalizeBoothAppearance({ theme: 'custom', image_url: 'https://example.com/private.jpg', has_image: true }).theme, 'default');
  assert.equal(normalizeBoothAppearance({ theme: 'custom', image_url: image, has_image: true }).theme, 'custom');
});
test('custom backdrop resolves only trusted local asset paths and darkness is independent of photo output', () => {
  const style = boothAppearanceStyle({ theme: 'custom', dim: 42, image_url: image, has_image: true }, 'http://127.0.0.1:8000');
  assert.equal(style['--booth-dim-opacity'], 0.42);
  assert.equal(style['--booth-background'], `url("http://127.0.0.1:8000${image}")`);
  assert.match(boothAppearanceStyle({ theme: 'floral' })['--booth-background'], /gradient|svg/);
  assert.doesNotMatch(boothAppearanceStyle({ theme: 'custom', image_url: '/../../secret' })['--booth-background'], /secret/);
});
test('slow initial GET cannot overwrite a newly saved wedding theme', async () => {
  let finishLoad; const changes = [];
  const controller = createBoothAppearanceController({ onChange: value => changes.push(value),
    request: (_path, options) => options?.method === 'POST' ? Promise.resolve({ theme: 'pink', dim: 25 })
      : new Promise(resolve => { finishLoad = resolve; }) });
  const loading = controller.load();
  assert.equal(await controller.save({ theme: 'pink', dim: 25 }), true);
  finishLoad({ theme: 'default', dim: 35 }); await loading;
  assert.deepEqual(changes.map(value => value.theme), ['pink']);
});
test('save/upload failures retain the current appearance, report errors, and unlock retry', async () => {
  const changes = [], errors = [], busy = [];
  let fail = false;
  const controller = createBoothAppearanceController({ onChange: value => changes.push(value), onError: value => errors.push(value), onBusy: value => busy.push(value),
    request: async () => { if (fail) throw Error('Offline'); return { theme: 'elegant', dim: 30 }; } });
  await controller.load(); fail = true;
  assert.equal(await controller.save({ theme: 'pink', dim: 40 }), false);
  assert.equal(await controller.upload('image-bytes', 40), false);
  assert.deepEqual(changes.map(value => value.theme), ['elegant']);
  assert.match(errors.at(-1), /Offline/);
  assert.deepEqual(busy, [true, false, true, false]);
});
test('a second mutation cannot replace an in-flight save or submit another upload', async () => {
  let finish; let requests = 0;
  const controller = createBoothAppearanceController({ request: () => { requests++; return new Promise(resolve => { finish = resolve; }); } });
  const saving = controller.save({ theme: 'pink', dim: 20 });
  assert.equal(await controller.upload('image-bytes', 30), false);
  assert.equal(requests, 1);
  finish({ theme: 'pink', dim: 20 }); assert.equal(await saving, true);
});
test('custom upload sends only image bytes/darkness and applies server-managed asset response', async () => {
  let sent, state;
  const controller = createBoothAppearanceController({ request: async (path, options) => {
    sent = { path, body: JSON.parse(options.body) }; return { theme: 'custom', dim: 15, image_url: image, has_image: true };
  }, onChange: value => { state = value; } });
  assert.equal(await controller.upload('encoded-image', 15), true);
  assert.deepEqual(sent, { path: '/photobooth/appearance/image', body: { data_base64: 'encoded-image', dim: 15 } });
  assert.equal(state.image_url, image);
});
test('disposed requests cannot update a different page', async () => {
  let finish;
  const controller = createBoothAppearanceController({ request: () => new Promise(resolve => { finish = resolve; }), onChange() { assert.fail('Stale update'); } });
  const loading = controller.load(); controller.dispose(); finish({ theme: 'pink' });
  assert.equal(await loading, false);
});
