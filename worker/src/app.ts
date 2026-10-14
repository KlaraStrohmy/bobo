/** Hono API app (port of the FastAPI routes; contract in docs/SPEC.md). */
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { JWTVerifyGetKey } from 'jose';
import { HttpError, getIdentity, isAdmin, upsertUser, type UserRow } from './auth';
import {
  bulkFill,
  dayJson,
  getDayStatus,
  getOverride,
  isCooking,
  loadOverrides,
  loadSettings,
  nextCookingDay,
  saveSettings,
  setResponse,
  settingsToApi,
  userCalendar,
} from './calendar';
import type { Env } from './env';
import { sendToUser } from './push';
import { reminderDeadline, reminderTimeAllowed } from './reminders';
import { ExpiredToken, InvalidToken, verifyToken } from './pushTokens';
import { dateRange, daysBetween, localParts, parseDate, parseHhmm } from './tz';

const MAX_RANGE_DAYS = 92;
const BULK_MAX_DAYS = 366;

export interface AppOptions {
  /** Clock (tests inject a fixed time); defaults to the real time. */
  now?: () => Date;
  /** JWKS key resolver (tests inject a local key set); defaults to the tenant's remote JWKS. */
  getKey?: JWTVerifyGetKey;
  /** Outbound fetch for push delivery (tests inject a mock). */
  pushFetch?: typeof fetch;
}

type AppEnv = { Bindings: Env; Variables: { user: UserRow; now: Date } };
type Ctx = Context<AppEnv>;
type Json = Record<string, unknown>;

// ---- validation helpers (FastAPI returns 422 for invalid input) ----

const invalid = (detail: string) => new HttpError(422, detail);

async function jsonBody(c: Ctx): Promise<Json> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw invalid('invalid JSON body');
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw invalid('body must be a JSON object');
  return body as Json;
}

function field<T>(obj: Json, key: string, check: (v: unknown) => v is T, what: string, fallback?: { value: T }): T {
  if (!(key in obj)) {
    if (fallback) return fallback.value;
    throw invalid(`${key}: field required`);
  }
  const v = obj[key];
  if (!check(v)) throw invalid(`${key}: expected ${what}`);
  return v;
}

const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isBoolOrNull = (v: unknown): v is boolean | null => v === null || typeof v === 'boolean';
const isString = (v: unknown): v is string => typeof v === 'string';
const isStringOrNull = (v: unknown): v is string | null => v === null || typeof v === 'string';
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

function dateValue(value: unknown, name: string): string {
  const d = parseDate(value);
  if (!d) throw invalid(`${name}: invalid date`);
  return d;
}

function hhmmValue(value: unknown, name: string): string {
  const t = parseHhmm(value);
  if (!t) throw invalid(`${name}: invalid time ${JSON.stringify(value)}`);
  return t;
}

/** Reject inverted or too long ranges with 400. */
function checkRange(start: string, end: string, maxDays = MAX_RANGE_DAYS): void {
  const span = daysBetween(start, end);
  if (span < 0) throw new HttpError(400, "'to' must not be before 'from'");
  if (span > maxDays) throw new HttpError(400, `range exceeds ${maxDays} days`);
}

function queryRange(c: Ctx): [string, string] {
  return [dateValue(c.req.query('from'), 'from'), dateValue(c.req.query('to'), 'to')];
}

const isoUtc = (value: string | null): string | null => (value ? value.replace(/Z$/, '+00:00') : null);

const userBrief = (u: Pick<UserRow, 'id' | 'email' | 'name'>) => ({ id: u.id, email: u.email, name: u.name });

const userAdminJson = (u: UserRow) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  active: u.active === 1,
  reminderEnabled: u.reminder_enabled === 1,
  lastSeenAt: isoUtc(u.last_seen_at),
});

async function meJson(env: Env, user: UserRow) {
  const sub = await env.DB.prepare('SELECT 1 FROM push_subscriptions WHERE user_id = ?1 LIMIT 1').bind(user.id).first();
  const cs = await loadSettings(env.DB);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isAdmin: isAdmin(user, env),
    reminderEnabled: user.reminder_enabled === 1,
    reminderTime: user.reminder_time,
    pushSubscribed: sub !== null,
    reminderDeadline: reminderDeadline(cs),
    remindersPossible: cs.cutoffDaysBefore <= 1,
  };
}

