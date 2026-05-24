// Kanji Flow Application Logic

// --- 전역 상태 객체 ---
const AppState = {
  activeTab: 'dashboard',
  studiedKanji: new Set(), // 완료한 한자 목록 (localStorage 저장)
  stats: {
    totalViews: 0,
    quizTaken: 0,
    quizCorrect: 0,
    songsAnalyzed: 0
  },
  
  // 쓰기 연습용 상태
  currentWriteKanji: null,
  canvasInstance: null,
  canvasGuideVisible: true,
  canvasGridVisible: true,
  writeLevelFilter: 'ALL',
  
  // 퀴즈용 상태
  quiz: {
    isPlaying: false,
    pool: [],
    questions: [],
    currentIndex: 0,
    score: 0,
    selectedOption: null,
    lyricsMode: false
  },
  
  // 가사 분석용 상태
  currentLyricsKanji: []
};

// --- 샘플 가사 데이터 ---
const LYRICS_SAMPLES = {
  lemon: `夢ならばどれほどよかったでしょう
未だにあなたのことを夢にみる
忘れた物を取りに帰るように
古びた思い出の埃を払う

戻らない幸せがあることを
最後にあなたが教えてくれた
言えずに隠した昏い過去も
あなたがいなきゃ永遠に昏いまま

きっともうこれ以上　傷つくことなど
ありはしないとわかっている
あの日の悲しみさえ　あの日の苦しみさえ
そのすべてを愛してた　あなたとともに
胸に残り離れない　苦いレモンの匂い
雨が降り止むまでは帰れない
今でもあなたはわたしの光`,

  idol: `無敵の笑顔で荒らすメディア
知りたいその秘密ミステリアス
抜けてるところさえ彼女のエリア
完璧で嘘つきな君は
天才的なアイドル様

今日何食べた？
好きな本は？
遊びに行くならどこに行くの？
何も食べてない
それは内緒
何を聞かれても
のらりくらり

そう淡々と
だけど燦々と
見えそうで見えない秘密は蜜の味
あれもないないない
これもないないない
好きなタイプは？
相手は？
さあ答えて`,

  pretender: `君とのラブストーリー
それは予想通り
いざ始まればひとり芝居だ
ずっとそばにいたって
結局ただの観客さ

感情のないアイラブユー
言いたくないけど
嘘でもないこの世界で
グッバイ
君の運命の人は僕じゃない
辛いけど否めない　でも離れ難いのさ
その髪に触れただけで　痛いや　いやでも
甘いな　いやいや
グッバイ
それじゃ僕にとって君は何？
答えは分からない　分かりたくもないのさ
たったひとつ確かなことがあるとするのならば
「君は綺麗だ」`
};

// --- 앱 로드 시 초기화 ---
window.addEventListener('DOMContentLoaded', () => {
  // 1. localStorage 로드
  loadProgressData();
  
  // 2. Lucide 아이콘 초기화
  lucide.createIcons();
  
  // 3. 네비게이션 탭 설정
  switchTab('dashboard');
  
  // 4. 쓰기 연습용 캔버스 인스턴스 생성
  AppState.canvasInstance = new KanjiCanvas('kanji-canvas', {
    brushColor: '#8B5CF6',
    lineWidth: 8
  });
  
  // 5. 쓰기 탭 사이드바 및 단어장 채우기
  initWriteSidebar();
  initExplorerGrid();
  
  // 6. 통계 UI 업데이트
  updateStatsUI();
  
  // 창 크기 변경 시 캔버스 반응형 리사이즈 대응
  window.addEventListener('resize', () => {
    if (AppState.canvasInstance) {
      AppState.canvasInstance.resizeCanvas();
      if (AppState.currentWriteKanji) {
        AppState.canvasInstance.setGuideKanji(AppState.currentWriteKanji.kanji);
      }
    }
  });
});

// --- 로컬 데이터 저장 및 불러오기 ---
function saveProgressData() {
  localStorage.setItem('kf_studied_kanji', JSON.stringify(Array.from(AppState.studiedKanji)));
  localStorage.setItem('kf_stats', JSON.stringify(AppState.stats));
}

