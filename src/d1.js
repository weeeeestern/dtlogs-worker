export async function ensureSchema(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS question_history (
      user_id TEXT,
      category TEXT,
      question TEXT,
      link TEXT,
      status TEXT,
      created_at INTEGER
    )`).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_history_user_cat ON question_history(user_id, category)').run();

  await db.prepare(`CREATE TABLE IF NOT EXISTS request_log (
      user_id TEXT,
      path TEXT,
      method TEXT,
      requested_at INTEGER,
      note TEXT
    )`).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_log_user_time ON request_log(user_id, requested_at)').run();
}

export async function logRequest(db, { userId, path, method, note }) {
  const ts = Math.floor(Date.now() / 1000);
  await db
    .prepare('INSERT INTO request_log (user_id, path, method, requested_at, note) VALUES (?, ?, ?, ?, ?)')
    .bind(userId || '', path, method, ts, note || '')
    .run();
}

export async function pickQuestion(db, userId, category, allQuestions) {
  const { results } = await db
    .prepare('SELECT question FROM question_history WHERE user_id = ? AND category = ?')
    .bind(userId, category)
    .all();
  const asked = results.map(r => r.question);
  const remaining = allQuestions.filter(q => !asked.includes(q));
  if (remaining.length === 0) return { question: null, remaining: 0 };
  const question = remaining[Math.floor(Math.random() * remaining.length)];
  return { question, remaining: remaining.length - 1 };
}

export async function recordHistory(db, { userId, category, question, link, status }) {
  const createdAt = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      'INSERT INTO question_history (user_id, category, question, link, status, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .bind(userId, category, question, link, status, createdAt)
    .run();
}

export async function resetHistory(db, userId, category) {
  await db
    .prepare('DELETE FROM question_history WHERE user_id = ? AND category = ?')
    .bind(userId, category)
    .run();
}
