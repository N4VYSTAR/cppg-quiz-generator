const fallbackQuestions = (articles) => {
  const first = articles[0] || {};
  const title = first.title || '오늘의 조문';
  const content = first.content || '조문 원문을 확인하세요.';
  const questions = [
    { question: `${title}의 내용으로 옳은 것은?`, options: [first.summary || content.slice(0, 80), '해당 조문은 모든 개인정보 처리를 예외 없이 허용한다.', '해당 조문은 정보주체의 권리와 무관하다.', '해당 조문에는 적용 요건이나 예외가 없다.'], answer: 0, explanation: `정답은 오늘 선정된 ${title}의 핵심 내용입니다. 원문: ${content}` },
    { question: `${title}을(를) 적용할 때 가장 먼저 확인해야 할 사항은?`, options: ['조문이 정한 요건과 예외에 해당하는지 여부', '문제에 제시된 기관의 규모만', '개인정보의 처리 목적과 무관한 내부 관행', '조문 제목의 글자 수'], answer: 0, explanation: `${title}은(는) 문구 자체보다 적용 요건과 예외를 함께 확인해야 합니다.` },
    { question: `다음 중 ${title}에 대한 설명으로 옳지 않은 것은?`, options: ['조문 원문에 없는 내용을 임의로 추가할 수 있다.', '조문의 보호 목적과 적용 범위를 확인해야 한다.', '구체적인 사실관계에 따라 예외 적용 여부가 달라질 수 있다.', '관련 조문과 함께 읽으면 출제 포인트를 파악하기 쉽다.'], answer: 0, explanation: '법 조문 기반 문제는 원문에 없는 내용을 정답 근거로 삼을 수 없습니다.' }
  ];
  return questions.slice(0, 2 + Math.floor(Math.random() * 2));
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 허용됩니다.' });
  const { articles = [], articleTitle, articleContent } = req.body || {};
  const normalized = articles.length ? articles : [{ title: articleTitle, content: articleContent }];
  if (!normalized[0]?.content) return res.status(400).json({ error: '조문 내용이 없습니다.' });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(200).json({ questions: fallbackQuestions(normalized), source: 'fallback' });
  const prompt = `너는 CPPG(개인정보관리사) 개인정보보호법 과목의 출제 전문가다. 아래에 제공된 오늘의 조문만 근거로 실제 CPPG 기출과 유사한 4지선다 문제 2~3개를 만들어라.

반드시 지킬 조건:
- 모든 문제는 제공된 조문의 구체적인 문구, 요건, 예외, 금지사항 또는 관련 조문과의 비교 포인트를 직접 물어야 한다.
- 개인정보보호법과 무관한 일반 학습법, 공부 방법, 추상적인 태도 문제는 절대 만들지 않는다.
- '옳은 것은?', '옳지 않은 것은?', '해당하지 않는 것은?' 등 실제 시험형 문장을 사용한다.
- 정답은 하나만 두고, 오답은 조문 요건을 살짝 바꾼 그럴듯한 선택지로 만든다.
- 해설에는 반드시 정답의 근거가 되는 조문 내용과 적용 요건을 포함한다.
- 조문에 없는 사실이나 판례를 임의로 추가하지 않는다.
- JSON 배열만 출력한다. 각 객체는 question(string), options(string 4개 배열), answer(0~3 정수), explanation(string) 필드를 가진다.

[오늘의 조문]
${normalized.map((a) => `${a.title}\n${a.content}`).join('\n\n')}`;
  try {
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', responseSchema: { type: 'ARRAY', items: { type: 'OBJECT', properties: { question: { type: 'STRING' }, options: { type: 'ARRAY', items: { type: 'STRING' } }, answer: { type: 'INTEGER' }, explanation: { type: 'STRING' } }, required: ['question', 'options', 'answer', 'explanation'] } } } }) });
    if (!response.ok) throw new Error(`Gemini ${response.status}`);
    const data = await response.json(); const text = data.candidates?.[0]?.content?.parts?.[0]?.text; const questions = JSON.parse(text || '[]');
    return res.status(200).json({ questions: questions.slice(0, 3), source: 'ai' });
  } catch (error) {
    console.error(error);
    return res.status(200).json({ questions: fallbackQuestions(normalized), source: 'fallback' });
  }
}
