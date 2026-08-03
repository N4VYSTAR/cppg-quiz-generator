// Vercel Serverless Function
// 브라우저 대신 여기서 Gemini를 호출 → API 키가 안전하게 숨겨짐

export default async function handler(req, res) {
  // POST 요청만 허용
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST만 허용됩니다' });
  }

  const { articleTitle, articleContent } = req.body;

  if (!articleContent) {
    return res.status(400).json({ error: '조문 내용이 없습니다' });
  }

  // 프롬프트 조립
  const prompt = `너는 CPPG(개인정보관리사) 문제 출제 전문가야. 아래 조문을 바탕으로 실제 시험 스타일의 4지선다 문제 3개를 만들어줘.
  조건:
  - 실제 기출처럼 "~에 해당하지 않는 것은?", "옳은 것은?" 등 다양한 형태 사용
  - 정답 1개 + 헷갈리는 그럴듯한 오답 3개 구성- 각 문제에 명확한 해설 포함
  
  [조문]
  ${articleTitle}
  ${articleContent}`;

try {
    const apiKey = process.env.GEMINI_API_KEY; // 환경변수에서 키 읽기

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${apiKey}`,
    {
        method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        thinkingConfig: {
          thinkingBudget: 0  // thinking 끄기 (속도 ↑, 토큰 절약)
        },
        responseSchema: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              question: { type: 'STRING' },
              options: { type: 'ARRAY', items: { type: 'STRING' } },
              answer: { type: 'INTEGER' },
              explanation: { type: 'STRING' }
            },
            required: ['question', 'options', 'answer', 'explanation']
          }
        }
      }
    })
  }
);
	
	// api/generate.js 의 catch 처리 개선
	if (!response.ok) {
	  const errData = await response.json().catch(() => ({}));
	  console.error('Gemini 에러:', response.status, errData);

	  if (response.status === 429) {
		return res.status(429).json({ error: '요청이 많아요. 1분 뒤 다시 시도해주세요.' });
	  }
	  return res.status(response.status).json({ error: 'AI 호출 실패', detail: errData });
	}
	
    const data = await response.json();
    // Gemini 응답에서 텍스트 추출
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('AI 응답이 비어있습니다');

    const questions = JSON.parse(text); // JSON 모드라 바로 파싱 가능
    return res.status(200).json({ questions });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: '문제 생성 실패. 다시 시도해주세요.' });
  }
}