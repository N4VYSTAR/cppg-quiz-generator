function fallbackQuestions(articles) {
  const first = articles[0] || {};
  const title = first.title || '오늘의 조문';
  const content = first.content || '조문 원문을 확인하세요.';
  const summary = first.summary || content.split('\n')[0].slice(0, 100);
  return [
    { question: `${title}의 내용과 일치하는 것은?`, options: [summary, '해당 규정은 적용 대상보다 처리자의 내부 기준을 우선하여 판단한다.', '해당 규정은 조문에 적힌 요건 중 일부만 충족하면 동일하게 적용된다.', '해당 규정은 구체적인 사실관계와 관계없이 같은 기준으로 판단한다.'], answer: 0, explanation: `정답은 ${title}의 원문에 기초합니다. ${content}` },
    { question: `${title}에 관한 설명 중 옳지 않은 것은?`, options: ['적용 대상과 조문이 정한 요건을 함께 확인해야 한다.', '관련 항·호의 구체적인 제한 조건을 검토해야 한다.', '조문의 보호 목적과 적용 범위는 판단에서 제외한다.', '사실관계에 따라 해당 요건의 충족 여부를 검토해야 한다.'], answer: 2, explanation: 'CPPG 문제는 조문의 보호 목적, 적용 대상, 요건과 제한 조건을 함께 판단해야 합니다.' }
  ];
}

function hasForbiddenMetaText(value) {
  return /현행 법령 원문에서 가져온|개인정보보호법을 학습|오늘 조문을 복습|공부 방법|글자 수|제목만|예외 없이|무관하다|무관한|모든 개인정보 처리를/i.test(String(value || ''));
}

function validateQuestions(questions) {
  if (!Array.isArray(questions) || questions.length < 2) return false;
  return questions.every((q) => Array.isArray(q.options) && q.options.length === 4 && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4 && !hasForbiddenMetaText(q.question) && !q.options.some(hasForbiddenMetaText) && !hasForbiddenMetaText(q.explanation) && new Set(q.options).size === 4);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 허용됩니다.' });
  const { articles = [], articleTitle, articleContent } = req.body || {};
  const normalized = articles.length ? articles : [{ title: articleTitle, content: articleContent }];
  if (!normalized[0]?.content) return res.status(400).json({ error: '조문 내용이 없습니다.' });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(200).json({ questions: fallbackQuestions(normalized), source: 'fallback' });
  const prompt = `너는 CPPG(개인정보관리사) 개인정보보호법 과목의 출제 전문가다. 아래에 제공된 오늘의 조문만 근거로 실제 CPPG 기출과 유사한 4지선다 문제 2~3개를 만들어라.

반드시 지킬 조건:
- 각 문제는 특정 조문의 문언, 적용 대상, 요건, 예외, 제한, 기간, 주체 또는 항·호의 차이를 직접 묻는다.
- 조문별로 1문제 이상 출제하고, 일반적인 공부법·복습법·태도·개인정보보호법 학습법을 질문하지 않는다.
- 오답은 정답과 같은 주제 안에서 요건 하나만 바꾸는 '근접 오답'으로 만든다. 정답처럼 보이지 않는 과장된 오답을 만들지 않는다.
- 선택지에 '항상', '모든', '절대', '예외 없이', '무관', '제목만', '글자 수', '공부 방법' 같은 단정적이거나 메타적인 표현을 사용하지 않는다.
- '현행 법령 원문에서 가져온 조문입니다' 같은 데이터 설명 문구를 문제나 선택지에 넣지 않는다.
- 정답은 하나만 두고, 해설은 정답 조문과 어떤 요건이 다른지 설명한다.
- 조문에 없는 사실이나 판례를 임의로 추가하지 않는다.
- JSON 배열만 출력한다. 각 객체는 question(string), options(string 4개 배열), answer(0~3 정수), explanation(string) 필드를 가진다.

[오늘의 조문]
${normalized.map((a) => `${a.title}\n${a.content}`).join('\n\n')}`;
  try {
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', responseSchema: { type: 'ARRAY', items: { type: 'OBJECT', properties: { question: { type: 'STRING' }, options: { type: 'ARRAY', items: { type: 'STRING' } }, answer: { type: 'INTEGER' }, explanation: { type: 'STRING' } }, required: ['question', 'options', 'answer', 'explanation'] } } } }) });
    if (!response.ok) throw new Error(`Gemini ${response.status}`);
    const data = await response.json(); const text = data.candidates?.[0]?.content?.parts?.[0]?.text; const questions = JSON.parse(text || '[]');
    if (!validateQuestions(questions)) throw new Error('AI 문제 품질 검증 실패');
    return res.status(200).json({ questions: questions.slice(0, 3), source: 'ai' });
  } catch (error) {
    console.error(error);
    return res.status(200).json({ questions: fallbackQuestions(normalized), source: 'fallback' });
  }
}

export { fallbackQuestions, validateQuestions };
