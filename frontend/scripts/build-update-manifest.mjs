import { readFileSync, statSync } from 'node:fs';
import { basename } from 'node:path';

export function buildUpdateManifest({ version, tag, installerPath, signaturePath, repository, notes = '' }) {
  if (!/^\d+\.\d+\.\d+$/.test(version) || tag !== `v${version}`) throw new Error('Release tag must match stable package version');
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('Invalid repository');
  const name = basename(installerPath);
  if (!name.endsWith(`_${version}_x64-setup.exe`) || statSync(installerPath).size === 0) throw new Error('Invalid installer version or empty installer');
  const signature = readFileSync(signaturePath, 'utf8').trim();
  if (!/^[A-Za-z0-9+/=]+$/.test(signature) || !Buffer.from(signature, 'base64').toString().startsWith('untrusted comment:')) throw new Error('Missing or invalid signature');
  return { version, notes, pub_date: new Date().toISOString(), platforms: { 'windows-x86_64': {
    signature, url: `https://github.com/${repository}/releases/download/${tag}/${encodeURIComponent(name)}`,
  } } };
}
