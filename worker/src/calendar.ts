/** Cooking-day, cutoff and response logic (port of bobo.services.calendar). */
import { addDays, dateRange, isoWeekday, zonedIso, zonedTime } from './tz';

export interface CalendarSettings {
  cookingWeekdays: number[];
  cutoffDaysBefore: number;
  /** `HH:MM` */
  cutoffTime: string;
}

export const DEFAULT_SETTINGS: CalendarSettings = {
  cookingWeekdays: [2, 4, 5],
  cutoffDaysBefore: 1,
  cutoffTime: '16:00',
};

export interface Override {
  date: string;
  cooking: boolean;
  note: string | null;
}

interface OverrideRow {
  date: string;
  cooking: number;
  note: string | null;
}

export type Source = 'web' | 'bulk' | 'push';

export function settingsToApi(cs: CalendarSettings) {
  return {
    cookingWeekdays: [...cs.cookingWeekdays],
    cutoff: { daysBefore: cs.cutoffDaysBefore, time: cs.cutoffTime },
  };
}

export async function loadSettings(db: D1Database): Promise<CalendarSettings> {
  const { results } = await db.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>();
  const rows = new Map(results.map((r) => [r.key, JSON.parse(r.value) as unknown]));
  const weekdays = rows.get('cooking_weekdays');
  const cutoff = (rows.get('cutoff') ?? {}) as { days_before?: number; time?: string };
  return {
    cookingWeekdays: Array.isArray(weekdays)
      ? [...(weekdays as number[])].sort((a, b) => a - b)
      : [...DEFAULT_SETTINGS.cookingWeekdays],
    cutoffDaysBefore: Number(cutoff.days_before ?? DEFAULT_SETTINGS.cutoffDaysBefore),
    cutoffTime: cutoff.time ?? DEFAULT_SETTINGS.cutoffTime,
  };
}

export async function saveSettings(db: D1Database, cs: CalendarSettings): Promise<void> {
  const stmt = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  );
  await db.batch([
    stmt.bind('cooking_weekdays', JSON.stringify(cs.cookingWeekdays)),
    stmt.bind('cutoff', JSON.stringify({ days_before: cs.cutoffDaysBefore, time: cs.cutoffTime })),
  ]);
}

/** Moment after which answers for `day` are locked. */
export function cutoffAt(day: string, cs: CalendarSettings): Date {
  return zonedTime(addDays(day, -cs.cutoffDaysBefore), cs.cutoffTime).instant;
}

export function cutoffIso(day: string, cs: CalendarSettings): string {
  return zonedIso(addDays(day, -cs.cutoffDaysBefore), cs.cutoffTime);
}

export function isLocked(day: string, cs: CalendarSettings, now: Date): boolean {
  return now.getTime() >= cutoffAt(day, cs).getTime();
}

/** Override wins; otherwise the ISO weekday decides. */
export function isCooking(day: string, cs: CalendarSettings, override: Override | null | undefined): boolean {
  if (override) return override.cooking;
  return cs.cookingWeekdays.includes(isoWeekday(day));
}

const toOverride = (r: OverrideRow): Override => ({ date: r.date, cooking: r.cooking === 1, note: r.note });

export async function loadOverrides(db: D1Database, start: string, end: string): Promise<Map<string, Override>> {
  const { results } = await db
    .prepare('SELECT date, cooking, note FROM day_overrides WHERE date >= ?1 AND date <= ?2 ORDER BY date')
    .bind(start, end)
    .all<OverrideRow>();
  return new Map(results.map((r) => [r.date, toOverride(r)]));
}

export async function getOverride(db: D1Database, day: string): Promise<Override | null> {
  const row = await db.prepare('SELECT date, cooking, note FROM day_overrides WHERE date = ?1').bind(day).first<OverrideRow>();
  return row ? toOverride(row) : null;
}

export async function loadUserResponses(
  db: D1Database,
  userId: string,
  start: string,
  end: string,
): Promise<Map<string, boolean>> {
  const { results } = await db
    .prepare('SELECT date, attending FROM responses WHERE user_id = ?1 AND date >= ?2 AND date <= ?3')
    .bind(userId, start, end)
    .all<{ date: string; attending: number }>();
  return new Map(results.map((r) => [r.date, r.attending === 1]));
}

