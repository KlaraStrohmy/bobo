import { beforeEach, describe, expect, it } from 'vitest';
import { ADMIN, as, Clock, client, resetDb, type TestClient } from './helpers';

const ALICE = as('alice@strohmy.cz');
const ADM = as(ADMIN);

interface Day {
  date: string;
  dish: { name: string; url: string | null; dishId: string | null } | null;
}

let clock: Clock;
let c: TestClient;

beforeEach(async () => {
  await resetDb();
  clock = new Clock(); // Monday 2026-10-12, cooking Tue/Thu/Fri
  c = client(clock);
});

const dayOf = async (date: string, who = ALICE) =>
  ((await (await c.get(`/api/calendar?from=${date}&to=${date}`, who)).json()) as { days: Day[] }).days[0];
const setDish = (day: string, body: unknown, who = ADM) => c.put(`/api/admin/dishes/${day}`, body, who);

describe('day dishes (admin decides what is cooked)', () => {
  it('shows no dish until an admin picks one', async () => {
    expect((await dayOf('2026-10-13')).dish).toBeNull();
  });

  it('takes a dish from the list including its link, and everybody sees it', async () => {
    const res = await setDish('2026-10-13', { dishId: 'kure-na-paprice' });
    expect(res.status).toBe(200);
    expect((await dayOf('2026-10-13')).dish).toEqual({
      name: 'Kuře na paprice',
      url: 'https://www.rohlik.cz/chef/21-kure-na-paprice',
      dishId: 'kure-na-paprice',
    });
  });

  it('accepts a free-text dish with an optional link', async () => {
    await setDish('2026-10-15', { name: '  Svíčková  ', url: 'https://example.com/svickova' });
    expect((await dayOf('2026-10-15')).dish).toEqual({ name: 'Svíčková', url: 'https://example.com/svickova', dishId: null });
    await setDish('2026-10-15', { name: 'Guláš' });
    expect((await dayOf('2026-10-15')).dish).toEqual({ name: 'Guláš', url: null, dishId: null });
  });

  it('clears the dish when neither a list dish nor a name is given', async () => {
    await setDish('2026-10-13', { dishId: 'koprovka' });
    await setDish('2026-10-13', { dishId: null, name: '' });
    expect((await dayOf('2026-10-13')).dish).toBeNull();
  });

  it('rejects unknown dishes, long names and non-http links', async () => {
    expect((await setDish('2026-10-13', { dishId: 'nesmysl' })).status).toBe(422);
    expect((await setDish('2026-10-13', { name: 'x'.repeat(81) })).status).toBe(422);
    expect((await setDish('2026-10-13', { name: 'Něco', url: 'javascript:alert(1)' })).status).toBe(422);
    expect((await setDish('2026-10-13', { name: 'Něco', url: 'ne-odkaz' })).status).toBe(422);
    expect((await dayOf('2026-10-13')).dish).toBeNull();
  });

  it('is for admins only', async () => {
    expect((await setDish('2026-10-13', { dishId: 'koprovka' }, ALICE)).status).toBe(403);
    expect((await c.put('/api/admin/dishes/2026-10-13', { dishId: 'koprovka' })).status).toBe(401);
  });

  it('is part of the admin overview and of an answered day', async () => {
    await setDish('2026-10-13', { dishId: 'rajska' });
    const ov = (await (await c.get('/api/admin/overview?date=2026-10-13', ADM)).json()) as Day;
    expect(ov.dish?.name).toBe('Rajská');
    const ans = (await (await c.put('/api/responses/2026-10-13', { attending: true }, ALICE)).json()) as Day;
    expect(ans.dish?.name).toBe('Rajská');
  });

  it('lets admins see vote counts without having voted, others not', async () => {
    await c.put('/api/votes/koprovka', { voted: true }, as('bob@strohmy.cz'));
    const asAdmin = (await (await c.get('/api/votes', ADM)).json()) as { dishes: { id: string; votes: number | null }[] };
    expect(asAdmin.dishes.find((d) => d.id === 'koprovka')?.votes).toBe(1);
    const asUser = (await (await c.get('/api/votes', ALICE)).json()) as { dishes: { votes: number | null }[] };
    expect(asUser.dishes.every((d) => d.votes === null)).toBe(true);
  });
});
