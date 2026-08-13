function fallbackAnalysis(articles) {
  return articles.map((article) => ({
    id: article.id,
    importance: scoreImportance(article),
    importanceReason: '조문 내용과 CPPG 핵심 출제 영역의 연관성',
    summary: makeSummary(article.content),
    tags: makeTags(article)
  }));
}

function scoreImportance(article) {
  const text = `${article.title || ''} ${article.content || ''}`;
  const hits = (text.match(/정의|수집|이용|동의|민감|고유식별|권리|안전|보호위원회|유출|통지/g) || []).length;
  return Math.min(5, Math.max(1, Number(article.examWeight || 1) + (hits >= 3 ? 2 : hits >= 1 ? 1 : 0)));
}

function makeSummary(content = '') {
  const lines = String(content).split('\n').map((line) => line.trim()).filter(Boolean);
  const summary = lines.map((line) => line.replace(/^제\d+(?:의\d+)?조(?:\([^)]*\))?\s*/, '').trim()).find(Boolean);
  return (summary || '조문의 적용 대상과 핵심 요건을 확인한다.').slice(0, 90);
}

function makeTags(article) {
  const text = `${article.title || ''} ${article.content || ''}`;
  const candidates = [['정의', '정의'], ['수집', '수집·이용'], ['이용', '수집·이용'], ['동의', '동의'], ['권리', '정보주체 권리'], ['민감', '민감정보'], ['고유식별', '고유식별정보'], ['안전', '안전성 확보'], ['보호위원회', '보호위원회']];
  return [...new Set(candidates.filter(([word]) => text.includes(word)).map(([, tag]) => tag))].slice(0, 5);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 허용됩니다.' });
  const articles = req.body?.articles || [];
  if (!articles.length) return res.status(400).json({ error: '분석할 조문이 없습니다.' });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(200).json({ articles: fallbackAnalysis(articles), source: 'weight' });
  const prompt = `너는 CPPG 개인정보보호법 조문 분석 전문가다. 제공된 현행 조문마다 시험 대비 정보를 생성하라. 조문 원문에 없는 내용을 추가하지 말라.

각 조문에 대해 다음을 JSON으로 반환하라.
- id: 입력 id
- importance: CPPG 출제 가능성 1~5 정수. 정의, 개인정보 처리의 법적 근거, 정보주체 권리, 민감·고유식별정보, 안전성 확보, 유출 통지처럼 반복 출제되는 핵심 영역과 구체적 요건·예외가 많은 조문에 높은 점수를 부여
- importanceReason: 왜 해당 조문이 CPPG에 중요한지 근거를 한 문장으로 작성
- summary: 조문의 핵심 요건·대상·예외를 담은 정확한 한국어 한 줄 요약. '현행 법령 원문에서 가져온 조문입니다' 같은 문구는 금지
- tags: 조문 내용과 직접 관련된 한국어 태그 2~5개. '현행법령'만 단독으로 반환하지 말 것

JSON 배열만 반환하라.
${JSON.stringify(articles.map((a) => ({ id: a.id, title: a.title, content: a.content })))}`;
  try {
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', responseSchema: { type: 'ARRAY', items: { type: 'OBJECT', properties: { id: { type: 'INTEGER' }, importance: { type: 'INTEGER' }, importanceReason: { type: 'STRING' }, summary: { type: 'STRING' }, tags: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['id', 'importance', 'importanceReason', 'summary', 'tags'] } } } }) });
    if (!response.ok) throw new Error(`Gemini ${response.status}`);
    const data = await response.json(); const text = data.candidates?.[0]?.content?.parts?.[0]?.text; const result = JSON.parse(text || '[]');
    return res.status(200).json({ articles: result, source: 'ai' });
  } catch (error) {
    console.error(error);
    return res.status(200).json({ articles: fallbackAnalysis(articles), source: 'weight' });
  }
}
