const DEFAULT_DOMAINS = [
  'netflixtechblog.com',
  'eng.uber.com',
  'dropbox.tech',
  'airbnb.io',
  'stripe.com',
  'cloud.google.com',
  'aws.amazon.com',
  'engineering.atspotify.com',
  'engineering.fb.com',
  'blog.cloudflare.com',
  'engineering.linkedin.com',
  'slack.engineering',
  'shopify.engineering',
  'engineering.mongodb.com',
  'engineering.salesforce.com'
];

const KEYWORDS = ['deep dive', 'case study', 'architecture', 'postmortem', 'lessons learned'];

function hasKeywords(text = '') {
  const lower = text.toLowerCase();
  return KEYWORDS.some(k => lower.includes(k));
}

async function pageWordCount(url) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(id);
    if (!res.ok) return 0;
    const html = await res.text();
    const plain = html.replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ');
    return plain.split(/\s+/).filter(Boolean).length;
  } catch {
    clearTimeout(id);
    return 0;
  }
}

export async function search(question, env) {
  if (!env.TAVILY_API_KEY) {
    return { url: '<TO_FILL:TAVILY_API_KEY>', reason: 'no-key' };
  }
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 10000);
  const include_domains = env.ALLOWED_SITES?.split(',').map(s => s.trim()).filter(Boolean) || DEFAULT_DOMAINS;
  const query = `${question} ${KEYWORDS.join(' ')}`;
  const body = {
    query,
    include_domains,
    days: parseInt(env.DAYS_LIMIT || '1460', 10),
    lang_threshold: parseFloat(env.LANG_THRESHOLD || '0.9'),
    max_results: 5,
    search_depth: 'advanced'
  };
  console.log('tavily.req', {
    query,
    include_domains: body.include_domains,
    days: body.days,
    lang_threshold: body.lang_threshold
  });
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
    const results = (data.results || []).filter(r => r.language === 'en' && r.url);
    console.log('tavily.filter', { total: data.results?.length || 0, english: results.length });
    const detailed = results.filter(r => {
      const text = `${r.title || ''} ${r.content || ''} ${r.snippet || ''}`;
      return hasKeywords(text);
    });
    const candidates = detailed.length > 0 ? detailed : results;
    console.log('tavily.candidates', { detailed: detailed.length, candidates: candidates.length });
    const counts = await Promise.all(candidates.map(r => pageWordCount(r.url)));
    for (let i = 0; i < candidates.length; i++) {
      const count = counts[i];
      if (count >= 1000 && count <= 3000) {
        console.log('tavily.res', { status: res.status, hasUrl: true, detailed: detailed.length > 0 });
        return { url: candidates[i].url, reason: detailed.length > 0 ? 'ok' : 'fallback' };
      }
    }
    const altIndex = counts.findIndex(c => c >= 700 && c <= 4000);
    if (altIndex !== -1) {
      console.log('tavily.res', { status: res.status, hasUrl: true, detailed: false });
      return { url: candidates[altIndex].url, reason: 'fallback' };
    }
    console.log('tavily.res', { status: res.status, hasUrl: false });
    return { url: '<검색 결과 없음>', reason: 'no-results' };
  } catch (e) {
    console.log('tavily.res', { status: 'error', hasUrl: false });
    return { url: '<검색 실패>', reason: e.name === 'AbortError' ? 'timeout' : 'error' };
  }
}
