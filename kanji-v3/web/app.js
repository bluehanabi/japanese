/* 한자 앱 — 로그인 없음, 데이터는 이 기기(localStorage)에만 저장. 설정 > 백업으로 파일 저장/복원. */
'use strict';

// ───────────────────────── 상태 ─────────────────────────
const KEY = 'kanjiv3';
const today = () => { const d = new Date(); return Math.floor((d - d.getTimezoneOffset() * 60000) / 864e5); };
const DEFAULT = { set: { newPerDay: 5 }, k: {}, cards: {}, wmiss: {}, log: {} };
let S = load();
let K = [], byChar = {};
let tab = 'today';
let sess = null;      // 학습 세션
let wsess = null;     // 쓰기 세션
let listFilter = 'all', quickMark = false;

function load() {
  try { return Object.assign({}, DEFAULT, JSON.parse(localStorage.getItem(KEY) || '{}')); }
  catch (e) { return JSON.parse(JSON.stringify(DEFAULT)); }
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* 저장 불가 환경 */ } }
const logToday = () => (S.log[today()] = S.log[today()] || { new: 0, rev: 0 });

// ───────────────────────── 유틸 ─────────────────────────
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const core = (list) => list.filter(r => r[1] === 0);

// 한국 한자음 받침 → 일본 음독 어미 (규칙적인 대응)
function endingHint(ko) {
  const syl = ko.split('·')[0].charCodeAt(0);
  if (syl < 0xAC00 || syl > 0xD7A3) return '';
  const jong = (syl - 0xAC00) % 28;
  const map = {
    1: 'ㄱ → 〜ク / 〜キ', 4: 'ㄴ → 〜ン', 8: 'ㄹ → 〜ツ / 〜チ', 16: 'ㅁ → 〜ン', 21: 'ㅇ → 〜ウ / 〜イ',
    0: '받침 없음 → 〜ウ / 〜イ / 〜ア 등',
  };
  const t = map[jong];
  return t ? `한국음 '${ko}' (${jong === 0 ? '' : '받침 '}${t}) 로 끝나는 음독이 많아요` : '';
}

const readingChips = (list, showRare) => list.filter(r => showRare || r[1] < 2)
  .map(r => `<span class="chip ${r[1] === 0 ? 'core' : r[1] === 2 ? 'rare' : ''}">${esc(r[0])}</span>`).join('');

function readingBlock(x, full) {
  const on = full ? x.on : x.on.filter(r => r[1] < 2), kun = full ? x.kun : x.kun.filter(r => r[1] < 2);
  return `${on.length ? `<div class="lbl">음독 (音読み)</div><div class="chips">${readingChips(on, full)}</div>` : ''}
    ${kun.length ? `<div class="lbl">훈독 (訓読み)</div><div class="chips">${readingChips(kun, full)}</div>` : ''}`;
}

function wordsBlock(x, hlReading) {
  return x.w.map(w => `<div class="word-row"><span class="w">${esc(w[0])}</span>
    <span class="r ${w[3] && w[3] === hlReading ? 'hl' : ''}">${esc(w[1])}</span><span class="m">${esc(w[2])}</span></div>`).join('');
}

function kanjiState(i) {
  const st = S.k[i]; if (!st) return 'new';
  const c = S.cards['k:' + K[i].c];
  return c && c.ivl >= 7 ? 'good' : 'learn';
}

