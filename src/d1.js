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
  const createdAt = new Date().toISOString();
  await db
    .prepare(
      'INSERT INTO question_history (user_id, category, question, link, status, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .bind(userId, category, question, link, status, createdAt)
    .run();
}

export async function resetHistory(db, userId, category) {
  await db.prepare('DELETE FROM question_history WHERE user_id = ? AND category = ?')
    .bind(userId, category)
    .run();
}