function loadProgressData() {
  const savedKanji = localStorage.getItem('kf_studied_kanji');
  if (savedKanji) {
    AppState.studiedKanji = new Set(JSON.parse(savedKanji));
  }
  
  const savedStats = localStorage.getItem('kf_stats');
  if (savedStats) {
    AppState.stats = JSON.parse(savedStats);
  }
}

function updateStatsUI() {
  // 헤더 및 대시보드 통계 업데이트
  document.getElementById('header-stat-studied').innerText = AppState.studiedKanji.size;
  document.getElementById('header-stat-total').innerText = KANJI_DATA.length;
  
  const totalQuizzes = AppState.stats.quizTaken;
  const accuracy = totalQuizzes > 0 ? Math.round((AppState.stats.quizCorrect / (totalQuizzes * 10)) * 100) : 0;
  
  document.getElementById('header-stat-accuracy').innerText = `${accuracy}%`;
  
  // 대시보드 요약
  document.getElementById('stats-total-read').innerText = AppState.stats.totalViews;
  document.getElementById('stats-quiz-taken').innerText = AppState.stats.quizTaken;
  document.getElementById('stats-songs-analyzed').innerText = AppState.stats.songsAnalyzed;
}

// --- 탭 전환 스크립트 ---
function switchTab(tabId) {
  AppState.activeTab = tabId;
  
  // 네비게이션 아이템 활성화 설정
  const navItems = document.querySelectorAll('.bottom-nav .nav-item');
  navItems.forEach(item => {
    item.classList.remove('active');
    if (item.id === `nav-${tabId === 'dashboard' ? 'dashboard' : tabId}`) {
      item.classList.add('active');
    }
  });
  
  // 스크린 컨테이너 활성화 설정
  const screens = document.querySelectorAll('.screen');
  screens.forEach(screen => {
    screen.classList.remove('active');
    if (screen.id === `screen-${tabId}`) {
      screen.classList.add('active');
    }
  });

  // 탭별 추가 로직
  if (tabId === 'write') {
    // 캔버스 사이즈 보정 및 다시 그리기
    setTimeout(() => {
      if (AppState.canvasInstance) {
        AppState.canvasInstance.resizeCanvas();
        if (!AppState.currentWriteKanji) {
          // 첫 한자로 선택
          selectKanjiForWrite(KANJI_DATA[0].kanji);
        } else {
          AppState.canvasInstance.redraw();
        }
      }
    }, 50);
  }
}

// 로고 클릭시 홈으로
document.getElementById('logo-btn').addEventListener('click', () => {
  switchTab('dashboard');
});

// --- 발음 합성 기능 (Web Speech API) ---
function speakText(text, rate = 0.8) {
  if ('speechSynthesis' in window) {
    // 이전 발음 취소
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ja-JP';
    utterance.rate = rate; // 초심자를 위해 약간 느린 발음 지원
    
    // 일본어 보이스 필터링 시도
    const voices = window.speechSynthesis.getVoices();
    const jaVoice = voices.find(v => v.lang === 'ja-JP' || v.lang.startsWith('ja'));
    if (jaVoice) {
      utterance.voice = jaVoice;
    }
    
    window.speechSynthesis.speak(utterance);
  } else {
    alert('이 브라우저는 음성 합성(TTS) 기능을 지원하지 않습니다.');
  }
}

// TTS 보이스 로딩 보정 (Chrome 등 일부 브라우저 대응)
if ('speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    // 브라우저 보이스가 준비되었을 때 조용히 캐싱해두기 위함
  };
}


// ==========================================================================
// 한자 쓰기 연습 (WRITE TAP) 로직
// ==========================================================================
function initWriteSidebar() {
  const container = document.getElementById('sidebar-kanji-list');
  container.innerHTML = '';
  
  const filtered = KANJI_DATA.filter(item => {
    if (AppState.writeLevelFilter === 'ALL') return true;
    return item.grade === AppState.writeLevelFilter;
  });
  
  filtered.forEach(item => {
    const el = document.createElement('div');
    el.className = `kanji-list-item ${AppState.currentWriteKanji?.kanji === item.kanji ? 'active' : ''}`;
    el.innerText = item.kanji;
    el.addEventListener('click', () => selectKanjiForWrite(item.kanji));
    container.appendChild(el);
  });
}

