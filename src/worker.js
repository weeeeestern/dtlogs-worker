import { isRateLimited } from './rate-limit.js';

async function extractUserId(req) {
  const contentType = req.headers.get('content-type') || '';
  try {
    if (contentType.includes('application/json')) {
      const data = await req.json();
      return data.userId || data.user_id || null;
    }
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const form = await req.formData();
      return form.get('user_id');
    }
  } catch (e) {
    return null;
  }
  return null;
}

export default {
  async fetch(req, env) {
    const { pathname } = new URL(req.url);
    if (pathname === '/health') return new Response('ok', { status: 200 });

    if (pathname.startsWith('/slack/')) {
      const userId = await extractUserId(req.clone());
      if (userId) {
        const limit = parseInt(env.RATE_LIMIT_MAX || '5', 10);
        const windowSec = parseInt(env.RATE_LIMIT_WINDOW || '60', 10);
        const blocked = await isRateLimited(env.DB, userId, limit, windowSec);
        if (blocked) return new Response('Too Many Requests', { status: 429 });
      }
    }

    if (req.method === 'POST' && pathname === '/slack/category')
      return new Response('처리 중…(stub)', { status: 200 });
    return new Response('not found', { status: 404 });
  },
  async scheduled() { console.log('cron tick'); }
};
