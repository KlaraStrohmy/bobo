#!/usr/bin/env node
// Print a fresh VAPID key pair as env lines (WebCrypto, no dependencies).
//   VAPID_PUBLIC_KEY  = base64url uncompressed P-256 point (65 bytes, 0x04||x||y);
//                       the browser's applicationServerKey and the `k=` of the VAPID header.
//   VAPID_PRIVATE_KEY = base64url raw private scalar d (32 bytes), same format as the
//                       old Python backend. The worker rebuilds the JWK from d plus the
//                       public key, so both values must come from the same pair.
// Optional: --dev-vars also prints PUSH_TOKEN_SECRET and AUTH_DISABLED for .dev.vars.
import { webcrypto as crypto } from 'node:crypto';

const b64url = (bytes) => Buffer.from(bytes).toString('base64url');

const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
  'sign',
  'verify',
]);
const publicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', publicKey));
const { d } = await crypto.subtle.exportKey('jwk', privateKey);

console.log(`VAPID_PUBLIC_KEY=${b64url(publicRaw)}`);
console.log(`VAPID_PRIVATE_KEY=${d}`);
if (process.argv.includes('--dev-vars')) {
  console.log(`PUSH_TOKEN_SECRET=${b64url(crypto.getRandomValues(new Uint8Array(32)))}`);
  console.log('AUTH_DISABLED=true');
}
