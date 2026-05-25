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
    hardFronts: [],     // 이번 세션에서 어려워한(몰랐음/힘들었어) 카드
  },
  vocab: {
    filter: "rec",
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
    mode: "trace",   // 'trace'(따라쓰기) / 'recall'(외워쓰기)
    srs: false,
    correct: 0,
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
    foundIds: [], foundCards: [], lastData: null, currentId: null,
  },
  sentence: {
    items: [], index: 0, direction: "jp2kr",
    target: [], answer: [], bank: [], answered: false, correct: 0,
  },
  listen: { items: [], idx: 0 },
  chat: { history: [], busy: false },
  settings: {
    daily_new_cards: 10,
    study_mode: "both",
    show_reading_on_front: "0",
    shuffle_study: "1",
    active_levels: "N5,N4",
    active_kanken: "10급,9급,8급,7급",
    active_categories: "한자,명사,동사,형용사,부사,기타,문법",
    gemini_api_key: "",
  },
};

// ══════════════════════════════════════════════════════════
//  초기화
// ══════════════════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", async () => {
  setGreeting();
  document.getElementById("vocab-view").addEventListener("scroll", onVocabScroll);
  loadReadingFreq();
  loadConjugation();
  flushReviewOutbox();                                  // 오프라인 중 쌓인 평가 동기화
  window.addEventListener("online", flushReviewOutbox); // 연결 복구 시 재동기화
  await loadHome();
  await loadSettings();

  // 마지막으로 보던 탭 복원 (앱을 껐다 켜도 그 탭 유지)
  const lastTab = localStorage.getItem("lastTab");
  if (lastTab && lastTab !== "home" &&
      ["vocab", "stats", "lyrics", "translate", "ai", "settings"].includes(lastTab)) {
    showView(lastTab);
  }
});

// 저장된 가사 목록 (서버) 불러와 오버레이 리스트로 표시 + 항목 배열 반환
async function loadSavedLyrics() {
  const wrap = document.getElementById("saved-lyrics-list");
  const data = await apiFetch("/api/lyrics/list");
  const items = data.items || [];
  wrap.innerHTML = items.length
    ? items.map(it => `
        <div class="saved-row">
          <button class="saved-row-open" onclick="openSavedLyric(${it.id})">📄 ${escapeHtml(it.title)}</button>
          <button class="saved-row-del" onclick="confirmDeleteLyric(${it.id})">🗑</button>
        </div>`).join("")
    : `<div style="color:var(--text-muted);font-size:13px;padding:24px;text-align:center">저장된 가사가 없어요.<br>아래 '새 가사 추가'로 만들어 보세요.</div>`;
  return items;
}

// 가사 탭 진입: 마지막에 보던 노래(없으면 가장 최근)를 불러온다
async function enterLyricsView() {
  const items = await loadSavedLyrics();
  if (!items.length) { newLyric(); return; }
  const lastId = parseInt(localStorage.getItem("lastLyricId") || "0", 10);
  const target = items.find(it => it.id === lastId) || items[0];
  openSavedLyric(target.id);
}

function openLyricsList() {
  loadSavedLyrics();
  document.getElementById("lyrics-list-overlay").classList.add("open");
}
function closeLyricsList() {
  document.getElementById("lyrics-list-overlay").classList.remove("open");
}

// 새 가사 입력 (빈 편집기)
function newLyric() {
  State.lyrics.currentId = null;
  State.lyrics.lastData = null;
  document.getElementById("lyrics-title").value = "";
  document.getElementById("lyrics-input").value = "";
  document.getElementById("lyrics-results").innerHTML = "";
  showLyricsEditor(true);
}
function confirmDeleteLyric(id) {
  if (confirm("이 가사를 삭제할까요?")) deleteSavedLyric(id);
}

// ── 한자 읽기 사용 비율 (음독/훈독, 정적 데이터) ──────────
var READING_FREQ = {};
async function loadReadingFreq() {
  try {
    const res = await fetch("/reading_freq.json", { cache: "force-cache" });
    READING_FREQ = await res.json();
  } catch (e) { READING_FREQ = {}; }
}

// 한자 한 글자의 읽기 비율 HTML (데이터 없으면 "")
function readingFreqHtml(front) {
  const rows = READING_FREQ[front];
  if (!rows || !rows.length) return "";
  const body = rows.map(x => `
    <div class="rf-row">
      <span class="rf-type ${x.t === "음" ? "on" : "kun"}">${x.t}</span>
      <span class="rf-read">${escapeHtml(x.r)}</span>
      <span class="rf-barwrap"><span class="rf-bar" style="width:${x.p}%"></span></span>
      <span class="rf-pct">${x.p}%</span>
    </div>`).join("");
  return `<div class="rf-wrap"><div class="rf-title">읽기 사용 비율 <span>(대략)</span></div>${body}</div>`;
}

// 쓰기 연습용 한 줄: "(음) セイ 43% · (훈) い（きる） 14% · …" (빈도순, 5%↑만)
function readingFreqLine(front) {
  const rows = READING_FREQ[front];
  if (!rows || !rows.length) return "";
  return rows.slice().sort((a, b) => b.p - a.p)
    .map(x => `(${x.t}) ${x.r} ${x.p}%`).join("  ·  ");
}

// 가사 입력/추출 영역(편집기) 표시 토글
function showLyricsEditor(show) {
  document.getElementById("lyrics-editor").style.display = show ? "" : "none";
}

async function openSavedLyric(id) {
  const it = await apiFetch(`/api/lyrics/item/${id}`);
  if (it.error) { showToast("불러오기 실패"); return; }
  State.lyrics.currentId = it.id;
  localStorage.setItem("lastLyricId", it.id);   // 다음 진입 때 이 노래 복원
  closeLyricsList();                            // 목록에서 열었으면 닫기
  document.getElementById("lyrics-title").value = it.title || "";
  document.getElementById("lyrics-input").value = it.text || "";
  showLyricsEditor(false);   // 저장된 가사는 연습 모드로
  const results = document.getElementById("lyrics-results");

  // 이미 추출된 데이터가 있으면 바로 연습 버튼
  if (it.data && it.data.found) {
    State.lyrics.lastData = it.data;
    renderLyricsResults(it.data);
    return;
  }
  // 추출 데이터가 없으면 저장된 가사로 즉시 자동 추출
  if (it.text) {
    results.innerHTML = '<div class="spinner"></div>';
    const data = await apiFetch("/api/lyrics/analyze", "POST", { text: it.text });
    if (data && data.found) {
      State.lyrics.lastData = data;
      renderLyricsResults(data);
      // 결과를 저장본에 백필 → 다음부턴 즉시 표시
      apiFetch("/api/lyrics/save", "POST", { id: it.id, title: it.title || "제목 없음", text: it.text, data });
      return;
    }
  }
  // 추출 결과가 없으면 편집기에서 직접
  showLyricsEditor(true);
  results.innerHTML = "";
}

// 저장된 가사 보기에서 '수정' → 편집기를 다시 펼친다 (연습 버튼은 유지)
function editLyric() {
  showLyricsEditor(true);
  if (State.lyrics.lastData) renderLyricsResults(State.lyrics.lastData);
  document.getElementById("lyrics-input").scrollIntoView({ behavior: "smooth", block: "center" });
}

async function deleteSavedLyric(id) {
  await apiFetch(`/api/lyrics/delete/${id}`, "POST", {});
  if (State.lyrics.currentId === id) newLyric();   // 현재 보던 걸 지우면 새 입력으로
  loadSavedLyrics();   // 목록 갱신 (오버레이 유지)
}

async function saveLyrics() {
  const title = document.getElementById("lyrics-title").value.trim() || "제목 없음";
  const text = document.getElementById("lyrics-input").value.trim();
  if (!text) { showToast("가사를 입력해 주세요"); return; }
  const res = await apiFetch("/api/lyrics/save", "POST",
    { id: State.lyrics.currentId || null, title, text, data: State.lyrics.lastData || null });
  if (res.id) { State.lyrics.currentId = res.id; localStorage.setItem("lastLyricId", res.id); showToast("💾 저장됐어요"); loadSavedLyrics(); }
}

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

  // 메인 탭이면 마지막 탭으로 기억 (앱 재실행/새로고침 시 복원)
  if (["home", "vocab", "stats", "lyrics", "translate", "ai", "settings"].includes(name)) {
    localStorage.setItem("lastTab", name);
  }

  // 뷰별 데이터 로드
  if (name === "vocab")    loadVocab();
  if (name === "stats")    loadStats();
  if (name === "settings") loadSettingsUI();
  if (name === "lyrics")   enterLyricsView();

  // 학습/퀴즈 중이면 내비 숨기기
  document.getElementById("nav").style.display =
    (["study", "quiz", "sentence", "ai-chat", "conj", "listen"].includes(name)) ? "none" : "flex";
}

