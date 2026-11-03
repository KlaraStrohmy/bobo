-- Weekly "Hlasuj!" push reminder: a per-user switch (on by default; push also needs the
-- device permission) and a log so nobody is reminded twice for the same voting week.
ALTER TABLE users ADD COLUMN vote_reminder_enabled INTEGER NOT NULL DEFAULT 1;

CREATE TABLE vote_reminder_log (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  PRIMARY KEY (user_id, week)
);
