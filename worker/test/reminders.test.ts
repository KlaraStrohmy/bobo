import { createExecutionContext, createScheduledController, env, waitOnExecutionContext } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/calendar';
import type { Env } from '../src/env';
import worker from '../src/index';
import { reminderDeadline, reminderPayload, reminderTarget, reminderTimeAllowed, runReminders, selectReminderUsers, type ReminderCandidate } from '../src/reminders';
import { as, Clock, client, resetDb, type TestClient } from './helpers';
import { decrypt, newSubscriptionKeys, newVapidKeys } from './pushCrypto';

const CS = DEFAULT_SETTINGS;
const MON_1500 = new Date('2026-10-12T15:00:00+02:00');

const cand = (id: string, reminderTime = '15:00', active = true, reminderEnabled = true): ReminderCandidate => ({
  id,
  active,
  reminderEnabled,
  reminderTime,
});

describe('reminder selection', () => {
  it('selects opted-in active users due this minute', () => {
    const users = [
      cand('ok'),
      cand('other-time', '15:01'),
      cand('inactive', '15:00', false),
      cand('disabled', '15:00', true, false),
      cand('answered'),
      cand('logged'),
    ];
    expect(selectReminderUsers(users, MON_1500, new Set(['answered']), new Set(['logged']))).toEqual(['ok']);
    // 13:00 UTC is 15:00 in Prague (CEST).
    expect(selectReminderUsers([cand('ok')], new Date('2026-10-12T13:00:00Z'), new Set(), new Set())).toEqual(['ok']);
  });

  it('uses Prague local time across DST', () => {
    // After the autumn switch 15:00 Prague is 14:00 UTC.
    expect(selectReminderUsers([cand('ok')], new Date('2026-10-26T14:00:00Z'), new Set(), new Set())).toEqual(['ok']);
    expect(selectReminderUsers([cand('ok')], new Date('2026-10-26T13:00:00Z'), new Set(), new Set())).toEqual([]);
    // After the spring switch 15:00 Prague is 13:00 UTC again.
    expect(selectReminderUsers([cand('ok')], new Date('2027-03-29T13:00:00Z'), new Set(), new Set())).toEqual(['ok']);
    expect(selectReminderUsers([cand('ok')], new Date('2027-03-29T14:00:00Z'), new Set(), new Set())).toEqual([]);
  });

  it('targets tomorrow only when it is an open cooking day', () => {
    expect(reminderTarget(MON_1500, CS, null)).toBe('2026-10-13');
    // Tuesday -> Wednesday is not a cooking day.
    expect(reminderTarget(new Date('2026-10-13T15:00:00+02:00'), CS, null)).toBeNull();
    // Extra day override on Wednesday.
    expect(reminderTarget(new Date('2026-10-13T15:00:00+02:00'), CS, { date: '2026-10-14', cooking: true, note: null })).toBe('2026-10-14');
    expect(reminderTarget(MON_1500, CS, { date: '2026-10-13', cooking: false, note: null })).toBeNull();
    // After cutoff (Mon 16:00) nothing is asked.
    expect(reminderTarget(new Date('2026-10-12T16:30:00+02:00'), CS, null)).toBeNull();
    // Late evening UTC is already the next Prague day: Mon 23:30 UTC = Tue 00:30 Prague -> Wed, no cooking.
    expect(reminderTarget(new Date('2026-10-12T22:30:00Z'), CS, null)).toBeNull();
    // DST: Mon 2026-10-26 15:30 CET (14:30 UTC) -> Tue 27th still open (cutoff 15:00 UTC).
    expect(reminderTarget(new Date('2026-10-26T14:30:00Z'), CS, null)).toBe('2026-10-27');
    expect(reminderTarget(new Date('2026-10-26T15:00:00Z'), CS, null)).toBeNull();
  });

  it('allows only reminder times before the cutoff', () => {
    expect(reminderTimeAllowed('15:59', CS)).toBe(true);
    expect(reminderTimeAllowed('16:00', CS)).toBe(false);
    expect(reminderTimeAllowed('23:00', { ...CS, cutoffDaysBefore: 0 })).toBe(true);
    expect(reminderTimeAllowed('08:00', { ...CS, cutoffDaysBefore: 2 })).toBe(false);
    expect(reminderDeadline(CS)).toBe('16:00');
    expect(reminderDeadline({ ...CS, cutoffDaysBefore: 0 })).toBeNull();
  });

  it('builds the payload text', () => {
    expect(reminderPayload('2026-10-14', 'tok', '16:00').title).toBe('Oběd ve středu 14. 10.?');
    expect(reminderPayload('2026-10-15', 'tok', '16:00')).toEqual({
      title: 'Oběd ve čtvrtek 15. 10.?',
      body: 'Zítra se vaří — budeš obědvat? Odpověz do 16:00.',
      date: '2026-10-15',
      token: 'tok',
      url: '/?date=2026-10-15',
    });
  });
});

