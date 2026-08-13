const state = { data: { articles: [], cards: [] }, todayArticles: [], questions: [], flipped: 0, completed: { article: false, quiz: false, cards: false } };
const $ = (id) => document.getElementById(id);

window.addEventListener('DOMContentLoaded', bootstrap);

async function bootstrap() {
  bindEvents();
  try {
    const local = await fetch('data.json').then((r) => r.json());
    state.data = local;
    $('syncStatus').textContent = '저장된 학습 데이터 사용 중';
    await refreshArticles(true);
    await refreshCards(false);
    refreshQuiz();
  } catch (error) {
    console.error(error);
    $('articles').innerHTML = '<div class="empty-state">데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</div>';
  }
}

function bindEvents() {
  $('refreshArticles').addEventListener('click', () => refreshArticles(true));
  $('refreshQuiz').addEventListener('click', () => refreshQuiz(true));
  $('refreshCards').addEventListener('click', () => refreshCards(true));
}

async function refreshArticles(useLive = true) {
  toggle('refreshArticles', true);
  let articles = [];
  if (useLive) {
    try {
      const live = await fetch('/api/law?limit=80').then(assertOk).then((r) => r.json());
      if (live.articles?.length) {
        state.data.articles = mergeWithLocal(live.articles);
        $('syncStatus').textContent = `현행 법령 동기화 · ${formatDate(live.updatedAt)}`;
        articles = live.articles;
      }
    } catch (error) {
      console.warn('현행 법령 API를 사용할 수 없어 저장된 데이터로 표시합니다.', error);
      $('syncStatus').textContent = '저장된 학습 데이터 사용 중';
    }
  }
  if (!articles.length) articles = state.data.articles;
  state.todayArticles = sampleFreshArticles(articles, Math.min(2, articles.length)).map((article) => ({ ...article, ...localArticleAnalysis(article) }));
  renderArticles(state.todayArticles);
  state.completed.article = false;
  updateProgress();
  toggle('refreshArticles', false);
  await analyzeImportance();
}

function mergeWithLocal(liveArticles) {
  return liveArticles.map((article) => {
    const local = state.data.articles.find((item) => item.number === article.number || item.id === article.id);
    return { ...local, ...article, summary: local?.summary || '', tags: local?.tags || [], examWeight: local?.examWeight || 1 };
  });
}

async function analyzeImportance() {
  const box = $('articles');
  state.todayArticles.forEach((article) => { article.importance = importanceScore(article); });
  renderArticles(state.todayArticles);
  try {
    const result = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ articles: state.todayArticles }) }).then(assertOk).then((r) => r.json());
    if (Array.isArray(result.articles)) {
      state.todayArticles = state.todayArticles.map((item) => mergeAnalysis(item, result.articles.find((x) => String(x.id) === String(item.id))));
      renderArticles(state.todayArticles);
    }
  } catch (error) {
    console.info('중요도 AI 분석 fallback:', error.message);
    state.todayArticles = state.todayArticles.map((article) => ({ ...article, ...localArticleAnalysis(article) }));
    renderArticles(state.todayArticles);
  }
}

function refreshQuiz() {
  if (!state.todayArticles.length) return;
  toggle('refreshQuiz', true);
  $('quiz').innerHTML = '<div class="loading">오늘의 조문으로 2~3문제를 만드는 중…</div>';
  const context = state.todayArticles.map((a) => `${a.title}\n${a.content}`).join('\n\n');
  fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ articles: state.todayArticles, articleTitle: state.todayArticles[0].title, articleContent: context }) })
    .then(assertOk).then((r) => r.json()).then((data) => { state.questions = data.questions || []; renderQuiz(state.questions); state.completed.quiz = false; updateProgress(); })
    .catch((error) => { console.warn(error); state.questions = buildLocalQuestions(); renderQuiz(state.questions); })
    .finally(() => toggle('refreshQuiz', false));
}

function refreshCards() {
  const ids = new Set(state.todayArticles.map((a) => a.id));
  const candidates = state.data.cards.filter((card) => ids.has(card.articleId));
  const cards = shuffle(candidates).slice(0, Math.min(4, Math.max(2, candidates.length)));
  renderCards(cards);
  state.completed.cards = false;
  updateProgress();
}

