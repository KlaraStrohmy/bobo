/**
 * Signed tokens that let a notification action answer without MSAL.
 *
 * Format: `base64url(user_id|date|exp) + "." + base64url(HMAC-SHA256)` (unpadded),
 * where `exp` is a Unix timestamp in seconds (the day's cutoff). Identical to
 * the Python backend, so tokens are interchangeable given the same secret.
 */
import { b64urlDecode, b64urlEncode, utf8 } from './b64';
import { parseDate } from './tz';

export class InvalidToken extends Error {}
export class ExpiredToken extends Error {}

export interface TokenData {
  userId: string;
  day: string;
  exp: number;
}

async function sign(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', utf8(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64urlEncode(await crypto.subtle.sign('HMAC', key, utf8(payload)));
}

function safeEqual(a: string, b: string): boolean {
  const x = utf8(a);
  const y = utf8(b);
  return x.length === y.length && crypto.subtle.timingSafeEqual(x, y);
}

export async function makeToken(secret: string, userId: string, day: string, expires: Date): Promise<string> {
  const payload = b64urlEncode(utf8(`${userId}|${day}|${Math.floor(expires.getTime() / 1000)}`));
  return `${payload}.${await sign(secret, payload)}`;
}

/** Validate signature and expiry; throws InvalidToken or ExpiredToken. */
export async function verifyToken(secret: string, token: string, now: Date): Promise<TokenData> {
  const dot = token.indexOf('.');
  if (dot < 0) throw new InvalidToken('bad signature');
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!safeEqual(await sign(secret, payload), signature)) throw new InvalidToken('bad signature');
  let data: TokenData;
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(b64urlDecode(payload));
    const last = text.lastIndexOf('|');
    const mid = text.lastIndexOf('|', last - 1);
    if (last < 0 || mid < 0) throw new Error('missing fields');
    const day = parseDate(text.slice(mid + 1, last));
    const expStr = text.slice(last + 1);
    if (!day || !/^-?\d+$/.test(expStr)) throw new Error('bad fields');
    data = { userId: text.slice(0, mid), day, exp: Number(expStr) };
  } catch {
    throw new InvalidToken('malformed token');
  }
  if (now.getTime() / 1000 >= data.exp) throw new ExpiredToken('token expired');
  return data;
}