function filterSidebar(level) {
  AppState.writeLevelFilter = level;
  // 버튼 활성화
  const btns = document.querySelectorAll('.level-selector .level-btn');
  btns.forEach(btn => {
    btn.classList.remove('active');
    const isMatch = (level === 'ALL' && (btn.innerText === '전체' || btn.innerText === 'ALL')) || btn.innerText === level;
    if (isMatch) {
      btn.classList.add('active');
    }
  });
  initWriteSidebar();
}

function selectKanjiForWrite(kanjiChar) {
  const item = KANJI_DATA.find(k => k.kanji === kanjiChar);
  if (!item) return;
  
  AppState.currentWriteKanji = item;
  AppState.stats.totalViews++;
  updateStatsUI();
  saveProgressData();
  
  // 사이드바 하이라이트 상태 업데이트
  const listItems = document.querySelectorAll('.kanji-list-item');
  listItems.forEach(el => {
    if (el.innerText === kanjiChar) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });
  
  // 캔버스 한자 업데이트
  document.getElementById('draw-kanji-title').innerText = item.kanji;
  AppState.canvasInstance.setGuideKanji(item.kanji);
  
  // 상세 데이터 업데이트
  document.getElementById('draw-detail-meaning').innerText = item.meaning;
  document.getElementById('draw-detail-onyomi').innerText = item.onyomi;
  document.getElementById('draw-detail-kunyomi').innerText = item.kunyomi;
  
  const wordContainer = document.getElementById('draw-detail-words');
  wordContainer.innerHTML = '';
  
  item.words.forEach(w => {
    const wordEl = document.createElement('div');
    wordEl.className = 'card-word-item';
    wordEl.innerHTML = `
      <div>
        <span class="card-word-furigana">${w.reading}</span>
        <span class="card-word-jp">${w.word}</span>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <span class="card-word-meaning">${w.meaning}</span>
        <button class="voice-btn" onclick="speakText('${w.word}')"><i data-lucide="volume-2" style="width: 14px; height: 14px;"></i></button>
      </div>
    `;
    wordContainer.appendChild(wordEl);
  });
  
  lucide.createIcons();
}

function toggleCanvasGuide() {
  AppState.canvasGuideVisible = !AppState.canvasGuideVisible;
  AppState.canvasInstance.toggleGuide(AppState.canvasGuideVisible);
  
  const btn = document.getElementById('toggle-guide-btn');
  btn.style.color = AppState.canvasGuideVisible ? 'var(--color-violet)' : 'var(--text-secondary)';
}

function toggleCanvasGrid() {
  AppState.canvasGridVisible = !AppState.canvasGridVisible;
  AppState.canvasInstance.toggleGrid(AppState.canvasGridVisible);
  
  const btn = document.getElementById('toggle-grid-btn');
  btn.style.color = AppState.canvasGridVisible ? 'var(--color-violet)' : 'var(--text-secondary)';
}

function clearDrawCanvas() {
  if (AppState.canvasInstance) {
    AppState.canvasInstance.clearUserStroke();
  }
}

function playCurrentKanjiSpeech() {
  if (AppState.currentWriteKanji) {
    speakText(AppState.currentWriteKanji.kanji, 0.75);
  }
}

function checkKanjiSuccess() {
  if (!AppState.currentWriteKanji) return;
  
  // 1. 학습 완료 셋에 추가
  AppState.studiedKanji.add(AppState.currentWriteKanji.kanji);
  updateStatsUI();
  saveProgressData();
  
  // 2. 축하 Confetti 이펙트 (미니버전)
  confetti({
    particleCount: 50,
    spread: 60,
    origin: { y: 0.8 },
    colors: ['#8B5CF6', '#06B6D4', '#10B981']
  });
  
  // 3. 사용자 안내
  const title = document.getElementById('draw-kanji-title');
  title.style.color = 'var(--color-success)';
  title.style.transform = 'scale(1.1)';
  setTimeout(() => {
    title.style.color = 'white';
    title.style.transform = 'scale(1)';
  }, 600);
}