// 안드로이드 뒤로(제스처/버튼) → 앱 내비게이션과 연결 (네이티브에서 호출)
function appBack() {
  // 1) 열린 오버레이부터 닫기
  for (const id of ["card-detail-overlay", "translate-history-overlay", "lyrics-list-overlay", "ai-tool-overlay", "ai-overlay", "writing-overlay", "quiz-setup-overlay"]) {
    const el = document.getElementById(id);
    if (el && el.classList.contains("open")) { el.classList.remove("open"); return "handled"; }
  }
  // 2) 홈이 아니면 홈으로
  if (State.currentView && State.currentView !== "home") {
    showView("home");
    loadHome();
    return "handled";
  }
  return "exit";   // 홈이면 앱을 백그라운드로
}
window.appBack = appBack;

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

    // 통합 학습 버튼 (오늘 목표를 끝내면 '추가 학습'으로 전환)
    const startBtn = document.getElementById("start-study-btn");
    startBtn.disabled = false;
    if (today.total_due === 0) {
      startBtn.innerHTML = `🔄 추가 학습하기 <span style="opacity:.7;font-weight:500">(오늘 목표 완료 ✅)</span>`;
      startBtn.onclick = () => startUnified(true);
    } else {
      startBtn.innerHTML = `
        <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
          <path d="M5 3l14 9-14 9V3z" fill="white"/>
        </svg>
        학습하기 (${today.total_due}개)`;
      startBtn.onclick = () => startUnified(false);
    }

    // 상태 분포 바 — 선택한 범위(레벨·급수·종류) 기준
    const nNew = stats.scope_new ?? stats.new;
    const nLearning = stats.scope_learning ?? stats.learning;
    const nMastered = stats.scope_mastered ?? stats.mastered;

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

// ── 오프라인 복원력: 서버가 잠깐 죽어도 저장된 카드로 학습, 평가는 큐에 모아 복구 시 동기화 ──
function _ok(res) { return res && Object.keys(res).length > 0; }

async function fetchTodayQueue(extra) {
  const data = await apiFetch("/api/today" + (extra ? "?extra=1" : "")) || {};
  if (data.review_cards || data.new_cards) {
    try { localStorage.setItem("todayCache", JSON.stringify(data)); } catch (e) {}
    return data;
  }
  // 서버 불가 → 마지막으로 저장된 카드로 학습
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem("todayCache") || "null"); } catch (e) {}
  if (cached && (cached.review_cards || cached.new_cards)) {
    showToast("오프라인: 저장된 카드로 학습합니다 📦");
    return cached;
  }
  return data;
}

function queueReview(card_id, answer) {
  let q = [];
  try { q = JSON.parse(localStorage.getItem("reviewOutbox") || "[]"); } catch (e) {}
  q.push({ card_id, answer });
  try { localStorage.setItem("reviewOutbox", JSON.stringify(q)); } catch (e) {}
}

async function flushReviewOutbox() {
  let q = [];
  try { q = JSON.parse(localStorage.getItem("reviewOutbox") || "[]"); } catch (e) { return; }
  if (!q.length) return;
  const remain = [];
  for (const it of q) {
    const res = await apiFetch("/api/review", "POST", it);
    if (!_ok(res)) remain.push(it);
  }
  try { localStorage.setItem("reviewOutbox", JSON.stringify(remain)); } catch (e) {}
  if (remain.length === 0) showToast(`오프라인 학습 ${q.length}건 동기화됐어요 ✅`);
}

