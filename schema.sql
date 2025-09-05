CREATE TABLE IF NOT EXISTS question_history(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  category TEXT NOT NULL,
  question TEXT NOT NULL,
  link TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_cat_q
ON question_history(user_id, category, question);

CREATE TABLE IF NOT EXISTS request_log(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  requested_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_request_log_user_time
ON request_log(user_id, requested_at);
