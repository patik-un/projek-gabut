import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppUpdater } from './appUpdater.js';

function fixture(overrides = {}) {
  const states = [], locks = [], calls = [];
  const native = {
    check: async () => ({ currentVersion: '0.1.6', supported: true, version: '0.1.7', notes: 'Perbaikan' }),
    download: async progress => { progress({ event: 'Started', total: null }); progress({ event: 'Progress', downloaded: 20, total: null }); },
    install: async progress => { calls.push('install'); progress({ event: 'Waiting' }); },
    cancel: async () => calls.push('cancel'),
    ...overrides.native,
  };
  const updater = createAppUpdater({ native, busy: overrides.busy || (() => ''),
    onState: state => states.push(state), onLock: value => locks.push(value) });
  return { updater, native, states, locks, calls };
}

test('available update includes native current version and survives postponement', async () => {
  const f = fixture(); await f.updater.check(); f.updater.postpone();
  assert.equal(f.updater.state.currentVersion, '0.1.6');
  assert.equal(f.updater.state.update.version, '0.1.7');
  assert.equal(f.updater.state.notice, false);
});
test('up to date, offline and unsupported are distinct outcomes', async () => {
  const f = fixture({ native: { check: async () => ({ currentVersion: '0.1.6', supported: true }) } });
  await f.updater.check(); assert.equal(f.updater.state.phase, 'current');
  f.native.check = async () => { throw new Error('offline'); };
  await f.updater.check(); assert.equal(f.updater.state.phase, 'error');
  assert.match(f.updater.state.error, /offline/);
  f.native.check = async () => ({ currentVersion: '0.1.6', supported: false });
  await f.updater.check(); assert.equal(f.updater.state.phase, 'unsupported');
});
test('busy capture prevents download and never locks the application', async () => {
  let downloaded = false;
  const f = fixture({ busy: () => 'Sesi foto aktif', native: { download: async () => { downloaded = true; } } });
  await f.updater.check(); await f.updater.install();
  assert.equal(downloaded, false); assert.deepEqual(f.locks, []);
  assert.match(f.updater.state.error, /Sesi foto aktif/);
});
test('double install starts one download and handles unknown content length', async () => {
  let finish, downloads = 0;
  const f = fixture({ native: { download: async progress => {
    downloads++; progress({ event: 'Progress', downloaded: 123, total: null });
    await new Promise(resolve => { finish = resolve; });
  } } });
  await f.updater.check(); const pending = f.updater.install(); await f.updater.install();
  assert.equal(f.updater.state.percent, null); assert.equal(downloads, 1);
  finish(); await pending; assert.deepEqual(f.calls, ['install']);
});
test('failed download leaves install untouched, releases lock and supports retry', async () => {
  const f = fixture({ native: { download: async () => { throw new Error('signature invalid'); } } });
  await f.updater.check(); await f.updater.install();
  assert.deepEqual(f.calls, ['cancel']); assert.deepEqual(f.locks, [true, false]);
  assert.equal(f.updater.state.phase, 'error');
  f.native.download = async () => {}; await f.updater.install();
  assert.deepEqual(f.calls, ['cancel', 'install']);
});
test('installer failure cancels backend pause and restores normal UI', async () => {
  const f = fixture({ native: { install: async () => { throw new Error('installer failed'); } } });
  await f.updater.check(); await f.updater.install();
  assert.deepEqual(f.calls, ['cancel']); assert.equal(f.locks.at(-1), false);
  assert.match(f.updater.state.error, /installer failed/);
});
test('disposed updater ignores late checks', async () => {
  let finish;
  const f = fixture({ native: { check: () => new Promise(resolve => { finish = resolve; }) } });
  const pending = f.updater.check(); f.updater.dispose(); const count = f.states.length;
  finish({ supported: true, version: '9.0.0' }); await pending;
  assert.equal(f.states.length, count);
});
test('late progress from a failed install cannot revive or replace a retry', async () => {
  let staleInstall, staleDownload;
  const f = fixture({ native: {
    download: async cb => { staleDownload = cb; },
    install: async cb => { staleInstall = cb; throw new Error('installer failed'); },
  } });
  await f.updater.check(); await f.updater.install();
  staleInstall({ event: 'Installing' });
  assert.equal(f.updater.state.phase, 'error');
  let release;
  f.native.download = async () => { await new Promise(resolve => { release = resolve; }); };
  f.native.install = async () => {};
  const retry = f.updater.install();
  staleDownload({ event: 'Progress', downloaded: 100, total: 100 });
  staleInstall({ event: 'Installing' });
  assert.equal(f.updater.state.phase, 'downloading');
  assert.equal(f.updater.state.percent, null);
  release(); await retry;
});
