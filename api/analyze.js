function fallbackAnalysis(articles) {
  return articles.map((article) => ({
    id: article.id,
    importance: Math.min(5, Number(article.examWeight || 1) + 1),
    importanceReason: 'CPPG 핵심 출제 영역과의 연관성',
    summary: makeSummary(article.content),
    tags: makeTags(article),
    highlights: makeHighlights(article.content),
  }));
}

function makeSummary(content = '') {
  const firstLine = String(content).split('\n').map((line) => line.trim()).find(Boolean) || '조문 원문에서 핵심 요건과 적용 범위를 확인한다.';
  return firstLine.replace(/^제\d+(?:의\d+)?조(?:\([^)]*\))?\s*/, '').slice(0, 90);
}

function makeHighlights(content = '') {
  return String(content).split('\n').map((line) => line.trim()).filter((line) => /하여야|할 수 없다|처리할 수|동의를 받|법령에서|경우/.test(line)).slice(0, 2);
}

function makeTags(article) {
  const text = `${article.title || ''} ${article.content || ''}`;
  const candidates = [['정의', '정의'], ['수집', '수집·이용'], ['이용', '수집·이용'], ['동의', '동의'], ['권리', '정보주체 권리'], ['민감', '민감정보'], ['고유식별', '고유식별정보'], ['안전', '안전성 확보'], ['보호위원회', '보호위원회']];
  return [...new Set(candidates.filter(([word]) => text.includes(word)).map(([, tag]) => tag))].slice(0, 5).concat(['현행법령']).slice(0, 5);
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
- importance: CPPG 출제 가능성 1~5 정수
- importanceReason: 근거를 한 문장으로 작성
- summary: 조문의 핵심 요건·대상·예외를 담은 정확한 한국어 한 줄 요약. '현행 법령 원문에서 가져온 조문입니다' 같은 문구는 금지
- tags: 조문 내용과 직접 관련된 한국어 태그 2~5개. '현행법령'만 단독으로 반환하지 말 것
- highlights: 원문에서 시험상 중요한 문장을 그대로 복사한 문자열 배열 0~3개. 원문에 없는 문장을 만들지 말 것

JSON 배열만 반환하라.
${JSON.stringify(articles.map((a) => ({ id: a.id, title: a.title, content: a.content })))}`;
  try {
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', responseSchema: { type: 'ARRAY', items: { type: 'OBJECT', properties: { id: { type: 'INTEGER' }, importance: { type: 'INTEGER' }, importanceReason: { type: 'STRING' }, summary: { type: 'STRING' }, tags: { type: 'ARRAY', items: { type: 'STRING' } }, highlights: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['id', 'importance', 'importanceReason', 'summary', 'tags', 'highlights'] } } } }) });
    if (!response.ok) throw new Error(`Gemini ${response.status}`);
    const data = await response.json(); const text = data.candidates?.[0]?.content?.parts?.[0]?.text; const result = JSON.parse(text || '[]');
    return res.status(200).json({ articles: result, source: 'ai' });
  } catch (error) {
    console.error(error);
    return res.status(200).json({ articles: fallbackAnalysis(articles), source: 'weight' });
  }
}