// ==========================================================================
// 파생 단어 탐색기 (EXPLORER TAP) 로직
// ==========================================================================
function initExplorerGrid() {
  const container = document.getElementById('explorer-kanji-grid');
  container.innerHTML = '';
  
  KANJI_DATA.forEach(item => {
    const card = document.createElement('div');
    card.className = 'kanji-card';
    card.dataset.kanji = item.kanji;
    card.dataset.grade = item.grade;
    card.dataset.meaning = item.meaning;
    card.dataset.onyomi = item.onyomi;
    card.dataset.kunyomi = item.kunyomi;
    
    // 파생 단어들 렌더링
    let wordsHTML = '';
    item.words.forEach(w => {
      wordsHTML += `
        <div class="card-word-item">
          <div>
            <span class="card-word-furigana">${w.reading}</span>
            <span class="card-word-jp">${w.word}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <span class="card-word-meaning">${w.meaning}</span>
            <button class="voice-btn" onclick="event.stopPropagation(); speakText('${w.word}')"><i data-lucide="volume-2" style="width: 13px; height: 13px;"></i></button>
          </div>
        </div>
      `;
    });
    
    card.innerHTML = `
      <div class="card-kanji-header">
        <span class="badge ${item.grade === 'N5' ? 'badge-n5' : 'badge-n4'}">${item.grade}</span>
        <button class="btn-icon btn-sm" onclick="event.stopPropagation(); speakText('${item.kanji}', 0.7)"><i data-lucide="volume-2" style="width: 14px; height: 14px;"></i></button>
      </div>
      <div style="display: flex; align-items: baseline; gap: 12px; margin-bottom: 6px;">
        <span class="card-kanji-big">${item.kanji}</span>
        <span class="card-kanji-meaning">${item.meaning}</span>
      </div>
      <div class="card-readings">
        <div style="margin-bottom: 4px;"><span style="color: var(--text-muted);">음독:</span> <span class="onyomi-val">${item.onyomi}</span></div>
        <div><span style="color: var(--text-muted);">훈독:</span> <span class="kunyomi-val">${item.kunyomi}</span></div>
      </div>
      <div class="card-word-list">
        ${wordsHTML}
      </div>
      <button class="btn btn-secondary btn-sm" style="width: 100%; margin-top: 14px;" onclick="quickPracticeFromExplorer('${item.kanji}')">✍️ 이 한자 연습하기</button>
    `;
    
    container.appendChild(card);
  });
  
  lucide.createIcons();
}

function quickPracticeFromExplorer(kanjiChar) {
  switchTab('write');
  selectKanjiForWrite(kanjiChar);
}

function onSearchInput() {
  const query = document.getElementById('explorer-search-input').value.toLowerCase().trim();
  const cards = document.querySelectorAll('.explorer-grid .kanji-card');
  
  cards.forEach(card => {
    const kanji = card.dataset.kanji;
    const meaning = card.dataset.meaning.toLowerCase();
    const onyomi = card.dataset.onyomi.toLowerCase();
    const kunyomi = card.dataset.kunyomi.toLowerCase();
    
    // 카드 텍스트 내용 전체 매칭 지원 (파생단어도 검색되도록)
    const cardText = card.innerText.toLowerCase();
    
    if (kanji.includes(query) || meaning.includes(query) || onyomi.includes(query) || kunyomi.includes(query) || cardText.includes(query)) {
      card.style.display = 'block';
    } else {
      card.style.display = 'none';
    }
  });
}

function filterExplorer(level) {
  // 레벨 필터링 처리
  const btns = document.querySelectorAll('#screen-explorer .level-btn');
  btns.forEach(btn => btn.classList.remove('active'));
  
  document.getElementById(`exp-lvl-${level}`).classList.add('active');
  
  const cards = document.querySelectorAll('.explorer-grid .kanji-card');
  cards.forEach(card => {
    const cardLvl = card.dataset.grade;
    if (level === 'ALL' || cardLvl === level) {
      card.style.display = 'block';
    } else {
      card.style.display = 'none';
    }
  });
  
  // 검색어 동시 적용
  onSearchInput();
}


// ==========================================================================
// 무제한 랜덤 퀴즈 (QUIZ TAP) 로직
// ==========================================================================
function startQuiz(type) {
  AppState.quiz.isPlaying = true;
  AppState.quiz.currentIndex = 0;
  AppState.quiz.score = 0;
  AppState.quiz.lyricsMode = false;
  
  // 퀴즈 문제 풀 구축
  if (type === 'ALL') {
    AppState.quiz.pool = [...KANJI_DATA];
  } else {
    AppState.quiz.pool = KANJI_DATA.filter(k => k.grade === type);
  }
  
  generateQuizQuestions();
  
  // UI 스위칭
  document.getElementById('quiz-setup-panel').style.display = 'none';
  document.getElementById('quiz-play-panel').style.display = 'block';
  document.getElementById('quiz-result-panel').style.display = 'none';
  
  renderQuizQuestion();
}

