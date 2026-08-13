const fallbackQuestions = (articles) => {
  const first = articles[0] || {};
  const questions = [
    { question: `${first.title || '오늘의 조문'}의 설명으로 가장 옳은 것은?`, options: [first.summary || '조문의 핵심 내용을 확인한다.', '개인정보 처리는 항상 자유롭게 허용된다.', '정보주체의 권리는 고려하지 않는다.', '법령상 예외는 존재하지 않는다.'], answer: 0, explanation: first.summary || '조문 원문과 한 줄 요약을 다시 확인해보세요.' },
    { question: '개인정보보호법을 학습할 때 가장 적절한 접근은?', options: ['조문 문구와 적용 요건을 함께 확인한다.', '제목만 보고 판단한다.', '예외 요건은 모두 무시한다.', '모든 상황에 같은 답을 적용한다.'], answer: 0, explanation: 'CPPG 문제는 원칙과 예외, 적용 요건을 함께 묻는 경우가 많습니다.' },
    { question: '다음 중 오늘 조문을 복습하는 방법으로 가장 효과적인 것은?', options: ['핵심 키워드를 회상한 뒤 원문으로 검증한다.', '답을 보지 않고 추측만 반복한다.', '조문을 읽지 않고 해설만 외운다.', '한 번 틀리면 해당 조문을 건너뛴다.'], answer: 0, explanation: '회상 후 원문 검증을 반복하면 짧은 시간에도 기억이 오래갑니다.' }
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
  const prompt = `너는 CPPG 개인정보관리사 시험 출제 전문가다. 아래 현행 조문을 바탕으로 4지선다 문제 2~3개를 만든다. 실제 기출처럼 옳은 것/옳지 않은 것/가장 적절한 것을 다양하게 사용하고, 정답은 하나만 둔다. 조문에 없는 사실을 만들지 말고, 각 해설은 적용 요건과 함정을 설명한다. JSON 배열만 출력한다. 각 객체는 question(string), options(string 4개 배열), answer(0~3 정수), explanation(string) 필드를 가진다.\n\n${normalized.map((a) => `${a.title}\n${a.content}`).join('\n\n')}`;
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
