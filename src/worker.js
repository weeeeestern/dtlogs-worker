import { isRateLimited } from './rate-limit.js';
import QUESTIONS from '../questions/backend.json' assert { type: 'json' };
import { verifySlackRequest, parseSlackBody, postMessage, postEphemeral, openCategoryModal } from './slack.js';
import { pickQuestion, recordHistory, resetHistory } from './d1.js';
import { search } from './tavily.js';
import { extractKeywords } from './gemini.js';
import { createTechLog } from './github.js';
import { renderMarkdown, kstDate } from './md.js';

async function handleCategory(data, env) {
  const token = env.SLACK_BOT_TOKEN;
  const channel = env.CHANNEL_ID;
  if (data.type === 'view_submission') {
    const userId = data.user.id;
    const category = data.view.state.values.category.select.selected_option.value;
    return processCategory(userId, category, channel, token, env);
  }
  const userId = data.user_id;
  const text = (data.text || '').trim();
  if (!text) {
    await openCategoryModal(token, data.trigger_id, Object.keys(QUESTIONS));
    return new Response('', { status: 200 });
  }
  return processCategory(userId, text, channel, token, env);
}

async function processCategory(userId, category, channel, token, env) {
  const list = QUESTIONS[category];
  if (!list) {
    await postEphemeral(token, channel, userId, '존재하지 않는 카테고리입니다.');
    return new Response('', { status: 200 });
  }
  const { question, remaining } = await pickQuestion(env.DB, userId, category, list);
  if (!question) {
    await postEphemeral(token, channel, userId, `남은 질문이 없습니다. \`/초기화 ${category}\`로 초기화하세요.`);
    return new Response('', { status: 200 });
  }
  const link = await search(question, env);
  await postMessage(token, channel, `📘 오늘의 질문: ${question}\n🔗 블로그 링크: ${link}\n👉 \`/정리\`로 오늘 학습 내용을 정리해!`);
  await recordHistory(env.DB, { userId, category, question, link, status: 'PRESENTED' });
  if (remaining === 0) {
    await postEphemeral(token, channel, userId, `모든 질문을 완료했습니다. \`/초기화 ${category}\` 입력!`);
  }
  return new Response('', { status: 200 });
}

async function handleSummary(data, env) {
  const { userId, category, question, link, userConcept, userOral, userExpressions, userReflection } = data;
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
  await postEphemeral(env.SLACK_BOT_TOKEN, env.CHANNEL_ID, userId, msg);
  return new Response('', { status: 200 });
}

async function handleReset(data, env) {
  const userId = data.user_id;
  const category = (data.text || '').trim();
  await resetHistory(env.DB, userId, category);
  await postEphemeral(env.SLACK_BOT_TOKEN, env.CHANNEL_ID, userId, '리셋 완료');
  return new Response('', { status: 200 });
}

function parseRequest(contentType, body) {
  return parseSlackBody(contentType, body);

}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/health') return new Response('ok');
    if (url.pathname.startsWith('/slack/')) {
      const body = await req.text();
      const valid = await verifySlackRequest(req, body, env);
      if (!valid) return new Response('invalid', { status: 401 });
      const data = parseRequest(req.headers.get('content-type') || '', body);
      const userId = data.user_id || data.userId || data.user?.id;

      if (userId) {
        const limit = parseInt(env.RATE_LIMIT_MAX || '5', 10);
        const windowSec = parseInt(env.RATE_LIMIT_WINDOW || '60', 10);
        const blocked = await isRateLimited(env.DB, userId, limit, windowSec);
        if (blocked) return new Response('Too Many Requests', { status: 429 });
      }

      if (req.method === 'POST' && url.pathname === '/slack/category') return handleCategory(data, env);
      if (req.method === 'POST' && url.pathname === '/slack/summary') return handleSummary(data, env);
      if (req.method === 'POST' && url.pathname === '/slack/reset') return handleReset(data, env);
    }

    return new Response('not found', { status: 404 });
  },
  async scheduled(event, env) {
    const text = '🧠 오늘 학습할 백엔드 면접 카테고리를 선택해주세요!\n예시: Spring, JPA, Java, JVM, Database, Redis, HTTP, Network, OS, Security, SystemDesign, DevOps, Concurrency, DataStructure & Algorithm, SoftwareDesign, Testing \n👉 `/카테고리 Spring` 처럼 입력해.';
    await postMessage(env.SLACK_BOT_TOKEN, env.CHANNEL_ID, text);
  }
};