// 가사용 커스텀 퀴즈 구동
function startLyricsQuiz(lyricsKanjiList) {
  AppState.quiz.isPlaying = true;
  AppState.quiz.currentIndex = 0;
  AppState.quiz.score = 0;
  AppState.quiz.lyricsMode = true;
  
  // 가사에 있는 한자 중 앱 사전에 있는 한자들만 필터링
  const matchingKanji = KANJI_DATA.filter(k => lyricsKanjiList.includes(k.kanji));
  
  if (matchingKanji.length === 0) {
    alert("이 가사에서 사전과 일치하는 초급 한자가 없습니다!");
    return;
  }
  
  AppState.quiz.pool = matchingKanji;
  
  // 만약 가사 한자 풀이 너무 적으면(예: 3자 미만) 문제를 원활히 생성하기 위해 전체 풀에서 퀴즈를 채웁니다.
  generateQuizQuestions();
  
  // UI 스위칭
  switchTab('quiz');
  document.getElementById('quiz-setup-panel').style.display = 'none';
  document.getElementById('quiz-play-panel').style.display = 'block';
  document.getElementById('quiz-result-panel').style.display = 'none';
  
  renderQuizQuestion();
}

function generateQuizQuestions() {
  AppState.quiz.questions = [];
  
  // 10문제 무작위 추출 (풀 개수가 10개 미만이면 풀 개수만큼 출제)
  const count = Math.min(10, AppState.quiz.pool.length);
  const shuffledPool = [...AppState.quiz.pool].sort(() => Math.random() - 0.5);
  
  for (let i = 0; i < count; i++) {
    const kanjiItem = shuffledPool[i];
    
    // 문제 유형 무작위 결정: 0 = 한국어 뜻 맞추기, 1 = 대표 요미가나(독음) 맞추기
    const type = Math.random() > 0.5 ? 'meaning' : 'reading';
    
    AppState.quiz.questions.push({
      item: kanjiItem,
      type: type
    });
  }
}

function renderQuizQuestion() {
  const current = AppState.quiz.questions[AppState.quiz.currentIndex];
  if (!current) return;
  
  AppState.quiz.selectedOption = null;
  document.getElementById('quiz-feedback-text').innerHTML = '';
  
  // 1. 프로그레스바 업데이트
  const progressPercent = (AppState.quiz.currentIndex / AppState.quiz.questions.length) * 100;
  document.getElementById('quiz-progress').style.width = `${progressPercent}%`;
  
  // 2. 카운터 및 레벨 설정
  document.getElementById('quiz-card-counter').innerText = `${AppState.quiz.currentIndex + 1} / ${AppState.quiz.questions.length}`;
  const lvlBadge = document.getElementById('quiz-card-level');
  lvlBadge.innerText = current.item.grade;
  lvlBadge.className = `badge ${current.item.grade === 'N5' ? 'badge-n5' : 'badge-n4'}`;
  
  // 3. 문제 텍스트 구성
  const questionType = document.getElementById('quiz-question-type');
  const questionContent = document.getElementById('quiz-question-content');
  const questionDesc = document.getElementById('quiz-question-desc');
  
  questionContent.innerText = current.item.kanji;
  
  let correctAnswerText = '';
  let distractors = [];
  
  if (current.type === 'meaning') {
    questionType.innerText = '한글 뜻 맞추기';
    questionDesc.innerText = '아래 보기에서 올바른 한국어 뜻을 선택하세요.';
    correctAnswerText = current.item.meaning;
    
    // 오답 후보들 생성 (대표 뜻)
    distractors = KANJI_DATA
      .filter(k => k.kanji !== current.item.kanji)
      .map(k => k.meaning);
  } else {
    questionType.innerText = '발음/독음 맞추기';
    questionDesc.innerText = '아래 보기에서 올바른 요미가나 발음을 선택하세요.';
    // 훈독/음독 중 무작위 하나 선택해서 문제용으로
    const hasKunyomi = current.item.kunyomi !== 'none';
    const hasOnyomi = current.item.onyomi !== 'none';
    
    if (hasKunyomi && (!hasOnyomi || Math.random() > 0.5)) {
      correctAnswerText = current.item.kunyomi.split(',')[0].trim();
    } else {
      correctAnswerText = current.item.onyomi.split(',')[0].trim();
    }
    
    // 오답 후보들 생성
    distractors = KANJI_DATA
      .filter(k => k.kanji !== current.item.kanji)
      .map(k => {
        const hasK = k.kunyomi !== 'none';
        const hasO = k.onyomi !== 'none';
        if (hasK && (!hasO || Math.random() > 0.5)) {
          return k.kunyomi.split(',')[0].trim();
        } else {
          return k.onyomi.split(',')[0].trim();
        }
      });
  }
  
  // 오답 후보들 필터링 (정답과 겹치거나 중복되는 값 제거)
  distractors = Array.from(new Set(distractors.filter(val => val !== correctAnswerText)));
  
  // 무작위 오답 3개 셔플
  distractors.sort(() => Math.random() - 0.5);
  const options = [correctAnswerText, ...distractors.slice(0, 3)].sort(() => Math.random() - 0.5);
  
  // 4. 옵션 렌더링
  const optionsContainer = document.getElementById('quiz-options-container');
  optionsContainer.innerHTML = '';
  
  options.forEach((optText, index) => {
    const btn = document.createElement('button');
    btn.className = 'quiz-option';
    btn.innerHTML = `
      <span>${optText}</span>
      <i data-lucide="circle-dot" style="width: 16px; height: 16px; opacity: 0.3;"></i>
    `;
    btn.addEventListener('click', () => selectQuizOption(btn, optText, correctAnswerText));
    optionsContainer.appendChild(btn);
  });
  
  lucide.createIcons();
}

