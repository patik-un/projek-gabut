import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyUpdateSignature } from './verify-update-signature.mjs';

// Public interoperability fixture from minisign-verify 0.2.5, verify_prehashed.
const publicKey = Buffer.from('untrusted comment: public key\nRWQf6LRCGA9i53mlYecO4IzT51TGPpvWucNSCh1CBM0QTaLn73Y7GFO3\n').toString('base64');
const signature = Buffer.from('untrusted comment: signature from minisign secret key\nRUQf6LRCGA9i559r3g7V1qNyJDApGip8MfqcadIgT9CuhV3EMhHoN1mGTkUidF/z7SrlQgXdy8ofjb7bNJJylDOocrCo8KLzZwo=\ntrusted comment: timestamp:1556193335\tfile:test\ny/rUw2y8/hOUYjZU71eHp/Wo1KZ40fGy2VJEDl34XMJM+TX48Ss/17u3IvIfbVR1FkZZSNCisQbuQY+bHwhEBg==').toString('base64');
test('verifies an independent real Minisign prehashed signature', () => {
  assert.equal(verifyUpdateSignature(Buffer.from('test'), signature, publicKey), true);
});
test('tampered installer and trusted comment fail verification', () => {
  assert.throws(() => verifyUpdateSignature(Buffer.from('changed'), signature, publicKey), /signature/i);
  const changed = Buffer.from(Buffer.from(signature, 'base64').toString().replace('file:test', 'file:other')).toString('base64');
  assert.throws(() => verifyUpdateSignature(Buffer.from('test'), changed, publicKey), /signature/i);
});
