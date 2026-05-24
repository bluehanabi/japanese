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
    allCards: [],
    displayCards: [],
  },
  settings: {
    daily_new_cards: 10,
    study_mode: "both",
    show_reading_on_front: "0",
    shuffle_study: "1",
    active_levels: "N5,N4",
    active_categories: "자연,사람,행동,감정,일상,지식",
  },
};

// ══════════════════════════════════════════════════════════
//  초기화
// ══════════════════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", async () => {
  setGreeting();
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

  // 학습 중이면 내비 숨기기
  document.getElementById("nav").style.display =
    (name === "study") ? "none" : "flex";
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

    // 학습 시작 버튼
    const startBtn = document.getElementById("start-study-btn");
    if (today.total_due === 0) {
      startBtn.textContent = "✅ 오늘 학습 완료!";
      startBtn.disabled = true;
    } else {
      startBtn.innerHTML = `
        <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
          <path d="M5 3l14 9-14 9V3z" fill="white"/>
        </svg>
        지금 바로 학습 시작 (${today.total_due}개)`;
      startBtn.disabled = false;
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

async function startStudy() {
  showView("study");
  document.getElementById("study-complete").style.display = "none";
  document.getElementById("flashcard-scene").style.display = "block";
  document.getElementById("rating-wrap").style.display = "none";

  const data = await apiFetch("/api/today") || {};
  const review_cards = data.review_cards || [];
  const new_cards = data.new_cards || [];

  // 복습 카드 먼저, 그 다음 신규
  State.study.queue = [...review_cards, ...new_cards];
  State.study.index = 0;
  State.study.sessionCorrect = 0;
  State.study.sessionTotal = 0;

  if (State.study.queue.length === 0) {
    showStudyComplete();
    return;
  }

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

  // 카드 타입 배지
  const typeBadge = document.getElementById("study-type-badge");
  typeBadge.textContent = card.type === "kanji" ? "한자" : "단어";
  typeBadge.className = `card-type-badge ${card.type === "kanji" ? "badge-kanji" : "badge-word"}`;

  // 레벨 배지 (n5 ~ n1 동적 뱃지 색상 매핑)
  const levelBadge = document.getElementById("front-level-badge");
  levelBadge.textContent = card.jlpt_level;
  levelBadge.className = `card-type-badge badge-${card.jlpt_level.toLowerCase()}`;

  // 앞면 텍스트
  const frontText = document.getElementById("card-front-text");
  frontText.textContent = card.front;
  frontText.className = `card-main-text${card.type === "word" ? " word-text" : ""}`;

  // 뒷면 준비
  document.getElementById("card-back-kanji").textContent =
    card.type === "word" ? card.front : card.front;
  document.getElementById("card-back-meaning").textContent = card.back_meaning;
  document.getElementById("card-back-reading").textContent = card.back_reading;

  // 파생 단어 목록 (한자 카드만)
  const wordsEl = document.getElementById("card-back-words");
  wordsEl.innerHTML = "";
  if (card.type === "kanji" && card.extra_info && Array.isArray(card.extra_info)) {
    card.extra_info.forEach(w => {
      wordsEl.innerHTML += `
        <div class="word-item">
          <span class="word-jp">${w.word}</span>
          <span class="word-reading">${w.reading}</span>
          <span class="word-kr">${w.meaning}</span>
        </div>`;
    });
  }

  // 카드 뒤집기 초기화
  const flashcard = document.getElementById("flashcard");
  flashcard.classList.remove("flipped");
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

function updateIntervalHints(card) {
  const rep = card.repetitions || 0;
  const interval = card.interval || 0;
  const ef = card.ease_factor || 2.5;

  const hints = {
    again: "내일",
    hard:  "내일",
    good:  rep === 0 ? "1일" : rep === 1 ? "6일" : `${Math.round(interval * ef)}일`,
    easy:  rep === 0 ? "6일" : `${Math.round(interval * ef * 1.3)}일`,
  };

  document.getElementById("interval-again").textContent = hints.again;
  document.getElementById("interval-hard").textContent  = hints.hard;
  document.getElementById("interval-good").textContent  = hints.good;
  document.getElementById("interval-easy").textContent  = hints.easy;
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

async function loadVocab() {
  const listEl = document.getElementById("card-list");
  listEl.innerHTML = '<div class="spinner"></div>';

  const data = await apiFetch("/api/cards?per_page=500");
  State.vocab.allCards = data.cards;
  renderCardList(applyFilter(data.cards, State.vocab.filter));
}

function setFilter(filter) {
  State.vocab.filter = filter;

  // 칩 활성화
  document.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
  const chipMap = {
    "all":            "chip-all",
    "kanji":          "chip-kanji",
    "word":           "chip-word",
    "n5":             "chip-n5",
    "n4":             "chip-n4",
    "n3":             "chip-n3",
    "n2":             "chip-n2",
    "n1":             "chip-n1",
    "state-new":      "chip-new",
    "state-learning": "chip-learning",
    "state-mastered": "chip-mastered",
  };
  const el = document.getElementById(chipMap[filter]);
  if (el) el.classList.add("active");

  renderCardList(applyFilter(State.vocab.allCards, filter));
}

function applyFilter(cards, filter) {
  switch (filter) {
    case "kanji":          return cards.filter(c => c.type === "kanji");
    case "word":           return cards.filter(c => c.type === "word");
    case "n5":             return cards.filter(c => c.jlpt_level === "N5");
    case "n4":             return cards.filter(c => c.jlpt_level === "N4");
    case "n3":             return cards.filter(c => c.jlpt_level === "N3");
    case "n2":             return cards.filter(c => c.jlpt_level === "N2");
    case "n1":             return cards.filter(c => c.jlpt_level === "N1");
    case "state-new":      return cards.filter(c => c.state === "new");
    case "state-learning": return cards.filter(c => c.state === "learning");
    case "state-mastered": return cards.filter(c => c.state === "mastered");
    default:               return cards;
  }
}

function renderCardList(cards) {
  const listEl = document.getElementById("card-list");

  if (cards.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <div class="empty-text">카드가 없어요</div>
        <div class="empty-sub">다른 필터를 선택해 보세요</div>
      </div>`;
    return;
  }

  listEl.innerHTML = cards.map(card => {
    const isKanji = card.type === "kanji";
    return `
      <div class="card-list-item animate-in" onclick="openCardDetail(${card.id})">
        <div class="card-list-kanji ${isKanji ? "" : "word-front"}">${card.front}</div>
        <div class="card-list-info">
          <div class="card-list-meaning">${card.back_meaning}</div>
          <div class="card-list-reading">${card.back_reading}</div>
        </div>
        <div class="card-state-dot ${card.state}"></div>
      </div>`;
  }).join("");
}

let searchTimer;
function onSearch(query) {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    if (!query.trim()) {
      renderCardList(applyFilter(State.vocab.allCards, State.vocab.filter));
      return;
    }
    const data = await apiFetch(`/api/search?q=${encodeURIComponent(query)}`);
    renderCardList(data.results);
  }, 300);
}

function openCardDetail(id) {
  // 카드 상세 — 학습 시작
  // 추후 모달 구현 예정. 지금은 해당 카드를 즉시 학습 세션으로
  showToast("곧 카드 상세 기능이 추가될 예정이에요!");
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

  if (data.found === 0) {
    resultsEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <div class="empty-text">인식된 한자가 없어요</div>
        <div class="empty-sub">DB에 등록된 한자 ${data.not_in_db}개가 있지만 아직 학습 목록에 없어요</div>
      </div>`;
    return;
  }

  resultsEl.innerHTML = `
    <div class="result-summary">가사에서 <b style="color:var(--indigo)">${data.found}개</b>의 한자를 찾았어요!</div>
    <div class="result-kanji-grid">
      ${data.kanji.map(k => `
        <div class="result-kanji-card" onclick="showToast('${k.front}: ${k.back_meaning}')">
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
  const modeMap = { both: "seg-both", kanji_only: "seg-kanji", word_only: "seg-word" };
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

  // 카테고리 활성화 복원
  const categories = (s.active_categories || "자연,사람,행동,감정,일상,지식").split(",").map(x => x.trim()).filter(Boolean);
  document.querySelectorAll("#settings-categories-wrap .select-chip").forEach(chip => {
    const val = chip.id.replace("setting-category-", "");
    if (categories.includes(val)) {
      chip.classList.add("active");
    } else {
      chip.classList.remove("active");
    }
  });

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
  const modeMap = { both: "seg-both", kanji_only: "seg-kanji", word_only: "seg-word" };
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
  let categories = (State.settings.active_categories || "자연,사람,행동,감정,일상,지식").split(",").map(x => x.trim()).filter(Boolean);
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

async function saveSettings() {
  await apiFetch("/api/settings", "POST", State.settings);
  showToast("✅ 설정이 저장되었어요!");
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

let toastTimer;
function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2500);
}
