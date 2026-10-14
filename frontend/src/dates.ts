// Date helpers. Dates are plain `YYYY-MM-DD` strings; arithmetic is done in UTC
// so DST never shifts a day, and "today" is evaluated in Europe/Prague.
export const TZ = 'Europe/Prague';

const isoFmt = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const shortFmt = new Intl.DateTimeFormat('cs-CZ', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'numeric' });
const longFmt = new Intl.DateTimeFormat('cs-CZ', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('cs-CZ', {
  timeZone: TZ,
  day: 'numeric',
  month: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function todayPrague(): string {
  return isoFmt.format(new Date());
}

function toUtc(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

function fromUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  const d = toUtc(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUtc(d);
}

/** ISO weekday, 1 = Monday … 7 = Sunday. */
export function isoWeekday(iso: string): number {
  const wd = toUtc(iso).getUTCDay();
  return wd === 0 ? 7 : wd;
}

export function mondayOf(iso: string): string {
  return addDays(iso, 1 - isoWeekday(iso));
}

export function endOfMonth(iso: string): string {
  const d = toUtc(iso);
  return fromUtc(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12)));
}

/** "út 14. 10." */
export function formatShort(iso: string): string {
  return shortFmt.format(toUtc(iso));
}

/** "úterý 14. 10. 2026" */
export function formatLong(iso: string): string {
  return longFmt.format(toUtc(iso));
}

/** Formats an ISO datetime (e.g. cutoffAt) in Prague time: "13. 10. 16:00". */
export function formatDateTime(isoDateTime: string): string {
  return dateTimeFmt.format(new Date(isoDateTime));
}

export function isoWeekNumber(iso: string): number {
  const d = toUtc(iso);
  d.setUTCDate(d.getUTCDate() + 4 - isoWeekday(iso));
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7);
}

export const WEEKDAY_LABELS = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];

const dayMonthFmt = new Intl.DateTimeFormat('cs-CZ', { timeZone: 'UTC', day: 'numeric', month: 'numeric' });
const weekdayLongFmt = new Intl.DateTimeFormat('cs-CZ', { timeZone: 'UTC', weekday: 'long' });
const weekdayShortFmt = new Intl.DateTimeFormat('cs-CZ', { timeZone: 'UTC', weekday: 'short' });
const timeFmt = new Intl.DateTimeFormat('cs-CZ', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });

/** "15. 10." */
export function formatDayMonth(iso: string): string {
  return dayMonthFmt.format(toUtc(iso));
}

/** "čtvrtek" */
export function weekdayLong(iso: string): string {
  return weekdayLongFmt.format(toUtc(iso));
}

/** "čt" */
export function weekdayShort(iso: string): string {
  return weekdayShortFmt.format(toUtc(iso));
}

/** Day of month as a number. */
export function dayOfMonth(iso: string): number {
  return Number(iso.slice(8, 10));
}

/** Relative Czech label of a date compared to `today`: "dnes", "zítra", "v pondělí"… */
export function relativeDayLabel(iso: string, today: string): string | null {
  if (iso === today) return 'dnes';
  if (iso === addDays(today, 1)) return 'zítra';
  if (iso === addDays(today, -1)) return 'včera';
  return null;
}

/** Human cutoff label in Prague time: "dnes 16:00", "zítra 9:30", "st 14. 10. 16:00". */
export function formatCutoff(isoDateTime: string, today: string): string {
  const d = new Date(isoDateTime);
  const date = isoFmt.format(d);
  const time = timeFmt.format(d);
  const rel = relativeDayLabel(date, today);
  if (rel) return `${rel} ${time}`;
  // Within the coming week the weekday is enough ("po 16:00"); further out use the date.
  return date > today && date <= addDays(today, 6) ? `${weekdayShort(date)} ${time}` : `${formatDayMonth(date)} ${time}`;
}
