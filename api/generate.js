function cleanArticleText(value = '') {
  return String(value)
    .replace(/^제\d+(?:의\d+)?조(?:\([^)]*\))?\s*/, '')
    .replace(/^\s*[①②③④⑤]\s*/, '')
    .trim();
}

function firstSubstantiveLine(article) {
  return String(article.content || '')
    .split('\n')
    .map((line) => cleanArticleText(line))
    .find((line) => line.length > 12) || '조문에서 정한 요건과 적용 범위를 확인한다.';
}

function mutateStatement(statement, article) {
  const mutations = [
    [/할 수 있다/g, '하여야 한다'],
    [/하여야 한다/g, '할 수 있다'],
    [/동의를 받거나/g, '동의 없이'],
    [/법률에 특별한 규정이 있는 경우/g, '처리자의 내부 기준이 있는 경우'],
    [/요건을 충족하는 경우/g, '요건과 관계없이'],
    [/정보주체/g, '개인정보처리자']
  ];
  for (const [pattern, replacement] of mutations) {
    if (pattern.test(statement)) return statement.replace(pattern, replacement);
  }
  return `${statement} 다만 조문에서 정한 별도의 요건은 확인하지 않는다.`;
}

function fallbackQuestions(articles) {
  const first = articles[0] || {};
  const title = first.title || '오늘의 조문';
  const content = first.content || '조문 원문을 확인하세요.';
  const correct = cleanArticleText(first.summary || firstSubstantiveLine(first)).slice(0, 120);
  const wrong = mutateStatement(correct, first);
  const secondCorrect = '조문의 적용 대상과 구체적인 요건을 사실관계에 맞춰 확인해야 한다.';
  const secondWrong = '구체적인 사실관계와 관계없이 같은 결론을 적용한다.';
  return [
    {
      question: `${title}의 내용으로 가장 정확한 것은?`,
      options: [correct, wrong, secondWrong, '조문에 정한 요건이 충족되지 않아도 동일한 법적 효과가 발생한다.'],
      answer: 0,
      explanation: `정답은 제공된 조문 원문에 근거합니다. 핵심 내용은 ${correct}입니다.`
    },
    {
      question: `${title}을(를) 적용할 때 가장 먼저 확인할 사항으로 옳은 것은?`,
      options: [secondCorrect, '처리자의 내부 관행만으로 적용 여부를 결정한다.', '조문의 일반적인 목적만 확인하고 본문에 정한 요건은 검토하지 않는다.', '구체적인 사실관계와 상관없이 같은 결론을 적용한다.'],
      answer: 0,
      explanation: `조문은 제목이 아니라 적용 대상과 본문에 정한 요건을 사실관계에 맞춰 판단해야 합니다. 근거 조문: ${title}.`
    }
  ];
}

function hasBadMetaText(value) {
  return /현행 법령 원문에서 가져온|공부 방법|복습 방법|글자 수|제목만|예외 없이|무관하다|무관한|모든 개인정보 처리를/i.test(String(value || ''));
}

function hasArticleHeader(value, articles = []) {
  const text = String(value || '').trim();
  if (/^제\d+(?:의\d+)?조(?:\([^)]*\))?/.test(text)) return true;
  return articles.some((article) => article.title && text.includes(String(article.title).trim()));
}

function validateQuestions(questions, articles = []) {
  if (!Array.isArray(questions) || questions.length < 2 || questions.length > 3) return false;
  return questions.every((question) => {
    const options = question.options || [];
    return typeof question.question === 'string' && options.length === 4 &&
      Number.isInteger(question.answer) && question.answer >= 0 && question.answer < 4 &&
      new Set(options.map((option) => String(option).trim())).size === 4 &&
      !hasBadMetaText(question.question) && !hasBadMetaText(question.explanation) &&
      !options.some((option) => hasBadMetaText(option) || hasArticleHeader(option, articles));
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 허용됩니다.' });
  const { articles = [], articleTitle, articleContent } = req.body || {};
  const normalized = articles.length ? articles : [{ title: articleTitle, content: articleContent }];
  if (!normalized[0]?.content) return res.status(400).json({ error: '조문 내용이 없습니다.' });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(200).json({ questions: fallbackQuestions(normalized), source: 'fallback' });

  const prompt = `너는 CPPG(개인정보관리사) 개인정보보호법 과목의 문제 출제 전문가다. 아래 법령 조문만 근거로 실제 시험의 문체와 난이도를 참고한 새로운 예상문제 2~3개를 만들어라.

문제는 다음 예시와 같은 자연스러운 법조문형 문장으로 작성하라.
예시 형식: "다음 중 개인정보 처리방침에 필수적으로 포함되어야 할 내용으로 가장 정확하지 않은 것은?"
사용할 수 있는 질문형은 "옳은 것은?", "옳지 않은 것은?", "가장 정확한 것은?", "가장 정확하지 않은 것은?", "적절하지 않은 것은?" 등이다.

각 문제는 제공된 조문에서 확인할 수 있는 의무, 대상, 법적 근거, 처리 요건, 예외, 권리, 절차 또는 기간 중 하나를 묻는다. 선택지 4개는 모두 같은 주제의 자연스러운 법률 문장으로 만들고, 정답과 헷갈릴 수 있도록 요건 하나만 다르게 만든다. 조문 내용과 무관한 공부법이나 일반론을 묻지 않는다. 조문 제목, 조문 번호, "제15조(개인정보의 수집·이용)" 같은 원문 헤더를 선택지로 복사하지 않는다. 제공된 조문에 없는 숫자·기관·판례·예외는 만들지 않는다.

문제의 근거가 부족한 경우 억지로 3개를 만들지 말고 2개만 만든다. 사례형 문제를 만들 때에는 조문에 있는 요건을 적용할 수 있는 짧은 사실관계만 추가하고, 사례의 정답에 필요한 정보가 모두 지문에 포함되게 한다.

반드시 JSON 배열만 반환하라. 각 객체는 question, options(문자열 4개), answer(0부터 시작하는 정답 번호), explanation 필드를 가진다. 해설에는 제공된 조문을 근거로 정답과 핵심 판단 기준을 간단히 설명하라.

[오늘의 조문]
${normalized.map((article) => `제목: ${article.title}\n원문:\n${article.content}`).join('\n\n')}`;

  try {
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.65,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'ARRAY', items: { type: 'OBJECT', properties: {
              question: { type: 'STRING' }, options: { type: 'ARRAY', items: { type: 'STRING' } },
              answer: { type: 'INTEGER' }, explanation: { type: 'STRING' }
            }, required: ['question', 'options', 'answer', 'explanation'] }
          }
        }
      })
    });
    if (!response.ok) throw new Error(`Gemini ${response.status}`);
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const questions = JSON.parse(text || '[]');
    if (!validateQuestions(questions, normalized)) throw new Error('AI 문제 품질 검증 실패');
    return res.status(200).json({ questions: questions.slice(0, 3), source: 'ai' });
  } catch (error) {
    console.error(error);
    return res.status(200).json({ questions: fallbackQuestions(normalized), source: 'fallback' });
  }
}

export { fallbackQuestions, validateQuestions };
