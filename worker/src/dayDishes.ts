/** The dish an admin picked for a day. Shown next to the date for everybody. */
import { DISHES } from './dishes';

export interface DayDish {
  name: string;
  url: string | null;
  dishId: string | null;
}

interface Row {
  date: string;
  dish_id: string | null;
  name: string;
  url: string | null;
}

const toDish = (r: Row): DayDish => ({ name: r.name, url: r.url, dishId: r.dish_id });

export async function loadDayDishes(db: D1Database, start: string, end: string): Promise<Map<string, DayDish>> {
  const { results } = await db
    .prepare('SELECT date, dish_id, name, url FROM day_dishes WHERE date >= ?1 AND date <= ?2')
    .bind(start, end)
    .all<Row>();
  return new Map(results.map((r) => [r.date, toDish(r)]));
}

export async function getDayDish(db: D1Database, day: string): Promise<DayDish | null> {
  return (await loadDayDishes(db, day, day)).get(day) ?? null;
}

/** Accepts only http(s) links, so a dish can never carry a javascript: URL into the UI. */
export function cleanUrl(value: string | null | undefined): string | null | 'invalid' {
  const v = (value ?? '').trim();
  if (!v) return null;
  if (v.length > 500) return 'invalid';
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : 'invalid';
  } catch {
    return 'invalid';
  }
}

export type SetResult = { ok: true; dish: DayDish | null } | { ok: false; detail: string };

/** dishId from the list, or a free-text name (+ optional url); neither clears the day. */
export async function setDayDish(
  db: D1Database,
  day: string,
  input: { dishId?: string | null; name?: string | null; url?: string | null },
  by: string,
  now: Date,
): Promise<SetResult> {
  const listed = input.dishId ? DISHES.find((d) => d.id === input.dishId) : undefined;
  if (input.dishId && !listed) return { ok: false, detail: 'unknown dish' };

  let name: string;
  let url: string | null;
  if (listed) {
    name = listed.name;
    url = listed.url ?? null;
  } else {
    name = (input.name ?? '').trim();
    if (!name) {
      await db.prepare('DELETE FROM day_dishes WHERE date = ?1').bind(day).run();
      return { ok: true, dish: null };
    }
    if (name.length > 80) return { ok: false, detail: 'name: at most 80 characters' };
    const cleaned = cleanUrl(input.url);
    if (cleaned === 'invalid') return { ok: false, detail: 'url: expected an http(s) link' };
    url = cleaned;
  }
  await db
    .prepare(
      `INSERT INTO day_dishes (date, dish_id, name, url, updated_by, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT(date) DO UPDATE SET dish_id = ?2, name = ?3, url = ?4, updated_by = ?5, updated_at = ?6`,
    )
    .bind(day, listed?.id ?? null, name, url, by, now.toISOString())
    .run();
  return { ok: true, dish: { name, url, dishId: listed?.id ?? null } };
}