function selectQuizOption(selectedBtn, chosenVal, correctVal) {
  if (AppState.quiz.selectedOption !== null) return; // 연속 클릭 방지
  
  AppState.quiz.selectedOption = chosenVal;
  const isCorrect = chosenVal === correctVal;
  
  // 모든 옵션 버튼 비활성화 상태 비주얼 부여
  const optionBtns = document.querySelectorAll('.quiz-options-grid .quiz-option');
  optionBtns.forEach(btn => {
    const label = btn.querySelector('span').innerText;
    
    if (label === correctVal) {
      btn.classList.add('correct');
      btn.querySelector('i').setAttribute('data-lucide', 'check-circle-2');
      btn.querySelector('i').style.opacity = '1';
    } else if (label === chosenVal && !isCorrect) {
      btn.classList.add('incorrect');
      btn.querySelector('i').setAttribute('data-lucide', 'x-circle');
      btn.querySelector('i').style.opacity = '1';
    }
  });
  
  lucide.createIcons();
  
  // 정답 처리 피드백
  const feedbackEl = document.getElementById('quiz-feedback-text');
  if (isCorrect) {
    AppState.quiz.score++;
    feedbackEl.innerHTML = `<span style="color: var(--color-success)"><i data-lucide="thumbs-up"></i> 정답입니다!</span>`;
    speakText(AppState.quiz.questions[AppState.quiz.currentIndex].item.kanji, 0.9);
  } else {
    feedbackEl.innerHTML = `<span style="color: var(--color-danger)"><i data-lucide="alert-circle"></i> 아쉽네요! 정답은 [ ${correctVal} ] 입니다.</span>`;
  }
  
  lucide.createIcons();
  
  // 1.5초 후 다음 문제 혹은 퀴즈 결과로
  setTimeout(() => {
    AppState.quiz.currentIndex++;
    if (AppState.quiz.currentIndex < AppState.quiz.questions.length) {
      renderQuizQuestion();
    } else {
      showQuizResult();
    }
  }, 1600);
}

