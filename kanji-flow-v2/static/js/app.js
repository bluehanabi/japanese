/**
 * Kanji Flow 2.0 — 메인 앱 로직
 * Flask REST API 기반, SRS 플래시카드 학습 시스템
 */

const API = "";  // 같은 서버 사용 (상대경로)

// ══════════════════════════════════════════════════════════
//  전역 상태
// ══════════════════════════════════════════════════════════

const State = {
  currentView: "home",
  study: {
    queue: [],          // 학습할 카드 목록
    index: 0,           // 현재 카드 인덱스
    flipped: false,     // 카드 뒤집기 여부
    sessionCorrect: 0,  // 세션 정답 수
    sessionTotal: 0,    // 세션 총 카드 수
  },
  vocab: {
    filter: "all",
    page: 1,
    loading: false,
    done: false,
    cards: [],
    search: "",
  },
  writing: {
    cards: [],
    index: 0,
    canvas: null,
    showGuide: true,
    showGrid: true,
  },
  quiz: {
    questions: [],
    index: 0,
    correct: 0,
    answered: false,
    level: "",
    count: 15,
  },
  lyrics: {
    foundIds: [],
  },
  settings: {
    daily_new_cards: 10,
    study_mode: "both",
    show_reading_on_front: "0",
    shuffle_study: "1",
    active_levels: "N5,N4",
    active_kanken: "10급,9급,8급,7급",
    active_categories: "한자,명사,동사,형용사,부사,기타,문법",
  },
};

// ══════════════════════════════════════════════════════════
//  초기화
// ══════════════════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", async () => {
  setGreeting();
  document.getElementById("vocab-view").addEventListener("scroll", onVocabScroll);
  await loadHome();
  await loadSettings();
});

function setGreeting() {
  const h = new Date().getHours();
  const greetings = [
    [5,  12, "좋은 아침이에요! ☀️"],
    [12, 18, "안녕하세요! 오후 학습 시작!"],
    [18, 22, "저녁 공부 화이팅! 🌙"],
    [22, 24, "오늘 하루도 수고하셨어요! 🌟"],
    [0,   5, "늦게까지 공부하시는군요! 💪"],
  ];
  for (const [s, e, msg] of greetings) {
    if (h >= s && h < e) {
      document.getElementById("home-greeting").textContent = msg;
      break;
    }
  }
}

// ══════════════════════════════════════════════════════════
//  내비게이션
// ══════════════════════════════════════════════════════════

function showView(name) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));

  document.getElementById(`${name}-view`).classList.add("active");
  const navBtn = document.getElementById(`nav-${name}`);
  if (navBtn) navBtn.classList.add("active");

  State.currentView = name;

  // 뷰별 데이터 로드
  if (name === "vocab")    loadVocab();
  if (name === "stats")    loadStats();
  if (name === "settings") loadSettingsUI();

  // 학습/퀴즈 중이면 내비 숨기기
  document.getElementById("nav").style.display =
    (name === "study" || name === "quiz") ? "none" : "flex";
}

// ══════════════════════════════════════════════════════════
//  홈 대시보드
// ══════════════════════════════════════════════════════════

async function loadHome() {
  try {
    const [today, stats] = await Promise.all([
      apiFetch("/api/today"),
      apiFetch("/api/stats"),
    ]);

    // 오늘 할 것
    document.getElementById("home-due").textContent = today.review_count;
    document.getElementById("home-new").textContent = today.new_count;
    document.getElementById("home-done").textContent = stats.today_reviewed;
    document.getElementById("home-streak").textContent = stats.streak;

    // 학습 시작 버튼 (오늘 목표를 끝내면 '추가 학습'으로 전환)
    const startBtn = document.getElementById("start-study-btn");
    startBtn.disabled = false;
    if (today.total_due === 0) {
      startBtn.innerHTML = `🔄 추가 학습하기 <span style="opacity:.7;font-weight:500">(오늘 목표 완료 ✅)</span>`;
      startBtn.onclick = () => startStudy(true);
    } else {
      startBtn.innerHTML = `
        <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
          <path d="M5 3l14 9-14 9V3z" fill="white"/>
        </svg>
        지금 바로 학습 시작 (${today.total_due}개)`;
      startBtn.onclick = () => startStudy(false);
    }

    // 상태 분포 바
    const total = stats.total_cards || 1;
    const nNew = stats.new;
    const nLearning = stats.learning;
    const nMastered = stats.mastered;

    document.getElementById("bar-new").style.flex      = nNew;
    document.getElementById("bar-learning").style.flex = nLearning;
    document.getElementById("bar-mastered").style.flex = nMastered;

    document.getElementById("cnt-new").textContent      = nNew;
    document.getElementById("cnt-learning").textContent = nLearning;
    document.getElementById("cnt-mastered").textContent = nMastered;

    // 설정 총 카드
    document.getElementById("info-total-cards").textContent = stats.total_cards;

  } catch (e) {
    console.error("홈 로드 오류:", e);
    showToast("서버 연결 오류 — 서버가 켜져 있는지 확인하세요");
  }
}

