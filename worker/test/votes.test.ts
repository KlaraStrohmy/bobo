import { beforeEach, describe, expect, it } from 'vitest';
import { DISHES } from '../src/dishes';
import { ADMIN, as, Clock, client, resetDb, type TestClient } from './helpers';

const ALICE = as('alice@strohmy.cz');
const BOB = as('bob@strohmy.cz');

interface Payload {
  week: string;
  maxVotes: number;
  myVotes: string[];
  dishes: {
    id: string;
    name: string;
    url: string | null;
    votes: number | null;
    lactose: string;
    ingredients: string[];
    nutrition: { protein: number; fat: number; carbs: number; estimated: boolean };
  }[];
}

let clock: Clock;
let c: TestClient;

beforeEach(async () => {
  await resetDb();
  clock = new Clock(); // Monday 2026-10-12, cooking Tue/Thu/Fri
  c = client(clock);
});

const vote = (who: Record<string, string>, dish: string, voted: boolean) => c.put(`/api/votes/${dish}`, { voted }, who);
const state = async (who: Record<string, string>) => (await (await c.get('/api/votes', who)).json()) as Payload;

describe('votes', () => {
  it('lists every dish for next week; links only where a url is known', async () => {
    const s = await state(ALICE);
    expect(s.week).toBe('2026-10-19');
    expect(s.dishes).toHaveLength(DISHES.length);
    const paprice = s.dishes.find((d) => d.id === 'kure-na-paprice');
    expect(paprice?.url).toBe('https://www.rohlik.cz/chef/21-kure-na-paprice');
    expect(s.dishes.find((d) => d.id === 'vepr-na-karamelu')?.url).toBeNull();
  });

  it('has nutrition and lactose for every dish, with calories that add up', async () => {
    const s = await state(ALICE);
    for (const d of s.dishes) {
      const { protein, fat, carbs } = d.nutrition;
      for (const g of [protein, fat, carbs]) expect(Number.isFinite(g) && g >= 0, d.name).toBe(true);
      const kcal = protein * 4 + fat * 9 + carbs * 4;
      expect(kcal, d.name).toBeGreaterThan(200); // a meal, not a garnish
      expect(kcal, d.name).toBeLessThan(1400);
      expect(['yes', 'trace', 'no'], d.name).toContain(d.lactose);
    }
    const byId = new Map(s.dishes.map((d) => [d.id, d]));
    // numbers printed on recipe pages are not estimates, calculated ones are
    expect(byId.get('pecene-testoviny-s-tunakem')?.nutrition).toEqual({ protein: 31, fat: 11, carbs: 60, estimated: false });
    expect(byId.get('kure-na-paprice')?.nutrition.estimated).toBe(true);
    expect(byId.get('koprovka')?.lactose).toBe('yes');
    // ingredients are an array for every dish; the cook fills them in one recipe at a time
    for (const d of s.dishes) expect(Array.isArray(d.ingredients), d.name).toBe(true);
    expect(byId.get('salat-s-pecenou-ryzi-a-lososem')?.ingredients).toEqual(['losos', 'okurka', 'avokádo', 'batáty', 'cottage', 'pečená rýže', 'chilli']);
    expect(byId.get('rajska')?.lactose).toBe('no'); // ghee only
    expect(byId.get('veprova-panenka-s-bramborovou-kasi')?.lactose).toBe('no'); // lactose-free mash
    expect(byId.get('arasidove-curry')?.lactose).toBe('no');
    expect(byId.get('arasidove-curry')?.ingredients).toContain('brambory');
  });

  it('gives everybody 4 votes a week, whatever the cooking days are', async () => {
    expect((await state(ALICE)).maxVotes).toBe(4);
    await c.put('/api/admin/settings', { cookingWeekdays: [5], cutoff: { daysBefore: 1, time: '16:00' } }, as(ADMIN));
    expect((await state(ALICE)).maxVotes).toBe(4);
  });

  it('hides the counts until the user has voted, then reveals them', async () => {
    await vote(BOB, 'koprovka', true);
    expect((await state(ALICE)).dishes.every((d) => d.votes === null)).toBe(true);
    await vote(ALICE, 'rajska', true);
    const s = await state(ALICE);
    expect(s.myVotes).toEqual(['rajska']);
    expect(s.dishes.find((d) => d.id === 'koprovka')?.votes).toBe(1);
    expect(s.dishes.find((d) => d.id === 'rajska')?.votes).toBe(1);
    expect(s.dishes.find((d) => d.id === 'arasidove-curry')?.votes).toBe(0);
  });

  it('refuses a fifth vote but always allows removing one', async () => {
    const ids = DISHES.slice(0, 5).map((d) => d.id);
    for (const id of ids.slice(0, 4)) expect((await vote(ALICE, id, true)).status).toBe(200);
    expect((await vote(ALICE, ids[4], true)).status).toBe(409);
    expect([...(await state(ALICE)).myVotes].sort()).toEqual(ids.slice(0, 4).sort());
    expect((await vote(ALICE, ids[0], false)).status).toBe(200);
    expect((await vote(ALICE, ids[4], true)).status).toBe(200);
  });

  it('is idempotent: voting twice for the same dish counts once', async () => {
    await vote(ALICE, 'koprovka', true);
    await vote(ALICE, 'koprovka', true);
    const s = await state(ALICE);
    expect(s.myVotes).toEqual(['koprovka']);
    expect(s.dishes.find((d) => d.id === 'koprovka')?.votes).toBe(1);
  });

  it('needs a signed-in user', async () => {
    expect((await c.get('/api/votes')).status).toBe(401);
    expect((await c.put('/api/votes/koprovka', { voted: true })).status).toBe(401);
  });

  it('rejects unknown dishes and malformed bodies', async () => {
    expect((await vote(ALICE, 'nesmysl', true)).status).toBe(404);
    expect((await c.put('/api/votes/koprovka', { voted: 'yes' }, ALICE)).status).toBe(422);
  });

  it('starts a clean slate every week', async () => {
    await vote(ALICE, 'koprovka', true);
    clock.now = new Date('2026-10-19T10:00:00+02:00'); // the voted week has begun, voting moves on
    const s = await state(ALICE);
    expect(s.week).toBe('2026-10-26');
    expect(s.myVotes).toEqual([]);
  });

});
