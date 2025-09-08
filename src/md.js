function kstDate() {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}

export function renderMarkdown({ date, category, question, keywords, link, user_concept, user_oral, user_expressions, user_reflection }) {
  return `# 📘 오늘의 기술 블로그 정리\n## 🗓 날짜\n${date}\n## 📂 카테고리\n${category}\n## ❓ 오늘의 질문\n${question}\n## 🔑 추출 키워드\n${keywords}\n## 🔗 추천 블로그\n${link}\n## ✍️ 핵심 개념을 포함하여 정리\n${user_concept}\n## 💬 영어로 설명하듯이 정리\n${user_oral}\n## 🧾 오늘 배운 표현/기술 용어\n${user_expressions}\n## ✏️ 느낀 점\n${user_reflection}\n`;
}

export { kstDate };