// ══════════════════════════════════════════════════════════
//  학습 세션
// ══════════════════════════════════════════════════════════

async function startStudy(extra = false) {
  const data = await apiFetch("/api/today" + (extra ? "?extra=1" : "")) || {};
  const review_cards = data.review_cards || [];
  const new_cards = data.new_cards || [];
  const queue = [...review_cards, ...new_cards];

  if (queue.length === 0) {
    showToast(extra ? "더 학습할 카드가 없어요 🎉" : "오늘 학습할 카드가 없어요");
    return;
  }

  showView("study");
  document.getElementById("study-complete").style.display = "none";
  document.getElementById("flashcard-scene").style.display = "block";
  // 평가 버튼은 .visible 클래스로만 제어 (인라인 display 를 쓰면 .visible 이 무시됨)
  document.getElementById("rating-wrap").classList.remove("visible");

  // 복습 카드 먼저, 그 다음 신규
  State.study.queue = queue;
  State.study.extra = extra;
  State.study.index = 0;
  State.study.sessionCorrect = 0;
  State.study.sessionTotal = 0;

  showCard(0);
}

function showCard(index) {
  const queue = State.study.queue;
  if (index >= queue.length) {
    showStudyComplete();
    return;
  }

  State.study.index = index;
  State.study.flipped = false;

  const card = queue[index];
  const total = queue.length;

  // 진행률
  const pct = Math.round(index / total * 100);
  document.getElementById("study-progress").style.width = pct + "%";
  document.getElementById("study-progress-text").textContent = `${index} / ${total}`;

  const TYPE_LABEL = { kanji: "한자", word: "단어", grammar: "문법" };

  // 카드 타입 배지
  const typeBadge = document.getElementById("study-type-badge");
  typeBadge.textContent = TYPE_LABEL[card.type] || "단어";
  typeBadge.className = `card-type-badge badge-${card.type}`;

  // 레벨 배지: 한자는 漢検 급수, 그 외는 JLPT 레벨
  const levelBadge = document.getElementById("front-level-badge");
  if (card.type === "kanji" && card.sub_level) {
    levelBadge.textContent = "漢検 " + card.sub_level;
    levelBadge.className = "card-type-badge badge-kanken";
  } else {
    levelBadge.textContent = card.jlpt_level;
    levelBadge.className = `card-type-badge badge-${card.jlpt_level.toLowerCase()}`;
  }

  // 앞면 텍스트 (단어·문법은 글자가 길어 작게)
  const frontText = document.getElementById("card-front-text");
  frontText.textContent = card.front;
  const longType = card.type === "word" ? " word-text" : card.type === "grammar" ? " grammar-text" : "";
  frontText.className = `card-main-text${longType}`;

  // 설정: 앞면에 발음(읽기) 표시
  const frontReading = document.getElementById("card-front-reading");
  if (State.settings.show_reading_on_front === "1" && card.back_reading) {
    frontReading.textContent = card.back_reading;
    frontReading.style.display = "block";
  } else {
    frontReading.style.display = "none";
  }

  // 뒷면 준비
  const backKanji = document.getElementById("card-back-kanji");
  backKanji.textContent = card.front;
  backKanji.className = `card-back-kanji${card.type === "grammar" ? " grammar-text" : ""}`;
  document.getElementById("card-back-meaning").textContent = card.back_meaning;

  const backReading = document.getElementById("card-back-reading");
  backReading.textContent = card.back_reading || "";
  backReading.style.display = card.back_reading ? "" : "none";

  // 쓰기 연습 버튼은 한자/단어만 (문법 제외)
  document.getElementById("card-write-btn").style.display =
    card.type === "grammar" ? "none" : "";

  // 뒷면 부가 정보: 한자=파생단어 / 문법=예문
  const wordsEl = document.getElementById("card-back-words");
  wordsEl.innerHTML = "";
  if (card.type === "grammar" && card.extra_info && Array.isArray(card.extra_info.examples)) {
    card.extra_info.examples.forEach(ex => {
      wordsEl.innerHTML += `
        <div class="example-item">
          <div class="ex-jp">${escapeHtml(ex.jp)}</div>
          <div class="ex-kr">${escapeHtml(ex.kr)}</div>
        </div>`;
    });
  } else if (card.type === "kanji" && card.extra_info && Array.isArray(card.extra_info)) {
    card.extra_info.forEach(w => {
      wordsEl.innerHTML += `
        <div class="word-item">
          <span class="word-jp">${w.word}</span>
          <span class="word-reading">${w.reading}</span>
          <span class="word-kr">${w.meaning}</span>
        </div>`;
    });
  }

  // 카드 뒤집기 초기화 — 애니메이션 없이 즉시 앞면으로 (다음 카드 정답이 회전 중에 비치는 것 방지)
  const flashcard = document.getElementById("flashcard");
  if (flashcard.classList.contains("flipped")) {
    flashcard.style.transition = "none";
    flashcard.classList.remove("flipped");
    void flashcard.offsetWidth;        // 강제 reflow로 transition:none 적용
    flashcard.style.transition = "";
  }
  document.getElementById("rating-wrap").classList.remove("visible");

  // 예상 간격 표시
  updateIntervalHints(card);
}

