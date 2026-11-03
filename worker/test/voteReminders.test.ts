import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Env } from '../src/env';
import { runVoteReminders, voteReminderDue, voteReminderPayload } from '../src/voteReminders';
import { as, Clock, client, resetDb, type TestClient } from './helpers';
import { decrypt, newSubscriptionKeys, newVapidKeys } from './pushCrypto';

// Monday 2026-10-19 09:30 Prague: votes now count for the week of 26.10.
const MON_0930 = new Date('2026-10-19T09:30:00+02:00');

describe('vote reminder timing', () => {
  it('is due on Monday between 09:00 and 18:00 Prague time only', () => {
    expect(voteReminderDue(new Date('2026-10-19T08:59:00+02:00'))).toBe(false);
    expect(voteReminderDue(new Date('2026-10-19T09:00:00+02:00'))).toBe(true);
    expect(voteReminderDue(new Date('2026-10-19T17:59:00+02:00'))).toBe(true);
    expect(voteReminderDue(new Date('2026-10-19T18:00:00+02:00'))).toBe(false);
    expect(voteReminderDue(new Date('2026-10-20T09:30:00+02:00'))).toBe(false); // Tuesday
    expect(voteReminderDue(new Date('2026-10-18T09:30:00+02:00'))).toBe(false); // Sunday
  });

  it('follows Prague time across the autumn DST switch', () => {
    // Mon 2026-10-26 09:00 CET is 08:00 UTC; the day before it was still CEST.
    expect(voteReminderDue(new Date('2026-10-26T07:59:00Z'))).toBe(false);
    expect(voteReminderDue(new Date('2026-10-26T08:00:00Z'))).toBe(true);
  });

  it('builds a payload that opens the voting page and does not replace the lunch reminder', () => {
    expect(voteReminderPayload('2026-10-26')).toEqual({
      title: 'Hlasuj! 🍜',
      body: 'Vyber, co budeme jíst týden od 26. 10. Máš 4 hlasy.',
      url: '/hlasuj',
      tag: 'bobo-vote',
    });
  });
});

