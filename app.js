// 오늘 날짜 문자열
const today = new Date().toDateString();

// 데이터 불러오기
fetch('data.json')
  .then(res => res.json())
  .then(data => initApp(data));

function initApp(data) {
	// initApp 함수 안에 추가
	document.getElementById('genBtn').addEventListener('click', () => {
		const a = todayArticles[0]; // 오늘의 첫 조문
		generateQuestion(a.title, a.content);
	});
	
	// 오늘의 조문 랜덤 2개 뽑기
	const shuffled = [...data.articles].sort(() => Math.random() - 0.5);
	const todayArticles = shuffled.slice(0, 2);
	const todayIds = todayArticles.map(a => a.id);

	renderArticles(todayArticles);
	renderCards(data.cards.filter(c => todayIds.includes(c.articleId)));
	renderQuestions(data.questions.filter(q => todayIds.includes(q.articleId)));

	setupStreak();
}

// 조문 표시
function renderArticles(articles) {
  const box = document.getElementById('articles');
  box.innerHTML = articles.map(a => `
    <div class="article-item">
      <div class="title">${a.title}</div>
      <div>${a.content}</div>
      <div class="summary">💡 ${a.summary}</div>
    </div>
  `).join('');
}

// 암기 카드 표시 (클릭 시 뒤집기)
function renderCards(cards) {
  const box = document.getElementById('flashcards');
  box.innerHTML = cards.map((c, i) => `
    <div class="flashcard" data-front="${c.front}" data-back="${c.back}" data-flipped="false">
      ${c.front}
    </div>
  `).join('');

  box.querySelectorAll('.flashcard').forEach(card => {
    card.addEventListener('click', () => {
      const flipped = card.dataset.flipped === 'true';
      card.textContent = flipped ? card.dataset.front : card.dataset.back;
      card.dataset.flipped = flipped ? 'false' : 'true';
    });
  });
}

// 기출문제 표시
function renderQuestions(questions) {
  const box = document.getElementById('questions');
  box.innerHTML = questions.map((q, qi) => `
    <div class="question-item">
      <div class="q-text">Q${qi + 1}. ${q.question}</div>
      ${q.options.map((opt, oi) => `
        <button class="option" data-q="${qi}" data-o="${oi}">${oi + 1}. ${opt}</button>
      `).join('')}
      <div class="explanation" id="exp-${qi}">${q.explanation}</div>
    </div>
  `).join('');

  box.querySelectorAll('.option').forEach(btn => {
    btn.addEventListener('click', () => {
      const qi = btn.dataset.q, oi = parseInt(btn.dataset.o);
      const correct = questions[qi].answer;
      // 이미 푼 문제면 무시
      const parent = btn.closest('.question-item');
      if (parent.dataset.done === 'true') return;
      parent.dataset.done = 'true';

      if (oi === correct) {
        btn.classList.add('correct');
      } else {
        btn.classList.add('wrong');
        parent.querySelectorAll('.option')[correct].classList.add('correct');
      }
      document.getElementById('exp-' + qi).style.display = 'block';
    });
  });
}

// 스트릭(연속 학습) 기능
function setupStreak() {
  const streakEl = document.getElementById('streakCount');
  const btn = document.getElementById('completeBtn');

  let streak = parseInt(localStorage.getItem('streak') || '0');
  const lastDate = localStorage.getItem('lastDate');
  streakEl.textContent = streak;

  // 오늘 이미 완료했는지 확인
  if (lastDate === today) {
    btn.textContent = '오늘 학습 완료됨 ✅';
    btn.classList.add('done');
  }

  btn.addEventListener('click', () => {
    if (localStorage.getItem('lastDate') === today) return;

    const yesterday = new Date(Date.now() - 86400000).toDateString();
    // 어제 했으면 이어서, 아니면 1부터
    streak = (lastDate === yesterday) ? streak + 1 : 1;

    localStorage.setItem('streak', streak);
    localStorage.setItem('lastDate', today);
    streakEl.textContent = streak;
    btn.textContent = '오늘 학습 완료됨 ✅';
    btn.classList.add('done');
  });
}

// ===== AI 문제 생성 기능 (Level 2) =====

// "새 문제 생성" 버튼에 연결할 함수
async function generateQuestion(articleTitle, articleContent) {
  const container = document.getElementById('aiQuestions');
  container.innerHTML = '<p>🤖 AI가 문제를 만드는 중... (몇 초 걸려요)</p>';

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articleTitle, articleContent })
    });

    if (!res.ok) throw new Error('서버 오류');

    const data = await res.json();
    renderAIQuestions(data.questions);

  } catch (err) {
    container.innerHTML = '<p>⚠️ 생성 실패. 잠시 후 다시 시도해주세요.</p>';
    console.error(err);
  }
}

// AI 생성 문제 화면에 표시
function renderAIQuestions(questions) {
  const box = document.getElementById('aiQuestions');
  box.innerHTML = questions.map((q, qi) => `
    <div class="question-item">
      <div class="q-text">🤖 ${q.question}</div>
      ${q.options.map((opt, oi) => `
        <button class="option" data-aq="${qi}" data-o="${oi}">${oi + 1}. ${opt}</button>
      `).join('')}
      <div class="explanation" id="aiexp-${qi}">${q.explanation}</div>
    </div>
  `).join('');

  box.querySelectorAll('.option').forEach(btn => {
    btn.addEventListener('click', () => {
      const qi = btn.dataset.aq, oi = parseInt(btn.dataset.o);
      const correct = questions[qi].answer;
      const parent = btn.closest('.question-item');
      if (parent.dataset.done === 'true') return;
      parent.dataset.done = 'true';

      if (oi === correct) {
        btn.classList.add('correct');
      } else {
        btn.classList.add('wrong');
        parent.querySelectorAll('.option')[correct].classList.add('correct');
      }
      document.getElementById('aiexp-' + qi).style.display = 'block';
    });
  });
}