function showQuizResult() {
  document.getElementById('quiz-progress').style.width = `100%`;
  
  // 퀴즈 결과 요약 세팅
  const total = AppState.quiz.questions.length;
  const score = AppState.quiz.score;
  const percent = Math.round((score / total) * 100);
  
  AppState.stats.quizTaken++;
  AppState.stats.quizCorrect += score;
  updateStatsUI();
  saveProgressData();
  
  // radial gradient 설정
  const radial = document.getElementById('quiz-score-radial');
  radial.style.setProperty('--score-percent', `${percent}%`);
  
  document.getElementById('quiz-score-text').innerText = `${score} / ${total}`;
  
  // 메시지 세팅
  const msgEl = document.getElementById('quiz-result-msg');
  if (percent === 100) {
    msgEl.innerHTML = `💯 대단합니다! <strong>완벽한 실력</strong>이네요! 한자 마스터에 성공했습니다!`;
    triggerPerfectScoreConfetti();
  } else if (percent >= 70) {
    msgEl.innerHTML = `✨ 훌륭해요! <strong>${score}문제</strong>나 맞췄습니다. 이 페이스를 유지해보세요!`;
    triggerSuccessConfetti();
  } else if (percent >= 40) {
    msgEl.innerHTML = `👍 잘하고 있습니다! 조금만 더 복습해보면 좋은 결과가 나올 거예요.`;
  } else {
    msgEl.innerHTML = `✍️ 한자 쓰기와 도서관에서 더 연습하고 도전하면 무조건 잘 하실 수 있습니다! 화이팅!`;
  }
  
  // 패널 전환
  document.getElementById('quiz-play-panel').style.display = 'none';
  document.getElementById('quiz-result-panel').style.display = 'block';
}

function resetQuizSetup() {
  AppState.quiz.isPlaying = false;
  document.getElementById('quiz-setup-panel').style.display = 'block';
  document.getElementById('quiz-play-panel').style.display = 'none';
  document.getElementById('quiz-result-panel').style.display = 'none';
}

function retryCurrentQuiz() {
  if (AppState.quiz.lyricsMode) {
    startLyricsQuiz(AppState.currentLyricsKanji);
  } else {
    // 이전 퀴즈 레벨 필터를 가져올 수 없으므로 디폴트로 ALL 퀴즈 재출제
    startQuiz('ALL');
  }
}

// --- Confetti 축하 연출 ---
function triggerSuccessConfetti() {
  confetti({
    particleCount: 80,
    spread: 70,
    origin: { y: 0.6 }
  });
}

function triggerPerfectScoreConfetti() {
  const duration = 3 * 1000;
  const end = Date.now() + duration;

  (function frame() {
    confetti({
      particleCount: 3,
      angle: 60,
      spread: 55,
      origin: { x: 0 }
    });
    confetti({
      particleCount: 3,
      angle: 120,
      spread: 55,
      origin: { x: 1 }
    });

    if (Date.now() < end) {
      requestAnimationFrame(frame);
    }
  }());
}


// ==========================================================================
// 노래 가사 분석기 (LYRICS ANALYZER TAP) 로직
// ==========================================================================
function loadSampleLyrics(songId) {
  const lyrics = LYRICS_SAMPLES[songId];
  if (lyrics) {
    document.getElementById('lyrics-input').value = lyrics;
  }
}

function clearLyricsInput() {
  document.getElementById('lyrics-input').value = '';
  document.getElementById('lyrics-result-panel').classList.remove('active');
}

