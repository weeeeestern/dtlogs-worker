export async function search(question, env) {
  if (!env.TAVILY_API_KEY) {
    return { url: '<TO_FILL:TAVILY_API_KEY>', reason: 'no-key' };
  }
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 8000);
  const include_domains = env.ALLOWED_SITES?.split(',').map(s => s.trim()).filter(Boolean) || [];
  const default_domains = [
    'engineering.atspotify.com',
    'dropbox.tech',
    'slack.engineering',
    'stripe.com',
    'developer.apple.com',
    'netflixtechblog.com',
    'engineering.fb.com',
    'developers.googleblog.com'
  ];
  const body = {
    query: question,
    include_domains: include_domains.length ? include_domains : default_domains,
    days: parseInt(env.DAYS_LIMIT || '1460', 10),
    lang_threshold: parseFloat(env.LANG_THRESHOLD || '0.9'),
    max_results: 3
  };
  console.log('tavily.req', { question, include_domains: body.include_domains, days: body.days, lang_threshold: body.lang_threshold });
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.TAVILY_API_KEY}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    clearTimeout(id);
    if (!res.ok) {
      console.log('tavily.res', { status: res.status, hasUrl: false });
      return { url: '<검색 실패>', reason: `http-${res.status}` };
    }
    const data = await res.json();
    const results = data.results || [];
    const english = results.find(r => r.language === 'en' && r.url);
    const url = english?.url || results[0]?.url;
    const hasUrl = !!url;
    console.log('tavily.res', { status: res.status, hasUrl });
    if (hasUrl) return { url, reason: 'ok' };
    return { url: '<검색 결과 없음>', reason: 'no-results' };
  } catch (e) {
    console.log('tavily.res', { status: 'error', hasUrl: false });
    return { url: '<검색 실패>', reason: e.name === 'AbortError' ? 'timeout' : 'error' };
  }
}