// ───────────────────────── SRS ─────────────────────────
function newCard(id, ch, extra) {
  S.cards[id] = Object.assign({ ch, due: today(), ivl: 0, ease: 2.3, reps: 0, lapses: 0 }, extra || {});
}
function rate(card, q) {         // q: 1 모름, 2 애매, 3 알아요
  if (q === 1) { card.ease = Math.max(1.3, card.ease - 0.2); card.lapses++; card.reps = 0; card.ivl = 0; card.due = today(); return; }
  if (q === 2) { card.ease = Math.max(1.3, card.ease - 0.1); card.ivl = Math.max(1, Math.round((card.ivl || 1) * 1.2)); }
  else {
    card.ivl = card.reps === 0 ? 1 : card.reps === 1 ? 3 : Math.max(card.ivl + 1, Math.round(card.ivl * card.ease));
    card.reps++;
  }
  card.due = today() + card.ivl;
}
function learnKanji(i) {
  const x = K[i];
  S.k[i] = { d: today() };
  newCard('k:' + x.c, x.c, { kind: 'k' });
  x.w.slice(0, 3).forEach((w, wi) => newCard('w:' + w[0], x.c, { kind: 'w', wi }));
}
function markKnown(i) {
  const x = K[i];
  S.k[i] = { d: today(), known: 1 };
  const ivl = 10;
  S.cards['k:' + x.c] = { ch: x.c, kind: 'k', due: today() + 1 + (Math.random() * ivl | 0), ivl, ease: 2.3, reps: 2, lapses: 0 };
}
function unmark(i) {
  const x = K[i];
  delete S.k[i];
  Object.keys(S.cards).filter(id => S.cards[id].ch === x.c).forEach(id => delete S.cards[id]);
}

// ───────────────────────── 화면: 오늘 ─────────────────────────
function viewToday() {
  const t = today();
  const due = Object.values(S.cards).filter(c => c.due <= t).length;
  const quota = Math.max(0, S.set.newPerDay - logToday().new);
  const unlearned = K.filter((_, i) => !S.k[i]).length;
  const nNew = Math.min(quota, unlearned);
  const learned = Object.keys(S.k).length;
  const solid = K.filter((_, i) => kanjiState(i) === 'good').length;
  const empty = due === 0 && nNew === 0;
  $('#app').innerHTML = `
    <h1>오늘의 한자</h1>
    <div class="stats">
      <div class="card"><div class="big-num">${due}</div><div class="muted">복습</div></div>
      <div class="card"><div class="big-num">${nNew}</div><div class="muted">새 한자</div></div>
    </div>
    <button class="btn" data-act="start" ${empty ? 'disabled' : ''}>${empty ? '오늘 할 일 끝 🎉' : '시작하기'}</button>
    <div class="card mt">
      <div class="row between"><b>진행</b><span class="muted">${learned} / ${K.length}자 만남 · ${solid}자 익숙</span></div>
      <div class="bar mt"><i style="width:${(learned / K.length * 100).toFixed(1)}%"></i></div>
    </div>
    ${quota === 0 && unlearned ? '<button class="link" data-act="more">새 한자 5개 더 하기</button>' : ''}`;
}

// ───────────────────────── 학습 세션 ─────────────────────────
function startSession(extraNew) {
  const t = today();
  const dueIds = shuffle(Object.keys(S.cards).filter(id => S.cards[id].due <= t));
  const quota = extraNew != null ? extraNew : Math.max(0, S.set.newPerDay - logToday().new);
  const newIdx = K.map((_, i) => i).filter(i => !S.k[i]).slice(0, quota);
  sess = { q: [...dueIds.map(id => ({ t: 'c', id })), ...newIdx.map(i => ({ t: 'i', i }))], total: 0, done: 0, reveal: false };
  sess.total = sess.q.length;
  nextStep();
}
function nextStep() {
  if (!sess.q.length) { finishSession(); return; }
  const it = sess.q[0]; sess.reveal = false; sess.full = false;
  $('#tabs').classList.add('hide');
  it.t === 'i' ? viewIntro(it.i) : viewCard(it.id);
}
function finishSession() {
  const l = logToday();
  $('#tabs').classList.remove('hide');
  $('#app').innerHTML = `<div class="stage center"><div style="font-size:64px">🎉</div><h1>수고했어요</h1>
    <p class="muted">복습 ${l.rev}개 · 새 한자 ${l.new}개 (오늘)</p></div><button class="btn" data-act="home">홈으로</button>`;
  sess = null;
}
function topbar() {
  const p = sess.total ? Math.min(100, sess.done / sess.total * 100) : 0;
  return `<div class="topbar"><button class="x" data-act="quit">✕</button><div class="bar"><i style="width:${p}%"></i></div></div>`;
}

