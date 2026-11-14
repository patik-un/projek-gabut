import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { verifyUpdateSignature } from './verify-update-signature.mjs';
import { buildUpdateManifest } from './build-update-manifest.mjs';

const [installer, runId, sourceSha] = process.argv.slice(2);
if (!installer || !/^\d+$/.test(runId || '') || !/^[a-f0-9]{40}$/.test(sourceSha || '')) throw new Error('Usage: node scripts/sign-update-locally.mjs INSTALLER RUN_ID SOURCE_SHA');
const config = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
const key = resolve('../.update-signing/event-booth.key');
// The private key is read only by the local signer. Never print its contents.
execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'tauri', '--', 'signer', 'sign', '-f', key, '-p', '', resolve(installer)], { stdio: 'ignore' });
const signature = readFileSync(`${installer}.sig`, 'utf8').trim();
const bytes = readFileSync(installer);
verifyUpdateSignature(bytes, signature, config.plugins.updater.pubkey);
buildUpdateManifest({ version: config.version, tag: `v${config.version}`, installerPath: installer,
  signaturePath: `${installer}.sig`, repository: 'patik-un/projek-gabut' });
const payload = { version: config.version, runId, sourceSha, sha256: createHash('sha256').update(bytes).digest('hex'), signature };
writeFileSync(`${installer}.release.json`, JSON.stringify(payload));
console.log(`Public release payload saved: ${installer}.release.json (no private key)`);