function flipCard() {
  if (State.study.flipped) return;
  State.study.flipped = true;

  document.getElementById("flashcard").classList.add("flipped");
  document.getElementById("rating-wrap").classList.add("visible");
}

function fmtDays(d) {
  return d <= 1 ? "내일" : `${d}일`;
}

function updateIntervalHints(card) {
  // 백엔드(srs.py)가 계산해 내려준 예상 간격을 그대로 표시 → 항상 실제와 일치
  const h = card.hints || { again: 1, hard: 1, good: 1, easy: 4 };
  document.getElementById("interval-again").textContent = fmtDays(h.again);
  document.getElementById("interval-hard").textContent  = fmtDays(h.hard);
  document.getElementById("interval-good").textContent  = fmtDays(h.good);
  document.getElementById("interval-easy").textContent  = fmtDays(h.easy);
}

async function submitRating(answer) {
  const card = State.study.queue[State.study.index];
  State.study.sessionTotal++;
  if (answer === "good" || answer === "easy") State.study.sessionCorrect++;

  // API 호출
  apiFetch("/api/review", "POST", { card_id: card.id, answer });

  // 다음 카드로
  showCard(State.study.index + 1);
}

function showStudyComplete() {
  document.getElementById("flashcard-scene").style.display = "none";
  document.getElementById("rating-wrap").classList.remove("visible");
  document.getElementById("study-complete").style.display = "flex";
  document.getElementById("study-progress").style.width = "100%";

  const total   = State.study.sessionTotal;
  const correct = State.study.sessionCorrect;
  const pct     = total ? Math.round(correct / total * 100) : 0;

  document.getElementById("complete-total").textContent    = total;
  document.getElementById("complete-correct").textContent  = correct;
  document.getElementById("complete-accuracy").textContent = pct + "%";

  const subs = [
    "훌륭합니다! 매일 조금씩 쌓이는 게 실력이에요 💪",
    "오늘도 한자 하나 더 마스터! 🎌",
    "꾸준함이 최고의 무기예요! ⚡",
    "멋져요! 내일도 기다리고 있을게요 🌸",
  ];
  document.getElementById("complete-sub").textContent = subs[Math.floor(Math.random() * subs.length)];

  loadHome();
}

function endStudy() {
  showView("home");
}

// ══════════════════════════════════════════════════════════
//  단어장
// ══════════════════════════════════════════════════════════

const VOCAB_PER_PAGE = 60;

// 필터 이름 → /api/cards 쿼리 파라미터
function filterToQuery(filter) {
  if (filter === "kanji" || filter === "word" || filter === "grammar") return `type=${filter}`;
  if (["n5", "n4", "n3", "n2", "n1"].includes(filter)) return `level=${filter.toUpperCase()}`;
  if (filter === "state-new")      return "state=new";
  if (filter === "state-learning") return "state=learning";
  if (filter === "state-mastered") return "state=mastered";
  return "";
}

async function loadVocab(reset = true) {
  const v = State.vocab;
  if (v.loading || (!reset && v.done)) return;
  v.loading = true;

  if (reset) {
    v.page = 1; v.done = false; v.cards = []; v.search = "";
    document.getElementById("card-list").innerHTML = '<div class="spinner"></div>';
  }

  const q = filterToQuery(v.filter);
  const data = await apiFetch(`/api/cards?per_page=${VOCAB_PER_PAGE}&page=${v.page}${q ? "&" + q : ""}`);
  const cards = data.cards || [];
  v.cards.push(...cards);
  if (cards.length < VOCAB_PER_PAGE) v.done = true;
  v.page++;
  v.loading = false;
  renderCardList(v.cards, data.total);
}

