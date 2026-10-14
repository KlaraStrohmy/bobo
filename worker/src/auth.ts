/** Entra ID access-token validation and user upsert (port of bobo.auth). */
import { createRemoteJWKSet, errors, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import type { Env } from './env';

export class HttpError extends Error {
  constructor(
    public status: number,
    public detail: string,
    public headers: Record<string, string> = {},
  ) {
    super(detail);
  }
}

const unauthorized = (detail: string) => new HttpError(401, detail, { 'WWW-Authenticate': 'Bearer' });

export interface Identity {
  id: string;
  email: string;
  name: string;
}

export interface UserRow {
  id: string;
  email: string;
  name: string;
  active: number;
  reminder_enabled: number;
  reminder_time: string;
  created_at: string;
  last_seen_at: string | null;
}

export const authDisabled = (env: Env): boolean => env.AUTH_DISABLED?.trim().toLowerCase() === 'true';

export function audiences(env: Env): string[] {
  return [`api://${env.AZURE_CLIENT_ID}`, env.AZURE_CLIENT_ID];
}

export function issuers(env: Env): string[] {
  return [`https://login.microsoftonline.com/${env.AZURE_TENANT_ID}/v2.0`, `https://sts.windows.net/${env.AZURE_TENANT_ID}/`];
}

// Module scope so the key set (and jose's internal cache/cooldown) survives across requests in an isolate.
let remoteJwks: { tenant: string; getKey: JWTVerifyGetKey } | null = null;

export function tenantJwks(env: Env): JWTVerifyGetKey {
  if (remoteJwks?.tenant !== env.AZURE_TENANT_ID) {
    const url = new URL(`https://login.microsoftonline.com/${env.AZURE_TENANT_ID}/discovery/v2.0/keys`);
    remoteJwks = { tenant: env.AZURE_TENANT_ID, getKey: createRemoteJWKSet(url, { timeoutDuration: 10_000 }) };
  }
  return remoteJwks.getKey;
}

/** Whether a verification failure was caused by not being able to fetch the key set. */
function isJwksFetchFailure(err: unknown): boolean {
  if (err instanceof errors.JWKSTimeout || err instanceof errors.JWKSInvalid) return true;
  if (err instanceof errors.JOSEError) return /Expected 200 OK/.test(err.message);
  return true; // network error / unexpected exception from fetch
}

/** Validate an Entra access token (RS256) and return its claims. */
export async function validateToken(token: string, env: Env, getKey: JWTVerifyGetKey = tenantJwks(env)): Promise<JWTPayload> {
  try {
    const { payload } = await jwtVerify(token, getKey, {
      algorithms: ['RS256'],
      audience: audiences(env),
      issuer: issuers(env),
      requiredClaims: ['exp', 'iss', 'aud', 'oid'],
    });
    if (typeof payload.oid !== 'string' || !payload.oid) throw unauthorized('invalid token: missing oid');
    return payload;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (err instanceof errors.JWKSNoMatchingKey) throw unauthorized('unknown signing key');
    if (isJwksFetchFailure(err)) {
      console.error('JWKS fetch failed:', err);
      throw new HttpError(503, 'cannot fetch signing keys');
    }
    throw unauthorized(`invalid token: ${(err as Error).message}`);
  }
}

export function identityFromClaims(claims: JWTPayload): Identity {
  const pick = (k: string) => (typeof claims[k] === 'string' ? (claims[k] as string) : '');
  const email = pick('preferred_username') || pick('upn') || pick('email');
  return { id: pick('oid'), email: email.toLowerCase(), name: pick('name') || email };
}

/** Resolve the caller (Bearer token, or `X-Dev-User` when auth is disabled). */
export async function getIdentity(req: Request, env: Env, getKey?: JWTVerifyGetKey): Promise<Identity> {
  if (authDisabled(env)) {
    const email = (req.headers.get('X-Dev-User') ?? '').trim().toLowerCase();
    if (!email) throw unauthorized('missing X-Dev-User header');
    return { id: email, email, name: email.split('@')[0] };
  }
  const header = req.headers.get('Authorization') ?? '';
  const space = header.indexOf(' ');
  const scheme = space < 0 ? header : header.slice(0, space);
  const token = space < 0 ? '' : header.slice(space + 1);
  if (scheme.toLowerCase() !== 'bearer' || !token) throw unauthorized('missing bearer token');
  return identityFromClaims(await validateToken(token, env, getKey ?? tenantJwks(env)));
}

/** Create or update the user record and bump `last_seen_at`. */
export async function upsertUser(db: D1Database, ident: Identity): Promise<UserRow> {
  const now = new Date().toISOString();
  const row = await db
    .prepare(
      `INSERT INTO users (id, email, name, created_at, last_seen_at) VALUES (?1, ?2, ?3, ?4, ?4)
       ON CONFLICT(id) DO UPDATE SET
         email = COALESCE(NULLIF(excluded.email, ''), users.email),
         name = COALESCE(NULLIF(excluded.name, ''), users.name),
         last_seen_at = excluded.last_seen_at
       RETURNING *`,
    )
    .bind(ident.id, ident.email, ident.name, now)
    .first<UserRow>();
  if (!row) throw new Error('user upsert returned nothing');
  return row;
}

export function adminSet(env: Env): Set<string> {
  return new Set(
    (env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAdmin(user: Pick<UserRow, 'email'>, env: Env): boolean {
  return adminSet(env).has(user.email.toLowerCase());
}