export interface DayStatus {
  date: string;
  cooking: boolean;
  note: string | null;
  isOverride: boolean;
  locked: boolean;
  cutoffAt: string;
}

export function dayStatus(day: string, cs: CalendarSettings, override: Override | null | undefined, now: Date): DayStatus {
  return {
    date: day,
    cooking: isCooking(day, cs, override),
    note: override ? override.note : null,
    isOverride: Boolean(override),
    locked: isLocked(day, cs, now),
    cutoffAt: cutoffIso(day, cs),
  };
}

export async function getDayStatus(db: D1Database, day: string, now: Date): Promise<DayStatus> {
  const cs = await loadSettings(db);
  return dayStatus(day, cs, await getOverride(db, day), now);
}

export function dayJson(status: DayStatus, attending: boolean | null) {
  return {
    date: status.date,
    cooking: status.cooking,
    note: status.note,
    isOverride: status.isOverride,
    attending,
    locked: status.locked,
    cutoffAt: status.cutoffAt,
  };
}

export async function userCalendar(db: D1Database, userId: string, start: string, end: string, now: Date) {
  const [cs, overrides, responses] = await Promise.all([
    loadSettings(db),
    loadOverrides(db, start, end),
    loadUserResponses(db, userId, start, end),
  ]);
  return dateRange(start, end).map((day) =>
    dayJson(dayStatus(day, cs, overrides.get(day), now), responses.get(day) ?? null),
  );
}

/** Statement upserting (or deleting, when `attending` is null) a response. */
export function responseStatement(
  db: D1Database,
  userId: string,
  day: string,
  attending: boolean | null,
  source: Source,
): D1PreparedStatement {
  if (attending === null) {
    return db.prepare('DELETE FROM responses WHERE user_id = ?1 AND date = ?2').bind(userId, day);
  }
  return db
    .prepare(
      `INSERT INTO responses (user_id, date, attending, updated_at, source) VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(user_id, date) DO UPDATE SET
         attending = excluded.attending, updated_at = excluded.updated_at, source = excluded.source`,
    )
    .bind(userId, day, attending ? 1 : 0, new Date().toISOString(), source);
}

export async function setResponse(
  db: D1Database,
  userId: string,
  day: string,
  attending: boolean | null,
  source: Source,
): Promise<void> {
  await responseStatement(db, userId, day, attending, source).run();
}

/**
 * Apply an answer to unlocked cooking days; non-cooking days are ignored.
 * `updated` counts cooking days the answer was applied to; `skipped` counts
 * cooking days left untouched because they are locked or (with `onlyEmpty`)
 * already answered.
 */
export async function bulkFill(
  db: D1Database,
  userId: string,
  start: string,
  end: string,
  attending: boolean | null,
  onlyEmpty: boolean,
  now: Date,
): Promise<{ updated: number; skipped: number }> {
  const [cs, overrides, responses] = await Promise.all([
    loadSettings(db),
    loadOverrides(db, start, end),
    loadUserResponses(db, userId, start, end),
  ]);
  let updated = 0;
  let skipped = 0;
  const statements: D1PreparedStatement[] = [];
  for (const day of dateRange(start, end)) {
    if (!isCooking(day, cs, overrides.get(day))) continue;
    if (isLocked(day, cs, now) || (onlyEmpty && responses.has(day))) {
      skipped += 1;
      continue;
    }
    statements.push(responseStatement(db, userId, day, attending, 'bulk'));
    updated += 1;
  }
  if (statements.length) await db.batch(statements);
  return { updated, skipped };
}

/** First cooking day on or after `start` (`start` if none within the horizon). */
export async function nextCookingDay(db: D1Database, start: string, horizon = 62): Promise<string> {
  const end = addDays(start, horizon);
  const [cs, overrides] = await Promise.all([loadSettings(db), loadOverrides(db, start, end)]);
  return dateRange(start, end).find((day) => isCooking(day, cs, overrides.get(day))) ?? start;
}
