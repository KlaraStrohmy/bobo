-- Votes for next week's dishes. `week` is the Monday (YYYY-MM-DD) of the week being voted for,
-- so every week starts with a clean slate without any cleanup job.
CREATE TABLE dish_votes (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week TEXT NOT NULL,
  dish_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, week, dish_id)
);
CREATE INDEX dish_votes_week ON dish_votes(week, dish_id);