function setFilter(filter) {
  State.vocab.filter = filter;
  document.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
  const chipMap = {
    "all": "chip-all", "kanji": "chip-kanji", "word": "chip-word", "grammar": "chip-grammar",
    "n5": "chip-n5", "n4": "chip-n4", "n3": "chip-n3", "n2": "chip-n2", "n1": "chip-n1",
    "state-new": "chip-new", "state-learning": "chip-learning", "state-mastered": "chip-mastered",
  };
  const el = document.getElementById(chipMap[filter]);
  if (el) el.classList.add("active");
  document.getElementById("search-input").value = "";
  loadVocab(true);
}

function renderCardList(cards, total) {
  const listEl = document.getElementById("card-list");
  State.vocab.cards = cards;

  if (cards.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <div class="empty-text">카드가 없어요</div>
        <div class="empty-sub">다른 필터를 선택해 보세요</div>
      </div>`;
    return;
  }

  const items = cards.map(card => {
    const frontCls = card.type === "kanji" ? "" : card.type === "grammar" ? "grammar-front" : "word-front";
    return `
      <div class="card-list-item" onclick="openCardDetail(${card.id})">
        <div class="card-list-kanji ${frontCls}">${escapeHtml(card.front)}</div>
        <div class="card-list-info">
          <div class="card-list-meaning">${escapeHtml(card.back_meaning)}</div>
          <div class="card-list-reading">${escapeHtml(card.back_reading || "")}</div>
        </div>
        <div class="card-state-dot ${card.state}"></div>
      </div>`;
  }).join("");

  const footer = State.vocab.done
    ? (total ? `<div class="list-footer">전체 ${total}개${State.vocab.search ? " (검색)" : ""}</div>` : "")
    : `<div class="list-footer">불러오는 중…</div>`;
  listEl.innerHTML = items + footer;
}

// 무한 스크롤 — 바닥 근처에서 다음 페이지 로드
function onVocabScroll(e) {
  if (State.vocab.search) return;        // 검색 결과는 페이지네이션 없음
  const el = e.target;
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) loadVocab(false);
}

let searchTimer;
function onSearch(query) {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    if (!query.trim()) { loadVocab(true); return; }
    State.vocab.search = query;
    State.vocab.done = true;
    const data = await apiFetch(`/api/search?q=${encodeURIComponent(query)}`);
    renderCardList(data.results || [], (data.results || []).length);
  }, 300);
}

function openCardDetail(id) {
  const card = (State.vocab.cards || []).find(c => c.id === id);
  if (!card) return;
  if (card.type === "grammar") {
    showToast(`${card.front} — ${card.back_meaning}`);
    return;
  }
  openWriting([card], 0);   // 단어장에서 누르면 쓰기 연습
}

// ══════════════════════════════════════════════════════════
//  통계
// ══════════════════════════════════════════════════════════

async function loadStats() {
  const stats = await apiFetch("/api/stats");

  document.getElementById("s-total").textContent     = stats.total_cards;
  document.getElementById("s-mastered").textContent  = stats.mastered;
  document.getElementById("s-today-done").textContent = stats.today_reviewed;
  document.getElementById("s-accuracy").textContent  = stats.today_accuracy + "%";

  renderHeatmap(stats.heatmap);
  renderWeakCards(stats.weak_cards);
}

function renderHeatmap(data) {
  const grid = document.getElementById("heatmap-grid");

  // 날짜 → 카운트 맵
  const countMap = {};
  let maxCount = 1;
  data.forEach(d => {
    countMap[d.date] = d.count;
    if (d.count > maxCount) maxCount = d.count;
  });

  // 오늘 기준 53주 (371일) 거슬러 올라가기
  const today = new Date();
  const cells = [];
  for (let i = 364; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().split("T")[0];
    const count = countMap[key] || 0;
    let level = 0;
    if (count > 0) level = count <= maxCount * 0.25 ? 1 : count <= maxCount * 0.5 ? 2 : count <= maxCount * 0.75 ? 3 : 4;
    cells.push(`<div class="heatmap-cell level-${level}" title="${key}: ${count}회"></div>`);
  }

  grid.innerHTML = cells.join("");
}

function renderWeakCards(cards) {
  const el = document.getElementById("weak-cards-list");
  if (!cards.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">🎉</div><div class="empty-text">취약 카드가 없어요!</div></div>';
    return;
  }

  el.innerHTML = cards.map(c => {
    const pct = Math.round(c.accuracy * 100);
    const cls = pct < 50 ? "low" : "mid";
    return `
      <div class="weak-card-item">
        <div class="weak-card-front">${c.front}</div>
        <div class="weak-card-info">
          <div class="weak-card-meaning">${c.back_meaning}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${c.total_reviews}회 복습</div>
        </div>
        <div class="accuracy-badge ${cls}">${pct}%</div>
      </div>`;
  }).join("");
}

// ══════════════════════════════════════════════════════════
//  가사 분석기
// ══════════════════════════════════════════════════════════

async function analyzeLyrics() {
  const text = document.getElementById("lyrics-input").value.trim();
  if (!text) {
    showToast("가사를 입력해 주세요!");
    return;
  }

  const resultsEl = document.getElementById("lyrics-results");
  resultsEl.innerHTML = '<div class="spinner"></div>';

  const data = await apiFetch("/api/lyrics/analyze", "POST", { text });

  if (!data.found) {
    State.lyrics.foundIds = [];
    resultsEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <div class="empty-text">인식된 한자가 없어요</div>
        <div class="empty-sub">학습 DB에 등록된 한자가 가사에 없네요${data.not_in_db ? ` (미등록 ${data.not_in_db}자)` : ""}</div>
      </div>`;
    return;
  }

  // 가사 퀴즈 / 쓰기 연습에 쓸 카드 보관
  State.lyrics.foundIds = data.kanji.map(k => k.id);
  State.lyrics.foundCards = data.kanji;

  resultsEl.innerHTML = `
    <div class="result-summary">가사에서 <b style="color:var(--indigo)">${data.found}개</b>의 한자를 찾았어요!</div>
    <div class="lyrics-actions">
      <button class="action-btn" onclick="startLyricsQuiz()"><span class="action-emoji">🎯</span><span>이 한자로 퀴즈</span></button>
      <button class="action-btn" onclick="openWriting(State.lyrics.foundCards, 0)"><span class="action-emoji">✍️</span><span>쓰기 연습</span></button>
    </div>
    <div class="result-kanji-grid">
      ${data.kanji.map((k, i) => `
        <div class="result-kanji-card" onclick="openWriting(State.lyrics.foundCards, ${i})">
          <div class="result-kanji-char">${k.front}</div>
          <div class="result-kanji-meaning">${k.back_meaning}</div>
          <div class="result-kanji-state ${k.state}"></div>
        </div>`).join("")}
    </div>`;
}

