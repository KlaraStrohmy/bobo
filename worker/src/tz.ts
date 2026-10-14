/**
 * Europe/Prague time helpers. Workers run in UTC, so local dates/times are
 * derived with Intl, and calendar dates are plain `YYYY-MM-DD` strings.
 */

export const TZ = 'Europe/Prague';

const DAY_MS = 86_400_000;

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

export interface LocalParts {
  /** `YYYY-MM-DD` */
  date: string;
  /** `HH:MM` */
  time: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Wall-clock parts of an instant in Europe/Prague. */
export function localParts(instant: Date | number): LocalParts {
  const map: Record<string, number> = {};
  for (const p of partsFormatter.formatToParts(new Date(instant))) {
    if (p.type !== 'literal') map[p.type] = Number(p.value);
  }
  const { year, month, day, hour, minute, second } = map as Record<keyof LocalParts, number>;
  return {
    date: `${year}-${pad2(month)}-${pad2(day)}`,
    time: `${pad2(hour)}:${pad2(minute)}`,
    year,
    month,
    day,
    hour,
    minute,
    second,
  };
}

/** UTC offset of Europe/Prague at an instant, in minutes (60 or 120). */
export function offsetMinutes(instant: Date | number): number {
  const ms = new Date(instant).getTime();
  const p = localParts(ms);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60_000);
}

/** Today's date in Europe/Prague. */
export function localDate(instant: Date | number): string {
  return localParts(instant).date;
}

/**
 * Resolve a Prague wall-clock time to an instant, like Python's
 * `datetime.combine(day, t, ZoneInfo("Europe/Prague"))` (fold=0): an ambiguous
 * time (autumn) maps to its first occurrence, a non-existent one (spring gap)
 * uses the offset in force before the transition.
 */
export function zonedTime(date: string, hhmm: string): { instant: Date; offset: number } {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  const before = offsetMinutes(wall - DAY_MS);
  const after = offsetMinutes(wall + DAY_MS);
  for (const off of [before, after]) {
    const t = wall - off * 60_000;
    if (offsetMinutes(t) === off) return { instant: new Date(t), offset: off };
  }
  return { instant: new Date(wall - before * 60_000), offset: before };
}

function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  return `${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
}

/** ISO string with local offset, e.g. `2026-10-14T16:00:00+02:00` (Python isoformat). */
export function zonedIso(date: string, hhmm: string): string {
  return `${date}T${hhmm}:00${formatOffset(zonedTime(date, hhmm).offset)}`;
}

// ---- calendar-date arithmetic on YYYY-MM-DD strings ----

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parse a strict `YYYY-MM-DD` that is a real calendar date; null otherwise. */
export function parseDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const m = DATE_RE.exec(value);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d || y < 1) return null;
  return value;
}

function dateToMs(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function msToDate(ms: number): string {
  const t = new Date(ms);
  return `${String(t.getUTCFullYear()).padStart(4, '0')}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
}

export function addDays(date: string, days: number): string {
  return msToDate(dateToMs(date) + days * DAY_MS);
}

/** Whole days from `start` to `end` (negative when `end` is earlier). */
export function daysBetween(start: string, end: string): number {
  return Math.round((dateToMs(end) - dateToMs(start)) / DAY_MS);
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: string): number {
  return ((new Date(dateToMs(date)).getUTCDay() + 6) % 7) + 1;
}

/** Inclusive list of dates. */
export function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  for (let i = 0; i <= daysBetween(start, end); i++) out.push(addDays(start, i));
  return out;
}

/** Parse `HH:MM` like the Python backend (two digits each, valid clock time). */
export function parseHhmm(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return value;
}
