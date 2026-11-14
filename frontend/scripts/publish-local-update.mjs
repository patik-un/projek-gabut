import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { buildUpdateManifest } from './build-update-manifest.mjs';
import { verifyUpdateSignature } from './verify-update-signature.mjs';
import { validateSigningPayload, validateBuildProvenance, assertIncreasingVersion } from './update-release-validation.mjs';

const gh = args => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const repo = process.env.GH_REPO;
const payload = JSON.parse(process.env.SIGNED_RELEASE || '{}');
validateSigningPayload(payload, repo);
const tag = `v${payload.version}`;
const run = JSON.parse(gh(['api', `repos/${repo}/actions/runs/${payload.runId}`]));
const ref = JSON.parse(gh(['api', `repos/${repo}/git/ref/tags/${tag}`]));
const source = JSON.parse(gh(['api', `repos/${repo}/contents/frontend/src-tauri/tauri.conf.json?ref=${payload.sourceSha}`]));
const config = JSON.parse(Buffer.from(source.content, 'base64').toString());
validateBuildProvenance(payload, repo, run, ref, config);
gh(['run', 'download', payload.runId, '--repo', repo, '--name', 'event-booth-studio-windows-installer', '--dir', 'release']);
const installers = readdirSync('release').filter(name => name.endsWith('.exe'));
if (installers.length !== 1) throw new Error('Exactly one installer required');
const installerPath = join('release', installers[0]);
const bytes = readFileSync(installerPath);
if (createHash('sha256').update(bytes).digest('hex') !== payload.sha256) throw new Error('Installer checksum does not match local signing');
verifyUpdateSignature(bytes, payload.signature, config.plugins.updater.pubkey);
const signaturePath = `${installerPath}.sig`;
writeFileSync(signaturePath, payload.signature + '\n');
const manifest = buildUpdateManifest({ version: payload.version, tag, installerPath, signaturePath, repository: repo,
  notes: `Event Booth Studio ${payload.version}\nPembaruan aplikasi, perbaikan bug, dan peningkatan kestabilan.` });
let previous;
try { previous = JSON.parse(gh(['api', `repos/${repo}/releases/latest`])); }
catch (error) { if (!String(error.stderr).includes('404')) throw error; }
assertIncreasingVersion(payload.version, previous?.tag_name);
writeFileSync('release/latest.json', JSON.stringify(manifest, null, 2) + '\n');
writeFileSync('release-notes.md', manifest.notes + '\n\nVersi 0.1.5 dan sebelumnya: pasang installer ini satu kali untuk mengaktifkan update dari aplikasi.');
gh(['release', 'create', tag, ...readdirSync('release').map(name => join('release', name)), '--repo', repo,
  '--draft', '--verify-tag', '--title', `Event Booth Studio ${tag}`, '--notes-file', 'release-notes.md']);
gh(['release', 'edit', tag, '--repo', repo, '--draft=false', '--latest']);
console.log(`Published signed update ${tag}; private signing key stayed on the local machine.`);