// ══════════════════════════════════════════════════════════
//  설정
// ══════════════════════════════════════════════════════════

async function loadSettings() {
  const data = await apiFetch("/api/settings");
  State.settings = data;
}

async function loadSettingsUI() {
  await loadSettings();
  const s = State.settings;

  document.getElementById("setting-new-cards").textContent = s.daily_new_cards || 10;

  // 학습 모드 세그먼트
  const mode = s.study_mode || "both";
  document.querySelectorAll(".seg-btn").forEach(b => b.classList.remove("active"));
  const modeMap = { both: "seg-both", kanji_only: "seg-kanji", word_only: "seg-word", grammar_only: "seg-grammar" };
  const el = document.getElementById(modeMap[mode]);
  if (el) el.classList.add("active");

  // 발음 표시 토글
  document.getElementById("setting-show-reading").checked =
    (s.show_reading_on_front === "1");

  // 셔플 토글 복원
  document.getElementById("setting-shuffle-study").checked =
    (s.shuffle_study === "1");

  // JLPT 등급 활성화 복원
  const levels = (s.active_levels || "N5,N4").split(",").map(x => x.trim()).filter(Boolean);
  document.querySelectorAll("#settings-levels-wrap .select-chip").forEach(chip => {
    const val = chip.id.replace("setting-level-", "");
    if (levels.includes(val)) {
      chip.classList.add("active");
    } else {
      chip.classList.remove("active");
    }
  });

  // 카테고리 칩 동적 생성 + 활성화 복원 (데이터의 실제 카테고리 사용)
  const activeCats = (s.active_categories || "").split(",").map(x => x.trim()).filter(Boolean);
  const catData = await apiFetch("/api/categories");
  const allCats = catData.categories || [];
  const wrap = document.getElementById("settings-categories-wrap");
  wrap.innerHTML = allCats.map(cat => {
    const on = activeCats.length === 0 || activeCats.includes(cat);
    return `<button class="select-chip${on ? " active" : ""}" id="setting-category-${cat}" onclick="toggleSettingCategory('${cat}')">${cat}</button>`;
  }).join("");
  if (activeCats.length === 0) State.settings.active_categories = allCats.join(",");

  // 漢検 급수 칩 동적 생성 + 활성화 복원
  const activeKK = (s.active_kanken || "").split(",").map(x => x.trim()).filter(Boolean);
  const kkData = await apiFetch("/api/kanken");
  const allKK = kkData.grades || [];
  const kkWrap = document.getElementById("settings-kanken-wrap");
  kkWrap.innerHTML = allKK.map(g => {
    const on = activeKK.includes(g);
    return `<button class="select-chip${on ? " active" : ""}" id="setting-kanken-${g}" onclick="toggleSettingKanken('${g}')">${g}</button>`;
  }).join("");

  // 총 카드
  document.getElementById("info-total-cards").textContent =
    document.getElementById("s-total")?.textContent || "—";
}

