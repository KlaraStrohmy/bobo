/** Test-side Web Push crypto: the user-agent (decrypting) half of RFC 8291 and key generators. */
import { expect } from 'vitest';
import { b64urlDecode, b64urlEncode, concatBytes, utf8 } from '../src/b64';
import { p256Jwk, type VapidKeys } from '../src/webpush';

export const ECDH = { name: 'ECDH', namedCurve: 'P-256' } as const;

export async function importEcdhPair(pub: string, priv: string): Promise<CryptoKeyPair> {
  const jwk = p256Jwk(b64urlDecode(pub), b64urlDecode(priv));
  const { d: _d, ...publicJwk } = jwk;
  return {
    privateKey: await crypto.subtle.importKey('jwk', jwk, ECDH, true, ['deriveBits']),
    publicKey: await crypto.subtle.importKey('jwk', publicJwk, ECDH, true, []),
  };
}

async function hkdf(salt: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, bytes: number) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8));
}

/** Independent user-agent side of RFC 8291: decrypt an aes128gcm push body. */
export async function decrypt(body: Uint8Array<ArrayBuffer>, uaPrivate: CryptoKey, uaPublicB64: string, authB64: string): Promise<string> {
  const salt = body.slice(0, 16);
  const rs = new DataView(body.buffer, body.byteOffset).getUint32(16);
  const idlen = body[20];
  const asPublic = body.slice(21, 21 + idlen);
  const ciphertext = body.slice(21 + idlen);
  expect(rs).toBe(4096);
  expect(idlen).toBe(65);
  const asKey = await crypto.subtle.importKey('raw', asPublic, ECDH, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey } as SubtleCryptoDeriveKeyAlgorithm, uaPrivate, 256));
  const uaPublic = b64urlDecode(uaPublicB64);
  const ikm = await hkdf(b64urlDecode(authB64), ecdh, concatBytes(utf8('WebPush: info\0'), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, utf8('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, utf8('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const padded = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ciphertext));
  let end = padded.length - 1;
  while (end >= 0 && padded[end] === 0) end--;
  expect(padded[end]).toBe(2); // last-record delimiter
  return new TextDecoder().decode(padded.slice(0, end));
}

export async function newSubscriptionKeys() {
  const pair = (await crypto.subtle.generateKey(ECDH, true, ['deriveBits'])) as CryptoKeyPair;
  const p256dh = b64urlEncode((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer);
  const auth = b64urlEncode(crypto.getRandomValues(new Uint8Array(16)));
  return { privateKey: pair.privateKey, p256dh, auth };
}

/** Same derivation as scripts/gen-vapid.mjs. */
export async function newVapidKeys(): Promise<VapidKeys> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey('jwk', pair.privateKey)) as JsonWebKey;
  const pub = concatBytes(new Uint8Array([4]), b64urlDecode(jwk.x!), b64urlDecode(jwk.y!));
  return { publicKey: b64urlEncode(pub), privateKey: jwk.d!, subject: 'mailto:test@strohmy.cz' };
}