async function startStudy(extra = false) {
  let data = await fetchTodayQueue(extra);
  let queue = [...(data.review_cards || []), ...(data.new_cards || [])];
  // 오늘치를 끝냈으면 자동으로 추가 학습으로 전환
  if (queue.length === 0 && !extra) {
    extra = true;
    data = await fetchTodayQueue(true);
    queue = [...(data.review_cards || []), ...(data.new_cards || [])];
  }
  if (queue.length === 0) {
    showToast("더 학습할 카드가 없어요 🎉");
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
  State.study.unified = false;
  State.study.index = 0;
  State.study.sessionCorrect = 0;
  State.study.sessionTotal = 0;
  State.study.hardFronts = [];

  showCard(0);
}

// 통합 학습 — 카드마다 플래시카드/사지선다를 자동으로 섞어 연속 출제
async function startUnified(extra = false) {
  let data = await fetchTodayQueue(extra);
  let queue = [...(data.review_cards || []), ...(data.new_cards || [])];
  if (queue.length === 0 && !extra) {
    extra = true;
    data = await fetchTodayQueue(true);
    queue = [...(data.review_cards || []), ...(data.new_cards || [])];
  }
  if (queue.length === 0) {
    showToast("더 학습할 카드가 없어요 🎉");
    return;
  }
  showView("study");
  document.getElementById("study-complete").style.display = "none";
  State.study.queue = queue;
  State.study.extra = extra;
  State.study.unified = true;
  State.study.index = 0;
  State.study.sessionCorrect = 0;
  State.study.sessionTotal = 0;
  State.study.hardFronts = [];
  showUnifiedStep(0);
}

function studyNext() {
  if (State.study.unified) showUnifiedStep(State.study.index + 1);
  else showCard(State.study.index + 1);
}

function showUnifiedStep(i) {
  const q = State.study.queue;
  if (i >= q.length) { showStudyComplete(); return; }
  // 보기가 충분하면 50% 확률로 사지선다, 아니면 플래시카드
  const fmt = (q.length >= 4 && Math.random() < 0.5) ? "choice" : "flash";
  if (fmt === "flash") {
    document.getElementById("uni-choice").style.display = "none";
    document.getElementById("flashcard-scene").style.display = "block";
    showCard(i);
  } else {
    showUniChoice(i);
  }
}

const TYPE_LABEL_U = { kanji: "한자", word: "단어", grammar: "문법" };

function showUniChoice(i) {
  const q = State.study.queue;
  const card = q[i];
  State.study.index = i;

  document.getElementById("study-progress").style.width = Math.round(i / q.length * 100) + "%";
  document.getElementById("study-progress-text").textContent = `${i} / ${q.length}`;
  const tb = document.getElementById("study-type-badge");
  tb.textContent = TYPE_LABEL_U[card.type] || "단어";
  tb.className = `card-type-badge badge-${card.type}`;

  document.getElementById("flashcard-scene").style.display = "none";
  document.getElementById("rating-wrap").classList.remove("visible");
  document.getElementById("uni-choice").style.display = "flex";

  const dir = Math.random() < 0.5 ? "f2m" : "m2f";
  let prompt, answer, pool, dirLabel;
  if (dir === "f2m") {
    prompt = card.front; answer = card.back_meaning;
    pool = q.map(c => c.back_meaning); dirLabel = "뜻을 고르세요";
  } else {
    prompt = card.back_meaning; answer = card.front;
    pool = q.map(c => c.front); dirLabel = "알맞은 한자/단어를 고르세요";
  }
  document.getElementById("uni-choice-dir").textContent = dirLabel;
  const promptEl = document.getElementById("uni-choice-prompt");
  promptEl.textContent = prompt;
  promptEl.classList.toggle("small", prompt.length > 6);

  const distract = [...new Set(pool.filter(x => x && x !== answer))];
  shuffleArr(distract);
  const opts = shuffleArr([answer, ...distract.slice(0, 3)]);
  State.study.uniOpts = opts;
  State.study.uniAnswer = answer;
  State.study.uniAnswered = false;
  document.getElementById("uni-choice-options").innerHTML = opts.map((o, idx) =>
    `<button class="quiz-option" onclick="answerUniChoice(this, ${idx})">${escapeHtml(o)}</button>`).join("");
}

function answerUniChoice(btn, idx) {
  if (State.study.uniAnswered) return;
  State.study.uniAnswered = true;
  const card = State.study.queue[State.study.index];
  const correct = State.study.uniOpts[idx] === State.study.uniAnswer;

  document.querySelectorAll("#uni-choice-options .quiz-option").forEach((b, j) => {
    b.classList.add("disabled");
    if (State.study.uniOpts[j] === State.study.uniAnswer) b.classList.add("correct");
  });
  if (!correct) btn.classList.add("wrong");

  const answer = correct ? "good" : "again";
  State.study.sessionTotal++;
  if (correct) State.study.sessionCorrect++; else State.study.hardFronts.push(card.front);
  apiFetch("/api/review", "POST", { card_id: card.id, answer });
  speak(cardTTSText(card));
  setTimeout(() => showUnifiedStep(State.study.index + 1), correct ? 750 : 1400);
}

function showCard(index) {
  const queue = State.study.queue;
  if (index >= queue.length) {
    showStudyComplete();
    return;
  }

  // 통합 학습의 사지선다 패널 숨기고 플래시카드 표시
  document.getElementById("uni-choice").style.display = "none";
  document.getElementById("flashcard-scene").style.display = "block";

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
  speakCurrentCard();   // 카드를 뒤집으면 발음 자동 재생
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
  else State.study.hardFronts.push(card.front);   // 몰랐음/힘들었어 → 약점 기록

  // API 호출 (실패하면 오프라인 큐에 저장 → 복구 시 자동 동기화)
  apiFetch("/api/review", "POST", { card_id: card.id, answer })
    .then(res => { if (!_ok(res)) queueReview(card.id, answer); });

  // 다음 (통합이면 형식 섞어서, 아니면 다음 카드)
  studyNext();
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
  saveSessionDigest(total, correct);   // 세션 종료 → 백데이터 저장 + AI 요약
}

// 세션 종료 시: 기록 저장 + AI 요약 (백데이터)
async function saveSessionDigest(total, correct) {
  const aiEl = document.getElementById("complete-ai");
  aiEl.style.display = "none";
  if (total === 0) return;

  // 다음 '문장 연습'이 즉시 뜨도록 백그라운드로 문장 미리 생성 (대기 안 함)
  apiFetch("/api/ai/pregenerate", "POST", {});

  const hasKey = !!(State.settings.gemini_api_key || "").trim();
  if (hasKey) {
    aiEl.style.display = "block";
    aiEl.innerHTML = '<div class="spinner"></div>';
  }
  const data = await apiFetch("/api/ai/session_summary", "POST", {
    studied: total, correct: correct,
    hard_fronts: State.study.hardFronts,
  });
  if (data.summary) {
    aiEl.style.display = "block";
    aiEl.innerHTML = `<div class="complete-ai-title">🤖 오늘의 AI 코치</div>
      <div class="complete-ai-text">${escapeHtml(data.summary).replace(/\n/g, "<br>")}</div>`;
  } else {
    aiEl.style.display = "none";   // 키 없거나 실패 시 조용히 숨김
  }
}

function endStudy() {
  showView("home");
}

// 홈 '학습 현황' 탭 → 단어장에서 여태 학습한 카드만 보여준다
function goStudied() {
  State.vocab.filter = "studied";
  showView("vocab");   // showView가 이 필터로 loadVocab 실행
  document.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
}

// ══════════════════════════════════════════════════════════
//  단어장
// ══════════════════════════════════════════════════════════

const VOCAB_PER_PAGE = 60;

// 필터 이름 → /api/cards 쿼리 파라미터
function filterToQuery(filter) {
  if (filter === "rec") return "personalized=1";   // 추천 = 학습한 것 중 약한 순
  if (filter === "all") return "scope=1";   // 전체 = 선택한 레벨/급수 범위
  if (filter === "kanji" || filter === "word" || filter === "grammar") return `type=${filter}`;
  if (["n5", "n4", "n3", "n2", "n1"].includes(filter)) return `level=${filter.toUpperCase()}`;
  if (filter === "state-new")      return "state=new";
  if (filter === "state-learning") return "state=learning";
  if (filter === "state-mastered") return "state=mastered";
  if (filter === "studied")        return "state=studied";   // 여태 학습한 것
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
    "rec": "chip-rec",
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

let cdCard = null;
function openCardDetail(id) {
  const card = (State.vocab.cards || []).find(c => c.id === id);
  if (!card) return;
  cdCard = card;
  document.getElementById("cd-front").textContent = card.front;
  document.getElementById("cd-sub").textContent =
    [card.back_reading, card.back_meaning].filter(Boolean).join("  ·  ");
  // 문법은 쓰기 연습 숨김
  document.getElementById("cd-write-btn").style.display = card.type === "grammar" ? "none" : "";
  // 한자면 읽기 사용 비율(음독/훈독) 표시
  document.getElementById("cd-freq").innerHTML = card.type === "kanji" ? readingFreqHtml(card.front) : "";
  document.getElementById("card-detail-overlay").classList.add("open");
  // AI 뜻 풀이·예문 (캐시 있으면 즉시, 없으면 생성하며 스트리밍)
  streamInto("/api/ai/explain", { card_id: card.id }, document.getElementById("cd-ai"));
}
function closeCardDetail() {
  document.getElementById("card-detail-overlay").classList.remove("open");
}
function cdSpeak() { if (cdCard) speak(cardTTSText(cdCard)); }
function cdWrite() { if (cdCard) { closeCardDetail(); openWriting([cdCard], 0); } }

// ══════════════════════════════════════════════════════════
//  통계
// ══════════════════════════════════════════════════════════

async function loadStats() {
  const stats = await apiFetch("/api/stats");

  // 선택한 범위 기준 (총 카드 절대값은 설정 화면에만 표시)
  document.getElementById("s-total").textContent     = stats.scope_total ?? stats.total_cards ?? 0;
  document.getElementById("s-mastered").textContent  = stats.scope_mastered ?? stats.mastered ?? 0;
  document.getElementById("s-today-done").textContent = stats.today_reviewed ?? 0;
  document.getElementById("s-accuracy").textContent  = (stats.today_accuracy ?? 0) + "%";

  renderHeatmap(stats.heatmap || []);
  renderWeakCards(stats.weak_cards || []);
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
    State.lyrics.foundIds = []; State.lyrics.foundCards = []; State.lyrics.lastData = null;
    resultsEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <div class="empty-text">인식된 한자가 없어요</div>
        <div class="empty-sub">학습 DB에 등록된 한자가 가사에 없네요${data.not_in_db ? ` (미등록 ${data.not_in_db}자)` : ""}</div>
      </div>`;
    return;
  }
  State.lyrics.lastData = data;
  renderLyricsResults(data);
}

function renderLyricsResults(data) {
  State.lyrics.foundIds = data.kanji.map(k => k.id);
  State.lyrics.foundCards = data.kanji;
  // 편집기가 숨겨진(저장된 가사 보기) 상태면 '수정' 버튼을 위에 보여준다
  const editorHidden = document.getElementById("lyrics-editor").style.display === "none";
  const editBtn = editorHidden
    ? `<button class="analyze-btn" style="margin:0 20px 12px;width:calc(100% - 40px)" onclick="editLyric()">✏️ 수정</button>` : "";
  document.getElementById("lyrics-results").innerHTML = editBtn + `
    <div class="result-summary">가사에서 <b style="color:var(--indigo)">${data.found}개</b>의 한자를 찾았어요!</div>
    <div class="lyrics-actions lyrics-actions-grid">
      <button class="action-btn" onclick="startLyricsQuiz()"><span class="action-emoji">🎯</span><span>퀴즈</span></button>
      <button class="action-btn" onclick="startLyricsCards()"><span class="action-emoji">🃏</span><span>카드 학습</span></button>
      <button class="action-btn" onclick="startLyricsSentences()"><span class="action-emoji">🧩</span><span>문장 연습</span></button>
      <button class="action-btn" onclick="openWriting(State.lyrics.foundCards, 0)"><span class="action-emoji">✍️</span><span>쓰기 연습</span></button>
    </div>
    <div class="result-kanji-grid">
      ${data.kanji.map((k, i) => `
        <div class="result-kanji-card" onclick="openWriting(State.lyrics.foundCards, ${i})">
          <div class="result-kanji-char">${escapeHtml(k.front)}</div>
          <div class="result-kanji-meaning">${escapeHtml(k.back_meaning)}</div>
          <div class="result-kanji-state ${k.state}"></div>
        </div>`).join("")}
    </div>`;

  // 한자 결과가 뜨는 즉시, '문장 연습'용 문장을 백그라운드로 미리 생성
  prefetchLyricsSentences();
}

// 가사 한자로 카드(플래시) 학습
function studyCards(cards) {
  if (!cards || !cards.length) { showToast("카드가 없어요"); return; }
  showView("study");
  document.getElementById("study-complete").style.display = "none";
  State.study.queue = cards;
  State.study.unified = false;
  State.study.extra = false;
  State.study.index = 0;
  State.study.sessionCorrect = 0;
  State.study.sessionTotal = 0;
  State.study.hardFronts = [];
  showCard(0);
}
function startLyricsCards() { studyCards(State.lyrics.foundCards || []); }

// 가사 한자로 문장을 백그라운드 미리 생성 (들어갈 때 기다림 없이 바로 시작되게)
function prefetchLyricsSentences() {
  const words = (State.lyrics.foundCards || []).map(c => c.front);
  if (!words.length) return;
  const key = words.join(",");
  if (State.lyrics.sentFor === key && State.lyrics.sentPromise) return;   // 이미 준비/준비중
  State.lyrics.sentFor = key;
  State.lyrics.sentPromise = (async () => {
    try {
      const data = await apiFetch("/api/ai/sentences", "POST", { words });
      return (data.sentences || []).filter(s => s.jp_tiles && s.kr_tiles);
    } catch (e) { return []; }
  })();
}

// 가사 한자로 문장 연습 (미리 생성된 문장이 있으면 즉시 시작)
async function startLyricsSentences() {
  const words = (State.lyrics.foundCards || []).map(c => c.front);
  if (!words.length) { showToast("먼저 가사를 분석해 주세요"); return; }
  const key = words.join(",");

  let items = null;
  if (State.lyrics.sentFor === key && State.lyrics.sentPromise) {
    items = await State.lyrics.sentPromise;   // 보통 이미 준비됨 (대기 없음)
  }
  if (!items || !items.length) {
    showToast("문장 만드는 중…");
    const data = await apiFetch("/api/ai/sentences", "POST", { words });
    items = (data.sentences || []).filter(s => s.jp_tiles && s.kr_tiles);
    if (!items.length) { showToast((data && data.error) || "문장을 만들지 못했어요"); return; }
  }

  State.sentence.items = items;
  State.sentence.index = 0;
  State.sentence.correct = 0;
  showView("sentence");
  document.getElementById("sent-complete").style.display = "none";
  document.getElementById("sent-body").style.display = "flex";
  showSentence(0);

  // 다음 판도 바로 시작되도록 미리 다시 생성
  State.lyrics.sentFor = null; State.lyrics.sentPromise = null;
  prefetchLyricsSentences();
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

  // 漢検 급수 칩 — 선택된 JLPT 등급에 해당하는 급수만 표시
  renderKankenChips(false);

  // Gemini API 키 복원
  const keyInput = document.getElementById("setting-gemini-key");
  if (keyInput) keyInput.value = s.gemini_api_key || "";

  // 총 카드(절대값)은 /api/stats 에서
  const st = await apiFetch("/api/stats");
  document.getElementById("info-total-cards").textContent = st.total_cards ?? "—";
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
  // 등급이 바뀌면 그에 맞는 漢検 급수만 다시 표시 (해당 급수 전체 선택)
  renderKankenChips(true);
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

// JLPT 등급 ↔ 漢検 급수 매핑 (난이도 근사)
const KANKEN_BY_JLPT = {
  "N5": ["10급", "9급"], "N4": ["8급", "7급"], "N3": ["6급", "5급"],
  "N2": ["4급", "3급"],  "N1": ["준2급", "2급"],
};
const KANKEN_ORDER = ["10급", "9급", "8급", "7급", "6급", "5급", "4급", "3급", "준2급", "2급"];

function allowedKanken() {
  const levels = (State.settings.active_levels || "").split(",").map(s => s.trim()).filter(Boolean);
  const set = new Set();
  levels.forEach(l => (KANKEN_BY_JLPT[l] || []).forEach(g => set.add(g)));
  return KANKEN_ORDER.filter(g => set.has(g));
}

// 선택된 JLPT 등급에 해당하는 漢検 급수만 칩으로 표시
// reset=true 면 (등급이 바뀐 경우) 해당 급수를 전부 선택
function renderKankenChips(reset) {
  const allowed = allowedKanken();
  let active = (State.settings.active_kanken || "").split(",").map(s => s.trim()).filter(Boolean);
  active = reset ? allowed.slice() : active.filter(g => allowed.includes(g));
  if (active.length === 0) active = allowed.slice();
  State.settings.active_kanken = active.join(",");

  const wrap = document.getElementById("settings-kanken-wrap");
  if (!wrap) return;
  wrap.innerHTML = allowed.map(g =>
    `<button class="select-chip${active.includes(g) ? " active" : ""}" id="setting-kanken-${g}" onclick="toggleSettingKanken('${g}')">${g}</button>`
  ).join("");
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

// 홈 '쓰기 연습' — 학습 범위 한자를 SRS 순서로 가져와 AI 채점 세션 시작
async function startWritingPractice() {
  const data = await apiFetch("/api/writing_cards");
  const cards = data.cards || [];
  if (!cards.length) { showToast("쓰기 연습할 한자가 없어요 (설정에서 한자 급수를 확인하세요)"); return; }
  openWriting(cards, 0, true);
}

function openWriting(cards, index = 0, srs = false) {
  if (!cards || cards.length === 0) { showToast("연습할 카드가 없어요"); return; }
  State.writing.cards = cards;
  State.writing.index = index;
  State.writing.srs = srs;
  State.writing.correct = 0;
  if (!State.writing.mode) State.writing.mode = "trace";

  document.getElementById("writing-overlay").classList.add("open");
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
  // 한자면 정리된 읽기(빈도순, 음/훈 표기)만, 데이터 없으면 원본
  document.getElementById("writing-reading").textContent =
    (card.type === "kanji" && readingFreqLine(card.front)) || card.back_reading || "";
  document.getElementById("writing-count").textContent =
    w.cards.length > 1 ? `${w.index + 1} / ${w.cards.length}` : "";

  // 결과/버튼 초기화
  document.getElementById("writing-result").style.display = "none";
  const btn = document.getElementById("writing-action");
  btn.disabled = false;
  btn.textContent = "🤖 AI 채점";
  btn.onclick = scoreWriting;

  // 모드 반영 (따라쓰기=가이드 보임 / 외워쓰기=가이드 숨김)
  w.showGuide = (w.mode === "trace");
  document.getElementById("wmode-trace").classList.toggle("active", w.mode === "trace");
  document.getElementById("wmode-recall").classList.toggle("active", w.mode === "recall");

  if (w.canvas) {
    w.canvas.showGuide = w.showGuide;
    w.canvas.showGrid = w.showGrid;
    w.canvas.setGuideKanji(card.front);   // clear + 가이드 다시 그림
  }
}

function setWriteMode(mode) {
  State.writing.mode = mode;
  const w = State.writing;
  w.showGuide = (mode === "trace");
  document.getElementById("wmode-trace").classList.toggle("active", mode === "trace");
  document.getElementById("wmode-recall").classList.toggle("active", mode === "recall");
  if (w.canvas) w.canvas.toggleGuide(w.showGuide);
}

async function scoreWriting() {
  const w = State.writing;
  const card = w.cards[w.index];
  if (!w.canvas || w.canvas.isEmpty()) { showToast("먼저 한자를 써주세요 ✍️"); return; }

  const btn = document.getElementById("writing-action");
  btn.disabled = true;
  btn.textContent = "채점 중…";
  const data = await apiFetch("/api/ai/score_writing", "POST",
    { card_id: card.id, image: w.canvas.exportInk(200) });
  btn.disabled = false;

  if (data.error) {
    btn.textContent = "🤖 다시 채점";
    showWritingResult({ error: data.error });
    return;
  }

  showWritingResult(data);
  speak(cardTTSText(card));   // 채점 후 발음 재생

  if (w.srs) {
    apiFetch("/api/review", "POST", { card_id: card.id, answer: data.rating });  // SRS 자동 반영
    if (data.rating === "good" || data.rating === "easy") w.correct++;
    btn.textContent = (w.index >= w.cards.length - 1) ? "완료" : "다음 →";
    btn.onclick = writingAdvance;
  } else {
    btn.textContent = "🤖 다시 채점";
    btn.onclick = scoreWriting;
  }
}

const RATING_LABEL = { again: "🔴 몰랐어요", hard: "🟠 힘들었어", good: "🟢 맞았어", easy: "💙 완벽해요" };

function showWritingResult(data) {
  const el = document.getElementById("writing-result");
  el.style.display = "block";
  if (data.error) {
    el.className = "writing-result ng";
    el.innerHTML = `<div class="wr-feedback">${escapeHtml(data.error)}</div>`;
    return;
  }
  const ok = data.rating === "good" || data.rating === "easy";
  el.className = `writing-result ${ok ? "ok" : "ng"}`;
  const card = State.writing.cards[State.writing.index];
  const freq = card && card.type === "kanji" ? readingFreqHtml(card.front) : "";
  el.innerHTML = `
    <div class="wr-head"><span class="wr-rating">${RATING_LABEL[data.rating] || ""}</span>
      <span class="wr-score">${data.score}점</span></div>
    <div class="wr-feedback">${escapeHtml(data.feedback || "")}</div>${freq}`;
}

function writingAdvance() {
  const w = State.writing;
  if (w.index >= w.cards.length - 1) {
    showToast(`쓰기 연습 완료! 정답 ${w.correct}/${w.cards.length} ✍️`);
    closeWriting();
    loadHome();
    return;
  }
  w.index++;
  renderWritingCard();
}

function openWritingForCurrent() {
  const card = State.study.queue[State.study.index];
  if (card) openWriting([card], 0, false);
}

function closeWriting() {
  document.getElementById("writing-overlay").classList.remove("open");
}

function clearWriting() {
  if (State.writing.canvas) State.writing.canvas.clear();
}

function toggleWriteGrid() {
  State.writing.showGrid = !State.writing.showGrid;
  if (State.writing.canvas) State.writing.canvas.toggleGrid(State.writing.showGrid);
  document.getElementById("wc-grid").textContent =
    State.writing.showGrid ? "격자 끄기" : "격자 켜기";
  document.getElementById("wc-grid").classList.toggle("off", !State.writing.showGrid);
}

// ══════════════════════════════════════════════════════════
//  랜덤 사지선다 퀴즈
// ══════════════════════════════════════════════════════════

function openQuizSetup() {
  // 지난번에 고른 등급·문제 수를 기본값으로 복원
  const lv = localStorage.getItem("quizLevel") || "";
  const cnt = parseInt(localStorage.getItem("quizCount") || "15", 10);
  State.quiz.level = lv;
  State.quiz.count = cnt;
  document.querySelectorAll("#quiz-level-chips .select-chip").forEach(c =>
    c.classList.toggle("active", (c.dataset.level || "") === lv));
  document.querySelectorAll("#quiz-count-chips .select-chip").forEach(c =>
    c.classList.toggle("active", parseInt(c.dataset.n, 10) === cnt));
  document.getElementById("quiz-setup-overlay").classList.add("open");
}
function closeQuizSetup() {
  document.getElementById("quiz-setup-overlay").classList.remove("open");
}

function pickQuizLevel(btn, level) {
  State.quiz.level = level;
  localStorage.setItem("quizLevel", level);
  document.querySelectorAll("#quiz-level-chips .select-chip").forEach(c => c.classList.remove("active"));
  btn.classList.add("active");
}
function pickQuizCount(btn, n) {
  State.quiz.count = n;
  localStorage.setItem("quizCount", n);
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
    ${info.meaning ? `<div class="reveal-meaning">${escapeHtml(info.meaning)}</div>` : ""}
    <button class="tts-btn" style="margin-top:10px" onclick="speakQuizReveal()">🔊 발음</button>`;
  el.style.display = "block";

  const nb = document.getElementById("quiz-next-btn");
  nb.textContent = (State.quiz.index >= State.quiz.questions.length - 1) ? "결과 보기 →" : "다음 →";
  nb.style.display = "block";

  speakQuizReveal();   // 정답 공개 시 일본어 발음 자동 재생
}

function quizNext() {
  showQuizQuestion(State.quiz.index + 1);
}

function speakQuizReveal() {
  const q = State.quiz.questions[State.quiz.index];
  if (!q) return;
  const info = q.info || {};
  const r = (info.reading || "").replace(/음독:|훈독:/g, "").replace(/\//g, " ").trim();
  speak(r || info.front);
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
//  문장 연습 (단어 타일 배열, 듀오링고식)
// ══════════════════════════════════════════════════════════

function shuffleArr(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function startSentencePractice() {
  const data = await apiFetch("/api/ai/sentences", "POST", {});
  if (data.error) { showToast(data.error); return; }
  const items = (data.sentences || []).filter(s => s.jp_tiles && s.kr_tiles);
  if (!items.length) { showToast("문장을 만들지 못했어요. 다시 시도해 주세요."); return; }

  State.sentence.items = items;
  State.sentence.index = 0;
  State.sentence.correct = 0;
  showView("sentence");
  document.getElementById("sent-complete").style.display = "none";
  document.getElementById("sent-body").style.display = "flex";
  showSentence(0);
}

function showSentence(i) {
  const S = State.sentence;
  if (i >= S.items.length) { showSentenceComplete(); return; }
  S.index = i;
  S.answered = false;

  const item = S.items[i];
  S.direction = Math.random() < 0.5 ? "jp2kr" : "kr2jp";
  if (S.direction === "jp2kr") {
    document.getElementById("sent-direction").textContent = "일본어 문장을 보고 한국어를 순서대로 배열하세요";
    document.getElementById("sent-prompt").textContent = item.jp;
    S.target = item.kr_tiles.slice();
  } else {
    document.getElementById("sent-direction").textContent = "한국어 문장을 보고 일본어를 순서대로 배열하세요";
    document.getElementById("sent-prompt").textContent = item.kr;
    S.target = item.jp_tiles.slice();
  }
  S.answer = [];
  S.bank = shuffleArr(S.target);

  document.getElementById("sent-progress").style.width = Math.round(i / S.items.length * 100) + "%";
  document.getElementById("sent-progress-text").textContent = `${i + 1} / ${S.items.length}`;
  document.getElementById("sent-result").style.display = "none";
  const checkBtn = document.getElementById("sent-check");
  checkBtn.textContent = "확인";
  checkBtn.disabled = false;
  checkBtn.onclick = checkSentence;
  renderSentence();
}

function renderSentence() {
  const S = State.sentence;
  document.getElementById("sent-answer").innerHTML = S.answer.map((t, i) =>
    `<button class="tile" onclick="unpickTile(${i})">${escapeHtml(t)}</button>`).join("")
    || '<span class="sent-placeholder">아래에서 단어를 순서대로 누르세요</span>';
  document.getElementById("sent-bank").innerHTML = S.bank.map((t, i) =>
    t === null ? "" : `<button class="tile" onclick="pickTile(${i})">${escapeHtml(t)}</button>`).join("");
}

function pickTile(i) {
  const S = State.sentence;
  if (S.answered || S.bank[i] === null) return;
  S.answer.push(S.bank[i]);
  S.bank[i] = null;          // 자리 비움(중복 단어 인덱스 유지)
  renderSentence();
}

function unpickTile(i) {
  const S = State.sentence;
  if (S.answered) return;
  const t = S.answer.splice(i, 1)[0];
  const empty = S.bank.indexOf(null);
  if (empty >= 0) S.bank[empty] = t; else S.bank.push(t);
  renderSentence();
}

function checkSentence() {
  const S = State.sentence;
  if (S.answered) return;
  S.answered = true;

  // 한 문제 풀 때마다 백그라운드로 문장 캐시 보충 → 다음 문장이 항상 미리 준비됨
  apiFetch("/api/ai/pregenerate", "POST", {});

  const isCorrect = S.answer.join("") === S.target.join("");
  if (isCorrect) S.correct++;

  const item = S.items[S.index];
  const resEl = document.getElementById("sent-result");
  resEl.style.display = "block";
  resEl.className = `sent-result ${isCorrect ? "ok" : "ng"}`;
  resEl.innerHTML = `
    <div class="sent-result-mark">${isCorrect ? "⭕ 정답!" : "❌ 다시 보기"}</div>
    <div class="sent-result-jp">${escapeHtml(item.jp)}</div>
    <div class="sent-result-kr">${escapeHtml(item.kr)}</div>`;

  speak(item.jp);   // 정답 완료 시 일본어 발음 자동 재생

  const checkBtn = document.getElementById("sent-check");
  checkBtn.textContent = (S.index >= S.items.length - 1) ? "결과 보기 →" : "다음 →";
  checkBtn.onclick = () => showSentence(S.index + 1);
}

function showSentenceComplete() {
  document.getElementById("sent-body").style.display = "none";
  document.getElementById("sent-complete").style.display = "flex";
  document.getElementById("sent-progress").style.width = "100%";
  const total = State.sentence.items.length;
  const correct = State.sentence.correct;
  document.getElementById("sent-total").textContent = total;
  document.getElementById("sent-correct").textContent = correct;
  document.getElementById("sent-accuracy").textContent =
    (total ? Math.round(correct / total * 100) : 0) + "%";
}

function endSentence() {
  showView("home");
  loadHome();
}

// ══════════════════════════════════════════════════════════
//  활용 연습 (동사·형용사 활용 — 규칙 기반, AI 불필요)
// ══════════════════════════════════════════════════════════
var CONJ = { verbs: [], adjs: [] };
async function loadConjugation() {
  try { CONJ = await (await fetch("/conjugation.json", { cache: "force-cache" })).json(); }
  catch (e) { CONJ = { verbs: [], adjs: [] }; }
}
const _U2I = { "う":"い","く":"き","ぐ":"ぎ","す":"し","つ":"ち","ぬ":"に","ぶ":"び","む":"み","る":"り" };
const _U2A = { "う":"わ","く":"か","ぐ":"が","す":"さ","つ":"た","ぬ":"な","ぶ":"ば","む":"ま","る":"ら" };
const _TE  = { "う":"って","く":"いて","ぐ":"いで","す":"して","つ":"って","ぬ":"んで","ぶ":"んで","む":"んで","る":"って" };
const _TA  = { "う":"った","く":"いた","ぐ":"いだ","す":"した","つ":"った","ぬ":"んだ","ぶ":"んだ","む":"んだ","る":"った" };
function conjVerb(w, type, form) {
  if (type === "ichidan") { const s = w.slice(0, -1); return s + { masu:"ます", te:"て", ta:"た", nai:"ない" }[form]; }
  if (type === "suru")    { const s = w.slice(0, -2); return s + { masu:"します", te:"して", ta:"した", nai:"しない" }[form]; }
  if (type === "kuru") {
    if (w === "くる") return { masu:"きます", te:"きて", ta:"きた", nai:"こない" }[form];
    const s = w.slice(0, -1); return s + { masu:"ます", te:"て", ta:"た", nai:"ない" }[form];   // 来る (한자)
  }
  const last = w.slice(-1), stem = w.slice(0, -1);   // godan
  if (form === "masu") return stem + _U2I[last] + "ます";
  if (form === "nai")  return stem + _U2A[last] + "ない";
  if (w === "行く" || w === "いく") return stem + (form === "te" ? "って" : "った");   // 예외
  return stem + (form === "te" ? _TE : _TA)[last];
}
function conjAdj(w, form) { const s = w.slice(0, -1); return s + { ta:"かった", nai:"くない", te:"くて" }[form]; }
const VERB_FORMS = [["masu","ます형 (정중)"], ["te","て형"], ["ta","た형 (과거)"], ["nai","ない형 (부정)"]];
const ADJ_FORMS  = [["ta","과거 (~かった)"], ["nai","부정 (~くない)"], ["te","て형 (~くて)"]];

function startConjugation() {
  const verbs = CONJ.verbs || [], adjs = CONJ.adjs || [];
  if (!verbs.length) { showToast("데이터 불러오는 중… 잠시 후 다시"); loadConjugation(); return; }
  const all = [...verbs.map(v => ({ v, kind: "verb" })), ...adjs.map(a => ({ v: a, kind: "adj" }))];
  const picks = shuffleArr(all).slice(0, 10);
  State.conj = {
    index: 0, correct: 0,
    items: picks.map(p => {
      const forms = p.kind === "verb" ? VERB_FORMS : ADJ_FORMS;
      const [f, label] = forms[Math.floor(Math.random() * forms.length)];
      const ansK = p.kind === "verb" ? conjVerb(p.v.d, p.v.t, f) : conjAdj(p.v.d, f);
      const ansR = p.kind === "verb" ? conjVerb(p.v.r, p.v.t, f) : conjAdj(p.v.r, f);
      return { word: p.v.d, reading: p.v.r, meaning: p.v.m, label, ansK, ansR };
    }),
  };
  showView("conj");
  document.getElementById("conj-complete").style.display = "none";
  document.getElementById("conj-body").style.display = "";
  showConjQ();
}
function showConjQ() {
  const S = State.conj, it = S.items[S.index];
  if (!it) { showConjComplete(); return; }
  document.getElementById("conj-word").textContent = it.word;
  document.getElementById("conj-meaning").textContent = it.reading + " · " + it.meaning;
  document.getElementById("conj-target").textContent = "→ " + it.label;
  document.getElementById("conj-progress").textContent = `${S.index + 1} / ${S.items.length}`;
  const inp = document.getElementById("conj-input");
  inp.value = ""; inp.disabled = false;
  inp.onkeydown = e => { if (e.key === "Enter") document.getElementById("conj-check").onclick(); };
  setTimeout(() => inp.focus(), 50);
  const btn = document.getElementById("conj-check");
  btn.textContent = "확인"; btn.onclick = checkConj;
  document.getElementById("conj-result").style.display = "none";
}
function checkConj() {
  const S = State.conj, it = S.items[S.index];
  const val = (document.getElementById("conj-input").value || "").trim();
  if (!val) { showToast("답을 입력해 주세요"); return; }
  const ok = val === it.ansK || val === it.ansR;
  if (ok) S.correct++;
  const r = document.getElementById("conj-result");
  r.style.display = "block";
  r.className = "quiz-reveal " + (ok ? "ok" : "ng");
  r.innerHTML = `
    <div class="reveal-mark">${ok ? "⭕ 정답!" : "❌ 오답"}</div>
    <div class="reveal-front" style="font-size:22px">${escapeHtml(it.ansK)}<span style="color:var(--text-muted);font-size:15px"> (${escapeHtml(it.ansR)})</span></div>
    <div class="reveal-meaning">${escapeHtml(it.word)} · ${escapeHtml(it.meaning)}</div>`;
  speak(it.ansR);
  document.getElementById("conj-input").disabled = true;
  const btn = document.getElementById("conj-check");
  btn.textContent = (S.index >= S.items.length - 1) ? "결과 보기 →" : "다음 →";
  btn.onclick = () => { S.index++; showConjQ(); };
}
function showConjComplete() {
  document.getElementById("conj-body").style.display = "none";
  document.getElementById("conj-complete").style.display = "flex";
  const t = State.conj.items.length, c = State.conj.correct;
  document.getElementById("conj-total").textContent = t;
  document.getElementById("conj-correct").textContent = c;
  document.getElementById("conj-acc").textContent = (t ? Math.round(c / t * 100) : 0) + "%";
}

// ══════════════════════════════════════════════════════════
//  듣기 연습 (받아쓰기 — 느리게·반복)
// ══════════════════════════════════════════════════════════
async function startListening() {
  showView("listen");
  document.getElementById("listen-complete").style.display = "none";
  document.getElementById("listen-body").style.display = "";
  document.getElementById("listen-progress").textContent = "문장 준비 중…";
  const data = await apiFetch("/api/ai/sentences", "POST", {});
  const items = (data.sentences || []).filter(s => s.jp && s.kr);
  if (!items.length) { showToast(data.error || "문장이 아직 없어요. 학습을 한 번 하면 생성돼요."); showView("ai"); return; }
  State.listen2 = { items, index: 0, correct: 0, mode: "dictation" };
  document.getElementById("lmode-dict").classList.add("active");
  document.getElementById("lmode-choice").classList.remove("active");
  showListen2();
}
function setListenMode(mode) {
  if (!State.listen2) return;
  State.listen2.mode = mode;
  document.getElementById("lmode-dict").classList.toggle("active", mode === "dictation");
  document.getElementById("lmode-choice").classList.toggle("active", mode === "choice");
  showListen2();
}
function showListen2() {
  const S = State.listen2, it = S.items[S.index];
  if (!it) { showListenComplete(); return; }
  document.getElementById("listen-progress").textContent = `${S.index + 1} / ${S.items.length}`;
  document.getElementById("listen-result2").style.display = "none";
  document.getElementById("listen-hint-text").textContent = "";
  const dict = document.getElementById("listen-dict"), choice = document.getElementById("listen-choice");
  if (S.mode === "choice") {
    dict.style.display = "none"; choice.style.display = "";
    const others = S.items.filter((_, i) => i !== S.index).map(x => x.kr);
    S.opts = shuffleArr([it.kr, ...shuffleArr(others).slice(0, 3)]);
    choice.innerHTML = S.opts.map((o, i) =>
      `<button class="quiz-option" onclick="pickListenChoice(${i})">${escapeHtml(o)}</button>`).join("");
  } else {
    choice.style.display = "none"; dict.style.display = "";
    const inp = document.getElementById("listen-input2");
    inp.value = ""; inp.disabled = false;
    inp.onkeydown = e => { if (e.key === "Enter") checkListen2(); };
    const btn = document.getElementById("listen-check2");
    btn.textContent = "확인"; btn.onclick = checkListen2;
  }
  listenPlayNow(1);   // 들어오면 한 번 재생
}
function listenPlayNow(rate) {
  const S = State.listen2, it = S && S.items[S.index];
  if (it) speakRate(it.jp, rate);
}
function listenHint() {
  const S = State.listen2, it = S && S.items[S.index];
  if (it) document.getElementById("listen-hint-text").textContent = "뜻: " + it.kr;
}
function revealListen(ok) {
  const S = State.listen2, it = S.items[S.index];
  if (ok) S.correct++;
  const r = document.getElementById("listen-result2");
  r.style.display = "block";
  r.className = "quiz-reveal " + (ok ? "ok" : "ng");
  r.innerHTML = `
    <div class="reveal-mark">${ok ? "⭕ 정답!" : "❌ 다시 보기"}</div>
    <div class="reveal-front" style="font-size:20px">${escapeHtml(it.jp)}</div>
    <div class="reveal-meaning">${escapeHtml(it.kr)}</div>
    <button class="quiz-next-btn" style="margin-top:10px" onclick="listenAdvance()">${S.index >= S.items.length - 1 ? "결과 보기 →" : "다음 →"}</button>`;
}
function listenAdvance() { State.listen2.index++; showListen2(); }
function checkListen2() {
  const S = State.listen2, it = S.items[S.index];
  const norm = s => (s || "").replace(/[\s、。,.！!？?]/g, "");
  document.getElementById("listen-input2").disabled = true;
  revealListen(norm(document.getElementById("listen-input2").value) === norm(it.jp));
}
function pickListenChoice(i) {
  const S = State.listen2, it = S.items[S.index];
  document.querySelectorAll("#listen-choice .quiz-option").forEach(b => b.classList.add("disabled"));
  revealListen(S.opts[i] === it.kr);
}
function showListenComplete() {
  document.getElementById("listen-body").style.display = "none";
  document.getElementById("listen-complete").style.display = "flex";
  const t = State.listen2.items.length, c = State.listen2.correct;
  document.getElementById("listen-total2").textContent = t;
  document.getElementById("listen-correct2").textContent = c;
  document.getElementById("listen-acc2").textContent = (t ? Math.round(c / t * 100) : 0) + "%";
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
    if (res.status === 401) { showLogin(); return {}; }   // 비밀번호 게이트
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.error(`API 오류 [${path}]:`, e);
    return {};
  }
}

// ── 비밀번호 게이트 (서버에 APP_PASSWORD 설정 시) ──
function showLogin() {
  const el = document.getElementById("login-overlay");
  if (el) { el.style.display = "flex"; setTimeout(() => document.getElementById("login-pw").focus(), 60); }
}
async function doLogin() {
  const pw = document.getElementById("login-pw").value;
  const err = document.getElementById("login-error");
  err.textContent = "";
  try {
    const res = await fetch(API + "/api/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    if (res.ok) { document.getElementById("login-overlay").style.display = "none"; location.reload(); }
    else { err.textContent = "비밀번호가 틀렸어요."; }
  } catch (e) { err.textContent = "연결 오류"; }
}

// ── TTS 발음 (가나 기반으로 정확하게) ──────────────────
function speak(text) {
  if (!text) return;
  // APK: 네이티브 일본어 TTS (WebView speechSynthesis 보다 안정적)
  if (window.AndroidTTS && window.AndroidTTS.speak) {
    try { window.AndroidTTS.speak(text); return; } catch (e) {}
  }
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ja-JP";
  u.rate = 0.9;
  window.speechSynthesis.speak(u);
}

// 속도 조절 발음 (듣기 연습 '느리게'). 네이티브 speakRate 우선, 없으면 보통/웹.
function speakRate(text, rate) {
  if (!text) return;
  if (window.AndroidTTS && window.AndroidTTS.speakRate) {
    try { window.AndroidTTS.speakRate(text, rate); return; } catch (e) {}
  }
  if (window.AndroidTTS && window.AndroidTTS.speak) {
    try { window.AndroidTTS.speak(text); return; } catch (e) {}   // 구버전 네이티브: 보통 속도
  }
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ja-JP";
  u.rate = rate;
  window.speechSynthesis.speak(u);
}

// 후리가나 괄호 제거: 鈴木(すずき) → 鈴木
function stripFurigana(s) {
  return (s || "").replace(/[（(][ぁ-んァ-ヴー・]+[）)]/g, "");
}

// 카드 타입별로 TTS에 넘길 텍스트(가능하면 가나)를 만든다
function cardTTSText(card) {
  if (!card) return "";
  if (card.type === "kanji") {
    // 비율 데이터가 있으면 화면과 동일하게 '빈도순'으로 읽는다 (많이 쓰는 것 먼저)
    const rows = READING_FREQ[card.front];
    if (rows && rows.length) {
      const toRead = s => s.replace(/[（）()]/g, "");   // 送りがな 괄호 합쳐서 자연스럽게
      const parts = rows.slice().sort((a, b) => b.p - a.p).slice(0, 2).map(x => toRead(x.r));
      return parts.join("、") || card.front;
    }
    // 데이터 없으면: 첫 음독 + 첫 훈독
    const r = card.back_reading || "";
    const clean = s => (s.split("・")[0] || "").replace(/[*\-]/g, "").replace(/[（）()]/g, "").trim();
    const onM = r.match(/음독:\s*([^/]+)/);
    const kunM = r.match(/훈독:\s*(.+)/);
    const parts = [];
    if (onM) { const t = clean(onM[1]); if (t) parts.push(t); }
    if (kunM) { const t = clean(kunM[1]); if (t) parts.push(t); }
    return parts.join("、") || card.front;
  }
  if (card.type === "grammar") {
    const ex = card.extra_info && card.extra_info.examples && card.extra_info.examples[0];
    return ex ? stripFurigana(ex.jp) : card.front;
  }
  return card.back_reading || card.front;   // 단어: 루비(가나) 우선
}

function speakCurrentCard() {
  speak(cardTTSText(State.study.queue[State.study.index]));
}

// ── AI 설명 (Gemini) ───────────────────────────────────
function onGeminiKey(value) {
  State.settings.gemini_api_key = value.trim();
}

async function aiExplainCurrent() {
  const card = State.study.queue[State.study.index];
  if (!card) return;
  aiExplain(card.id, card.front);
}

async function aiExplain(cardId, label) {
  const overlay = document.getElementById("ai-overlay");
  const body = document.getElementById("ai-body");
  document.getElementById("ai-sub").textContent = label || "";
  body.innerHTML = '<div class="spinner"></div>';
  overlay.classList.add("open");

  let acc = "";
  const render = () => {
    body.innerHTML = `<div class="ai-text">${escapeHtml(acc).replace(/\n/g, "<br>")}</div>`;
  };

  try {
    const res = await fetch(API + "/api/ai/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ card_id: cardId }),
    });
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop();
      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith("data:")) continue;
        let obj;
        try { obj = JSON.parse(line.slice(5).trim()); } catch { continue; }
        if (obj.error) { body.innerHTML = `<div class="ai-error">${escapeHtml(obj.error)}</div>`; return; }
        if (obj.t) { acc += obj.t; render(); }
      }
    }
    if (!acc.trim()) body.innerHTML = '<div class="ai-error">응답이 비어 있어요. 잠시 후 다시 시도해 주세요.</div>';
  } catch (e) {
    body.innerHTML = `<div class="ai-error">연결 오류: ${escapeHtml(String(e))}</div>`;
  }
}

function closeAI() {
  document.getElementById("ai-overlay").classList.remove("open");
}

// ── AI 허브 도구 (작문 첨삭 / 약점 리포트 / …) ───────────
async function openAITool(kind) {
  const ov = document.getElementById("ai-tool-overlay");
  const form = document.getElementById("ai-tool-form");
  const body = document.getElementById("ai-tool-body");
  form.innerHTML = "";
  body.innerHTML = "";

  if (kind === "weakness") {
    document.getElementById("ai-tool-title").textContent = "📊 약점 리포트";
    document.getElementById("ai-tool-sub").textContent = "복습 이력 분석";
    ov.classList.add("open");
    streamInto("/api/ai/weakness", {}, body);
  } else if (kind === "correct") {
    document.getElementById("ai-tool-title").textContent = "📝 작문 첨삭";
    document.getElementById("ai-tool-sub").textContent = "일본어로 한 문장 써보세요";
    form.innerHTML = `
      <input id="ai-correct-topic" class="ai-key-input" style="margin-bottom:8px" placeholder="주제(선택) 예: 내 취미"/>
      <textarea id="ai-correct-text" class="lyrics-textarea" style="min-height:90px;margin:0" placeholder="여기에 일본어 문장을 쓰세요"></textarea>
      <button class="save-btn" style="margin-top:8px" onclick="submitCorrect()">✏️ 첨삭받기</button>`;
    ov.classList.add("open");
  } else if (kind === "listen") {
    document.getElementById("ai-tool-title").textContent = "🎧 듣기 받아쓰기";
    document.getElementById("ai-tool-sub").textContent = "문장을 듣고 받아써 보세요";
    ov.classList.add("open");
    body.innerHTML = '<div class="spinner"></div>';
    const data = await apiFetch("/api/ai/sentences", "POST", {});
    State.listen.items = (data.sentences || []).filter(s => s.jp);
    State.listen.idx = 0;
    if (!State.listen.items.length) {
      body.innerHTML = '<div class="ai-error">문장이 아직 없어요. 학습을 한 번 하면 자동 생성돼요.</div>';
      return;
    }
    renderListen();
  } else {
    openChat();
  }
}

function renderListen() {
  const body = document.getElementById("ai-tool-body");
  body.innerHTML = `
    <button class="tts-btn" style="margin:0 auto 12px;display:block" onclick="listenPlay()">🔊 다시 듣기</button>
    <textarea id="listen-input" class="lyrics-textarea" style="min-height:70px;margin:0" placeholder="들은 문장을 입력하세요"></textarea>
    <button class="save-btn" style="margin-top:8px" onclick="checkListen()">확인</button>
    <div id="listen-result"></div>`;
  listenPlay();
}
function listenPlay() { speak(State.listen.items[State.listen.idx].jp); }
function checkListen() {
  const it = State.listen.items[State.listen.idx];
  const norm = s => (s || "").replace(/[\s、。,.！!？?]/g, "");
  const ok = norm(document.getElementById("listen-input").value) === norm(it.jp);
  const r = document.getElementById("listen-result");
  r.className = "quiz-reveal " + (ok ? "ok" : "ng");
  r.style.display = "block";
  r.innerHTML = `
    <div class="reveal-mark">${ok ? "⭕ 정답!" : "❌ 다시 보기"}</div>
    <div class="reveal-front" style="font-size:22px">${escapeHtml(it.jp)}</div>
    <div class="reveal-meaning">${escapeHtml(it.kr)}</div>
    <button class="quiz-next-btn" style="margin-top:10px" onclick="listenNext()">다음 문장 →</button>`;
}
function listenNext() {
  State.listen.idx = (State.listen.idx + 1) % State.listen.items.length;
  renderListen();
}

function submitCorrect() {
  const text = document.getElementById("ai-correct-text").value.trim();
  const topic = document.getElementById("ai-correct-topic").value.trim();
  if (!text) { showToast("문장을 입력해 주세요"); return; }
  streamInto("/api/ai/correct", { text, topic }, document.getElementById("ai-tool-body"));
}

function closeAITool() {
  document.getElementById("ai-tool-overlay").classList.remove("open");
}

// ── AI 회화 (채팅) ─────────────────────────────────────
function openChat() {
  showView("ai-chat");
  if (State.chat.history.length === 0) {
    document.getElementById("chat-messages").innerHTML = "";
    addChatBubble("model", "こんにちは！🌸\n안녕하세요! 일본어로 편하게 말 걸어보세요. 제가 도와드릴게요.");
  }
}

function scrollChat() {
  const w = document.getElementById("chat-messages");
  w.scrollTop = w.scrollHeight;
}

function addChatBubble(role, text) {
  const b = document.createElement("div");
  b.className = "chat-bubble " + role;
  b.innerHTML = escapeHtml(text).replace(/\n/g, "<br>");
  document.getElementById("chat-messages").appendChild(b);
  scrollChat();
  return b;
}

async function sendChat() {
  if (State.chat.busy) return;
  const inp = document.getElementById("chat-input");
  const text = inp.value.trim();
  if (!text) return;
  inp.value = "";
  addChatBubble("user", text);
  State.chat.history.push({ role: "user", text });
  State.chat.busy = true;

  const el = addChatBubble("model", "…");
  let acc = "";
  try {
    const res = await fetch(API + "/api/ai/chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ history: State.chat.history }),
    });
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop();
      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith("data:")) continue;
        let o; try { o = JSON.parse(line.slice(5).trim()); } catch { continue; }
        if (o.error) { el.textContent = o.error; el.classList.add("err"); State.chat.busy = false; return; }
        if (o.t) { acc += o.t; el.innerHTML = escapeHtml(acc).replace(/\n/g, "<br>"); scrollChat(); }
      }
    }
    if (acc.trim()) State.chat.history.push({ role: "model", text: acc });
    else el.textContent = "응답이 비어 있어요.";
  } catch (e) {
    el.textContent = "연결 오류: " + e;
  }
  State.chat.busy = false;
  scrollChat();
}