function changeNewCards(delta) {
  const el = document.getElementById("setting-new-cards");
  const cur = parseInt(el.textContent) || 10;
  const next = Math.max(1, Math.min(50, cur + delta));
  el.textContent = next;
  State.settings.daily_new_cards = String(next);
}

function setStudyMode(mode) {
  State.settings.study_mode = mode;
  document.querySelectorAll(".seg-btn").forEach(b => b.classList.remove("active"));
  const modeMap = { both: "seg-both", kanji_only: "seg-kanji", word_only: "seg-word", grammar_only: "seg-grammar" };
  const el = document.getElementById(modeMap[mode]);
  if (el) el.classList.add("active");
}

function toggleShowReading(checked) {
  State.settings.show_reading_on_front = checked ? "1" : "0";
}

function toggleShuffleStudy(checked) {
  State.settings.shuffle_study = checked ? "1" : "0";
}

function toggleSettingLevel(level) {
  let levels = (State.settings.active_levels || "N5,N4").split(",").map(x => x.trim()).filter(Boolean);
  const chip = document.getElementById(`setting-level-${level}`);
  if (levels.includes(level)) {
    if (levels.length <= 1) {
      showToast("⚠️ 최소한 하나 이상의 등급은 활성화해야 해요!");
      return;
    }
    levels = levels.filter(l => l !== level);
    chip.classList.remove("active");
  } else {
    levels.push(level);
    chip.classList.add("active");
  }
  State.settings.active_levels = levels.join(",");
}

function toggleSettingCategory(category) {
  let categories = (State.settings.active_categories || "").split(",").map(x => x.trim()).filter(Boolean);
  const chip = document.getElementById(`setting-category-${category}`);
  if (categories.includes(category)) {
    if (categories.length <= 1) {
      showToast("⚠️ 최소한 하나 이상의 카테고리는 활성화해야 해요!");
      return;
    }
    categories = categories.filter(c => c !== category);
    chip.classList.remove("active");
  } else {
    categories.push(category);
    chip.classList.add("active");
  }
  State.settings.active_categories = categories.join(",");
}

function toggleSettingKanken(grade) {
  let grades = (State.settings.active_kanken || "").split(",").map(x => x.trim()).filter(Boolean);
  const chip = document.getElementById(`setting-kanken-${grade}`);
  if (grades.includes(grade)) {
    if (grades.length <= 1) {
      showToast("⚠️ 최소한 하나 이상의 급수는 활성화해야 해요!");
      return;
    }
    grades = grades.filter(g => g !== grade);
    chip.classList.remove("active");
  } else {
    grades.push(grade);
    chip.classList.add("active");
  }
  State.settings.active_kanken = grades.join(",");
}

async function saveSettings() {
  await apiFetch("/api/settings", "POST", State.settings);
  showToast("✅ 설정이 저장되었어요!");
  loadHome();
}

// ══════════════════════════════════════════════════════════
//  한자 쓰기 연습
// ══════════════════════════════════════════════════════════

function openWriting(cards, index = 0) {
  if (!cards || cards.length === 0) {
    showToast("연습할 카드가 없어요");
    return;
  }
  State.writing.cards = cards;
  State.writing.index = index;

  document.getElementById("writing-overlay").classList.add("open");
  document.getElementById("writing-nav").style.display =
    cards.length > 1 ? "flex" : "none";

  // 캔버스는 오버레이가 보인 뒤 크기를 잡아야 정확함
  requestAnimationFrame(() => {
    if (!State.writing.canvas) {
      State.writing.canvas = new KanjiCanvas("writing-canvas");
    } else {
      State.writing.canvas.resize();
    }
    renderWritingCard();
  });
}

