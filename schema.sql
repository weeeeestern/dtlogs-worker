CREATE TABLE IF NOT EXISTS question_history(
  user_id TEXT,
  category TEXT,
  question TEXT,
  link TEXT,
  status TEXT,
  created_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_history_user_cat
ON question_history(user_id, category);

CREATE TABLE IF NOT EXISTS request_log(
  user_id TEXT,
  path TEXT,
  method TEXT,
  requested_at INTEGER,
  note TEXT
);
CREATE INDEX IF NOT EXISTS idx_log_user_time
ON request_log(user_id, requested_at);