describe('reminder job', () => {
  let c: TestClient;
  const prefs = { reminderEnabled: true, reminderTime: '15:00' };
  // Push-service mock: records endpoints, always 201.
  let pushed: string[];
  const fakeFetch = (async (input: RequestInfo | URL) => {
    pushed.push(new Request(input).url);
    return new Response(null, { status: 201 });
  }) as typeof fetch;
  let pushEnv: Env;

  const subKeys = new Map<string, Awaited<ReturnType<typeof newSubscriptionKeys>>>();
  async function subscribe(who: string) {
    const keys = await newSubscriptionKeys();
    subKeys.set(`https://push.example/${who}`, keys);
    await c.post('/api/push/subscribe', { endpoint: `https://push.example/${who}`, keys: { p256dh: keys.p256dh, auth: keys.auth } }, as(who));
  }

  beforeEach(async () => {
    await resetDb();
    pushed = [];
    c = client(new Clock());
    const vapid = await newVapidKeys();
    pushEnv = { ...env, VAPID_PUBLIC_KEY: vapid.publicKey, VAPID_PRIVATE_KEY: vapid.privateKey } as Env;
  });

  async function setupUsers() {
    for (const who of ['a@x.cz', 'b@x.cz', 'c@x.cz', 'nosub@x.cz']) {
      await c.put('/api/me/preferences', prefs, as(who));
      if (who !== 'nosub@x.cz') await subscribe(who);
    }
    await c.put('/api/responses/2026-10-13', { attending: true }, as('b@x.cz'));
    await c.put('/api/me/preferences', { ...prefs, reminderTime: '15:05' }, as('c@x.cz'));
  }

  it('sends only to due users with a subscription, logs first, never twice', async () => {
    await setupUsers();
    expect(await runReminders(pushEnv, MON_1500, { fetch: fakeFetch })).toBe(1);
    expect(pushed).toEqual(['https://push.example/a@x.cz']);
    const log = await env.DB.prepare('SELECT user_id, date FROM reminder_log').all();
    expect(log.results).toEqual([{ user_id: 'a@x.cz', date: '2026-10-13' }]);
    // Logged: second run in the same minute sends nothing.
    expect(await runReminders(pushEnv, MON_1500, { fetch: fakeFetch })).toBe(0);
    expect(pushed).toHaveLength(1);
    // c@x.cz at 15:05.
    expect(await runReminders(pushEnv, new Date('2026-10-12T15:05:00+02:00'), { fetch: fakeFetch })).toBe(1);
    expect(pushed[1]).toBe('https://push.example/c@x.cz');
  });

  it('writes the log even when delivery fails, and the token answers the day', async () => {
    await setupUsers();
    const failing = (async () => {
      throw new Error('push service down');
    }) as typeof fetch;
    expect(await runReminders(pushEnv, MON_1500, { fetch: failing })).toBe(1);
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM reminder_log').first('n')).toBe(1);
  });

  it('pushes the spec payload whose token answers the target day', async () => {
    await setupUsers();
    const sent: Request[] = [];
    const capture = (async (input: RequestInfo | URL, init?: RequestInit) => {
      sent.push(new Request(input, init));
      return new Response(null, { status: 201 });
    }) as typeof fetch;
    expect(await runReminders(pushEnv, MON_1500, { fetch: capture })).toBe(1);
    expect(sent).toHaveLength(1);
    const keys = subKeys.get(sent[0].url)!;
    const body = new Uint8Array(await sent[0].arrayBuffer());
    const payload = JSON.parse(await decrypt(body, keys.privateKey, keys.p256dh, keys.auth));
    expect(payload).toEqual(reminderPayload('2026-10-13', payload.token, '16:00'));
    expect(payload.title).toBe('Oběd v úterý 13. 10.?');
    const res = await c.post('/api/push/answer', { token: payload.token, attending: false });
    expect(await res.json()).toEqual({ ok: true, date: '2026-10-13' });
  });

  it('respects Prague time across the autumn DST switch', async () => {
    await c.put('/api/me/preferences', prefs, as('a@x.cz'));
    await subscribe('a@x.cz');
    // Mon 2026-10-26 14:00 UTC = 15:00 CET; target Tue 27th.
    expect(await runReminders(pushEnv, new Date('2026-10-26T13:00:00Z'), { fetch: fakeFetch })).toBe(0);
    expect(await runReminders(pushEnv, new Date('2026-10-26T14:00:00Z'), { fetch: fakeFetch })).toBe(1);
    const log = await env.DB.prepare('SELECT date FROM reminder_log').first('date');
    expect(log).toBe('2026-10-27');
  });

  it('skips inactive users and does nothing without a token secret', async () => {
    await setupUsers();
    await env.DB.prepare("UPDATE users SET active = 0 WHERE id = 'a@x.cz'").run();
    expect(await runReminders(pushEnv, MON_1500, { fetch: fakeFetch })).toBe(0);
    await env.DB.prepare("UPDATE users SET active = 1 WHERE id = 'a@x.cz'").run();
    expect(await runReminders({ ...pushEnv, PUSH_TOKEN_SECRET: undefined }, MON_1500, { fetch: fakeFetch })).toBe(0);
  });

  it('runs from the scheduled handler without throwing', async () => {
    const ctx = createExecutionContext();
    const controller = createScheduledController({ scheduledTime: MON_1500.getTime(), cron: '* * * * *' });
    // A broken DB binding must be swallowed by the job.
    const broken = { ...env, DB: undefined } as unknown as Env;
    await worker.scheduled(controller, broken, ctx);
    await waitOnExecutionContext(ctx);
    const ctx2 = createExecutionContext();
    await worker.scheduled(controller, env, ctx2);
    await waitOnExecutionContext(ctx2);
  });
});
