export async function search(question, env) {
  if (!env.TAVILY_API_KEY) return '<TO_FILL:TAVILY_API_KEY>';
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 8000);
  try {
    const body = {
      api_key: env.TAVILY_API_KEY,
      query: question,
      include_domains: env.ALLOWED_SITES?.split(',').map(s => s.trim()).filter(Boolean) || [],
      days: parseInt(env.DAYS_LIMIT || '1460', 10),
      lang_threshold: parseFloat(env.LANG_THRESHOLD || '0.9'),
      max_results: 1
    };
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    clearTimeout(id);
    const data = await res.json();
    return data.results?.[0]?.url || '<검색 결과 없음>';
  } catch (e) {
    return '<검색 실패>';
  }
}
