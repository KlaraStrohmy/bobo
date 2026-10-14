import { env } from 'cloudflare:test';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTPayload } from 'jose';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { HttpError, identityFromClaims, validateToken } from '../src/auth';
import type { Env } from '../src/env';
import { Clock, client, resetDb } from './helpers';

const TENANT = 'tenant-1';
const CLIENT = 'client-1';
const testEnv = { ...env, AZURE_TENANT_ID: TENANT, AZURE_CLIENT_ID: CLIENT, AUTH_DISABLED: undefined } as Env;

let privateKey: CryptoKey;
let otherKey: CryptoKey;
let getKey: ReturnType<typeof createLocalJWKSet>;

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  otherKey = (await generateKeyPair('RS256')).privateKey;
  getKey = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256' }] });
});

function token(claims: JWTPayload = {}, key = privateKey, kid = 'k1'): Promise<string> {
  const base: JWTPayload = {
    iss: `https://login.microsoftonline.com/${TENANT}/v2.0`,
    aud: CLIENT,
    exp: Math.floor(Date.now() / 1000) + 600,
    oid: 'oid-1',
    preferred_username: 'Alice@Strohmy.cz',
    name: 'Alice',
  };
  return new SignJWT({ ...base, ...claims }).setProtectedHeader({ alg: 'RS256', kid }).sign(key);
}

async function status(promise: Promise<unknown>): Promise<number> {
  try {
    await promise;
    return 200;
  } catch (err) {
    if (err instanceof HttpError) return err.status;
    throw err;
  }
}

describe('Entra token validation', () => {
  it('accepts v2 tokens with the client id GUID audience', async () => {
    const ident = identityFromClaims(await validateToken(await token(), testEnv, getKey));
    expect(ident).toEqual({ id: 'oid-1', email: 'alice@strohmy.cz', name: 'Alice' });
  });

  it('accepts v1 issuer and api:// audience', async () => {
    const v1 = await token({ iss: `https://sts.windows.net/${TENANT}/`, aud: `api://${CLIENT}` });
    expect((await validateToken(v1, testEnv, getKey)).oid).toBe('oid-1');
  });

  it('rejects bad audience, issuer, expiry, signature, kid and missing oid with 401', async () => {
    const bad = [
      token({ aud: 'api://other' }),
      token({ iss: 'https://evil/' }),
      token({ exp: 1 }),
      token({}, otherKey),
      token({}, privateKey, 'unknown'),
      token({ oid: undefined }),
      Promise.resolve('not-a-jwt'),
    ];
    for (const t of bad) expect(await status(validateToken(await t, testEnv, getKey))).toBe(401);
    const unsigned = await new SignJWT({ oid: 'x' }).setProtectedHeader({ alg: 'HS256' }).sign(new Uint8Array(32));
    expect(await status(validateToken(unsigned, testEnv, getKey))).toBe(401);
  });

  it('maps a JWKS fetch failure to 503', async () => {
    const failing = async () => {
      throw new TypeError('network down');
    };
    expect(await status(validateToken(await token(), testEnv, failing))).toBe(503);
  });

  describe('through the API', () => {
    beforeEach(resetDb);

    it('upserts the user from the bearer token', async () => {
      const c = client(new Clock(), { getKey }, { AZURE_TENANT_ID: TENANT, AZURE_CLIENT_ID: CLIENT, AUTH_DISABLED: undefined });
      expect((await c.get('/api/me')).status).toBe(401);
      expect((await c.get('/api/me', { 'X-Dev-User': 'alice@strohmy.cz' })).status).toBe(401);
      expect((await c.get('/api/me', { Authorization: 'Bearer nope' })).status).toBe(401);
      const me = await c.get('/api/me', { Authorization: `Bearer ${await token()}` });
      expect(await me.json()).toMatchObject({ id: 'oid-1', email: 'alice@strohmy.cz', name: 'Alice' });
      // Second request updates name/email but keeps the row.
      await c.get('/api/me', { Authorization: `Bearer ${await token({ name: 'Alice B.' })}` });
      const row = await env.DB.prepare('SELECT name FROM users WHERE id = ?1').bind('oid-1').first<{ name: string }>();
      expect(row?.name).toBe('Alice B.');
    });
  });
});
