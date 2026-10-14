import { beforeEach, describe, expect, it } from 'vitest';
import { ADMIN, as, Clock, client, resetDb, type TestClient } from './helpers';

const ALICE = as('alice@strohmy.cz');
const BOB = as('bob@strohmy.cz');
const ADM = as(ADMIN);

let clock: Clock;
let c: TestClient;

beforeEach(async () => {
  await resetDb();
  clock = new Clock();
  c = client(clock);
});

describe('API', () => {
  it('serves health and config', async () => {
    expect(await (await c.get('/api/health')).json()).toEqual({ status: 'ok' });
    const cfg = (await (await c.get('/api/config')).json()) as Record<string, string>;
    expect(Object.keys(cfg).sort()).toEqual(['apiScope', 'clientId', 'tenantId', 'vapidPublicKey']);
    expect(cfg.clientId).toBe('00000000-0000-0000-0000-00000000c11e');
    expect(cfg.apiScope).toBe('api://00000000-0000-0000-0000-00000000c11e/access_as_user');
  });

  it('returns JSON 404 for unknown API paths', async () => {
    const res = await c.get('/api/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ detail: 'Not Found' });
  });

  it('requires auth on /me and upserts the user', async () => {
    const unauth = await c.get('/api/me');
    expect(unauth.status).toBe(401);
    expect(unauth.headers.get('WWW-Authenticate')).toBe('Bearer');
    expect(await (await c.get('/api/me', ALICE)).json()).toEqual({
      id: 'alice@strohmy.cz',
      email: 'alice@strohmy.cz',
      name: 'alice',
      isAdmin: false,
      reminderEnabled: false,
      reminderTime: '15:00',
      pushSubscribed: false,
      reminderDeadline: '16:00',
      remindersPossible: true,
    });
    const me = (await (await c.put('/api/me/preferences', { reminderEnabled: true, reminderTime: '14:30' }, ALICE)).json()) as Record<string, unknown>;
    expect(me.reminderEnabled).toBe(true);
    expect(me.reminderTime).toBe('14:30');
    expect((await c.put('/api/me/preferences', { reminderEnabled: true, reminderTime: '25:99' }, ALICE)).status).toBe(422);
    expect((await c.put('/api/me/preferences', { reminderEnabled: 'yes', reminderTime: '10:00' }, ALICE)).status).toBe(422);
    // A day-before reminder after the 16:00 cutoff could never fire.
    const late = await c.put('/api/me/preferences', { reminderEnabled: true, reminderTime: '16:00' }, ALICE);
    expect(late.status).toBe(422);
    expect(((await late.json()) as { detail: string }).detail).toBe('Připomínka musí být před uzávěrkou (16:00).');
    expect((await c.put('/api/me/preferences', { reminderEnabled: false, reminderTime: '18:00' }, ALICE)).status).toBe(200);
    expect(((await (await c.get('/api/me', ADM)).json()) as Record<string, unknown>).isAdmin).toBe(true);
  });

  it('builds the calendar with overrides', async () => {
    await c.put('/api/admin/overrides/2026-10-13', { cooking: false, note: 'Zavřeno' }, ADM);
    await c.put('/api/admin/overrides/2026-10-14', { cooking: true, note: null }, ADM);
    const res = await c.get('/api/calendar?from=2026-10-12&to=2026-10-18', ALICE);
    const days = Object.fromEntries(((await res.json()) as { days: Record<string, unknown>[] }).days.map((d) => [d.date, d]));
    expect(Object.keys(days)).toHaveLength(7);
    expect(days['2026-10-13']).toMatchObject({ cooking: false, note: 'Zavřeno', isOverride: true });
    expect(days['2026-10-14']).toMatchObject({ cooking: true, isOverride: true });
    expect(days['2026-10-15']).toEqual({
      date: '2026-10-15',
      cooking: true,
      note: null,
      isOverride: false,
      attending: null,
      locked: false,
      cutoffAt: '2026-10-14T16:00:00+02:00',
    });
    expect(days['2026-10-12'].locked).toBe(true); // cutoff was yesterday 16:00
    const overrides = (await (await c.get('/api/admin/overrides?from=2026-10-01&to=2026-10-31', ADM)).json()) as {
      overrides: { date: string }[];
    };
    expect(overrides.overrides).toEqual([
      { date: '2026-10-13', cooking: false, note: 'Zavřeno' },
      { date: '2026-10-14', cooking: true, note: null },
    ]);
    expect(await (await c.del('/api/admin/overrides/2026-10-13', undefined, ADM)).json()).toEqual({ ok: true });
  });

  it('limits the calendar range', async () => {
    expect((await c.get('/api/calendar?from=2026-10-01&to=2027-01-01', ALICE)).status).toBe(200);
    expect((await c.get('/api/calendar?from=2026-10-01&to=2027-01-02', ALICE)).status).toBe(400);
    expect((await c.get('/api/calendar?from=2026-10-10&to=2026-10-01', ALICE)).status).toBe(400);
    expect((await c.get('/api/calendar?from=2026-10-01', ALICE)).status).toBe(422);
    expect((await c.get('/api/calendar?from=nope&to=2026-10-02', ALICE)).status).toBe(422);
  });

  it('enforces response rules and the cutoff boundary', async () => {
    const put = (day: string, attending: boolean | null) => c.put(`/api/responses/${day}`, { attending }, ALICE);
    const res = await put('2026-10-13', true);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ attending: true, locked: false });
    expect((await put('2026-10-14', true)).status).toBe(400); // Wed: no cooking
    clock.now = new Date('2026-10-12T15:59:59+02:00');
    expect((await put('2026-10-13', true)).status).toBe(200);
    clock.now = new Date('2026-10-12T16:00:00+02:00');
    expect((await put('2026-10-13', false)).status).toBe(409);
    expect((await put('2026-10-15', null)).status).toBe(200);
    expect((await c.put('/api/responses/2026-10-15', {}, ALICE)).status).toBe(422);
    expect((await c.put('/api/responses/2026-13-01', { attending: true }, ALICE)).status).toBe(422);
    // Admin may change anyone after cutoff.
    const adm = await c.put('/api/admin/responses/alice@strohmy.cz/2026-10-13', { attending: false }, ADM);
    expect(await adm.json()).toEqual({ userId: 'alice@strohmy.cz', date: '2026-10-13', attending: false });
    expect((await c.put('/api/admin/responses/nobody/2026-10-13', { attending: false }, ADM)).status).toBe(404);
  });

  it('bulk-fills only empty / unlocked cooking days', async () => {
    clock.now = new Date('2026-10-12T17:00:00+02:00'); // Tue 13th locked
    await c.put('/api/responses/2026-10-15', { attending: false }, ALICE);
    const body = { from: '2026-10-12', to: '2026-10-25', attending: true as boolean | null, onlyEmpty: true };
    // cooking days: 13 (locked), 15 (answered), 16, 20, 22, 23
    expect(await (await c.post('/api/responses/bulk', body, ALICE)).json()).toEqual({ updated: 4, skipped: 2 });
    const days = ((await (await c.get('/api/calendar?from=2026-10-12&to=2026-10-25', ALICE)).json()) as {
      days: { date: string; attending: boolean | null }[];
    }).days;
    const att = Object.fromEntries(days.map((d) => [d.date, d.attending]));
    expect(att['2026-10-13']).toBeNull();
    expect(att['2026-10-15']).toBe(false);
    expect(att['2026-10-16']).toBe(true);
    expect(att['2026-10-14']).toBeNull(); // non-cooking untouched
    body.onlyEmpty = false;
    body.attending = false;
    expect(await (await c.post('/api/responses/bulk', body, ALICE)).json()).toEqual({ updated: 5, skipped: 1 });
    body.attending = null;
    expect(await (await c.post('/api/responses/bulk', body, ALICE)).json()).toEqual({ updated: 5, skipped: 1 });
    const cleared = ((await (await c.get('/api/calendar?from=2026-10-12&to=2026-10-25', ALICE)).json()) as {
      days: { attending: boolean | null }[];
    }).days;
    expect(cleared.every((d) => d.attending === null)).toBe(true);
    // onlyEmpty defaults to false; attending is required.
    expect((await c.post('/api/responses/bulk', { from: '2026-10-12', to: '2026-10-25', attending: true }, ALICE)).status).toBe(200);
    expect((await c.post('/api/responses/bulk', { from: '2026-10-12', to: '2026-10-25' }, ALICE)).status).toBe(422);
    expect((await c.post('/api/responses/bulk', { from: '2026-01-01', to: '2027-01-03', attending: true }, ALICE)).status).toBe(400);
  });

  it('forbids admin endpoints for regular users', async () => {
    for (const path of ['/api/admin/settings', '/api/admin/users', '/api/admin/overview?date=2026-10-13']) {
      expect((await c.get(path, ALICE)).status).toBe(403);
    }
    expect((await c.put('/api/admin/overrides/2026-10-13', { cooking: false }, ALICE)).status).toBe(403);
    expect((await c.get('/api/admin/settings')).status).toBe(401);
  });

  it('round-trips admin settings', async () => {
    expect(await (await c.get('/api/admin/settings', ADM)).json()).toEqual({
      cookingWeekdays: [2, 4, 5],
      cutoff: { daysBefore: 1, time: '16:00' },
    });
    const saved = await (await c.put('/api/admin/settings', { cookingWeekdays: [5, 1], cutoff: { daysBefore: 2, time: '09:00' } }, ADM)).json();
    expect(saved).toEqual({ cookingWeekdays: [1, 5], cutoff: { daysBefore: 2, time: '09:00' } });
    expect(await (await c.get('/api/admin/settings', ADM)).json()).toEqual(saved);
    const bad = { cookingWeekdays: [8], cutoff: { daysBefore: 1, time: '16:00' } };
    expect((await c.put('/api/admin/settings', bad, ADM)).status).toBe(422);
  });

  it('builds admin overview, summary and user list', async () => {
    const carol = as('carol@strohmy.cz');
    for (const h of [ALICE, BOB, carol, ADM]) await c.get('/api/me', h);
    await c.put('/api/responses/2026-10-13', { attending: true }, ALICE);
    await c.put('/api/responses/2026-10-13', { attending: false }, BOB);
    const deact = await c.put('/api/admin/users/carol@strohmy.cz', { active: false }, ADM);
    expect(((await deact.json()) as { active: boolean }).active).toBe(false);
    const ov = (await (await c.get('/api/admin/overview?date=2026-10-13', ADM)).json()) as {
      cooking: boolean;
      counts: unknown;
      yes: { email: string }[];
      no: { email: string }[];
      none: { email: string }[];
    };
    expect(ov.cooking).toBe(true);
    expect(ov.counts).toEqual({ yes: 1, no: 1, none: 1 });
    expect(ov.yes.map((u) => u.email)).toEqual(['alice@strohmy.cz']);
    expect(ov.no.map((u) => u.email)).toEqual(['bob@strohmy.cz']);
    expect(ov.none.map((u) => u.email)).toEqual([ADMIN]); // carol inactive
    expect(Object.keys(ov.yes[0]).sort()).toEqual(['email', 'id', 'name']);
    const def = (await (await c.get('/api/admin/overview', ADM)).json()) as { date: string };
    expect(def.date).toBe('2026-10-13'); // nearest cooking day from Monday
    const summary = (await (await c.get('/api/admin/summary?from=2026-10-13&to=2026-10-14', ADM)).json()) as {
      days: Record<string, unknown>[];
    };
    expect(summary.days[0]).toEqual({ date: '2026-10-13', cooking: true, note: null, yes: 1, no: 1, none: 1 });
    expect(summary.days[1].cooking).toBe(false);
    const users = ((await (await c.get('/api/admin/users', ADM)).json()) as { users: Record<string, unknown>[] }).users;
    expect(users).toHaveLength(4);
    expect(Object.keys(users[0]).sort()).toEqual(['active', 'email', 'id', 'lastSeenAt', 'name', 'reminderEnabled']);
    expect(users.map((u) => u.name)).toEqual(['admin', 'alice', 'bob', 'carol']);
    expect(String(users[0].lastSeenAt)).toMatch(/\+00:00$/);
    expect((await c.put('/api/admin/users/nobody', { active: true }, ADM)).status).toBe(404);
  });
});