describe('vote reminder job', () => {
  let c: TestClient;
  let pushed: string[];
  const fakeFetch = (async (input: RequestInfo | URL) => {
    pushed.push(new Request(input).url);
    return new Response(null, { status: 201 });
  }) as typeof fetch;
  let pushEnv: Env;
  const keysByEndpoint = new Map<string, Awaited<ReturnType<typeof newSubscriptionKeys>>>();

  async function subscribe(who: string) {
    const keys = await newSubscriptionKeys();
    keysByEndpoint.set(`https://push.example/${who}`, keys);
    await c.post('/api/push/subscribe', { endpoint: `https://push.example/${who}`, keys: { p256dh: keys.p256dh, auth: keys.auth } }, as(who));
  }

  beforeEach(async () => {
    await resetDb();
    pushed = [];
    const clock = new Clock();
    clock.now = MON_0930;
    c = client(clock);
    const vapid = await newVapidKeys();
    pushEnv = { ...env, VAPID_PUBLIC_KEY: vapid.publicKey, VAPID_PRIVATE_KEY: vapid.privateKey } as Env;
    for (const who of ['a@x.cz', 'voted@x.cz', 'off@x.cz', 'nosub@x.cz']) {
      await c.get('/api/me', as(who)); // creates the user
      if (who !== 'nosub@x.cz') await subscribe(who);
    }
    await c.put('/api/votes/koprovka', { voted: true }, as('voted@x.cz'));
    await c.put('/api/me/vote-reminder', { enabled: false }, as('off@x.cz'));
  });

  it('reminds only people with a subscription, the switch on and no vote yet; never twice', async () => {
    expect(await runVoteReminders(pushEnv, MON_0930, { fetch: fakeFetch })).toBe(1);
    expect(pushed).toEqual(['https://push.example/a@x.cz']);
    expect(await env.DB.prepare('SELECT user_id, week FROM vote_reminder_log').all().then((r) => r.results)).toEqual([{ user_id: 'a@x.cz', week: '2026-10-26' }]);
    // a later tick on the same Monday sends nothing more
    expect(await runVoteReminders(pushEnv, new Date('2026-10-19T09:31:00+02:00'), { fetch: fakeFetch })).toBe(0);
    expect(await runVoteReminders(pushEnv, new Date('2026-10-19T15:00:00+02:00'), { fetch: fakeFetch })).toBe(0);
    expect(pushed).toHaveLength(1);
  });

  it('sends nothing outside the Monday window', async () => {
    expect(await runVoteReminders(pushEnv, new Date('2026-10-19T08:30:00+02:00'), { fetch: fakeFetch })).toBe(0);
    expect(await runVoteReminders(pushEnv, new Date('2026-10-20T09:30:00+02:00'), { fetch: fakeFetch })).toBe(0);
    expect(pushed).toHaveLength(0);
  });

  it('delivers late in the window when an earlier tick was missed', async () => {
    expect(await runVoteReminders(pushEnv, new Date('2026-10-19T14:20:00+02:00'), { fetch: fakeFetch })).toBe(1);
  });

  it('stops asking someone who votes before the reminder, and starts a new round next week', async () => {
    await c.put('/api/votes/rajska', { voted: true }, as('a@x.cz'));
    expect(await runVoteReminders(pushEnv, MON_0930, { fetch: fakeFetch })).toBe(0);
    // a week later the old votes belong to the previous round: both voters are asked again for the new week
    expect(await runVoteReminders(pushEnv, new Date('2026-10-26T09:30:00+01:00'), { fetch: fakeFetch })).toBe(2);
  });

  it('skips inactive users', async () => {
    await env.DB.prepare("UPDATE users SET active = 0 WHERE id = 'a@x.cz'").run();
    expect(await runVoteReminders(pushEnv, MON_0930, { fetch: fakeFetch })).toBe(0);
  });

  it('logs before sending, so a failing push service never causes a repeat', async () => {
    const failing = (async () => {
      throw new Error('push service down');
    }) as typeof fetch;
    expect(await runVoteReminders(pushEnv, MON_0930, { fetch: failing })).toBe(1);
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM vote_reminder_log').first('n')).toBe(1);
    expect(await runVoteReminders(pushEnv, MON_0930, { fetch: fakeFetch })).toBe(0);
  });

  it('pushes the payload that opens /hlasuj', async () => {
    const sent: Request[] = [];
    const capture = (async (input: RequestInfo | URL, init?: RequestInit) => {
      sent.push(new Request(input, init));
      return new Response(null, { status: 201 });
    }) as typeof fetch;
    await runVoteReminders(pushEnv, MON_0930, { fetch: capture });
    const keys = keysByEndpoint.get(sent[0].url)!;
    const body = new Uint8Array(await sent[0].arrayBuffer());
    expect(JSON.parse(await decrypt(body, keys.privateKey, keys.p256dh, keys.auth))).toEqual(voteReminderPayload('2026-10-26'));
  });
});

describe('vote reminder preference', () => {
  let c: TestClient;
  beforeEach(async () => {
    await resetDb();
    c = client(new Clock());
  });

  it('is on by default, can be switched and shows up in /me', async () => {
    const me = async () => ((await (await c.get('/api/me', as('a@x.cz'))).json()) as { voteReminderEnabled: boolean }).voteReminderEnabled;
    expect(await me()).toBe(true);
    const res = await c.put('/api/me/vote-reminder', { enabled: false }, as('a@x.cz'));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { voteReminderEnabled: boolean }).voteReminderEnabled).toBe(false);
    expect(await me()).toBe(false);
    await c.put('/api/me/vote-reminder', { enabled: true }, as('a@x.cz'));
    expect(await me()).toBe(true);
  });

  it('validates the body and needs a signed-in user', async () => {
    expect((await c.put('/api/me/vote-reminder', { enabled: 'yes' }, as('a@x.cz'))).status).toBe(422);
    expect((await c.put('/api/me/vote-reminder', {})).status).toBe(401);
  });
});