function renderArticles(articles) {
  $('articleCount').textContent = `${articles.length}개`;
  $('articles').innerHTML = articles.map((a) => `<article class="article-item"><div class="article-top"><div class="article-title">${escapeHtml(a.title)}</div>${a.importance >= 4 ? `<span class="importance" title="${escapeAttr(a.importanceReason || 'CPPG 출제 가능성 분석 결과')}">★ 시험 빈출 가능성 높음</span>` : ''}</div><div class="article-content">${formatArticleContent(a)}</div><div class="article-summary">한 줄 요약 · ${escapeHtml(cleanArticleText(a.summary || 'AI가 조문을 분석하는 중입니다.'))}</div><div class="tags">${(a.tags || []).filter((tag) => String(tag).trim() && String(tag).trim() !== '현행법령').slice(0, 5).map((tag) => `<span class="tag">#${escapeHtml(tag)}</span>`).join('')}</div></article>`).join('');
  $('articles').querySelectorAll('.article-item').forEach((item) => item.addEventListener('click', () => { state.completed.article = true; updateProgress(); }));
}

function buildLocalQuestions() {
  const article = state.todayArticles[0] || {};
  const title = article.title || '오늘의 조문';
  const content = article.content || '조문 원문을 확인하세요.';
  const correct = cleanArticleText(article.summary || content.split('\n').find((line) => line.trim()) || '조문의 핵심 요건을 확인한다.').slice(0, 120);
  return [
    { question: `${title}의 내용으로 가장 정확한 것은?`, options: [correct, '해당 요건은 적용 대상에 따라 별도로 검토할 필요가 없다.', '해당 요건은 일부 조건만 충족해도 같은 법적 효과가 발생한다.', '해당 요건은 사실관계보다 처리자의 내부 기준을 우선하여 판단한다.'], answer: 0, explanation: `정답은 제공된 조문 원문에 근거합니다. 핵심 내용은 ${correct}입니다.` },
    { question: `${title}을(를) 적용할 때 가장 적절한 판단은?`, options: ['적용 대상과 조문에 정한 요건을 사실관계에 맞춰 함께 확인한다.', '적용 대상은 확인하되 조문에 정한 제한 요건은 별도로 확인하지 않는다.', '법적 근거는 확인하되 구체적인 처리 상황은 판단에서 제외한다.', '조문의 일반적인 취지만 확인하고 세부 요건은 후순위로 둔다.'], answer: 0, explanation: 'CPPG 문제에서는 조문의 적용 대상과 구체적인 요건을 사실관계에 맞춰 판단해야 합니다.' }
  ];
}

function formatArticleContent(article) {
  return escapeHtml(article.content || '').replace(/\n/g, '<br>');
}

function isLongArticle(article) {
  return String(article.content || '').split(/\n/).filter((line) => line.trim()).length >= 20;
}

function mergeAnalysis(article, analysis = {}) {
  const next = { ...article };
  if (Number.isFinite(Number(analysis.importance))) next.importance = Math.max(1, Math.min(5, Number(analysis.importance)));
  if (analysis.importanceReason) next.importanceReason = cleanArticleText(analysis.importanceReason);
  if (analysis.summary && cleanArticleText(analysis.summary)) next.summary = cleanArticleText(analysis.summary);
  if (Array.isArray(analysis.tags)) next.tags = analysis.tags.filter((tag) => String(tag).trim() && String(tag).trim() !== '현행법령').slice(0, 5);
  return next;
}

function localArticleAnalysis(article) {
  const text = `${article.title || ''} ${article.content || ''}`;
  const lines = String(article.content || '').split('\n').map((line) => cleanArticleText(line)).filter(Boolean);
  const summary = cleanArticleText(article.summary || lines[0] || '조문의 적용 대상과 요건을 확인한다.').slice(0, 90);
  const tagRules = [['정의', '정의'], ['수집', '수집·이용'], ['이용', '수집·이용'], ['동의', '동의'], ['권리', '정보주체 권리'], ['민감', '민감정보'], ['고유식별', '고유식별정보'], ['안전', '안전성 확보'], ['보호위원회', '보호위원회']];
  const tags = [...new Set(tagRules.filter(([word]) => text.includes(word)).map(([, tag]) => tag))].slice(0, 5);
  return { importance: importanceScore(article), summary, tags };
}

function cleanArticleText(value = '') {
  return String(value).replace(/^제\d+(?:의\d+)?조(?:\([^)]*\))?\s*/, '').trim();
}

