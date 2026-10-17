/** Voting for next week's dishes: each person has a few votes, counts stay hidden until they voted. */
import { DISHES } from './dishes';
import { addDays, isoWeekday, localDate } from './tz';

/** Votes per person and week, whatever the cooking days are (Friday is always burrito and is not voted on). */
export const VOTES_PER_WEEK = 4;

/** Monday of the week being voted for (the week after the current one). */
export function votingWeek(now: Date): string {
  const today = localDate(now);
  return addDays(addDays(today, -(isoWeekday(today) - 1)), 7);
}

export async function myVotes(db: D1Database, userId: string, week: string): Promise<string[]> {
  const { results } = await db
    .prepare('SELECT dish_id FROM dish_votes WHERE user_id = ? AND week = ? ORDER BY created_at, dish_id')
    .bind(userId, week)
    .all<{ dish_id: string }>();
  return results.map((r) => r.dish_id);
}

export async function votesPayload(db: D1Database, userId: string, now: Date) {
  const week = votingWeek(now);
  const max = VOTES_PER_WEEK;
  const [mine, counts] = await Promise.all([
    myVotes(db, userId, week),
    db
      .prepare('SELECT dish_id, COUNT(*) AS n FROM dish_votes WHERE week = ? GROUP BY dish_id')
      .bind(week)
      .all<{ dish_id: string; n: number }>(),
  ]);
  const n = new Map(counts.results.map((r) => [r.dish_id, r.n]));
  const revealed = mine.length > 0; // no peeking before voting, so early votes do not steer the rest
  return {
    week,
    maxVotes: max,
    myVotes: mine,
    dishes: DISHES.map((d) => ({ id: d.id, name: d.name, url: d.url ?? null, votes: revealed ? (n.get(d.id) ?? 0) : null })),
  };
}

export type VoteResult = 'ok' | 'limit';

/** Add or remove one vote. Adding past the limit is refused; removing is always allowed. */
export async function setVote(db: D1Database, userId: string, week: string, dishId: string, voted: boolean, now: Date): Promise<VoteResult> {
  if (!voted) {
    await db.prepare('DELETE FROM dish_votes WHERE user_id = ? AND week = ? AND dish_id = ?').bind(userId, week, dishId).run();
    return 'ok';
  }
  const mine = await myVotes(db, userId, week);
  if (mine.includes(dishId)) return 'ok';
  if (mine.length >= VOTES_PER_WEEK) return 'limit';
  await db
    .prepare('INSERT OR IGNORE INTO dish_votes (user_id, week, dish_id, created_at) VALUES (?, ?, ?, ?)')
    .bind(userId, week, dishId, now.toISOString())
    .run();
  return 'ok';
}