function viewIntro(i) {
  const x = K[i], hint = endingHint(x.ko);
  $('#app').innerHTML = `${topbar()}
    <div class="card center">
      <div class="muted">새 한자 · ${i + 1}번째 · ${x.sc}획</div>
      <div class="kanji xl">${x.c}</div>
      <div class="ko">${esc(x.hun)}</div>
      <div>${esc(x.m)}</div>
    </div>
    <div class="card">
      <b>읽기</b> <span class="muted">초록색이 먼저 외울 핵심</span>
      ${readingBlock(x, !!sess.full)}
      ${hint ? `<div class="hint">💡 ${esc(hint)}</div>` : ''}
      ${!sess.full && (x.on.some(r => r[1] === 2) || x.kun.some(r => r[1] === 2)) ? '<button class="link" data-act="rare">희귀한 읽기까지 보기</button>' : ''}
    </div>
    <div class="card"><b>자주 쓰는 단어</b>${wordsBlock(x)}</div>
    <button class="btn" data-act="learn">외우기 시작</button>
    <button class="btn ghost mt" data-act="known">이미 알아요 (건너뛰기)</button>`;
}

function viewCard(id) {
  const c = S.cards[id], x = byChar[c.ch];
  let front, back;
  if (c.kind === 'k') {
    front = `<div class="kanji xl">${x.c}</div><div class="muted">읽기와 뜻은?</div>`;
    back = `<div class="center"><div class="ko">${esc(x.hun)} · ${esc(x.m)}</div></div>${readingBlock(x, false)}
      <div class="card" style="margin-top:12px;padding:6px 14px">${wordsBlock(x)}</div>`;
  } else {
    const w = x.w[c.wi] || x.w.find(v => v[0] === id.slice(2));
    front = `<div class="kanji word">${esc(w[0])}</div><div class="muted">어떻게 읽을까요?</div>`;
    back = `<div class="center"><div class="kanji" style="font-size:34px">${esc(w[1])}</div><div class="mt">${esc(w[2])}</div></div>
      <div class="hint">${x.c} <b>${esc(x.hun.split(',')[0])}</b> · 이 단어에서 <b class="hl">${esc(w[3] || '—')}</b></div>`;
  }
  const left = sess.q.filter(q => q.t === 'c').length;
  $('#app').innerHTML = `${topbar()}
    <div class="card"><div class="stage">${front}</div>${sess.reveal ? `<hr style="border:0;border-top:1px solid var(--line)">${back}` : ''}</div>
    ${sess.reveal
      ? `<div class="grades"><button class="g1" data-q="1">모름</button><button class="g2" data-q="2">애매</button><button class="g3" data-q="3">알아요</button></div>`
      : `<button class="btn" data-act="reveal">정답 보기</button>`}
    <div class="center muted mt">남은 카드 ${left}</div>`;
}

function answer(q) {
  const it = sess.q.shift(), c = S.cards[it.id];
  rate(c, q);
  logToday().rev++;
  if (q === 1) sess.q.push(it); else sess.done++;   // 모름은 이번 세션 끝에 다시
  save(); nextStep();
}