function analyzeLyrics() {
  const text = document.getElementById('lyrics-input').value.trim();
  if (!text) {
    alert("노래 가사를 입력해주세요!");
    return;
  }
  
  // 한자 문자만 정규식으로 추출
  const extracted = extractKanjiFromText(text);
  
  if (extracted.length === 0) {
    alert("가사에서 추출된 일본어 한자가 없습니다! 히라가나/가타가나만 있거나 올바르지 않은 가사 텍스트일 수 있습니다.");
    return;
  }
  
  // 분석 상태 업데이트
  AppState.currentLyricsKanji = extracted;
  AppState.stats.songsAnalyzed++;
  updateStatsUI();
  saveProgressData();
  
  // 사전 등록 유무에 따라 필터링
  const registeredKanji = [];
  const unregisteredKanji = [];
  
  extracted.forEach(char => {
    const data = findKanjiData(char);
    if (data) {
      registeredKanji.push(data);
    } else {
      unregisteredKanji.push(char);
    }
  });
  
  // UI 렌더링
  document.getElementById('lyric-stat-registered').innerText = registeredKanji.length;
  document.getElementById('lyric-stat-unregistered').innerText = unregisteredKanji.length;
  
  // 등록된 한자 리스트 렌더링
  const regGrid = document.getElementById('lyrics-registered-grid');
  regGrid.innerHTML = '';
  if (registeredKanji.length === 0) {
    regGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 20px;">사전 매칭 기초 한자가 없습니다.</div>`;
  } else {
    registeredKanji.forEach(item => {
      const el = document.createElement('div');
      el.className = 'lyrics-kanji-item registered';
      el.innerHTML = `
        <span class="lyrics-badge-dot"></span>
        <span class="lyrics-char">${item.kanji}</span>
        <span class="lyrics-kanji-sub">${item.meaning}</span>
      `;
      el.addEventListener('click', () => openKanjiModal(item));
      regGrid.appendChild(el);
    });
  }
  
  // 미등록 한자 리스트 렌더링
  const unregGrid = document.getElementById('lyrics-unregistered-grid');
  unregGrid.innerHTML = '';
  if (unregisteredKanji.length === 0) {
    unregGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 20px;">미등록 고급 한자가 없습니다.</div>`;
  } else {
    unregisteredKanji.forEach(char => {
      const el = document.createElement('div');
      el.className = 'lyrics-kanji-item unregistered';
      el.innerHTML = `
        <span class="lyrics-badge-dot"></span>
        <span class="lyrics-char">${char}</span>
        <span class="lyrics-kanji-sub" style="color:var(--text-muted)">네이버사전</span>
      `;
      el.addEventListener('click', () => {
        // 네이버 일본어 사전 링크 아웃
        window.open(`https://ja.dict.naver.com/#/search?query=${encodeURIComponent(char)}`, '_blank');
      });
      unregGrid.appendChild(el);
    });
  }
  
  // 결과 패널 보이기
  document.getElementById('lyrics-result-panel').classList.add('active');
  
  // 가사 퀴즈 시작 버튼 세팅 (사전 매치 한자가 있을 때만 활성화)
  const quizBtn = document.getElementById('lyrics-quiz-btn');
  if (registeredKanji.length > 0) {
    quizBtn.style.display = 'inline-flex';
  } else {
    quizBtn.style.display = 'none';
  }
}

function startLyricsCustomQuiz() {
  if (AppState.currentLyricsKanji.length === 0) return;
  startLyricsQuiz(AppState.currentLyricsKanji);
}

// --- 한자 디테일 팝업 모달 ---
let activeModalKanji = null;

function openKanjiModal(kanjiItem) {
  activeModalKanji = kanjiItem;
  
  document.getElementById('modal-kanji-char').innerText = kanjiItem.kanji;
  document.getElementById('modal-kanji-meaning').innerText = kanjiItem.meaning;
  
  const lvlBadge = document.getElementById('modal-kanji-level');
  lvlBadge.innerText = kanjiItem.grade;
  lvlBadge.className = `badge ${kanjiItem.grade === 'N5' ? 'badge-n5' : 'badge-n4'}`;
  
  document.getElementById('modal-kanji-onyomi').innerText = kanjiItem.onyomi;
  document.getElementById('modal-kanji-kunyomi').innerText = kanjiItem.kunyomi;
  
  const wordContainer = document.getElementById('modal-kanji-words');
  wordContainer.innerHTML = '';
  
  kanjiItem.words.forEach(w => {
    const wordEl = document.createElement('div');
    wordEl.className = 'card-word-item';
    wordEl.innerHTML = `
      <div>
        <span class="card-word-furigana">${w.reading}</span>
        <span class="card-word-jp">${w.word}</span>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <span class="card-word-meaning">${w.meaning}</span>
        <button class="voice-btn" onclick="event.stopPropagation(); speakText('${w.word}')"><i data-lucide="volume-2" style="width: 14px; height: 14px;"></i></button>
      </div>
    `;
    wordContainer.appendChild(wordEl);
  });
  
  lucide.createIcons();
  
  document.getElementById('kanji-modal').classList.add('active');
}

function closeKanjiModal() {
  document.getElementById('kanji-modal').classList.remove('active');
  activeModalKanji = null;
}

function playModalKanjiSpeech() {
  if (activeModalKanji) {
    speakText(activeModalKanji.kanji, 0.7);
  }
}

function goToWriteTabFromModal() {
  if (activeModalKanji) {
    const char = activeModalKanji.kanji;
    closeKanjiModal();
    switchTab('write');
    selectKanjiForWrite(char);
  }
}