function renderWritingCard() {
  const w = State.writing;
  const card = w.cards[w.index];
  if (!card) return;

  document.getElementById("writing-meaning").textContent = card.back_meaning || card.front;
  document.getElementById("writing-reading").textContent = card.back_reading || "";
  document.getElementById("writing-count").textContent = `${w.index + 1} / ${w.cards.length}`;

  if (w.canvas) {
    w.canvas.showGuide = w.showGuide;
    w.canvas.showGrid = w.showGrid;
    w.canvas.setGuideKanji(card.front);
  }
}

function openWritingForCurrent() {
  const card = State.study.queue[State.study.index];
  if (card) openWriting([card], 0);
}

async function openWritingFromHome() {
  const data = await apiFetch("/api/cards?type=kanji&per_page=1000");
  const cards = (data.cards || []);
  if (!cards.length) { showToast("한자 카드를 불러오지 못했어요"); return; }
  openWriting(cards, 0);
}

function closeWriting() {
  document.getElementById("writing-overlay").classList.remove("open");
}

function clearWriting() {
  if (State.writing.canvas) State.writing.canvas.clear();
}

function toggleWriteGuide() {
  State.writing.showGuide = !State.writing.showGuide;
  if (State.writing.canvas) State.writing.canvas.toggleGuide(State.writing.showGuide);
  document.getElementById("wc-guide").textContent =
    State.writing.showGuide ? "가이드 끄기" : "가이드 켜기";
  document.getElementById("wc-guide").classList.toggle("off", !State.writing.showGuide);
}

function toggleWriteGrid() {
  State.writing.showGrid = !State.writing.showGrid;
  if (State.writing.canvas) State.writing.canvas.toggleGrid(State.writing.showGrid);
  document.getElementById("wc-grid").textContent =
    State.writing.showGrid ? "격자 끄기" : "격자 켜기";
  document.getElementById("wc-grid").classList.toggle("off", !State.writing.showGrid);
}

function writingNext() {
  const w = State.writing;
  w.index = (w.index + 1) % w.cards.length;
  renderWritingCard();
}

function writingPrev() {
  const w = State.writing;
  w.index = (w.index - 1 + w.cards.length) % w.cards.length;
  renderWritingCard();
}

// ══════════════════════════════════════════════════════════
//  랜덤 사지선다 퀴즈
// ══════════════════════════════════════════════════════════

function openQuizSetup() {
  document.getElementById("quiz-setup-overlay").classList.add("open");
}
function closeQuizSetup() {
  document.getElementById("quiz-setup-overlay").classList.remove("open");
}

function pickQuizLevel(btn, level) {
  State.quiz.level = level;
  document.querySelectorAll("#quiz-level-chips .select-chip").forEach(c => c.classList.remove("active"));
  btn.classList.add("active");
}
function pickQuizCount(btn, n) {
  State.quiz.count = n;
  document.querySelectorAll("#quiz-count-chips .select-chip").forEach(c => c.classList.remove("active"));
  btn.classList.add("active");
}

async function startQuizFromSetup() {
  closeQuizSetup();
  const q = State.quiz;
  let url = `/api/quiz?n=${q.count}`;
  if (q.level) url += `&level=${q.level}`;
  await launchQuiz(url, q.level ? `${q.level} 퀴즈` : "랜덤 퀴즈");
}

async function startLyricsQuiz() {
  const ids = State.lyrics.foundIds;
  if (!ids.length) { showToast("먼저 가사를 분석해 주세요"); return; }
  await launchQuiz(`/api/quiz?n=30&ids=${ids.join(",")}`, "가사 한자 퀴즈");
}

async function launchQuiz(url, label) {
  const data = await apiFetch(url);
  const questions = data.questions || [];
  if (questions.length === 0) {
    showToast("문제를 만들 카드가 부족해요");
    return;
  }
  State.quiz.questions = questions;
  State.quiz.index = 0;
  State.quiz.correct = 0;
  State.quiz.answered = false;

  document.getElementById("quiz-badge").textContent = label;
  document.getElementById("quiz-complete").style.display = "none";
  document.getElementById("quiz-body").style.display = "flex";

  showView("quiz");
  showQuizQuestion(0);
}

const DIRECTION_LABEL = {
  front2meaning: "뜻을 고르세요",
  meaning2front: "알맞은 한자/단어를 고르세요",
  front2reading: "읽는 법을 고르세요",
};

