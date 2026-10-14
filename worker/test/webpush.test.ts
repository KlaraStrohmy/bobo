import { env } from 'cloudflare:test';
import { importJWK, jwtVerify } from 'jose';
import { beforeEach, describe, expect, it } from 'vitest';
import { b64urlDecode, b64urlEncode, utf8 } from '../src/b64';
import type { Env } from '../src/env';
import { sendToUser } from '../src/push';
import { encryptPayload, p256Jwk, PUSH_TTL_SECONDS, vapidAuthorization } from '../src/webpush';
import { decrypt, importEcdhPair, newSubscriptionKeys, newVapidKeys } from './pushCrypto';
import { as, Clock, client, resetDb } from './helpers';

// RFC 8291 section 5 / appendix A.
const RFC = {
  plaintext: 'When I grow up, I want to be a watermelon',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  uaPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  body:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml' +
    'mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT' +
    'pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

describe('RFC 8291 encryption', () => {
  it('reproduces the RFC 8291 example byte for byte', async () => {
    const body = await encryptPayload(utf8(RFC.plaintext), RFC.uaPublic, RFC.auth, {
      salt: b64urlDecode(RFC.salt),
      serverKeys: await importEcdhPair(RFC.asPublic, RFC.asPrivate),
    });
    expect(b64urlEncode(body)).toBe(RFC.body);
  });

  it('decrypts the RFC example with the user agent key', async () => {
    const ua = await importEcdhPair(RFC.uaPublic, RFC.uaPrivate);
    expect(await decrypt(b64urlDecode(RFC.body), ua.privateKey, RFC.uaPublic, RFC.auth)).toBe(RFC.plaintext);
  });

  it('round-trips a random-key encryption of a real reminder payload', async () => {
    const sub = await newSubscriptionKeys();
    const text = JSON.stringify({ title: 'Oběd zítra?', body: 'Čtvrtek 15. 10. — budeš obědvat?', date: '2026-10-15' });
    const body = await encryptPayload(utf8(text), sub.p256dh, sub.auth);
    expect(await decrypt(body, sub.privateKey, sub.p256dh, sub.auth)).toBe(text);
    // Fresh salt and ephemeral key every time.
    const again = await encryptPayload(utf8(text), sub.p256dh, sub.auth);
    expect(b64urlEncode(again)).not.toBe(b64urlEncode(body));
  });

  it('rejects malformed subscription keys', async () => {
    await expect(encryptPayload(utf8('x'), 'k', 'a')).rejects.toThrow();
  });
});

describe('VAPID', () => {
  it('signs an ES256 JWT verifiable with the public key', async () => {
    const keys = await newVapidKeys();
    const header = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', keys, new Date());
    const m = /^vapid t=([^,]+), k=(.+)$/.exec(header)!;
    expect(m[2]).toBe(keys.publicKey);
    const pub = await importJWK(p256Jwk(b64urlDecode(keys.publicKey)), 'ES256');
    const { payload, protectedHeader } = await jwtVerify(m[1], pub, { audience: 'https://fcm.googleapis.com' });
    expect(protectedHeader.alg).toBe('ES256');
    expect(payload.sub).toBe('mailto:test@strohmy.cz');
    expect(payload.exp! - Date.now() / 1000).toBeGreaterThan(PUSH_TTL_SECONDS - 60);
    expect(payload.exp! - Date.now() / 1000).toBeLessThanOrEqual(24 * 3600);
  });
});

describe('sending', () => {
  beforeEach(resetDb);

  it('delivers to every subscription and prunes 404/410 ones (mocked fetch)', async () => {
    const vapid = await newVapidKeys();
    const pushEnv = { ...env, VAPID_PUBLIC_KEY: vapid.publicKey, VAPID_PRIVATE_KEY: vapid.privateKey, VAPID_SUBJECT: vapid.subject } as Env;
    const c = client(new Clock());
    const subs = [];
    for (let i = 0; i < 4; i++) {
      const keys = await newSubscriptionKeys();
      subs.push(keys);
      await c.post('/api/push/subscribe', { endpoint: `https://push.example/${i}`, keys: { p256dh: keys.p256dh, auth: keys.auth } }, as('a@x.cz'));
    }
    const requests: Request[] = [];
    const statuses: Record<string, number> = { '/1': 410, '/2': 500, '/3': 404 };
    const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = new Request(input, init);
      requests.push(req.clone());
      return new Response(null, { status: statuses[new URL(req.url).pathname] ?? 201 });
    }) as typeof fetch;

    const payload = { title: 't', body: 'b' };
    expect(await sendToUser(pushEnv, 'a@x.cz', payload, { fetch: fakeFetch })).toBe(1);
    const left = await env.DB.prepare('SELECT endpoint FROM push_subscriptions ORDER BY endpoint').all<{ endpoint: string }>();
    expect(left.results.map((r) => r.endpoint)).toEqual(['https://push.example/0', 'https://push.example/2']);

    expect(requests).toHaveLength(4);
    const first = requests[0];
    expect(first.method).toBe('POST');
    expect(first.headers.get('TTL')).toBe(String(12 * 3600));
    expect(first.headers.get('Content-Encoding')).toBe('aes128gcm');
    expect(first.headers.get('Authorization')).toMatch(/^vapid t=.+, k=/);
    const body = new Uint8Array(await first.arrayBuffer());
    expect(JSON.parse(await decrypt(body, subs[0].privateKey, subs[0].p256dh, subs[0].auth))).toEqual(payload);
  });

  it('skips pushing when VAPID keys are missing', async () => {
    expect(await sendToUser({ ...env, VAPID_PRIVATE_KEY: undefined } as Env, 'a@x.cz', {})).toBe(0);
  });
});
