import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSigningPayload, validateBuildProvenance, assertIncreasingVersion } from './update-release-validation.mjs';

const payload = { version: '0.1.6', runId: '123', sourceSha: 'a'.repeat(40), sha256: 'b'.repeat(64), signature: 'public-signature' };
const repo = 'patik-un/projek-gabut';
const run = { conclusion: 'success', head_sha: payload.sourceSha, head_repository: { full_name: repo }, path: '.github/workflows/windows-installer.yml' };
const ref = { object: { type: 'commit', sha: payload.sourceSha } };
test('public payload and tested source commit authorize stable publication', () => {
  assert.doesNotThrow(() => validateSigningPayload(payload, repo));
  assert.doesNotThrow(() => validateBuildProvenance(payload, repo, run, ref, { version: '0.1.6' }));
});
test('untrusted run IDs, failed build, other source, other repo and mismatched tag are rejected', () => {
  assert.throws(() => validateSigningPayload({ ...payload, runId: '../wrong' }, repo));
  for (const changed of [{ ...run, conclusion: 'failure' }, { ...run, head_sha: 'c'.repeat(40) },
    { ...run, head_repository: { full_name: 'someone/other' } }]) {
    assert.throws(() => validateBuildProvenance(payload, repo, changed, ref, { version: '0.1.6' }));
  }
  assert.throws(() => validateBuildProvenance(payload, repo, run, { object: { type: 'commit', sha: 'c'.repeat(40) } }, { version: '0.1.6' }));
  assert.throws(() => validateBuildProvenance(payload, repo, run, ref, { version: '0.1.5' }));
});
test('new stable versions increase numerically and cannot downgrade latest', () => {
  assert.doesNotThrow(() => assertIncreasingVersion('0.1.10', 'v0.1.9'));
  assert.doesNotThrow(() => assertIncreasingVersion('0.1.6', null));
  for (const version of ['0.1.5', '0.1.6']) assert.throws(() => assertIncreasingVersion(version, 'v0.1.6'));
});
