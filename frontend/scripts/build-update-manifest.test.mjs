import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildUpdateManifest } from './build-update-manifest.mjs';

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'booth-release-')); t.after(() => rmSync(dir, { recursive: true }));
  const installerPath = join(dir, 'Event Booth Studio_0.1.6_x64-setup.exe');
  const signaturePath = `${installerPath}.sig`;
  writeFileSync(installerPath, 'installer-fixture');
  const signature = Buffer.from('untrusted comment: signature\nRWQfixture\ntrusted comment: timestamp\nfixture\n').toString('base64');
  writeFileSync(signaturePath, `${signature}\n`);
  return { version: '0.1.6', tag: 'v0.1.6', installerPath, signaturePath,
    repository: 'patik-un/projek-gabut', notes: 'Update aplikasi', signature };
}
test('manifest uses versioned public asset URL and signature content', t => {
  const f = fixture(t); const manifest = buildUpdateManifest(f);
  assert.equal(manifest.version, '0.1.6');
  assert.equal(manifest.platforms['windows-x86_64'].signature, f.signature);
  assert.equal(manifest.platforms['windows-x86_64'].url,
    'https://github.com/patik-un/projek-gabut/releases/download/v0.1.6/Event.Booth.Studio_0.1.6_x64-setup.exe');
});
test('mismatched version tag prevents publication', t => {
  assert.throws(() => buildUpdateManifest({ ...fixture(t), tag: 'v0.1.5' }), /tag/i);
});
test('missing signature, wrong installer version and empty artifact are rejected', t => {
  const f = fixture(t);
  assert.throws(() => buildUpdateManifest({ ...f, version: '0.1.7', tag: 'v0.1.7' }), /installer/i);
  writeFileSync(f.signaturePath, ''); assert.throws(() => buildUpdateManifest(f), /signature/i);
  writeFileSync(f.signaturePath, f.signature); writeFileSync(f.installerPath, '');
  assert.throws(() => buildUpdateManifest(f), /installer/i);
});
