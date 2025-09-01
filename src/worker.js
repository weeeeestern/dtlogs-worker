export default {
  async fetch(req) {
    const { pathname } = new URL(req.url);
    if (pathname === '/health') return new Response('ok', { status: 200 });
    if (req.method === 'POST' && pathname === '/slack/category')
      return new Response('처리 중…(stub)', { status: 200 });
    return new Response('not found', { status: 404 });
  },
  async scheduled() { console.log('cron tick'); }
};
