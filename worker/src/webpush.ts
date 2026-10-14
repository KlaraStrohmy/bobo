/**
 * Web Push with WebCrypto only: RFC 8291 message encryption (aes128gcm,
 * RFC 8188) and RFC 8292 VAPID (ES256 JWT).
 */
import { SignJWT } from 'jose';
import { b64urlDecode, b64urlEncode, concatBytes, utf8 } from './b64';

export const PUSH_TTL_SECONDS = 12 * 3600;
const RECORD_SIZE = 4096;

export interface PushTarget {
  endpoint: string;
  /** base64url uncompressed P-256 point from `PushSubscription.keys.p256dh` */
  p256dh: string;
  /** base64url 16-byte secret from `PushSubscription.keys.auth` */
  auth: string;
}

export interface VapidKeys {
  /** base64url uncompressed P-256 point (65 bytes, 0x04‖x‖y) */
  publicKey: string;
  /** base64url raw private scalar d (32 bytes) */
  privateKey: string;
  /** `mailto:` or `https:` contact */
  subject: string;
}

/** Deterministic inputs, only for reproducing the RFC 8291 test vector. */
export interface EncryptOverrides {
  salt?: Uint8Array<ArrayBuffer>;
  /** application-server ephemeral key pair */
  serverKeys?: CryptoKeyPair;
}

/** JWK for a P-256 key from a raw public point and optional raw private scalar. */
export function p256Jwk(publicRaw: Uint8Array, privateRaw?: Uint8Array): JsonWebKey {
  if (publicRaw.length !== 65 || publicRaw[0] !== 4) throw new Error('expected uncompressed P-256 point');
  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    x: b64urlEncode(publicRaw.slice(1, 33)),
    y: b64urlEncode(publicRaw.slice(33, 65)),
    ext: true,
  };
  if (privateRaw) {
    if (privateRaw.length !== 32) throw new Error('expected 32-byte P-256 private key');
    jwk.d = b64urlEncode(privateRaw);
  }
  return jwk;
}

async function hkdf(salt: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, bytes: number) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8));
}

/** Encrypt a push message body (RFC 8291, single aes128gcm record, no padding). */
export async function encryptPayload(
  plaintext: Uint8Array<ArrayBuffer>,
  uaPublicB64: string,
  authSecretB64: string,
  overrides: EncryptOverrides = {},
): Promise<Uint8Array<ArrayBuffer>> {
  const uaPublic = b64urlDecode(uaPublicB64);
  const authSecret = b64urlDecode(authSecretB64);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error('invalid p256dh key');
  if (authSecret.length < 16) throw new Error('invalid auth secret');
  if (plaintext.length + 1 + 16 > RECORD_SIZE - 86) throw new Error('payload too large');

  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const serverKeys =
    overrides.serverKeys ??
    ((await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair);
  const asPublic = new Uint8Array((await crypto.subtle.exportKey('raw', serverKeys.publicKey)) as ArrayBuffer);
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey } as SubtleCryptoDeriveKeyAlgorithm, serverKeys.privateKey, 256),
  );

  const keyInfo = concatBytes(utf8('WebPush: info\0'), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);
  const salt = overrides.salt ?? crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)));
  const cek = await hkdf(salt, ikm, utf8('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, utf8('Content-Encoding: nonce\0'), 12);

  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const record = concatBytes(plaintext, new Uint8Array([2])); // last-record delimiter
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, record));

  const header = new Uint8Array(new ArrayBuffer(16 + 4 + 1));
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE);
  header[20] = asPublic.length;
  return concatBytes(header, asPublic, ciphertext);
}

const vapidKeyCache = new Map<string, Promise<CryptoKey>>();

function vapidSigningKey(keys: VapidKeys): Promise<CryptoKey> {
  const cacheKey = `${keys.publicKey}:${keys.privateKey}`;
  let key = vapidKeyCache.get(cacheKey);
  if (!key) {
    const jwk = p256Jwk(b64urlDecode(keys.publicKey), b64urlDecode(keys.privateKey));
    key = crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    key.catch(() => vapidKeyCache.delete(cacheKey));
    vapidKeyCache.set(cacheKey, key);
  }
  return key;
}

/** `Authorization` header value for a push endpoint (RFC 8292). */
export async function vapidAuthorization(endpoint: string, keys: VapidKeys, now = new Date()): Promise<string> {
  const jwt = await new SignJWT({ sub: keys.subject })
    .setProtectedHeader({ typ: 'JWT', alg: 'ES256' })
    .setAudience(new URL(endpoint).origin)
    .setExpirationTime(Math.floor(now.getTime() / 1000) + PUSH_TTL_SECONDS)
    .sign(await vapidSigningKey(keys));
  return `vapid t=${jwt}, k=${keys.publicKey}`;
}

/** Encrypt and POST one push message; returns the push service's HTTP status. */
export async function sendWebPush(
  target: PushTarget,
  payload: string,
  keys: VapidKeys,
  fetchImpl: typeof fetch = fetch,
): Promise<number> {
  const body = await encryptPayload(utf8(payload), target.p256dh, target.auth);
  const res = await fetchImpl(target.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuthorization(target.endpoint, keys),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(PUSH_TTL_SECONDS),
      Urgency: 'high',
    },
    body,
  });
  // Drain the body so the connection can be reused.
  await res.arrayBuffer().catch(() => undefined);
  return res.status;
}
