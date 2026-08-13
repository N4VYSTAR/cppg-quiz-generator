export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 허용됩니다.' });
  const articles = req.body?.articles || [];
  if (!articles.length) return res.status(400).json({ error: '분석할 조문이 없습니다.' });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(200).json({ articles: articles.map((a) => ({ id: a.id, importance: Math.min(5, Number(a.examWeight || 1) + 1), importanceReason: '핵심 조문 가중치' })), source: 'weight' });
  const prompt = `다음 개인정보보호법 조문을 CPPG 시험 대비 관점에서 1~5점으로 평가해라. 정의, 원칙, 수집·이용, 정보주체 권리, 민감·고유식별정보처럼 여러 문제로 확장되는 조문일수록 높은 점수를 준다. JSON 배열만 출력하고 각 객체에 id, importance(1~5 정수), importanceReason(한국어 한 문장)을 포함한다.\n${JSON.stringify(articles.map((a) => ({ id: a.id, title: a.title, content: a.content })))} `;
  try {
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json' } }) });
    if (!response.ok) throw new Error(`Gemini ${response.status}`);
    const data = await response.json(); const text = data.candidates?.[0]?.content?.parts?.[0]?.text; const result = JSON.parse(text || '[]');
    return res.status(200).json({ articles: result, source: 'ai' });
  } catch (error) {
    console.error(error);
    return res.status(200).json({ articles: articles.map((a) => ({ id: a.id, importance: Math.min(5, Number(a.examWeight || 1) + 1), importanceReason: '내부 시험 빈출 가중치' })), source: 'weight' });
  }
}
