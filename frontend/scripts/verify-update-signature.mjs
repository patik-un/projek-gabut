import { createHash, createPublicKey, verify } from 'node:crypto';

// Tauri wraps a Minisign document in base64. This is a publication check;
// the installed application still verifies updates through Tauri's verifier.
export function verifyUpdateSignature(bytes, signature, publicKey) {
  const keyLines = Buffer.from(publicKey.trim(), 'base64').toString().trim().split(/\r?\n/);
  const lines = Buffer.from(signature.trim(), 'base64').toString().trim().split(/\r?\n/);
  const key = Buffer.from(keyLines[1] || '', 'base64');
  const sig = Buffer.from(lines[1] || '', 'base64');
  const global = Buffer.from(lines[3] || '', 'base64');
  if (key.length !== 42 || sig.length !== 74 || global.length !== 64 || key.subarray(0, 2).toString() !== 'Ed' ||
      sig.subarray(0, 2).toString() !== 'ED' || !lines[2]?.startsWith('trusted comment: ') ||
      !key.subarray(2, 10).equals(sig.subarray(2, 10))) throw new Error('Invalid update signature format or key');
  const verifyKey = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), key.subarray(10)]), format: 'der', type: 'spki' });
  const digest = createHash('blake2b512').update(bytes).digest();
  if (!verify(null, digest, verifyKey, sig.subarray(10)) ||
      !verify(null, Buffer.concat([sig.subarray(10), Buffer.from(lines[2].slice(17))]), verifyKey, global)) throw new Error('Update signature verification failed');
  return true;
}
