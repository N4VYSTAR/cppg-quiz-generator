function clean(value = '') {
  return String(value)
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();
}

function collectArticleNodes(value, result = []) {
  if (!value || typeof value !== 'object') return result;
  if (Array.isArray(value)) {
    value.forEach((item) => collectArticleNodes(item, result));
    return result;
  }
  const hasArticleFields = Object.keys(value).some((key) => ['조문내용', '조문제목', '조문번호', '조문단위'].includes(key));
  if (hasArticleFields) result.push(value);
  Object.entries(value).forEach(([key, child]) => {
    if (key !== '조문내용' && key !== '조문제목' && key !== '조문번호') collectArticleNodes(child, result);
  });
  return result;
}

function children(value, keys) {
  for (const key of keys) {
    const found = value?.[key];
    if (found) return Array.isArray(found) ? found : [found];
  }
  return [];
}

function collectParagraphLines(value, lines = []) {
  if (!value || typeof value !== 'object') return lines;
  if (Array.isArray(value)) { value.forEach((item) => collectParagraphLines(item, lines)); return lines; }
  for (const key of ['항내용', '호내용', '목내용']) {
    if (value[key]) lines.push(clean(value[key]));
  }
  Object.entries(value).forEach(([key, child]) => {
    if (!['항내용', '호내용', '목내용'].includes(key)) collectParagraphLines(child, lines);
  });
  return lines;
}

export function parseJsonArticles(payload, limit) {
  const nodes = payload?.법령?.조문?.조문단위 || payload?.법령?.조문단위 || [];
  const seen = new Set();
  return (Array.isArray(nodes) ? nodes : [nodes]).map((node, index) => {
    const number = clean(node?.['조문번호'] || `제${index + 1}조`);
    const title = clean(node?.['조문제목'] || '');
    const main = clean(node?.['조문내용'] || '');
    const paragraphs = collectParagraphLines(node['항']);
    const content = [main, ...paragraphs].filter(Boolean).join('\n');
    const key = `${number}|${content}`;
    if (!content || node?.['조문여부'] !== '조문' || seen.has(key)) return null;
    seen.add(key);
    const id = Number((number.match(/\d+/) || [index + 1])[0]);
    return { id, number: `제${id}조`, title: `제${id}조${title ? ` ${title}` : ''}`, content, summary: '현행 법령 원문에서 가져온 조문입니다.', tags: ['현행법령'], examWeight: 1 };
  }).filter(Boolean).slice(0, limit);
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Law API ${response.status}`);
  const text = await response.text();
  try { return JSON.parse(text); } catch { throw new Error('법령 API가 JSON이 아닌 응답을 반환했습니다.'); }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET만 허용됩니다.' });
  const oc = process.env.LAW_API_OC;
  if (!oc) return res.status(503).json({ error: 'LAW_API_OC 환경변수가 없습니다.' });
  const limit = Math.min(100, Math.max(10, Number(req.query?.limit || 80)));
  try {
    const params = new URLSearchParams({ OC: oc, target: 'eflaw', type: 'JSON', ID: '011357' });
    const payload = await fetchJson(`https://www.law.go.kr/DRF/lawService.do?${params.toString()}`);
    const articles = parseJsonArticles(payload, limit);
    if (!articles.length) throw new Error('JSON 응답에서 조문내용을 찾지 못했습니다.');
    return res.status(200).json({ articles, updatedAt: new Date().toISOString(), source: 'law.go.kr' });
  } catch (error) {
    console.error('법령 API 오류:', error);
    return res.status(502).json({ error: '현행 법령을 불러오지 못했습니다.', detail: error.message });
  }
}
