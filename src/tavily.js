const DEFAULT_DOMAINS = [
  'netflixtechblog.com',
  'eng.uber.com',
  'dropbox.tech',
  'airbnb.io',
  'stripe.com',
  'cloud.google.com',
  'aws.amazon.com',
  'engineering.atspotify.com',
  'engineering.fb.com'
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
  const id = setTimeout(() => controller.abort(), 8000);
  const include_domains = env.ALLOWED_SITES?.split(',').map(s => s.trim()).filter(Boolean) || DEFAULT_DOMAINS;
  const query = `${question} ${KEYWORDS.join(' ')}`;
  const body = {
    query,
    include_domains,
    days: parseInt(env.DAYS_LIMIT || '1460', 10),
    lang_threshold: parseFloat(env.LANG_THRESHOLD || '0.9'),
    max_results: 3
  };
  console.log('tavily.req', {
    question,
    include_domains: body.include_domains,
    days: body.days,
    lang_threshold: body.lang_threshold
  });

  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    clearTimeout(id);
    if (!res.ok) {
      console.log('tavily.res', { status: res.status, results: 0 });
      return [];
    }
    const data = await res.json();
    const results = data.results || [];
    const filtered = results.filter(r => {
      if (r.language !== 'en' || !r.url) return false;
      const text = `${r.title || ''} ${r.content || ''} ${r.snippet || ''}`;
      return hasKeywords(text);
    });
    console.log('tavily.filter', { total: results.length, filtered: filtered.length });
    const counts = await Promise.all(filtered.map(r => pageWordCount(r.url)));
    for (let i = 0; i < filtered.length; i++) {
      const count = counts[i];
      if (count >= 1000 && count <= 3000) {
        console.log('tavily.res', { status: res.status, hasUrl: true });
        return { url: filtered[i].url, reason: 'ok' };
      }
    }
    console.log('tavily.res', { status: res.status, hasUrl: false });
    return { url: '<검색 결과 없음>', reason: 'no-results' };

  } catch (e) {
    console.log('tavily.res', { status: 'error', results: 0 });
    return [];
  }
}

async function analyze(url) {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    const html = await res.text();
    const text = html.replace(/<[^>]+>/g, ' ');
    const words = text.trim().split(/\s+/).length;
    const headings = (html.match(/<h[23][^>]*>/gi) || []).length;
    const hasCode = /<pre|<code|```/.test(html);
    const hasKeyword = KEYWORD_RE.test(text.toLowerCase());
    return { words, headings, hasCode, hasKeyword };
  } catch {
    return { words: 0, headings: 0, hasCode: false, hasKeyword: false };
  }
}

export async function search(question, env) {
  if (!env.TAVILY_API_KEY) {
    return { url: '<TO_FILL:TAVILY_API_KEY>', reason: 'no-key' };
  }
  const coreDomains = parseDomains(env.ALLOWED_SITES) || [];
  const defaultDomains = coreDomains.length
    ? coreDomains
    : [
        'engineering.atspotify.com',
        'netflixtechblog.com',
        'eng.uber.com',
        'airbnb.io',
        'shopify.engineering',
        'slack.engineering',
        'blog.cloudflare.com',
        'cloud.google.com',
        'aws.amazon.com',
        'azure.microsoft.com',
        'github.blog',
        'engineering.linkedin.com',
        'engineering.fb.com',
        'confluent.io',
        'hashicorp.com',
        'databricks.com',
        'grafana.com',
        'datadoghq.com',
        'elastic.co',
        'kubernetes.io',
        'istio.io',
        'nginx.com',
        'redis.io',
        'dropbox.tech',
        'stripe.com',
        'developers.googleblog.com'
      ];
  const fallbackDomains = ['martinfowler.com', 'infoq.com', 'highscalability.com'];
  const days = parseInt(env.DAYS_LIMIT || '1460', 10);
  const langThreshold = parseFloat(env.LANG_THRESHOLD || '0.9');
  const minWords = parseInt(env.MIN_WORDS || '1000', 10);
  const maxWords = parseInt(env.MAX_WORDS || '4000', 10);
  const intent = '(deep dive OR case study OR architecture OR postmortem OR lessons learned OR guide OR explanation OR best practices)';
  const exclude = '-reference -api -sdk -release notes -announcing -announcement -update';
  const baseQuery = `${question} ${intent} ${exclude}`;

  async function attempt(domains, depth) {
    const chunks = [];
    for (let i = 0; i < domains.length; i += 10) {
      chunks.push(domains.slice(i, i + 10));
    }
    let results = [];
    for (const chunk of chunks) {
      const body = {
        query: baseQuery,
        include_domains: chunk,
        days,
        lang_threshold: langThreshold,
        max_results: 5
      };
      if (depth) body.search_depth = depth;
      results = results.concat(await runSearch(body, env.TAVILY_API_KEY));
    }
    const scored = results
      .map(r => ({ ...r, score: score(r) }))
      .filter(r => r.score > -Infinity)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    const evaluated = await Promise.all(
      scored.map(async r => ({ ...r, ...(await analyze(r.url)) }))
    );
    const good = evaluated.filter(
      r =>
        r.words >= minWords &&
        r.words <= maxWords &&
        r.headings >= 3 &&
        r.hasCode &&
        r.hasKeyword
    );
    good.sort((a, b) => b.score - a.score);
    return good[0]?.url;
  }

  function score(r) {
    try {
      const u = new URL(r.url);
      const path = u.pathname.toLowerCase();
      const title = (r.title || '').toLowerCase();
      if (!GOOD_PATH_RE.test(path)) return -Infinity;
      if (BAD_PATH_RE.test(path) || BAD_TITLE_RE.test(title)) return -Infinity;
      let s = 4;
      const text = `${r.title || ''} ${r.url}`;
      const letters = (text.match(/[a-z]/gi) || []).length;
      const total = (text.match(/[a-z0-9]/gi) || []).length;
      if (total && letters / total > 0.8) s += 1;
      if (defaultDomains.some(d => u.hostname.endsWith(d))) s += 2;
      return s;
    } catch {
      return -Infinity;
    }
  }

  let url = await attempt(defaultDomains);
  let reason = url ? 'ok' : 'no-results';
  if (!url) {
    url = await attempt(defaultDomains, 'advanced');
    if (url) reason = 'advanced';
  }
  if (!url) {
    url = await attempt(defaultDomains.concat(fallbackDomains), 'advanced');
    if (url) reason = 'fallback';
  }
  if (url) return { url, reason };
  return { url: '<검색 결과 없음>', reason };
}

