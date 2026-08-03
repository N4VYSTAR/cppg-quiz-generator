// 오늘 날짜 문자열
const today = new Date().toDateString();

// 데이터 불러오기
fetch('data.json')
  .then(res => res.json())
  .then(data => initApp(data));

function initApp(data) {
  const shuffled = [...data.articles].sort(() => Math.random() - 0.5);
  const todayArticles = shuffled.slice(0, 2);
  const todayIds = todayArticles.map(a => a.id);

  renderArticles(todayArticles);
  
	// ✅ 변경 (랜덤으로 3개만)
	const todayCards = data.cards
	  .filter(c => todayIds.includes(c.articleId))  // 오늘 조문 관련 카드만
	  .sort(() => Math.random() - 0.5)              // 랜덤 섞기
	  .slice(0, 3);                                 // 3개만 자르기

	renderCards(todayCards);

  // "새 문제 만들기" 버튼 → AI가 오늘 조문으로 새 문제 생성 후 갱신
  document.getElementById('genBtn').addEventListener('click', () => {
    const a = todayArticles[0];
    generateQuestion(a.title, a.content);
  });

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
async function generateQuestion(articleTitle, articleContent) {
  const box = document.getElementById('quiz');
  const btn = document.getElementById('genBtn');

  box.innerHTML = '<p>🤖 AI가 문제를 만드는 중... (몇 초 걸려요)</p>';
  btn.disabled = true; // 중복 클릭 방지

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articleTitle, articleContent })
    });

    if (!res.ok) throw new Error('서버 오류');

    const data = await res.json();
    renderQuiz(data.questions); // 통합 렌더 함수 재사용

  } catch (err) {
    box.innerHTML = '<p>⚠️ 생성 실패. 잠시 후 다시 시도해주세요.</p>';
    console.error(err);
  } finally {
    btn.disabled = false;
  }
}

// ===== 통합 퀴즈 렌더링 =====
function renderQuiz(questions) {
  const box = document.getElementById('quiz');

  if (!questions || questions.length === 0) {
    box.innerHTML = '<p>새 문제 만들기를 눌러보세요</p>';
    return;
  }

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