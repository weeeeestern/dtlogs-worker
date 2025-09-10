export async function extractKeywords(env, text) {
  if (!env.GEMINI_API_KEY) return 'to_fill';
  const model = env.LLM_MODEL_KEYWORDS || 'gemini-1.5-flash';
  const prompt = `Extract 5-8 comma-separated lower-case keywords from the following text:\n${text}`;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        signal: controller.signal
      }
    );
    clearTimeout(id);
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'to_fill';
  } catch (e) {
    return 'to_fill';
  }
}