function showQuizQuestion(index) {
  const quiz = State.quiz;
  if (index >= quiz.questions.length) {
    showQuizComplete();
    return;
  }
  quiz.index = index;
  quiz.answered = false;

  // 이전 문제의 정답 공개 패널/다음 버튼 숨김
  document.getElementById("quiz-reveal").style.display = "none";
  document.getElementById("quiz-next-btn").style.display = "none";

  const q = quiz.questions[index];
  const total = quiz.questions.length;

  document.getElementById("quiz-progress").style.width = Math.round(index / total * 100) + "%";
  document.getElementById("quiz-progress-text").textContent = `${index + 1} / ${total}`;
  document.getElementById("quiz-score").textContent = quiz.correct;
  document.getElementById("quiz-direction").textContent = DIRECTION_LABEL[q.direction] || "";

  const promptEl = document.getElementById("quiz-prompt");
  promptEl.textContent = q.prompt;
  promptEl.classList.toggle("small", q.prompt.length > 6);

  const optsEl = document.getElementById("quiz-options");
  optsEl.innerHTML = q.options.map((opt, i) =>
    `<button class="quiz-option" onclick="answerQuiz(this, ${i})">${escapeHtml(opt)}</button>`
  ).join("");
}

function answerQuiz(btn, optionIndex) {
  const quiz = State.quiz;
  if (quiz.answered) return;
  quiz.answered = true;

  const q = quiz.questions[quiz.index];
  const isCorrect = q.options[optionIndex] === q.answer;
  if (isCorrect) quiz.correct++;

  document.querySelectorAll("#quiz-options .quiz-option").forEach((b, i) => {
    b.classList.add("disabled");
    if (q.options[i] === q.answer) b.classList.add("correct");
  });
  if (!isCorrect) btn.classList.add("wrong");

  document.getElementById("quiz-score").textContent = quiz.correct;

  // 정답·오답 모두 전체 정보(한자/단어 · 읽기 · 뜻)를 공개하고, 다음 버튼 노출
  showQuizReveal(q, isCorrect);
}

function showQuizReveal(q, isCorrect) {
  const info = q.info || {};
  const el = document.getElementById("quiz-reveal");
  el.className = `quiz-reveal ${isCorrect ? "ok" : "ng"}`;
  el.innerHTML = `
    <div class="reveal-mark">${isCorrect ? "⭕ 정답!" : "❌ 오답"}</div>
    <div class="reveal-front">${escapeHtml(info.front || q.prompt)}</div>
    ${info.reading ? `<div class="reveal-reading">${escapeHtml(info.reading)}</div>` : ""}
    ${info.meaning ? `<div class="reveal-meaning">${escapeHtml(info.meaning)}</div>` : ""}`;
  el.style.display = "block";

  const nb = document.getElementById("quiz-next-btn");
  nb.textContent = (State.quiz.index >= State.quiz.questions.length - 1) ? "결과 보기 →" : "다음 →";
  nb.style.display = "block";
}

function quizNext() {
  showQuizQuestion(State.quiz.index + 1);
}

function showQuizComplete() {
  document.getElementById("quiz-body").style.display = "none";
  document.getElementById("quiz-complete").style.display = "flex";
  document.getElementById("quiz-progress").style.width = "100%";

  const total = State.quiz.questions.length;
  const correct = State.quiz.correct;
  const pct = total ? Math.round(correct / total * 100) : 0;

  document.getElementById("quiz-total").textContent = total;
  document.getElementById("quiz-correct").textContent = correct;
  document.getElementById("quiz-accuracy").textContent = pct + "%";

  const subs = pct >= 80
    ? ["대단해요! 거의 다 맞췄어요 🏆", "실력이 쑥쑥! 🎉"]
    : pct >= 50
      ? ["좋아요! 조금만 더 🔥", "절반 이상 정답! 계속 가요 💪"]
      : ["괜찮아요, 반복이 답이에요 🌱", "틀린 건 내일 또 만나요!"];
  document.getElementById("quiz-complete-sub").textContent = subs[Math.floor(Math.random() * subs.length)];
}

function endQuiz() {
  showView("home");
  loadHome();
}

// ══════════════════════════════════════════════════════════
//  공통 유틸
// ══════════════════════════════════════════════════════════

async function apiFetch(path, method = "GET", body = null) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);

  try {
    const res = await fetch(API + path, opts);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.error(`API 오류 [${path}]:`, e);
    return {};
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

let toastTimer;
function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2500);
}

// 서비스 워커 — 보안 컨텍스트(HTTPS/localhost)에서만 등록됨.
// 일반 http://IP:8005 접속에서는 자동으로 건너뜀(설치형 홈화면 아이콘은 매니페스트로 동작).
if ("serviceWorker" in navigator && window.isSecureContext) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
