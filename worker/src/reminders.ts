/** Per-minute reminder job: asks users about tomorrow's lunch via web push (port of bobo.scheduler). */
import { cutoffAt, getOverride, isCooking, isLocked, loadSettings, type CalendarSettings, type Override } from './calendar';
import type { Env } from './env';
import { sendToUser, type PushDeps } from './push';
import { makeToken } from './pushTokens';
import { addDays, isoWeekday, localParts } from './tz';

const WEEKDAYS_CS = ['Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota', 'Neděle'];

export interface ReminderCandidate {
  id: string;
  active: boolean;
  reminderEnabled: boolean;
  /** `HH:MM` */
  reminderTime: string;
}

/** Tomorrow if it is a cooking day still open at `now`; otherwise null. */
export function reminderTarget(now: Date, cs: CalendarSettings, override: Override | null): string | null {
  const tomorrow = addDays(localParts(now).date, 1);
  if (!isCooking(tomorrow, cs, override) || isLocked(tomorrow, cs, now)) return null;
  return tomorrow;
}

/** Active opted-in users whose reminder time is this minute (Prague) and who still need asking. */
export function selectReminderUsers(
  candidates: ReminderCandidate[],
  now: Date,
  answered: Set<string>,
  logged: Set<string>,
): string[] {
  const hhmm = localParts(now).time;
  return candidates
    .filter((c) => c.active && c.reminderEnabled && c.reminderTime === hhmm && !answered.has(c.id) && !logged.has(c.id))
    .map((c) => c.id);
}

/** Load state and return the target day and user ids to remind. */
export async function dueReminders(db: D1Database, now: Date): Promise<{ target: string | null; userIds: string[] }> {
  const cs = await loadSettings(db);
  const tomorrow = addDays(localParts(now).date, 1);
  const target = reminderTarget(now, cs, await getOverride(db, tomorrow));
  if (!target) return { target: null, userIds: [] };
  const [users, answered, logged] = await db.batch<Record<string, unknown>>([
    // Only users with at least one subscription are candidates.
    db.prepare(
      `SELECT id, active, reminder_enabled, reminder_time FROM users u
       WHERE active = 1 AND reminder_enabled = 1
         AND EXISTS (SELECT 1 FROM push_subscriptions s WHERE s.user_id = u.id)
       ORDER BY id`,
    ),
    db.prepare('SELECT user_id FROM responses WHERE date = ?1').bind(target),
    db.prepare('SELECT user_id FROM reminder_log WHERE date = ?1').bind(target),
  ]);
  const candidates = users.results.map((u) => ({
    id: u.id as string,
    active: u.active === 1,
    reminderEnabled: u.reminder_enabled === 1,
    reminderTime: u.reminder_time as string,
  }));
  const ids = (r: D1Result<Record<string, unknown>>) => new Set(r.results.map((x) => x.user_id as string));
  return { target, userIds: selectReminderUsers(candidates, now, ids(answered), ids(logged)) };
}

export function reminderPayload(day: string, token: string) {
  const [, m, d] = day.split('-').map(Number);
  return {
    title: 'Oběd zítra?',
    body: `${WEEKDAYS_CS[isoWeekday(day) - 1]} ${d}. ${m}. — budeš obědvat?`,
    date: day,
    token,
    url: `/?date=${day}`,
  };
}

/** Send due reminders; returns the number of users notified. */
export async function runReminders(env: Env, now: Date, deps: PushDeps = {}): Promise<number> {
  const secret = env.PUSH_TOKEN_SECRET;
  if (!secret) {
    console.error('PUSH_TOKEN_SECRET not set, reminders disabled');
    return 0;
  }
  const db = env.DB;
  const { target, userIds } = await dueReminders(db, now);
  if (!target || !userIds.length) return 0;
  // Log first so a crash mid-send never causes duplicate reminders. ON CONFLICT
  // guards against an overlapping invocation: only rows inserted here are sent.
  const sentAt = new Date().toISOString();
  const inserted = await db.batch<{ user_id: string }>(
    userIds.map((uid) =>
      db
        .prepare('INSERT INTO reminder_log (user_id, date, sent_at) VALUES (?1, ?2, ?3) ON CONFLICT DO NOTHING RETURNING user_id')
        .bind(uid, target, sentAt),
    ),
  );
  const toSend = inserted.flatMap((r) => r.results.map((x) => x.user_id));
  const expires = cutoffAt(target, await loadSettings(db));
  for (const uid of toSend) {
    try {
      const payload = reminderPayload(target, await makeToken(secret, uid, target, expires));
      await sendToUser(env, uid, payload, deps);
    } catch (err) {
      console.error(`reminder push failed for ${uid}:`, err);
    }
  }
  console.log(`sent reminders for ${target} to ${toSend.length} users`);
  return toSend.length;
}

/** Cron entrypoint; never throws. */
export async function reminderJob(env: Env, now: Date): Promise<void> {
  try {
    await runReminders(env, now);
  } catch (err) {
    console.error('reminder job failed:', err);
  }
}