export function createApp(options: AppOptions = {}) {
  const app = new Hono<AppEnv>().basePath('/api');

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json({ detail: err.detail }, err.status as ContentfulStatusCode, err.headers);
    }
    console.error(`${c.req.method} ${c.req.path} failed:`, err);
    return c.json({ detail: 'Internal Server Error' }, 500);
  });
  app.notFound((c) => c.json({ detail: 'Not Found' }, 404));

  app.use(async (c, next) => {
    c.set('now', options.now?.() ?? new Date());
    await next();
  });

  const auth: MiddlewareHandler<AppEnv> = async (c, next) => {
    c.set('user', await upsertUser(c.env.DB, await getIdentity(c.req.raw, c.env, options.getKey)));
    await next();
  };
  const admin: MiddlewareHandler<AppEnv> = async (c, next) => {
    if (!isAdmin(c.get('user'), c.env)) throw new HttpError(403, 'admin only');
    await next();
  };

  // ---- public ----

  app.get('/health', (c) => c.json({ status: 'ok' }));

  app.get('/config', (c) =>
    c.json({
      tenantId: c.env.AZURE_TENANT_ID,
      clientId: c.env.AZURE_CLIENT_ID,
      apiScope: `api://${c.env.AZURE_CLIENT_ID}/access_as_user`,
      vapidPublicKey: c.env.VAPID_PUBLIC_KEY ?? '',
    }),
  );

  app.post('/push/answer', async (c) => {
    const body = await jsonBody(c);
    const token = field(body, 'token', isString, 'string');
    const attending = field(body, 'attending', isBool, 'boolean');
    const secret = c.env.PUSH_TOKEN_SECRET;
    if (!secret) throw new HttpError(503, 'push answers are not configured');
    const now = c.get('now');
    let data;
    try {
      data = await verifyToken(secret, token, now);
    } catch (err) {
      if (err instanceof ExpiredToken) throw new HttpError(409, 'cutoff has passed');
      if (err instanceof InvalidToken) throw new HttpError(400, 'invalid token');
      throw err;
    }
    const user = await c.env.DB.prepare('SELECT id FROM users WHERE id = ?1').bind(data.userId).first();
    if (!user) throw new HttpError(400, 'unknown user');
    const status = await getDayStatus(c.env.DB, data.day, now);
    if (!status.cooking) throw new HttpError(400, 'no cooking on this day');
    if (status.locked) throw new HttpError(409, 'cutoff has passed');
    await setResponse(c.env.DB, data.userId, data.day, attending, 'push');
    return c.json({ ok: true, date: data.day });
  });

  // ---- user ----

  app.use('/me', auth);
  app.use('/me/*', auth);
  app.use('/calendar', auth);
  app.use('/responses/*', auth);
  app.use('/push/vapid-public-key', auth);
  app.use('/push/subscribe', auth);
  app.use('/push/test', auth);
  app.use('/admin/*', auth, admin);

  app.get('/me', async (c) => c.json(await meJson(c.env, c.get('user'))));

  app.put('/me/preferences', async (c) => {
    const body = await jsonBody(c);
    const enabled = field(body, 'reminderEnabled', isBool, 'boolean');
    const time = hhmmValue(field(body, 'reminderTime', isString, 'string'), 'reminderTime');
    const cs = await loadSettings(c.env.DB);
    if (enabled && !reminderTimeAllowed(time, cs)) {
      throw invalid(
        cs.cutoffDaysBefore <= 1
          ? `Připomínka musí být před uzávěrkou (${cs.cutoffTime}).`
          : 'Při současné uzávěrce nejde připomínku den předem použít.',
      );
    }
    const user = await c.env.DB.prepare('UPDATE users SET reminder_enabled = ?1, reminder_time = ?2 WHERE id = ?3 RETURNING *')
      .bind(enabled ? 1 : 0, time, c.get('user').id)
      .first<UserRow>();
    return c.json(await meJson(c.env, user!));
  });

  app.get('/calendar', async (c) => {
    const [from, to] = queryRange(c);
    checkRange(from, to);
    return c.json({ days: await userCalendar(c.env.DB, c.get('user').id, from, to, c.get('now')) });
  });

  app.post('/responses/bulk', async (c) => {
    const body = await jsonBody(c);
    const from = dateValue(field(body, 'from', isString, 'date'), 'from');
    const to = dateValue(field(body, 'to', isString, 'date'), 'to');
    const attending = field(body, 'attending', isBoolOrNull, 'boolean or null');
    const onlyEmpty = field(body, 'onlyEmpty', isBool, 'boolean', { value: false });
    checkRange(from, to, BULK_MAX_DAYS);
    return c.json(await bulkFill(c.env.DB, c.get('user').id, from, to, attending, onlyEmpty, c.get('now')));
  });

  app.put('/responses/:day', async (c) => {
    const day = dateValue(c.req.param('day'), 'day');
    const attending = field(await jsonBody(c), 'attending', isBoolOrNull, 'boolean or null');
    const status = await getDayStatus(c.env.DB, day, c.get('now'));
    if (!status.cooking) throw new HttpError(400, 'no cooking on this day');
    if (status.locked) throw new HttpError(409, 'cutoff has passed');
    await setResponse(c.env.DB, c.get('user').id, day, attending, 'web');
    return c.json(dayJson(status, attending));
  });

  app.get('/push/vapid-public-key', (c) => c.json({ key: c.env.VAPID_PUBLIC_KEY ?? '' }));

  app.post('/push/subscribe', async (c) => {
    const body = await jsonBody(c);
    const endpoint = field(body, 'endpoint', isString, 'string');
    const keys = field(body, 'keys', isObject, 'object');
    const p256dh = field(keys, 'p256dh', isString, 'string');
    const authKey = field(keys, 'auth', isString, 'string');
    await c.env.DB.prepare(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT(endpoint) DO UPDATE SET
         user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent`,
    )
      .bind(c.get('user').id, endpoint, p256dh, authKey, c.req.header('User-Agent') ?? null, new Date().toISOString())
      .run();
    return c.json({ ok: true });
  });

  app.delete('/push/subscribe', async (c) => {
    const endpoint = field(await jsonBody(c), 'endpoint', isString, 'string');
    await c.env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?1 AND user_id = ?2')
      .bind(endpoint, c.get('user').id)
      .run();
    return c.json({ ok: true });
  });

  app.post('/push/test', async (c) => {
    const payload = { title: 'Bobo', body: 'Testovací notifikace — funguje to!', url: '/' };
    const sent = await sendToUser(c.env, c.get('user').id, payload, { fetch: options.pushFetch });
    return c.json({ sent });
  });

  // ---- admin ----

  app.get('/admin/settings', async (c) => c.json(settingsToApi(await loadSettings(c.env.DB))));

  app.put('/admin/settings', async (c) => {
    const body = await jsonBody(c);
    const weekdays = field(body, 'cookingWeekdays', Array.isArray, 'list');
    if (!weekdays.every((d) => isInt(d) && d >= 1 && d <= 7)) throw invalid('cookingWeekdays: expected integers 1..7');
    const cutoff = field(body, 'cutoff', isObject, 'object');
    const daysBefore = field(cutoff, 'daysBefore', isInt, 'integer');
    if (daysBefore < 0 || daysBefore > 30) throw invalid('cutoff.daysBefore: expected 0..30');
    const time = hhmmValue(field(cutoff, 'time', isString, 'string'), 'cutoff.time');
    const cs = {
      cookingWeekdays: [...new Set(weekdays as number[])].sort((a, b) => a - b),
      cutoffDaysBefore: daysBefore,
      cutoffTime: time,
    };
    await saveSettings(c.env.DB, cs);
    return c.json(settingsToApi(cs));
  });

  app.get('/admin/overrides', async (c) => {
    const [from, to] = queryRange(c);
    const overrides = await loadOverrides(c.env.DB, from, to);
    return c.json({ overrides: [...overrides.values()] });
  });

  app.put('/admin/overrides/:day', async (c) => {
    const day = dateValue(c.req.param('day'), 'day');
    const body = await jsonBody(c);
    const cooking = field(body, 'cooking', isBool, 'boolean');
    const note = field(body, 'note', isStringOrNull, 'string or null', { value: null });
    await c.env.DB.prepare(
      `INSERT INTO day_overrides (date, cooking, note, created_by, created_at) VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(date) DO UPDATE SET cooking = excluded.cooking, note = excluded.note`,
    )
      .bind(day, cooking ? 1 : 0, note, c.get('user').email, new Date().toISOString())
      .run();
    return c.json({ date: day, cooking, note });
  });

  app.delete('/admin/overrides/:day', async (c) => {
    const day = dateValue(c.req.param('day'), 'day');
    await c.env.DB.prepare('DELETE FROM day_overrides WHERE date = ?1').bind(day).run();
    return c.json({ ok: true });
  });

  app.get('/admin/overview', async (c) => {
    const db = c.env.DB;
    const q = c.req.query('date');
    const day = q !== undefined ? dateValue(q, 'date') : await nextCookingDay(db, localParts(c.get('now')).date);
    const [cs, override] = await Promise.all([loadSettings(db), getOverride(db, day)]);
    const [answersRes, usersRes] = await db.batch<Record<string, unknown>>([
      db.prepare('SELECT user_id, attending FROM responses WHERE date = ?1').bind(day),
      db.prepare('SELECT id, email, name, active FROM users ORDER BY name, email'),
    ]);
    const answers = new Map(answersRes.results.map((r) => [r.user_id as string, r.attending === 1]));
    const users = usersRes.results as unknown as Pick<UserRow, 'id' | 'email' | 'name' | 'active'>[];
    const yes = users.filter((u) => answers.get(u.id) === true).map(userBrief);
    const no = users.filter((u) => answers.get(u.id) === false).map(userBrief);
    const none = users.filter((u) => u.active === 1 && !answers.has(u.id)).map(userBrief);
    return c.json({
      date: day,
      cooking: isCooking(day, cs, override),
      note: override ? override.note : null,
      counts: { yes: yes.length, no: no.length, none: none.length },
      yes,
      no,
      none,
    });
  });

  app.get('/admin/summary', async (c) => {
    const db = c.env.DB;
    const [from, to] = queryRange(c);
    checkRange(from, to);
    const [cs, overrides] = await Promise.all([loadSettings(db), loadOverrides(db, from, to)]);
    const [activeRes, rowsRes] = await db.batch<Record<string, unknown>>([
      db.prepare('SELECT id FROM users WHERE active = 1'),
      db.prepare('SELECT date, attending, user_id FROM responses WHERE date >= ?1 AND date <= ?2').bind(from, to),
    ]);
    const activeIds = new Set(activeRes.results.map((r) => r.id as string));
    const rows = rowsRes.results as { date: string; attending: number; user_id: string }[];
    const days = [];
    for (const day of dateRange(from, to)) {
      const dayRows = rows.filter((r) => r.date === day);
      const answered = new Set(dayRows.map((r) => r.user_id));
      const override = overrides.get(day);
      days.push({
        date: day,
        cooking: isCooking(day, cs, override),
        note: override ? override.note : null,
        yes: dayRows.filter((r) => r.attending === 1).length,
        no: dayRows.filter((r) => r.attending !== 1).length,
        none: [...activeIds].filter((id) => !answered.has(id)).length,
      });
    }
    return c.json({ days });
  });

  app.get('/admin/users', async (c) => {
    const { results } = await c.env.DB.prepare('SELECT * FROM users ORDER BY lower(name)').all<UserRow>();
    return c.json({ users: results.map(userAdminJson) });
  });

  app.put('/admin/users/:id', async (c) => {
    const active = field(await jsonBody(c), 'active', isBool, 'boolean');
    const user = await c.env.DB.prepare('UPDATE users SET active = ?1 WHERE id = ?2 RETURNING *')
      .bind(active ? 1 : 0, c.req.param('id'))
      .first<UserRow>();
    if (!user) throw new HttpError(404, 'user not found');
    return c.json(userAdminJson(user));
  });

  app.put('/admin/responses/:userId/:day', async (c) => {
    const userId = c.req.param('userId');
    const day = dateValue(c.req.param('day'), 'day');
    const attending = field(await jsonBody(c), 'attending', isBoolOrNull, 'boolean or null');
    const user = await c.env.DB.prepare('SELECT id FROM users WHERE id = ?1').bind(userId).first();
    if (!user) throw new HttpError(404, 'user not found');
    await setResponse(c.env.DB, userId, day, attending, 'web');
    return c.json({ userId, date: day, attending });
  });

  return app;
}