// ── 번역 ───────────────────────────────────────────────
function doTranslate() {
  const text = document.getElementById("translate-input").value.trim();
  if (!text) { showToast("번역할 문장을 입력해 주세요"); return; }
  streamInto("/api/ai/translate", { text }, document.getElementById("translate-result"));
}

function resetTranslate() {
  document.getElementById("translate-input").value = "";
  document.getElementById("translate-result").innerHTML = "";
  document.getElementById("translate-input").focus();
}

// 번역 결과 텍스트를 결과 영역에 표시 (스트림과 동일 형식)
function renderTranslateText(text) {
  document.getElementById("translate-result").innerHTML =
    `<div class="ai-text">${escapeHtml(text).replace(/\n/g, "<br>")}</div>`;
}

async function openTranslateHistory() {
  await loadTranslateHistory();
  document.getElementById("translate-history-overlay").classList.add("open");
}
function closeTranslateHistory() {
  document.getElementById("translate-history-overlay").classList.remove("open");
}

async function loadTranslateHistory() {
  const wrap = document.getElementById("translate-history-list");
  const data = await apiFetch("/api/translate/history");
  const items = data.items || [];
  wrap.innerHTML = items.length
    ? items.map(it => {
        const snip = it.source.length > 22 ? it.source.slice(0, 22) + "…" : it.source;
        return `
        <div class="saved-row">
          <button class="saved-row-open" onclick="openTranslateItem(${it.id})">${escapeHtml(snip)}
            <span style="color:var(--text-muted);font-weight:400;font-size:12px"> · ${escapeHtml((it.created_at || "").slice(5, 10))}</span></button>
          <button class="saved-row-del" onclick="confirmDeleteTranslate(${it.id})">🗑</button>
        </div>`;
      }).join("")
    : `<div style="color:var(--text-muted);font-size:13px;padding:24px;text-align:center">저장된 번역 기록이 없어요.</div>`;
}

