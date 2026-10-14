import { env } from 'cloudflare:test';
import { createApp, type AppOptions } from '../src/app';

export const ADMIN = 'admin@strohmy.cz';
export const SECRET = 'test-secret';

/** Mutable "now"; default Monday 2026-10-12 10:00 Prague (cooking days Tue/Thu/Fri). */
export class Clock {
  now = new Date('2026-10-12T10:00:00+02:00');
}

export function as(email: string): Record<string, string> {
  return { 'X-Dev-User': email };
}

/** Wipe all tables and restore default settings. */
export async function resetDb(): Promise<void> {
  const db = env.DB;
  await db.batch([
    db.prepare('DELETE FROM reminder_log'),
    db.prepare('DELETE FROM push_subscriptions'),
    db.prepare('DELETE FROM responses'),
    db.prepare('DELETE FROM day_overrides'),
    db.prepare('DELETE FROM users'),
    db.prepare('DELETE FROM settings'),
    db.prepare(
      `INSERT INTO settings (key, value) VALUES ('cooking_weekdays', '[2,4,5]'),
       ('cutoff', '{"days_before":1,"time":"16:00"}')`,
    ),
  ]);
}

export interface TestClient {
  get(path: string, headers?: Record<string, string>): Promise<Response>;
  put(path: string, body: unknown, headers?: Record<string, string>): Promise<Response>;
  post(path: string, body: unknown, headers?: Record<string, string>): Promise<Response>;
  del(path: string, body?: unknown, headers?: Record<string, string>): Promise<Response>;
}

/** In-process client against the Hono app with the real (miniflare) D1 binding. */
export function client(clock: Clock, options: AppOptions = {}, envOverrides: Partial<typeof env> = {}): TestClient {
  const app = createApp({ now: () => clock.now, ...options });
  const e = { ...env, ...envOverrides };
  const send = async (method: string, path: string, body: unknown, headers: Record<string, string> = {}) =>
    app.request(
      path,
      {
        method,
        headers: body === undefined ? headers : { 'Content-Type': 'application/json', ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      e,
    );
  return {
    get: (path, headers) => send('GET', path, undefined, headers),
    put: (path, body, headers) => send('PUT', path, body, headers),
    post: (path, body, headers) => send('POST', path, body, headers),
    del: (path, body, headers) => send('DELETE', path, body, headers),
  };
}
