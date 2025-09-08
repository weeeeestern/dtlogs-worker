export async function isRateLimited(db, userId, path, limit = 5, windowSec = 60) {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - windowSec;

  await db
      .prepare('DELETE FROM request_log WHERE requested_at < ?')
      .bind(windowStart)
      .run();

  const { results } = await db
      .prepare('SELECT COUNT(*) as count FROM request_log WHERE user_id = ? AND path = ? AND requested_at >= ?')
      .bind(userId, path, windowStart)
      .all();
  const count = results[0]?.count ?? 0;
  if (count >= limit) return true;

  await db
      .prepare('INSERT INTO request_log (user_id, path, method, requested_at, note) VALUES (?, ?, ?, ?, ?)')
      .bind(userId, path, 'POST', now, 'rate')
      .run();
  return false;
}
