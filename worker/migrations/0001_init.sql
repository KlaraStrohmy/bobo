-- Bobo schema (see docs/SPEC.md). Dates are TEXT 'YYYY-MM-DD', times 'HH:MM',
-- timestamps ISO 8601 UTC, booleans INTEGER 0/1, settings.value JSON text.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  reminder_enabled INTEGER NOT NULL DEFAULT 0,
  reminder_time TEXT NOT NULL DEFAULT '15:00',
  created_at TEXT NOT NULL,
  last_seen_at TEXT
);

CREATE TABLE responses (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  attending INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'web',
  PRIMARY KEY (user_id, date)
);
CREATE INDEX responses_date ON responses(date);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE day_overrides (
  date TEXT PRIMARY KEY,
  cooking INTEGER NOT NULL,
  note TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX push_subscriptions_user ON push_subscriptions(user_id);

CREATE TABLE reminder_log (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  PRIMARY KEY (user_id, date)
);

INSERT INTO settings (key, value) VALUES
  ('cooking_weekdays', '[2,4,5]'),
  ('cutoff', '{"days_before":1,"time":"16:00"}');
