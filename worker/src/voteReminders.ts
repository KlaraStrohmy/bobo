/** Weekly push reminder to vote for next week's dishes, for people who have not voted yet. */
import type { Env } from './env';
import { sendToUser, type PushDeps } from './push';
import { isoWeekday, localParts } from './tz';
import { VOTES_PER_WEEK, votingWeek } from './votes';

/** Monday, between 09:00 and 18:00 Prague time: a late cron tick still delivers, the log prevents repeats. */
export const VOTE_REMINDER_WEEKDAY = 1;
export const VOTE_REMINDER_FROM = '09:00';
export const VOTE_REMINDER_UNTIL = '18:00';

export function voteReminderDue(now: Date): boolean {
  const p = localParts(now);
  return isoWeekday(p.date) === VOTE_REMINDER_WEEKDAY && p.time >= VOTE_REMINDER_FROM && p.time < VOTE_REMINDER_UNTIL;
}

const votesWord = (n: number) => (n === 1 ? 'hlas' : n >= 2 && n <= 4 ? 'hlasy' : 'hlasů');

export function voteReminderPayload(week: string) {
  const [, m, d] = week.split('-').map(Number);
  return {
    title: 'Hlasuj! 🍜',
    body: `Vyber, co budeme jíst týden od ${d}. ${m}. Máš ${VOTES_PER_WEEK} ${votesWord(VOTES_PER_WEEK)}.`,
    url: '/hlasuj',
    tag: 'bobo-vote',
  };
}

/** Active users with a subscription and the switch on, who have no vote yet this week and were not reminded. */
export async function dueVoteReminders(db: D1Database, now: Date): Promise<{ week: string; userIds: string[] }> {
  const week = votingWeek(now);
  if (!voteReminderDue(now)) return { week, userIds: [] };
  const { results } = await db
    .prepare(
      `SELECT u.id FROM users u
       WHERE u.active = 1 AND u.vote_reminder_enabled = 1
         AND EXISTS (SELECT 1 FROM push_subscriptions s WHERE s.user_id = u.id)
         AND NOT EXISTS (SELECT 1 FROM dish_votes v WHERE v.user_id = u.id AND v.week = ?1)
         AND NOT EXISTS (SELECT 1 FROM vote_reminder_log l WHERE l.user_id = u.id AND l.week = ?1)
       ORDER BY u.id`,
    )
    .bind(week)
    .all<{ id: string }>();
  return { week, userIds: results.map((r) => r.id) };
}

/** Send the reminders that are due; returns how many people were notified. */
export async function runVoteReminders(env: Env, now: Date, deps: PushDeps = {}): Promise<number> {
  const { week, userIds } = await dueVoteReminders(env.DB, now);
  if (!userIds.length) return 0;
  // Log first, so a crash while sending never causes a second reminder; only rows inserted here are sent.
  const sentAt = new Date().toISOString();
  const inserted = await env.DB.batch<{ user_id: string }>(
    userIds.map((uid) =>
      env.DB.prepare('INSERT INTO vote_reminder_log (user_id, week, sent_at) VALUES (?1, ?2, ?3) ON CONFLICT DO NOTHING RETURNING user_id').bind(
        uid,
        week,
        sentAt,
      ),
    ),
  );
  const toSend = inserted.flatMap((r) => r.results.map((x) => x.user_id));
  const payload = voteReminderPayload(week);
  for (const uid of toSend) {
    try {
      await sendToUser(env, uid, payload, deps);
    } catch (err) {
      console.error(`vote reminder push failed for ${uid}:`, err);
    }
  }
  console.log(`sent vote reminders for week ${week} to ${toSend.length} users`);
  return toSend.length;
}

/** Cron entrypoint; never throws. */
export async function voteReminderJob(env: Env, now: Date): Promise<void> {
  try {
    await runVoteReminders(env, now);
  } catch (err) {
    console.error('vote reminder job failed:', err);
  }
}
