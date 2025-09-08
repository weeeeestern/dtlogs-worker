import QUESTIONS from '../questions/backend.json' assert { type: 'json' };
import { verifySlackRequest, parseSlackBody, postMessage, sendResponseUrl, openCategoryModal } from './slack.js';
import { ensureSchema, pickQuestion, recordHistory, resetHistory, logRequest } from './d1.js';
import { isRateLimited } from './rate-limit.js';
import { search } from './tavily.js';
import { extractKeywords } from './gemini.js';
import { createTechLog } from './github.js';
import { renderMarkdown, kstDate } from './md.js';

async function processCategory({ user_id, text, response_url, trigger_id }, env) {
  const userId = user_id;
  const category = (text || '').trim();
  const channel = env.CHANNEL_ID;
  const token = env.SLACK_BOT_TOKEN;
  try {
    if (!category) {
      await openCategoryModal(token, trigger_id || '', Object.keys(QUESTIONS));
      await logRequest(env.DB, { userId, path: '/slack/category', method: 'POST', note: 'modal-open' });
      return;
    }
    const list = QUESTIONS[category];
    if (!list) {
      if (response_url) await sendResponseUrl(response_url, '존재하지 않는 카테고리입니다.');
      await logRequest(env.DB, { userId, path: '/slack/category', method: 'POST', note: 'invalid-category' });
      return;
    }
    const { question, remaining } = await pickQuestion(env.DB, userId, category, list);
    if (!question) {
      if (response_url) await sendResponseUrl(response_url, `남은 질문이 없습니다. \`/초기화 ${category}\`로 초기화하세요.`);
      await logRequest(env.DB, { userId, path: '/slack/category', method: 'POST', note: 'no-question' });
      return;
    }
    const link = await search(question, env);
    await postMessage(token, channel, `📘 오늘의 질문: ${question}\n🔗 블로그 링크: ${link}\n👉 \`/정리\`로 오늘 학습 내용을 정리해!`);
    await recordHistory(env.DB, { userId, category, question, link, status: 'PRESENTED' });
    if (response_url) {
      await sendResponseUrl(response_url, `📘 오늘의 질문: ${question}\n🔗 블로그 링크: ${link}`);
      if (remaining === 0) {
        await sendResponseUrl(response_url, `모든 질문을 완료했습니다. \`/초기화 ${category}\` 입력!`);
      }
    }
    await logRequest(env.DB, { userId, path: '/slack/category', method: 'POST', note: 'done' });
    console.log('category done', userId, category);
  } catch (e) {
    console.log('category error', e);
    await logRequest(env.DB, { userId, path: '/slack/category', method: 'POST', note: 'error' });
    if (response_url) await sendResponseUrl(response_url, '처리 중 오류가 발생했습니다.');
  }
}

async function processSummary(data, env) {
  const { userId, category, question, link, userConcept, userOral, userExpressions, userReflection, response_url } = data;
  try {
    const keywords = await extractKeywords(env, `${question}\n${userConcept}\n${userOral}\n${userExpressions}\n${userReflection}`);
    const date = kstDate();
    const markdown = renderMarkdown({
      date,
      category,
      question,
      keywords,
      link,
      user_concept: userConcept,
      user_oral: userOral,
      user_expressions: userExpressions,
      user_reflection: userReflection
    });
    const { prUrl, reason } = await createTechLog(env, { date, category, markdown });
    await recordHistory(env.DB, { userId, category, question, link, status: 'COMPLETED' });
    const msg = prUrl ? `PR 생성: ${prUrl}` : `PR 미생성: ${reason}`;
    if (response_url) await sendResponseUrl(response_url, msg);
    await logRequest(env.DB, { userId, path: '/slack/summary', method: 'POST', note: prUrl ? 'done' : reason });
    console.log('summary done', userId, category, prUrl);
  } catch (e) {
    console.log('summary error', e);
    await logRequest(env.DB, { userId, path: '/slack/summary', method: 'POST', note: 'error' });
    if (response_url) await sendResponseUrl(response_url, '정리 처리 중 오류가 발생했습니다.');
  }
}

async function handleReset(data, env) {
  const userId = data.user_id;
  const category = (data.text || '').trim();
  await resetHistory(env.DB, userId, category);
  await logRequest(env.DB, { userId, path: '/slack/reset', method: 'POST', note: 'done' });
  return new Response(JSON.stringify({ response_type: 'ephemeral', text: '리셋 완료' }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

function parseRequest(contentType, body) {
  const obj = parseSlackBody(contentType, body);
  if (obj.text && obj.text.startsWith('{')) {
    try {
      const inner = JSON.parse(obj.text);
      return { ...obj, ...inner };
    } catch {
      return obj;
    }
  }
  return obj;
}

let schemaReady;

export default {
  async fetch(req, env, ctx) {
    if (!schemaReady) schemaReady = ensureSchema(env.DB);
    await schemaReady;
    const url = new URL(req.url);
    if (url.pathname === '/health') return new Response('ok');
    if (url.pathname.startsWith('/slack/')) {
      const body = await req.text();
      const valid = await verifySlackRequest(req, body, env);
      if (!valid) {
        console.log('signature invalid');
        await logRequest(env.DB, { userId: '', path: url.pathname, method: req.method, note: 'invalid-signature' });
        return new Response('invalid', { status: 401 });
      }
      const data = parseRequest(req.headers.get('content-type') || '', body);
      const userId = data.user_id || data.userId || data.user?.id || '';
      const limit = parseInt(env.RATE_LIMIT_MAX || '5', 10);
      const windowSec = parseInt(env.RATE_LIMIT_WINDOW || '60', 10);
      if (userId) {
        const blocked = await isRateLimited(env.DB, userId, url.pathname, limit, windowSec);
        if (blocked) return new Response('Too Many Requests', { status: 429 });
      }
      const ack = new Response(JSON.stringify({ response_type: 'ephemeral', text: '받았어. 처리 중이야.' }), {
        headers: { 'Content-Type': 'application/json' }
      });
      await logRequest(env.DB, { userId, path: url.pathname, method: req.method, note: 'ack' });
      if (req.method === 'POST' && url.pathname === '/slack/category') {
        const payload = { ...data, response_url: data.response_url, trigger_id: data.trigger_id };
        ctx.waitUntil(processCategory(payload, env));
        return ack;
      }
      if (req.method === 'POST' && url.pathname === '/slack/summary') {
        const payload = { ...data, response_url: data.response_url };
        ctx.waitUntil(processSummary(payload, env));
        return ack;
      }
      if (req.method === 'POST' && url.pathname === '/slack/reset') {
        return handleReset({ ...data, response_url: data.response_url }, env);
      }
    }
    return new Response('not found', { status: 404 });
  },
  async scheduled(event, env, ctx) {
    if (!schemaReady) schemaReady = ensureSchema(env.DB);
    await schemaReady;
    const text = '🧠 오늘 학습할 백엔드 면접 카테고리를 선택해주세요!\n예시: Spring, JVM, Database, Redis, HTTP …\n👉 `/카테고리 Spring` 처럼 입력해.';
    try {
      await postMessage(env.SLACK_BOT_TOKEN, env.CHANNEL_ID, text);
    } catch (e) {
      console.log('cron failed', e);
    }
  }
};