async function openTranslateItem(id) {
  const it = await apiFetch(`/api/translate/history/${id}`);
  if (it.error) { showToast("불러오기 실패"); return; }
  document.getElementById("translate-input").value = it.source || "";
  renderTranslateText(it.result || "");
  closeTranslateHistory();
}

function confirmDeleteTranslate(id) {
  if (confirm("이 기록을 삭제할까요?")) deleteTranslate(id);
}
async function deleteTranslate(id) {
  await apiFetch(`/api/translate/history/delete/${id}`, "POST", {});
  loadTranslateHistory();
}

// SSE 스트림을 받아 요소에 점진적으로 렌더 (설명/가사 공용)
async function streamInto(url, payload, el) {
  el.innerHTML = '<div class="spinner"></div>';
  let acc = "";
  const render = () => { el.innerHTML = `<div class="ai-text">${escapeHtml(acc).replace(/\n/g, "<br>")}</div>`; };
  try {
    const res = await fetch(API + url, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop();
      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith("data:")) continue;
        let obj; try { obj = JSON.parse(line.slice(5).trim()); } catch { continue; }
        if (obj.error) { el.innerHTML = `<div class="ai-error">${escapeHtml(obj.error)}</div>`; return; }
        if (obj.t) { acc += obj.t; render(); }
      }
    }
    if (!acc.trim()) el.innerHTML = '<div class="ai-error">응답이 비어 있어요.</div>';
  } catch (e) {
    el.innerHTML = `<div class="ai-error">연결 오류: ${escapeHtml(String(e))}</div>`;
  }
}

async function aiLyrics() {
  const text = document.getElementById("lyrics-input").value.trim();
  if (!text) { showToast("가사를 입력해 주세요!"); return; }
  await streamInto("/api/ai/lyrics", { text }, document.getElementById("lyrics-results"));
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