// ───────────────────────── 화면: 쓰기 ─────────────────────────
function viewWrite() {
  const learned = Object.keys(S.k).map(Number);
  if (!learned.length) {
    $('#app').innerHTML = `<h1>쓰기 연습</h1><div class="card center muted">아직 배운 한자가 없어요.<br>오늘 탭에서 먼저 새 한자를 배워 보세요.</div>`;
    return;
  }
  $('#app').innerHTML = `<h1>쓰기 연습</h1>
    <div class="card muted">배운 한자 중 10개를 한국음·뜻·읽기를 보고 손가락으로 써 봅니다. 못 쓴 한자는 다음에 더 자주 나와요.</div>
    <button class="btn" data-act="wstart">연습 시작</button>`;
}
function startWrite() {
  const learned = Object.keys(S.k).map(Number);
  const weighted = learned.flatMap(i => Array(1 + (S.wmiss[K[i].c] || 0) * 3).fill(i));
  const picked = [...new Set(shuffle(weighted))].slice(0, 10);
  wsess = { q: picked, n: picked.length, reveal: false };
  nextWrite();
}
function nextWrite() {
  if (!wsess.q.length) { wsess = null; $('#tabs').classList.remove('hide'); tab = 'write'; render(); return; }
  $('#tabs').classList.add('hide');
  const i = wsess.q[0], x = K[i];
  const w = x.w.find(v => v[0].includes(x.c));
  const prompt = w ? `${esc(w[0]).replace(x.c, '<span class="hl">□</span>')} <span class="muted">${esc(w[1])}</span>` : '';
  $('#app').innerHTML = `<div class="topbar"><button class="x" data-act="wquit">✕</button>
    <div class="bar"><i style="width:${(wsess.n - wsess.q.length) / wsess.n * 100}%"></i></div></div>
    <div class="center"><div class="ko">${esc(x.hun)} · ${esc(x.m)}</div>
      <div class="mt" style="font-size:20px">${prompt}</div>
      <div class="chips" style="justify-content:center">${readingChips(core(x.on).concat(core(x.kun)), false)}</div></div>
    <div class="mt" style="position:relative"><canvas class="pad" id="pad"></canvas>
      ${wsess.reveal ? `<div class="kanji" style="position:absolute;inset:0;font-size:min(70vw,360px);display:grid;place-items:center;opacity:.28;pointer-events:none">${x.c}</div>` : ''}</div>
    ${wsess.reveal
      ? `<div class="grades" style="grid-template-columns:1fr 1fr"><button class="g1" data-act="wmiss">틀림</button><button class="g3" data-act="wok">맞음</button></div>`
      : `<div class="row mt"><button class="btn ghost" data-act="wclear">지우기</button><button class="btn" data-act="wreveal">정답 보기</button></div>`}`;
  setupPad();
}
let padStrokes = [];
function setupPad() {
  const cv = $('#pad'), dpr = window.devicePixelRatio || 1, r = cv.getBoundingClientRect();
  cv.width = r.width * dpr; cv.height = r.height * dpr;
  const g = cv.getContext('2d'); g.scale(dpr, dpr);
  const css = getComputedStyle(document.documentElement);
  const ink = css.getPropertyValue('--ink').trim(), line = css.getPropertyValue('--line').trim();
  const redraw = () => {
    g.clearRect(0, 0, r.width, r.height);
    g.strokeStyle = line; g.lineWidth = 1; g.setLineDash([6, 6]);
    g.beginPath(); g.moveTo(r.width / 2, 0); g.lineTo(r.width / 2, r.height); g.moveTo(0, r.height / 2); g.lineTo(r.width, r.height / 2); g.stroke();
    g.setLineDash([]); g.strokeStyle = ink; g.lineWidth = 7; g.lineCap = g.lineJoin = 'round';
    padStrokes.forEach(s => { g.beginPath(); s.forEach((p, k) => k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); if (s.length === 1) g.lineTo(s[0][0] + .1, s[0][1]); g.stroke(); });
  };
  if (!wsess || !wsess.reveal) padStrokes = [];   // 정답을 펼칠 때는 내가 쓴 글씨 유지
  redraw();
  const pos = e => { const b = cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
  let cur = null;
  cv.onpointerdown = e => { cv.setPointerCapture(e.pointerId); cur = [pos(e)]; padStrokes.push(cur); redraw(); };
  cv.onpointermove = e => { if (cur) { cur.push(pos(e)); redraw(); } };
  cv.onpointerup = cv.onpointercancel = () => { cur = null; };
  cv.clear = () => { padStrokes = []; redraw(); };
}

// ───────────────────────── 화면: 목록 ─────────────────────────
function viewList() {
  const filt = { all: () => true, new: i => !S.k[i], learn: i => S.k[i] };
  const idx = K.map((_, i) => i).filter(filt[listFilter]);
  $('#app').innerHTML = `<h1>한자 목록</h1>
    <div class="seg"><button data-flt="all" class="${listFilter === 'all' ? 'on' : ''}">전체</button>
      <button data-flt="learn" class="${listFilter === 'learn' ? 'on' : ''}">배운 것</button>
      <button data-flt="new" class="${listFilter === 'new' ? 'on' : ''}">안 배운 것</button></div>
    <div class="legend"><span><i style="background:var(--new)"></i>미학습</span><span><i style="background:var(--learn)"></i>학습 중</span><span><i style="background:var(--good)"></i>익숙</span></div>
    <label class="row card muted" style="padding:12px"><input type="checkbox" id="qm" ${quickMark ? 'checked' : ''}>
      빠른 표시: 탭하면 '이미 아는 한자'로 표시/해제</label>
    <div class="grid">${idx.map(i => `<button class="cell ${kanjiState(i)}" data-i="${i}">${K[i].c}</button>`).join('')}</div>`;
}
function sheet(i) {
  const x = K[i], st = S.k[i];
  const bg = document.createElement('div'); bg.className = 'sheet-bg';
  bg.innerHTML = `<div class="sheet"><div class="card center"><div class="muted">${i + 1}번째 · ${x.sc}획 · ${x.g === 8 ? '중학' : x.g + '학년'}</div>
    <div class="kanji xl" style="font-size:96px">${x.c}</div><div class="ko">${esc(x.hun)}</div><div>${esc(x.m)}</div></div>
    <div class="card"><b>읽기</b>${readingBlock(x, true)}</div>
    <div class="card"><b>단어</b>${wordsBlock(x)}</div>
    ${st ? `<button class="btn ghost" data-sa="unmark">학습 기록 지우기</button>` : `<button class="btn" data-sa="learn">지금 배우기</button><button class="btn ghost mt" data-sa="known">이미 알아요</button>`}
    <button class="btn ghost mt" data-sa="close">닫기</button></div>`;
  bg.onclick = e => {
    const a = e.target.dataset.sa;
    if (e.target === bg || a === 'close') return bg.remove();
    if (a === 'learn') learnKanji(i); else if (a === 'known') markKnown(i); else if (a === 'unmark') unmark(i); else return;
    save(); bg.remove(); render();
  };
  document.body.appendChild(bg);
}

// ───────────────────────── 화면: 설정 ─────────────────────────
function viewSettings() {
  $('#app').innerHTML = `<h1>설정</h1>
    <div class="card"><div class="field"><span>하루 새 한자</span>
      <div class="row"><button class="btn sm ghost" data-act="np-">−</button><b>${S.set.newPerDay}</b><button class="btn sm ghost" data-act="np+">＋</button></div></div></div>
    <h2>백업 (로그인이 없어서 직접 저장해 두세요)</h2>
    <div class="card"><p class="muted" style="margin-top:0">기록은 이 폰의 브라우저에만 저장돼요. 아이폰은 사파리 메뉴 → '홈 화면에 추가'로 설치해야 기록이 안전하게 유지됩니다.</p>
      <button class="btn ghost" data-act="export">백업 파일 저장</button>
      <label class="btn ghost mt" style="display:block;text-align:center">백업 파일 불러오기<input type="file" id="imp" accept="application/json" hidden></label></div>
    <h2>다른 앱</h2>
    <a class="btn ghost" style="display:block;text-align:center;text-decoration:none" href="${location.protocol}//${location.hostname}:8006/">Kanji Flow (기존 앱) 열기 →</a>
    <h2>기타</h2>
    <button class="btn ghost" data-act="reset" style="color:var(--warn)">모든 기록 지우기</button>`;
}
function exportData() {
  const blob = new Blob([JSON.stringify(S)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `kanji-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
}

// ───────────────────────── 이벤트 ─────────────────────────
function render() {
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  ({ today: viewToday, write: viewWrite, list: viewList, settings: viewSettings })[tab]();
}
document.addEventListener('click', e => {
  const t = e.target.closest('button, label'); if (!t) return;
  const d = t.dataset;
  if (d.tab) { tab = d.tab; sess = null; render(); return; }
  if (d.flt) { listFilter = d.flt; viewList(); return; }
  if (d.i != null) {
    const i = +d.i;
    if (quickMark) { S.k[i] ? unmark(i) : markKnown(i); save(); const y = scrollY; viewList(); scrollTo(0, y); } else sheet(i);
    return;
  }
  if (d.q) return answer(+d.q);
  switch (d.act) {
    case 'start': startSession(); break;
    case 'more': startSession(5); break;
    case 'home': tab = 'today'; render(); break;
    case 'quit': sess = null; $('#tabs').classList.remove('hide'); render(); break;
    case 'reveal': sess.reveal = true; viewCard(sess.q[0].id); break;
    case 'learn': { const it = sess.q.shift(); learnKanji(it.i); logToday().new++; sess.done++;
      const x = K[it.i]; const ids = ['k:' + x.c, ...x.w.slice(0, 3).map(w => 'w:' + w[0])];
      sess.q.unshift(...ids.map(id => ({ t: 'c', id }))); sess.total += ids.length; save(); nextStep(); break; }
    case 'known': { const it = sess.q.shift(); markKnown(it.i); logToday().new++; sess.done++; save(); nextStep(); break; }
    case 'rare': sess.full = true; viewIntro(sess.q[0].i); break;
    case 'np-': S.set.newPerDay = Math.max(1, S.set.newPerDay - 1); save(); viewSettings(); break;
    case 'np+': S.set.newPerDay = Math.min(30, S.set.newPerDay + 1); save(); viewSettings(); break;
    case 'export': exportData(); break;
    case 'reset': if (confirm('정말 모든 학습 기록을 지울까요?')) { S = JSON.parse(JSON.stringify(DEFAULT)); save(); render(); } break;
    case 'wstart': startWrite(); break;
    case 'wquit': wsess = null; $('#tabs').classList.remove('hide'); render(); break;
    case 'wclear': $('#pad').clear(); break;
    case 'wreveal': wsess.reveal = true; nextWrite(); break;
    case 'wok': case 'wmiss': {
      const c = K[wsess.q.shift()].c;
      if (t.dataset.act === 'wmiss') S.wmiss[c] = (S.wmiss[c] || 0) + 1; else if (S.wmiss[c]) S.wmiss[c]--;
      wsess.reveal = false; save(); nextWrite(); break; }
  }
});
document.addEventListener('change', e => {
  if (e.target.id === 'qm') quickMark = e.target.checked;
  if (e.target.id === 'imp' && e.target.files[0]) {
    e.target.files[0].text().then(txt => {
      try { const d = JSON.parse(txt); if (!d.cards || !d.k) throw 0; S = Object.assign({}, DEFAULT, d); save(); tab = 'today'; render(); alert('불러왔어요'); }
      catch (err) { alert('올바른 백업 파일이 아니에요'); }
    });
  }
});

// ───────────────────────── 시작 ─────────────────────────
fetch('data/kanji.json').then(r => r.json()).then(d => {
  K = d; K.forEach(x => byChar[x.c] = x);
  render();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
}).catch(() => { $('#app').innerHTML = '<div class="card">데이터를 불러오지 못했어요. 인터넷 연결을 확인하고 새로고침해 주세요.</div>'; });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
