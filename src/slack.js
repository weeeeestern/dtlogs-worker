
async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function verifySlackRequest(req, body, env) {
  const ts = req.headers.get('x-slack-request-timestamp');
  const sig = req.headers.get('x-slack-signature');
  if (!ts || !sig) return false;
  const fiveMinutes = 60 * 5;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(ts, 10)) > fiveMinutes) return false;
  const base = `v0:${ts}:${body}`;
  const mySig = `v0=${await hmac(env.SLACK_SIGNING_SECRET, base)}`;
  return mySig === sig;
}

export function parseSlackBody(contentType, body) {
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(body);
    if (params.get('payload')) return JSON.parse(params.get('payload'));
    const obj = {};
    for (const [k, v] of params) obj[k] = v;
    return obj;
  }
  try {
    return JSON.parse(body || '{}');
  } catch {
    return {};
  }
}

function fetchWithTimeout(url, options = {}, ms = 8000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...options, signal: ctrl.signal })
    .finally(() => clearTimeout(id));
}

async function slackFetch(token, method, payload) {
  const res = await fetchWithTimeout(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  return res.json();
}

export async function postMessage(token, channel, text) {
  return slackFetch(token, 'chat.postMessage', { channel, text });
}

export async function postEphemeral(token, channel, user, text) {
  return slackFetch(token, 'chat.postEphemeral', { channel, user, text });
}

export async function openCategoryModal(token, triggerId, categories) {
  const options = categories.map(c => ({ text: { type: 'plain_text', text: c }, value: c }));
  const view = {
    type: 'modal',
    callback_id: 'category-modal',
    title: { type: 'plain_text', text: '카테고리 선택' },
    submit: { type: 'plain_text', text: '선택' },
    blocks: [
      {
        type: 'input',
        block_id: 'category',
        label: { type: 'plain_text', text: '카테고리' },
        element: {
          type: 'static_select',
          action_id: 'select',
          options
        }
      }
    ]
  };
  return slackFetch(token, 'views.open', { trigger_id: triggerId, view });
}

export async function sendResponseUrl(url, text) {
  await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
}