function renderQuiz(questions) {
  $('quizCount').textContent = `${questions.length}문제`;
  if (!questions.length) { $('quiz').innerHTML = '<div class="empty-state">새 문제를 눌러 오늘의 문제를 만들어보세요.</div>'; return; }
  $('quiz').innerHTML = questions.map((q, qi) => `<article class="question-item" data-done="false"><div class="q-text">Q${qi + 1}. ${escapeHtml(q.question)}</div>${(q.options || []).map((opt, oi) => `<button class="option" data-q="${qi}" data-o="${oi}" type="button">${oi + 1}. ${escapeHtml(opt)}</button>`).join('')}<div class="explanation" id="exp-${qi}">해설 · ${escapeHtml(q.explanation || '관련 조문을 다시 확인해보세요.')}</div></article>`).join('');
  $('quiz').querySelectorAll('.option').forEach((button) => button.addEventListener('click', () => {
    const parent = button.closest('.question-item'); if (parent.dataset.done === 'true') return;
    const question = questions[Number(button.dataset.q)]; const answer = Number(question.answer); const selected = Number(button.dataset.o);
    parent.dataset.done = 'true'; button.classList.add(selected === answer ? 'correct' : 'wrong');
    if (selected !== answer) parent.querySelectorAll('.option')[answer]?.classList.add('correct');
    parent.querySelector('.explanation').style.display = 'block';
    if ([...$('quiz').querySelectorAll('.question-item')].every((item) => item.dataset.done === 'true')) { state.completed.quiz = true; updateProgress(); }
  }));
}

function renderCards(cards) {
  $('cardCount').textContent = `${cards.length}장`; state.flipped = 0;
  $('flashcards').innerHTML = cards.map((c) => `<button class="flashcard" type="button" data-front="${escapeAttr(c.front)}" data-back="${escapeAttr(c.back)}"><span class="card-label">QUESTION</span><span class="card-text">${escapeHtml(c.front)}</span></button>`).join('');
  $('flashcards').querySelectorAll('.flashcard').forEach((card) => card.addEventListener('click', () => { const flipped = card.classList.toggle('flipped'); card.querySelector('.card-label').textContent = flipped ? 'ANSWER' : 'QUESTION'; card.querySelector('.card-text').textContent = flipped ? card.dataset.back : card.dataset.front; if (flipped) state.flipped += 1; if (state.flipped >= Math.min(2, cards.length)) { state.completed.cards = true; updateProgress(); } }));
}

function weightedSample(items, count) { const pool = [...items]; const result = []; while (pool.length && result.length < count) { const total = pool.reduce((sum, item) => sum + Math.max(1, Number(item.examWeight || item.importance || 1)), 0); let pick = Math.random() * total; const index = pool.findIndex((item) => { pick -= Math.max(1, Number(item.examWeight || item.importance || 1)); return pick <= 0; }); result.push(pool.splice(index < 0 ? 0 : index, 1)[0]); } return result; }
function sampleFreshArticles(items, count) {
  const previous = sessionStorage.getItem('cppg-today-article-ids') || '';
  let selected = weightedSample(items, count);
  for (let attempt = 0; attempt < 8 && selected.map((item) => item.id).sort().join(',') === previous; attempt += 1) selected = weightedSample(items, count);
  const longArticle = selected.find(isLongArticle);
  if (longArticle) selected = [longArticle];
  sessionStorage.setItem('cppg-today-article-ids', selected.map((item) => item.id).sort().join(','));
  return selected;
}
function importanceScore(article) { const text = `${article.title || ''} ${article.content || ''} ${(article.tags || []).join(' ')}`; const hits = (text.match(/정의|수집|이용|동의|민감|고유식별|권리|안전|보호위원회|유출|통지/g) || []).length; return Math.min(5, Math.max(1, Number(article.examWeight || 1) + (hits >= 3 ? 2 : hits >= 1 ? 1 : 0))); }
function shuffle(items) { return [...items].sort(() => Math.random() - .5); }
function toggle(id, value) { $(id).disabled = value; }
function assertOk(response) { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response; }
function formatDate(value) { return value ? new Date(value).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }) : '최근'; }
function escapeHtml(value = '') { return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char])); }
function escapeAttr(value = '') { return escapeHtml(value); }
function updateProgress() {}
