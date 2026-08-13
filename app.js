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
  state.todayArticles = sampleFreshArticles(articles, 2 + Math.floor(Math.random() * 2));
  renderArticles(state.todayArticles);
  state.completed.article = false;
  updateProgress();
  toggle('refreshArticles', false);
  await analyzeImportance();
}

function mergeWithLocal(liveArticles) {
  return liveArticles.map((article) => {
    const local = state.data.articles.find((item) => item.number === article.number || item.id === article.id);
    return { ...local, ...article, summary: local?.summary || '현행 조문을 읽고 핵심 의무와 예외를 확인하세요.', tags: local?.tags || ['현행법령'], examWeight: local?.examWeight || 1 };
  });
}

async function analyzeImportance() {
  const box = $('articles');
  state.todayArticles.forEach((article) => { article.importance = importanceScore(article); });
  renderArticles(state.todayArticles);
  try {
    const result = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ articles: state.todayArticles }) }).then(assertOk).then((r) => r.json());
    if (Array.isArray(result.articles)) {
      state.todayArticles = state.todayArticles.map((item) => ({ ...item, ...result.articles.find((x) => String(x.id) === String(item.id)) }));
      renderArticles(state.todayArticles);
    }
  } catch (error) { console.info('중요도 AI 분석 fallback:', error.message); }
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
  $('articles').innerHTML = articles.map((a) => `<article class="article-item"><div class="article-top"><div class="article-title">${escapeHtml(a.title)}</div>${a.importance >= 3 ? '<span class="importance">★ 시험 빈출</span>' : ''}</div><div class="article-content">${escapeHtml(a.content)}</div><div class="article-summary">한 줄 요약 · ${escapeHtml(a.summary || '핵심 의무와 예외를 확인하세요.')}</div><div class="tags">${(a.tags || []).slice(0, 5).map((tag) => `<span class="tag">#${escapeHtml(tag)}</span>`).join('')}</div></article>`).join('');
  $('articles').querySelectorAll('.article-item').forEach((item) => item.addEventListener('click', () => { state.completed.article = true; updateProgress(); }));
}

function buildLocalQuestions() {
  const article = state.todayArticles[0] || {};
  const title = article.title || '오늘의 조문';
  const content = article.content || '조문 원문을 확인하세요.';
  return [
    { question: `${title}의 내용으로 옳은 것은?`, options: [article.summary || content.slice(0, 80), '해당 조문은 모든 개인정보 처리를 예외 없이 허용한다.', '해당 조문은 정보주체의 권리와 무관하다.', '해당 조문에는 적용 요건이나 예외가 없다.'], answer: 0, explanation: `정답은 ${title}의 핵심 내용입니다. 원문: ${content}` },
    { question: `${title}을(를) 적용할 때 가장 먼저 확인해야 할 사항은?`, options: ['조문이 정한 요건과 예외에 해당하는지 여부', '문제에 제시된 기관의 규모만', '개인정보의 처리 목적과 무관한 내부 관행', '조문 제목의 글자 수'], answer: 0, explanation: `${title}은(는) 문구 자체보다 적용 요건과 예외를 함께 확인해야 합니다.` },
    { question: `다음 중 ${title}에 대한 설명으로 옳지 않은 것은?`, options: ['조문 원문에 없는 내용을 임의로 추가할 수 있다.', '조문의 보호 목적과 적용 범위를 확인해야 한다.', '구체적인 사실관계에 따라 예외 적용 여부가 달라질 수 있다.', '관련 조문과 함께 읽으면 출제 포인트를 파악하기 쉽다.'], answer: 0, explanation: '법 조문 기반 문제는 원문에 없는 내용을 정답 근거로 삼을 수 없습니다.' }
  ].slice(0, 2 + Math.floor(Math.random() * 2));
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
  sessionStorage.setItem('cppg-today-article-ids', selected.map((item) => item.id).sort().join(','));
  return selected;
}
function importanceScore(article) { const tags = (article.tags || []).join(' '); return Math.min(5, Number(article.examWeight || 1) + (/정의|수집|이용|민감|고유|권리|안전/.test(tags) ? 2 : 0)); }
function shuffle(items) { return [...items].sort(() => Math.random() - .5); }
function toggle(id, value) { $(id).disabled = value; }
function assertOk(response) { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response; }
function formatDate(value) { return value ? new Date(value).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }) : '최근'; }
function escapeHtml(value = '') { return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char])); }
function escapeAttr(value = '') { return escapeHtml(value); }
function updateProgress() {}
