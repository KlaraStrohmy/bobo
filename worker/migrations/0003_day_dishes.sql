-- What is cooked on a given day, chosen by an admin (votes are only a hint for that decision).
-- dish_id points at src/dishes.ts when the dish came from the list, NULL for a free-text dish.
CREATE TABLE day_dishes (
  date TEXT PRIMARY KEY,
  dish_id TEXT,
  name TEXT NOT NULL,
  url TEXT,
  updated_by TEXT,
  updated_at TEXT NOT NULL
);
