const API = 'https://api.github.com';

function b64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

async function fetchWithTimeout(url, options, timeout = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

export async function createTechLog(env, { date, category, markdown }) {
  if (!env.GITHUB_TOKEN)
    return { prUrl: null, reason: 'missing GITHUB_TOKEN' };
  const owner = env.GITHUB_OWNER;
  const repo = env.GITHUB_REPO;
  const base = env.GITHUB_DEFAULT_BRANCH;
  const branch = `feat/tech-log-${date.replace(/-/g, '')}`;
  const path = `daily-tech-logs/${date}-${category}.md`;
  const message = `Add tech log for ${date}`;
  const headers = {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    'Content-Type': 'application/json',
    'User-Agent': 'dtlogs-worker'
  };

  try {
    const refRes = await fetchWithTimeout(`${API}/repos/${owner}/${repo}/git/refs/heads/${base}`, { headers });
    const refData = await refRes.json();
    const sha = refData.object.sha;
    await fetchWithTimeout(`${API}/repos/${owner}/${repo}/git/refs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha })
    });
    await fetchWithTimeout(`${API}/repos/${owner}/${repo}/contents/${path}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ message, content: b64(markdown), branch })
    });
    const prRes = await fetchWithTimeout(`${API}/repos/${owner}/${repo}/pulls`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ title: `Tech Log for ${date}`, head: branch, base })
    });
    const prData = await prRes.json();
    return { prUrl: prData.html_url };
  } catch (e) {
    return { prUrl: null, reason: 'github-error' };
  }
}
