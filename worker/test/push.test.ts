import { beforeEach, describe, expect, it } from 'vitest';
import { ExpiredToken, InvalidToken, makeToken, verifyToken } from '../src/pushTokens';
import { as, Clock, client, resetDb, SECRET, type TestClient } from './helpers';

const ALICE = as('alice@strohmy.cz');
const DAY = '2026-10-13';
const EXP = new Date('2026-10-12T16:00:00+02:00');
const BEFORE = new Date('2026-10-12T15:00:00+02:00');

describe('push tokens', () => {
  it('round-trips, including user ids with pipes', async () => {
    const token = await makeToken(SECRET, 'user|with|pipes', DAY, EXP);
    expect(await verifyToken(SECRET, token, BEFORE)).toEqual({
      userId: 'user|with|pipes',
      day: DAY,
      exp: EXP.getTime() / 1000,
    });
  });

  it('matches the Python token format byte for byte', async () => {
    // python: make_token("test-secret", "u1", date(2026,10,13), datetime(2026,10,12,16,0,tzinfo=TZ))
    const token = await makeToken(SECRET, 'u1', DAY, EXP);
    expect(token).toBe('dTF8MjAyNi0xMC0xM3wxNzkxODEzNjAw.qDAAFZzE4br2gQVsU2jQuyFrzmllvZdV4wMq21mg0R8');
  });

  it('rejects tampering, garbage and expiry', async () => {
    const token = await makeToken(SECRET, 'u1', DAY, EXP);
    await expect(verifyToken('other-secret', token, BEFORE)).rejects.toBeInstanceOf(InvalidToken);
    const sig = token.split('.')[1];
    const forged = (await makeToken(SECRET, 'u2', DAY, EXP)).split('.')[0];
    await expect(verifyToken(SECRET, `${forged}.${sig}`, BEFORE)).rejects.toBeInstanceOf(InvalidToken);
    await expect(verifyToken(SECRET, 'garbage', BEFORE)).rejects.toBeInstanceOf(InvalidToken);
    await expect(verifyToken(SECRET, 'x.y', BEFORE)).rejects.toBeInstanceOf(InvalidToken);
    await expect(verifyToken(SECRET, token, EXP)).rejects.toBeInstanceOf(ExpiredToken);
    expect((await verifyToken(SECRET, token, new Date(EXP.getTime() - 1))).userId).toBe('u1');
  });
});

describe('push endpoints', () => {
  let clock: Clock;
  let c: TestClient;

  beforeEach(async () => {
    await resetDb();
    clock = new Clock();
    c = client(clock);
  });

  it('subscribes and unsubscribes', async () => {
    const sub = { endpoint: 'https://push.example/abc', keys: { p256dh: 'k', auth: 'a' } };
    expect(await (await c.post('/api/push/subscribe', sub, ALICE)).json()).toEqual({ ok: true });
    expect((await c.post('/api/push/subscribe', sub, ALICE)).status).toBe(200);
    expect(((await (await c.get('/api/me', ALICE)).json()) as { pushSubscribed: boolean }).pushSubscribed).toBe(true);
    expect(await (await c.del('/api/push/subscribe', { endpoint: sub.endpoint }, ALICE)).json()).toEqual({ ok: true });
    expect(((await (await c.get('/api/me', ALICE)).json()) as { pushSubscribed: boolean }).pushSubscribed).toBe(false);
    expect(await (await c.post('/api/push/test', undefined, ALICE)).json()).toEqual({ sent: 0 });
    expect((await c.post('/api/push/subscribe', { endpoint: 'x' }, ALICE)).status).toBe(422);
    expect(await (await c.get('/api/push/vapid-public-key', ALICE)).json()).toEqual({ key: '' });
  });

  it('reassigns an endpoint to the user who subscribes last', async () => {
    const sub = { endpoint: 'https://push.example/shared', keys: { p256dh: 'k', auth: 'a' } };
    await c.post('/api/push/subscribe', sub, ALICE);
    await c.post('/api/push/subscribe', sub, as('bob@strohmy.cz'));
    expect(((await (await c.get('/api/me', ALICE)).json()) as { pushSubscribed: boolean }).pushSubscribed).toBe(false);
  });

  it('records answers from notification actions', async () => {
    await c.get('/api/me', ALICE);
    const token = await makeToken(SECRET, 'alice@strohmy.cz', DAY, EXP);
    expect(await (await c.post('/api/push/answer', { token, attending: true })).json()).toEqual({ ok: true, date: DAY });
    const cal = (await (await c.get(`/api/calendar?from=${DAY}&to=${DAY}`, ALICE)).json()) as { days: { attending: boolean }[] };
    expect(cal.days[0].attending).toBe(true);
    expect((await c.post('/api/push/answer', { token: 'x.y', attending: true })).status).toBe(400);
    expect((await c.post('/api/push/answer', { token, attending: 'yes' })).status).toBe(422);
    const unknown = await makeToken(SECRET, 'ghost@strohmy.cz', DAY, EXP);
    expect((await c.post('/api/push/answer', { token: unknown, attending: true })).status).toBe(400);
    const wednesday = await makeToken(SECRET, 'alice@strohmy.cz', '2026-10-14', EXP);
    expect((await c.post('/api/push/answer', { token: wednesday, attending: true })).status).toBe(400);
    clock.now = EXP;
    expect((await c.post('/api/push/answer', { token, attending: false })).status).toBe(409);
  });
});
