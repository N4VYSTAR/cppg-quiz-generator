function strip(value = '') { return value.replace(/<[^>]+>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim(); }
function tag(xml, name) { const match = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i')); return match ? strip(match[1]) : ''; }
function parseArticles(xml, limit) {
  const blocks = [...xml.matchAll(/<조문단위[\s\S]*?<\/조문단위>/gi)].map((m) => m[0]);
  return blocks.map((block, index) => { const number = tag(block, '조문번호') || `제${index + 1}조`; const title = tag(block, '조문제목'); const text = tag(block, '조문내용'); return { id: number.replace(/[^0-9]/g, '') || index + 1, number, title: `${number} ${title}`.trim(), content: text, summary: '현행 법령 원문에서 가져온 조문입니다.', tags: ['현행법령'], examWeight: 1 }; }).filter((a) => a.content).slice(0, limit);
}
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET만 허용됩니다.' });
  const oc = process.env.LAW_API_OC;
  if (!oc) return res.status(503).json({ error: 'LAW_API_OC 환경변수가 없습니다.' });
  const limit = Math.min(100, Math.max(10, Number(req.query?.limit || 80)));
  try {
    const url = `https://www.law.go.kr/DRF/lawService.do?OC=${encodeURIComponent(oc)}&target=eflaw&type=XML&ID=011357`;
    const response = await fetch(url, { headers: { Accept: 'application/xml, text/xml' } });
    if (!response.ok) throw new Error(`Law API ${response.status}`);
    const xml = await response.text(); const articles = parseArticles(xml, limit);
    if (!articles.length) throw new Error('조문을 찾지 못했습니다. API 응답 형식을 확인하세요.');
    return res.status(200).json({ articles, updatedAt: new Date().toISOString(), source: 'law.go.kr' });
  } catch (error) { console.error(error); return res.status(502).json({ error: '현행 법령을 불러오지 못했습니다.' }); }
}
