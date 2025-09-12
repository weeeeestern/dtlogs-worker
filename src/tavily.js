const DEFAULT_DOMAINS = [
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

const FALLBACK_DOMAINS = [
    'martinfowler.com',
    'infoq.com',
    'highscalability.com'
];

const KEYWORDS = [
    'deep dive',
    'case study',
    'architecture',
    'postmortem',
    'lessons learned',
    'guide',
    'explanation',
    'best practices'
];

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
        const plain = html
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ');
        return plain.split(/\s+/).filter(Boolean).length;
    } catch {
        clearTimeout(id);
        return 0;
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
        const hasKeyword = hasKeywords(text.toLowerCase());
        return { words, headings, hasCode, hasKeyword };
    } catch {
        return { words: 0, headings: 0, hasCode: false, hasKeyword: false };
    }
}

function parseDomains(str) {
    return str?.split(',').map(s => s.trim()).filter(Boolean);
}

// TODO: define GOOD_PATH_RE, BAD_PATH_RE, BAD_TITLE_RE if not already in file
// For now assume they are global regex or adjust accordingly.

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
        if (DEFAULT_DOMAINS.some(d => u.hostname.endsWith(d))) s += 2;
        return s;
    } catch {
        return -Infinity;
    }
}

async function runSearch(body, key) {
    try {
        const res = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
            body: JSON.stringify(body)
        });
        if (!res.ok) return [];
        const data = await res.json();
        return data.results || [];
    } catch {
        return [];
    }
}

export async function search(question, env) {
    if (!env.TAVILY_API_KEY) {
        return { url: '<TO_FILL:TAVILY_API_KEY>', reason: 'no-key' };
    }

    const coreDomains = parseDomains(env.ALLOWED_SITES) || [];
    const defaultDomains = coreDomains.length ? coreDomains : DEFAULT_DOMAINS;

    const days = parseInt(env.DAYS_LIMIT || '1460', 10);
    const langThreshold = parseFloat(env.LANG_THRESHOLD || '0.9');
    const minWords = parseInt(env.MIN_WORDS || '1000', 10);
    const maxWords = parseInt(env.MAX_WORDS || '4000', 10);
    const intent =
        '(deep dive OR case study OR architecture OR postmortem OR lessons learned OR guide OR explanation OR best practices)';
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

    let url = await attempt(defaultDomains);
    let reason = url ? 'ok' : 'no-results';
    if (!url) {
        url = await attempt(defaultDomains, 'advanced');
        if (url) reason = 'advanced';
    }
    if (!url) {
        url = await attempt(defaultDomains.concat(FALLBACK_DOMAINS), 'advanced');
        if (url) reason = 'fallback';
    }
    if (url) return { url, reason };
    return { url: '<검색 결과 없음>', reason };
}
