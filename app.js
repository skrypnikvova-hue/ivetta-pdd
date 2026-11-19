'use strict';
const NS = 'ivetta.v3.';
const $ = id => document.getElementById(id);
const P = window.IvettaPayments;
const TRIAL_MS = P.TRIAL_DAYS * 864e5;
const EXAM_Q = 20, EXAM_MIN = 20, EXAM_MAX_WRONG = 2;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const mem = new Map(); let storageOK = true;
try { localStorage.setItem(NS + 't', '1'); localStorage.removeItem(NS + 't'); } catch (e) { storageOK = false; }
const store = {
  get(k) { try { return storageOK ? localStorage.getItem(NS + k) : (mem.get(k) ?? null); } catch (e) { return mem.get(k) ?? null; } },
  set(k, v) { try { storageOK ? localStorage.setItem(NS + k, v) : mem.set(k, v); } catch (e) { mem.set(k, v); } }
};
const state = { cat: 'CD', mode: 'all', ticket: 1, topic: '', index: 0, showAnswer: false, auto: true, sound: true, mistakes: new Set(), done: new Set(), mastered: new Set(), session: { ok: 0, bad: 0 }, exam: null, ledger: {} };
let allQuestions = [], topics = [], current = [], explainMap = new Map(), bankError = false;
let answeredIndex = -1, lastChoice = -1, advanceTimer = null, examTimer = null, topicError = false, pgRange = 14; let lastTickSec = -1;
const k = s => state.cat + ':' + s;
const examKey = () => 'exam:' + state.cat;
const historyKey = () => 'exams:' + state.cat;
const bankPath = () => state.cat === 'CD' ? './tickets_cd_2026.json' : './tickets_ab_2026.json';
const topicsManifest = () => state.cat === 'CD' ? './topics.json' : './ab/topics.json';
const topicsDir = () => state.cat === 'CD' ? './topics/' : './ab/topics/';
const maxTicket = () => allQuestions.reduce((m, q) => Math.max(m, q.ticket || 1), 1);
const ctxKey = (m = state.mode, t = state.ticket, tp = state.topic) => m === 'ticket' ? 'ticket:' + t : m === 'topic' ? 'topic:' + tp : m;
const titleOf = () => state.mode === 'exam' ? 'Экзамен' : state.mode === 'ticket' ? 'Билет ' + state.ticket : state.mode === 'topic' ? state.topic : state.mode === 'mistakes' ? 'Мои ошибки' : 'Все вопросы';
const fmt = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
function migrateLegacy() {
  if (store.get('migrated5')) return;
  ['last', 'mistakes', 'done', 'mastered', 'daily'].forEach(s => { const v = store.get(s); if (v !== null) store.set('CD:' + s, v); });
  try {
    const src = storageOK ? localStorage : null;
    if (src) for (let i = 0; i < src.length; i++) { const key = src.key(i); if (key && key.startsWith(NS + 'p:')) store.set('CD:' + key.slice(NS.length), src.getItem(key)); }
  } catch (e) {}
  store.set('migrated5', '1');
}
function getEnt() { try { return JSON.parse(store.get('ent') || 'null'); } catch (e) { return null; } }
function entStatus() {
  let e = getEnt();
  if (e && e.license) return { kind: 'licensed', e };
  if (!e || !e.trialStart) { e = { trialStart: Date.now() }; store.set('ent', JSON.stringify(e)); }
  const left = TRIAL_MS - (Date.now() - e.trialStart);
  return left > 0 ? { kind: 'trial', left, e } : { kind: 'expired', e };
}
const entitled = () => entStatus().kind !== 'expired';
const daysLeft = ms => Math.max(1, Math.ceil(ms / 864e5));
const todayKey = () => new Date().toLocaleDateString('sv-SE');
function getDaily() { try { return JSON.parse(store.get('daily:' + state.cat) || '{}'); } catch (e) { return {}; } }
function recordDaily(ok) {
  const d = getDaily(), key = todayKey(), r = d[key] || { a: 0, c: 0, w: 0 };
  r.a++; ok ? r.c++ : r.w++; d[key] = r;
  const keys = Object.keys(d).sort(); if (keys.length > 90) keys.slice(0, keys.length - 90).forEach(x => delete d[x]);
  store.set('daily:' + state.cat, JSON.stringify(d));
}
function streak(d) {
  let s = 0, dt = new Date();
  if (!d[todayKey()] || !d[todayKey()].a) dt.setDate(dt.getDate() - 1);
  for (;;) { const key = dt.toLocaleDateString('sv-SE'); if (d[key] && d[key].a) { s++; dt.setDate(dt.getDate() - 1); } else break; }
  return s;
}
function getHistory() { try { return JSON.parse(store.get(historyKey()) || '[]'); } catch (e) { return []; } }
function saveExam() { store.set(examKey(), state.exam ? JSON.stringify(state.exam) : 'null'); }
function save() {
  store.set(k('p:' + ctxKey()), String(state.index));
  store.set(k('last'), JSON.stringify({ mode: state.mode, ticket: state.ticket, topic: state.topic }));
  store.set('prefs', JSON.stringify({ showAnswer: state.showAnswer, auto: state.auto, sound: state.sound }));
  store.set(k('mistakes'), JSON.stringify([...state.mistakes]));
  store.set(k('done'), JSON.stringify([...state.done]));
  store.set(k('mastered'), JSON.stringify([...state.mastered]));
  store.set(k('ans:' + ctxKey()), JSON.stringify(state.ledger));
}
function load() {
  try {
    const l = JSON.parse(store.get(k('last')) || 'null');
    if (l) { state.mode = l.mode || 'all'; state.ticket = l.ticket || 1; state.topic = l.topic || ''; }
    const p = JSON.parse(store.get('prefs') || 'null');
    if (p) { state.showAnswer = !!p.showAnswer; state.auto = p.auto !== false; state.sound = p.sound !== false; }
    state.mistakes = new Set(JSON.parse(store.get(k('mistakes')) || '[]'));
    state.done = new Set(JSON.parse(store.get(k('done')) || '[]'));
    state.mastered = new Set(JSON.parse(store.get(k('mastered')) || '[]'));
  } catch (e) {}
  state.index = parseInt(store.get(k('p:' + ctxKey())) || '0', 10) || 0;
  if (!entitled()) state.showAnswer = false;
  state.exam = null;
  try {
    const ex = JSON.parse(store.get(examKey()) || 'null');
    if (ex && Array.isArray(ex.ids) && ex.ids.length && ex.deadline > Date.now()) { state.exam = ex; state.mode = 'exam'; state.index = ex.i || 0; }
  } catch (e) {}
  if (!state.exam && state.mode === 'exam') { state.mode = 'all'; state.index = parseInt(store.get(k('p:all')) || '0', 10) || 0; }
}
let actx = null;
function ac() { if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (actx && actx.state === 'suspended') actx.resume(); return actx; }
function tone(f, d, t, g, w) { const c = ac(); if (!c || !state.sound) return; const o = c.createOscillator(), v = c.createGain(), s = c.currentTime + (w || 0); o.type = t || 'sine'; o.frequency.value = f; v.gain.setValueAtTime(.0001, s); v.gain.exponentialRampToValueAtTime(g || .12, s + .015); v.gain.exponentialRampToValueAtTime(.0001, s + d); o.connect(v).connect(c.destination); o.start(s); o.stop(s + d + .05); }
const sfx = { tap: () => tone(520, .06, 'triangle', .05), ok: () => { tone(660, .12); tone(880, .18, 'sine', .1, .09); }, bad: () => tone(150, .22, 'square', .06), win: () => [523, 659, 784, 1043].forEach((f, i) => tone(f, .22, 'sine', .1, i * .11)) };
addEventListener('pointerdown', () => ac(), { once: true });
async function loadExplanations() {
  explainMap = new Map();
  const lists = await Promise.all(topics.map(async name => {
    try { return await (await fetch(topicsDir() + encodeURIComponent(name) + '.json')).json(); } catch (e) { return []; }
  }));
  lists.forEach(arr => (arr || []).forEach(it => {
    if (!it || it.id === undefined) return;
    const tip = it.answer_tip || it.explanation || it.comment || '';
    if (tip) explainMap.set(it.id, String(tip));
  }));
}
const explanationFor = q => q.explanation || q.answer_tip || explainMap.get(q.id) || '';
function correctIndex(q) {
  for (let i = 0; i < q.answers.length; i++) {
    const a = q.answers[i];
    if (a.isCorrect === true || (a.isCorrect === undefined && q.correctIndex === i)) return i;
  }
  return -1;
}
function paintBoard() {
  const b = $('examBoard');
  if (!b) return;
  if (!state.exam) { b.innerHTML = ''; return; }
  b.innerHTML = state.exam.ids.map((id, i) => {
    const cls = i < state.exam.i ? (state.exam.wrong.includes(id) ? 'bad' : 'ok') : i === state.exam.i ? 'cur' : 'todo';
    return '<i class="' + cls + '" title="' + (i + 1) + '"></i>';
  }).join('');
}
function showExplanation(q) {
  const tip = explanationFor(q);
  if (!tip) return false;
  const old = document.getElementById('explainBox'); if (old) old.remove();
  const box = document.createElement('div'); box.id = 'explainBox'; box.className = 'explain';
  const head = document.createElement('div'); head.className = 'explain-head';
  head.innerHTML = '<span class="explain-ic">ℹ️</span><b>Пояснение</b>';
  const body = document.createElement('div'); body.className = 'explain-body';
  const lead = document.createElement('strong');
  lead.textContent = 'Правильный ответ: ' + (correctIndex(q) + 1) + '. ';
  body.appendChild(lead); body.appendChild(document.createTextNode(tip));
  const foot = document.createElement('div'); foot.className = 'explain-foot';
  foot.textContent = 'Автопереход отключён для этого вопроса — читай спокойно и жми «Далее».';
  box.append(head, body, foot);
  $('answers').after(box);
  $('nextBtn').classList.add('invite');
  return true;
}
async function loadData() {
  bankError = false;
  try { allQuestions = await (await fetch(bankPath())).json(); }
  catch (e) { allQuestions = []; bankError = true; }
  try { topics = await (await fetch(topicsManifest())).json(); } catch (e) { topics = []; }
  await loadExplanations();
  load(); syncControls();
  if (state.exam) { show('quiz'); rebuild(); startExamTimer(); }
  else { show('home'); rebuild(); }
}
async function rebuild() {
  clearAdvance(); topicError = false;
  try { state.ledger = JSON.parse(store.get(k('ans:' + ctxKey())) || '{}'); } catch (e) { state.ledger = {}; }
  let list = allQuestions;
  if (state.mode === 'exam') list = state.exam ? state.exam.ids.map(id => allQuestions.find(q => q.id === id)).filter(Boolean) : [];
  else if (state.mode === 'ticket') list = allQuestions.filter(q => q.ticket === state.ticket);
  else if (state.mode === 'mistakes') list = allQuestions.filter(q => state.mistakes.has(q.id));
  else if (state.mode === 'topic') {
    try { const d = await (await fetch(topicsDir() + encodeURIComponent(state.topic) + '.json')).json(); const ids = new Set(d.map(x => x.id)); list = allQuestions.filter(q => ids.has(q.id)); }
    catch (e) { topicError = true; list = []; }
  }
  current = list; if (state.index >= current.length) state.index = 0;
  answeredIndex = -1; lastChoice = -1; render(); refreshMenu();
}
function setContext(mode, ticket, topic) {
  save(); state.mode = mode;
  if (ticket !== undefined) state.ticket = ticket;
  if (topic !== undefined) state.topic = topic;
  state.index = parseInt(store.get(k('p:' + ctxKey())) || '0', 10) || 0;
  state.session = { ok: 0, bad: 0 }; save(); closeSheets(); show('quiz'); rebuild();
}
async function setCategory(cat) {
  if (cat === state.cat) { closeSheets(); return; }
  const view = document.body.dataset.view;
  save(); state.cat = cat; store.set('cat', cat);
  state.session = { ok: 0, bad: 0 };
  clearInterval(examTimer);
  await loadData();
  show(view === 'home' ? 'home' : 'quiz'); rebuild(); refreshHome(); syncControls();
  closeSheets(); toast('Категория ' + cat + (bankError ? ' · банк ещё не загружен' : ''));
}
function startExam(resume) {
  let ex = null;
  if (resume) { try { const p = JSON.parse(store.get(examKey()) || 'null'); if (p && p.deadline > Date.now() && p.ids && p.ids.length) ex = p; } catch (e) {} }
  if (resume && !ex) { try { const p = JSON.parse(store.get(examKey()) || 'null'); if (p && p.ids && p.ids.length && p.deadline <= Date.now()) { state.exam = p; finishExam(false, 'Время вышло'); return; } } catch (e) {} }
  if (!ex) {
    if (!allQuestions.length) { toast('Банк ' + state.cat + ' ещё не загружен'); return; }
    const ids = allQuestions.map(q => q.id);
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = ids[i]; ids[i] = ids[j]; ids[j] = t; }
    ex = { ids: ids.slice(0, EXAM_Q), i: 0, wrong: [], deadline: Date.now() + EXAM_MIN * 60000 };
  }
  state.exam = ex; state.mode = 'exam'; state.index = ex.i || 0; lastTickSec = -1;
  saveExam(); save(); closeSheets(); show('quiz'); rebuild(); startExamTimer(); sfx.tap();
}
function startExamTimer() { clearInterval(examTimer); examTimer = setInterval(tick, 1000); tick(); }
function tick() {
  if (!state.exam) return;
  const left = state.exam.deadline - Date.now();
  if (left <= 0) { if (document.body.dataset.view === 'quiz') { finishExam(false, 'Время вышло'); } else if (!state.exam.expiredNoted) { state.exam.expiredNoted = true; state.exam.deadline = Date.now() - 1; saveExam(); } return; }
  const el = $('examTime');
  if (el) { el.textContent = fmt(left); el.classList.toggle('low', left < 60000); el.classList.toggle('critical', left < 10000); }
  const sec = Math.ceil(left / 1000);
  if (sec <= 10 && sec !== lastTickSec) { lastTickSec = sec; sfx.tap(); }
}
function finishExam(pass, reason) {
  clearInterval(examTimer); clearAdvance();
  const ex = state.exam; if (!ex) return;
  const hist = getHistory();
  hist.push({ at: Date.now(), pass: pass, ok: ex.ids.length - ex.wrong.length, bad: ex.wrong.length, secs: Math.round((EXAM_MIN * 60000 - (ex.deadline - Date.now())) / 1000) });
  while (hist.length > 20) hist.shift();
  store.set(historyKey(), JSON.stringify(hist));
  const wrongIds = ex.wrong.slice();
  state.exam = null; saveExam(); answeredIndex = -1;
  state.mode = 'all'; state.index = parseInt(store.get(k('p:all')) || '0', 10) || 0; save();
  $('exBadge').textContent = pass ? '🏆' : '💥';
  $('exTitle').textContent = pass ? 'Экзамен сдан!' : 'Экзамен не сдан';
  $('exStats').textContent = state.cat + ' · ' + (reason ? reason + ' · ' : '') + 'верно ' + (ex.ids.length - wrongIds.length) + ' из ' + ex.ids.length + ' · ошибок ' + wrongIds.length + ' · время ' + fmt((EXAM_MIN * 60000 - (ex.deadline - Date.now())));
  const rv = $('exReview'); rv.innerHTML = '';
  if (!wrongIds.length) { const p = document.createElement('p'); p.textContent = 'Без ошибок — чисто!'; rv.appendChild(p); }
  wrongIds.forEach(id => {
    const q = allQuestions.find(x => x.id === id); if (!q) return;
    const item = document.createElement('div'); item.className = 'ex-review-item';
    const b = document.createElement('b'); b.textContent = q.text; item.appendChild(b);
    const ok = document.createElement('div'); ok.className = 'ok'; ok.textContent = '✓ ' + (q.answers[correctIndex(q)] || {}).text; item.appendChild(ok);
    const tip = explanationFor(q);
    if (tip) { const t = document.createElement('div'); t.className = 'tip'; t.textContent = tip; item.appendChild(t); }
    rv.appendChild(item);
  });
  show('examResult'); refreshMenu(); refreshHome();
  if (pass) { sfx.win(); confetti(); } else sfx.bad();
}
function show(v) {
  ['home', 'quiz', 'progress', 'info', 'done', 'empty', 'examResult'].forEach(x => $(x + 'View').hidden = x !== v);
  document.body.dataset.view = v;
  $('appbarMid').style.visibility = v === 'quiz' ? 'visible' : 'hidden';
  if (v === 'home') refreshHome();
  if (v === 'progress') renderProgress();
  if (v === 'info') renderInfo();
  if (v === 'quiz') { if (state.exam && state.exam.deadline <= Date.now()) { finishExam(false, 'Время вышло'); return; } render(); }
}
function render() {
  const oldEx = document.getElementById('explainBox'); if (oldEx) oldEx.remove();
  $('nextBtn').classList.remove('invite');
  const isExam = state.mode === 'exam';
  $('examHud').hidden = !isExam;
  $('quizView').classList.toggle('exam-active', isExam);
  if (!current.length) {
    show('empty');
    $('emptyText').textContent = bankError ? 'Банк ' + state.cat + ' ещё не загружен. Добавь tickets_' + state.cat.toLowerCase() + '_2026.json и темы.' : topicError ? 'Не удалось загрузить тему «' + state.topic + '».' : state.mode === 'mistakes' ? 'Ошибок пока нет — так держать!' : 'В этом разделе пока нет вопросов.';
    $('emptyRetryBtn').hidden = !(topicError || bankError); return;
  }
  const q = current[state.index], total = current.length;
  const rec = state.mode !== 'exam' ? state.ledger[q.id] : null;
  if (rec) { answeredIndex = state.index; lastChoice = rec.c; }
  const answered = answeredIndex === state.index;
  $('sectionTitle').textContent = titleOf();
  $('sectionCount').textContent = (state.index + 1) + ' / ' + total;
  $('progressFill').style.width = ((state.index + 1) / total * 100) + '%';
  $('qChip').textContent = isExam ? 'Экзамен' : state.cat + ' · Билет ' + q.ticket;
  if (isExam && state.exam) {
    tick();
    $('examDots').innerHTML = Array.from({ length: EXAM_MAX_WRONG + 1 }, (_, i) => '<i class="' + (i < state.exam.wrong.length ? 'hit' : '') + '"></i>').join('');
    $('examLeft').textContent = 'вопрос ' + (state.index + 1) + ' из ' + total;
    paintBoard();
  }
  $('questionText').textContent = q.text;
  const wrap = $('imageWrap'), img = $('questionImage');
  if (q.image) {
    const n = String(q.image).split('/').pop(); wrap.hidden = false;
    img.onerror = () => { img.onerror = () => { img.onerror = () => { wrap.hidden = true; }; img.src = './' + n; }; img.src = './images_ab/' + n; };
    img.src = './images/' + n;
  } else wrap.hidden = true;
  const box = $('answers'); box.innerHTML = '';
  q.answers.forEach((a, i) => {
    const ok = a.isCorrect === true || (a.isCorrect === undefined && q.correctIndex === i);
    const b = document.createElement('button'); b.className = 'answer';
    b.innerHTML = '<span class="num">' + (i + 1) + '</span><span></span>'; b.lastElementChild.textContent = a.text;
    if (answered) { b.disabled = true; if (ok) b.classList.add('correct'); else if (i === lastChoice) b.classList.add('wrong'); }
    else if (state.showAnswer && entitled() && ok && !isExam) b.classList.add('reveal');
    b.addEventListener('click', () => answer(i, ok, q)); box.appendChild(b);
  });
  if (answered && !isExam) showExplanation(q);
  $('prevBtn').disabled = isExam || state.index === 0;
  $('nextBtn').disabled = isExam ? (!answered || state.index === total - 1) : state.index === total - 1;
  $('autoBar').classList.remove('pending');
  syncControls();
}
function answer(i, ok, q) {
  if (answeredIndex === state.index) return;
  if (state.mode !== 'exam' && state.ledger[q.id]) return;
  answeredIndex = state.index; lastChoice = i;
  [...$('answers').children].forEach((b, idx) => {
    b.disabled = true;
    const good = q.answers[idx].isCorrect === true || (q.answers[idx].isCorrect === undefined && q.correctIndex === idx);
    if (good) b.classList.add('correct'); else if (idx === i) b.classList.add('wrong');
  });
  if (ok) { state.session.ok++; state.mistakes.delete(q.id); state.mastered.add(q.id); sfx.ok(); }
  else { state.session.bad++; state.mistakes.add(q.id); sfx.bad(); }
  if (state.mode !== 'exam') state.ledger[q.id] = { c: i, ok: ok };
  recordDaily(ok); save();
  if (state.mode === 'exam' && state.exam) {
    if (!ok) state.exam.wrong.push(q.id);
    state.exam.i = state.index; saveExam(); paintBoard();
    $('nextBtn').disabled = state.index === current.length - 1;
    if (state.exam.wrong.length > EXAM_MAX_WRONG) { finishExam(false, 'Превышен лимит ошибок'); return; }
    if (state.index >= current.length - 1) { finishExam(true, ''); return; }
    $('autoBar').classList.add('pending');
    advanceTimer = setTimeout(() => { state.exam.i = state.index + 1; state.index = state.exam.i; answeredIndex = -1; saveExam(); render(); }, 1200);
    return;
  }
  const hasTip = showExplanation(q);
  if (!hasTip && state.auto) {
    $('autoBar').classList.add('pending');
    advanceTimer = setTimeout(() => state.index < current.length - 1 ? next() : complete(), 900);
  }
}
function clearAdvance() { clearTimeout(advanceTimer); advanceTimer = null; $('autoBar').classList.remove('pending'); }
function next() {
  clearAdvance();
  if (state.mode === 'exam') {
    if (answeredIndex !== state.index || state.index >= current.length - 1) return;
    state.exam.i = state.index + 1; state.index = state.exam.i; answeredIndex = -1; saveExam(); render(); return;
  }
  if (state.index < current.length - 1) { state.index++; answeredIndex = -1; save(); render(); } else complete();
}
function prev() { if (state.mode === 'exam') return; clearAdvance(); if (state.index > 0) { state.index--; answeredIndex = -1; save(); render(); } }
function complete() {
  clearAdvance(); state.done.add(ctxKey()); save();
  const s = state.session, t = s.ok + s.bad;
  $('doneTitle').textContent = state.mode === 'ticket' ? 'Билет ' + state.ticket + ' пройден!' : 'Раздел пройден!';
  $('doneStats').textContent = t ? 'Верно: ' + s.ok + ' · Ошибок: ' + s.bad + ' · Точность: ' + Math.round(s.ok / t * 100) + '%' : 'Отличная работа!';
  $('nextSectionBtn').textContent = state.mode === 'ticket' ? 'Билет ' + (state.ticket % maxTicket() + 1) + ' →' : state.mode === 'topic' ? 'Следующая тема →' : 'В меню';
  show('done'); sfx.win(); confetti(); refreshMenu();
}
function refreshHome() {
  const st = entStatus(), d = getDaily();
  $('homeChip').textContent = st.kind === 'licensed' ? '✓ Пожизненный доступ' : st.kind === 'trial' ? 'Пробный период: ' + daysLeft(st.left) + ' дн.' : 'Пробный период завершён · «Ответ» 399 ₽';
  $('homeStreak').textContent = streak(d);
  $('homeToday').textContent = (d[todayKey()] || {}).a || 0;
  $('homeSub').innerHTML = allQuestions.length + ' вопросов · ' + maxTicket() + ' билетов · ' + topics.length + ' тем.<br>Сдай на права спокойно и с удовольствием.';
  $('homeContinueBtn').textContent = 'Продолжить: ' + titleOf() + ' →';
  $('homeExamBtn').textContent = state.exam ? '🎯 Вернуться к экзамену · ' + fmt(state.exam.deadline - Date.now()) : '🎯 Экзамен · ' + EXAM_Q + ' вопросов · ' + EXAM_MIN + ' минут';
  document.querySelectorAll('#catSwitch button').forEach(b => b.classList.toggle('active', b.dataset.cat === state.cat));
}
function renderProgress() {
  const d = getDaily(), t = d[todayKey()] || { a: 0, c: 0, w: 0 };
  $('pgToday').textContent = t.a; $('pgCorrect').textContent = t.c;
  $('pgAcc').textContent = t.a ? Math.round(t.c / t.a * 100) + '%' : '—';
  $('pgStreak').textContent = streak(d);
  let total = 0; Object.values(d).forEach(r => { total += r.a; });
  $('pgTotal').textContent = total;
  $('pgMastered').textContent = state.mastered.size + ' / ' + (allQuestions.length || 0);
  $('pgMistakes').textContent = state.mistakes.size;
  const hist = getHistory();
  $('pgExams').textContent = hist.filter(x => x.pass).length + ' / ' + hist.length;
  const pl = $('pgExamList'); pl.innerHTML = '';
  hist.slice(-5).reverse().forEach(x => { const d = document.createElement('div'); d.className = 'pg-exam-row'; d.innerHTML = '<span class=' + (x.pass ? 'ok' : 'bad') + '>' + (x.pass ? '✓ сдан' : '✗ не сдан') + '</span><span>' + new Date(x.at).toLocaleDateString('ru-RU') + '</span><span>' + x.ok + '/' + (x.ok + x.bad) + '</span><span>' + fmt(x.secs * 1000) + '</span>'; pl.appendChild(d); });
  const N = pgRange, days = [];
  for (let i = N - 1; i >= 0; i--) { const dt = new Date(); dt.setDate(dt.getDate() - i); const key = dt.toLocaleDateString('sv-SE'); days.push({ k: key, r: d[key] || { a: 0 }, today: i === 0, wd: 'впвсчпс'[dt.getDay()] }); }
  const max = Math.max(...days.map(x => x.r.a), 1), W = N * 26, H = 130;
  let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="chart"><defs><linearGradient id="pgG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8B5CF6"/><stop offset="1" stop-color="#3D5AFE"/></linearGradient></defs>';
  days.forEach((x, i) => {
    const h = Math.round(x.r.a / max * 86), bx = i * 26 + 5, by = 100 - h;
    svg += '<rect x="' + bx + '" y="' + by + '" width="16" height="' + Math.max(h, 2) + '" rx="5" class="bar' + (x.today ? ' today' : '') + '"><title>' + x.k + ': ' + x.r.a + ' ответов</title></rect>';
    if (x.r.a) svg += '<text x="' + (bx + 8) + '" y="' + (by - 5) + '" class="val">' + x.r.a + '</text>';
    svg += '<text x="' + (bx + 8) + '" y="118" class="wd' + (x.today ? ' today' : '') + '">' + x.wd + '</text>';
  });
  svg += '</svg>'; $('pgChart').innerHTML = svg;
  $('pgRange7').classList.toggle('active', N === 7); $('pgRange14').classList.toggle('active', N === 14);
}
function renderInfo() {
  const st = entStatus();
  $('infoChip').textContent = st.kind === 'licensed' ? '✓ активен' : st.kind === 'trial' ? 'trial ' + daysLeft(st.left) + ' дн.' : 'trial ended';
  $('infoTrialLine').textContent = st.kind === 'licensed' ? 'Спасибо! Доступ открыт навсегда на этом устройстве.' : st.kind === 'trial' ? 'Сейчас действует бесплатный пробный период: ' + daysLeft(st.left) + ' дн. Затем кнопка «Ответ» станет платной.' : 'Пробный период завершён. Оплати один раз — и кнопка «Ответ» твоя навсегда.';
  const lic = st.e && st.e.license;
  $('payBlock').hidden = !!lic; $('receiptPanel').hidden = !lic;
  if (lic) { $('rcKey').textContent = lic.key; $('rcDate').textContent = new Date(lic.issuedAt).toLocaleDateString('ru-RU'); $('rcAmount').textContent = lic.amount + ' ₽ · карта •••• ' + lic.last4; }
  $('payBadge').hidden = P.MODE !== 'mock'; $('payHint').hidden = P.MODE !== 'mock';
}
async function submitPay(e) {
  e.preventDefault();
  const card = { number: $('cardNumber').value, exp: $('cardExp').value, cvc: $('cardCvc').value };
  const v = P.validateCard(card);
  $('errNumber').textContent = v.errors.number || ''; $('errExp').textContent = v.errors.exp || ''; $('errCvc').textContent = v.errors.cvc || '';
  $('payError').hidden = true;
  if (!v.ok) return;
  const btn = $('payBtn'); btn.disabled = true; btn.classList.add('loading'); btn.textContent = 'Обработка платежа…';
  try {
    const lic = await P.pay(card);
    const ent = getEnt() || { trialStart: Date.now() }; ent.license = lic; store.set('ent', JSON.stringify(ent));
    sfx.win(); confetti(); toast('Доступ активирован пожизненно 🎉');
    syncControls(); renderInfo(); refreshMenu();
  } catch (err) {
    $('payError').hidden = false;
    $('payError').textContent = err.code === 'declined' ? 'Банк отклонил платёж. Попробуй другую карту.' : err.code === 'backend_required' ? 'Боевой эквайринг требует подключения бэкенда.' : 'Платёж не прошёл. Проверь данные карты.';
    sfx.bad();
  } finally { btn.disabled = false; btn.classList.remove('loading'); btn.textContent = 'Оплатить ' + P.PRICE + ' ₽'; }
}
function openSheet(id) { closeSheets(); $('scrim').hidden = false; $(id).hidden = false; if (id === 'ticketSheet') buildTickets(); if (id === 'topicSheet') buildTopics(); if (id === 'menuSheet') refreshMenu(); }
function closeSheets() { $('scrim').hidden = true; ['menuSheet', 'ticketSheet', 'topicSheet', 'catSheet'].forEach(i => $(i).hidden = true); }
function refreshMenu() {
  const b = (key, tot) => { const v = parseInt(store.get(k(key)) || '0', 10) || 0; return v > 0 ? 'с ' + (v + 1) + (tot ? '/' + tot : '') : ''; };
  $('badgeAll').textContent = b('p:all', allQuestions.length);
  $('badgeTicket').textContent = [...state.done].filter(x => x.startsWith('ticket:')).length ? '✓ ' + [...state.done].filter(x => x.startsWith('ticket:')).length : '';
  $('badgeTopic').textContent = b('p:topic:' + state.topic);
  $('badgeMistakes').textContent = state.mistakes.size ? state.mistakes.size + ' шт.' : '';
  $('badgeProgress').textContent = ((getDaily()[todayKey()] || {}).a || 0) + ' сегодня';
  $('badgeCat').textContent = state.cat;
  const hist = getHistory();
  $('badgeExam').textContent = state.exam ? 'идёт' : hist.length ? (hist[hist.length - 1].pass ? '✓ сдан' : '✗ не сдан') : '';
  const st = entStatus();
  $('badgeInfo').textContent = st.kind === 'licensed' ? '✓' : st.kind === 'trial' ? daysLeft(st.left) + ' дн.' : '399 ₽';
}
function buildTickets() {
  const g = $('ticketGrid'); g.innerHTML = '';
  const n = maxTicket();
  for (let i = 1; i <= n; i++) {
    const b = document.createElement('button'); b.className = 'ticket-btn'; b.textContent = i;
    const key = 'ticket:' + i, p = parseInt(store.get(k('p:' + key)) || '0', 10) || 0;
    if (state.done.has(key)) b.classList.add('done'); else if (p > 0) b.classList.add('started');
    if (state.mode === 'ticket' && state.ticket === i) b.classList.add('current');
    b.addEventListener('click', () => { sfx.tap(); setContext('ticket', i); }); g.appendChild(b);
  }
}
function buildTopics() {
  const l = $('topicList'); l.innerHTML = '';
  topics.forEach(name => {
    const b = document.createElement('button'); b.className = 'topic-btn';
    const p = parseInt(store.get(k('p:topic:' + name)) || '0', 10) || 0;
    b.innerHTML = '<span></span>' + (p > 0 ? '<span class="mi-badge">с ' + (p + 1) + '</span>' : '');
    b.firstElementChild.textContent = name;
    b.addEventListener('click', () => { sfx.tap(); setContext('topic', undefined, name); }); l.appendChild(b);
  });
}
let toastTimer = null;
function toast(msg, label, fn) { const t = $('toast'); t.innerHTML = ''; t.append(document.createTextNode(msg)); if (label) { const b = document.createElement('button'); b.textContent = label; b.addEventListener('click', () => { fn(); t.classList.remove('show'); }); t.appendChild(b); } t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 6000); }
let cRAF = null;
function confetti() {
  if (REDUCED) return;
  const cv = $('confetti'), ctx = cv.getContext('2d');
  cv.width = innerWidth * devicePixelRatio; cv.height = innerHeight * devicePixelRatio;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  const cols = ['#8B5CF6', '#3D5AFE', '#16A34A', '#F59E0B', '#D7263D', '#0EA5A5'];
  const ps = Array.from({ length: 130 }, () => ({ x: innerWidth / 2 + (Math.random() - .5) * 120, y: innerHeight * .35, vx: (Math.random() - .5) * 9, vy: -Math.random() * 11 - 3, s: Math.random() * 7 + 4, r: Math.random() * Math.PI, vr: (Math.random() - .5) * .3, c: cols[Math.random() * cols.length | 0], life: 1 }));
  cancelAnimationFrame(cRAF); const t0 = performance.now();
  (function loop(t) { const dt = Math.min((t - t0) / 1000, 2.4); ctx.clearRect(0, 0, innerWidth, innerHeight); ps.forEach(p => { p.vy += .22; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life = 1 - dt / 2.4; ctx.save(); ctx.globalAlpha = Math.max(p.life, 0); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * .6); ctx.restore(); }); if (dt < 2.4) cRAF = requestAnimationFrame(loop); else ctx.clearRect(0, 0, innerWidth, innerHeight); })(t0);
}
function syncControls() {
  const ok = entitled();
  const examLock = state.mode === 'exam';
  if (!ok) state.showAnswer = false;
  $('showAnswer').checked = state.showAnswer && !examLock;
  $('answerSwitch').classList.toggle('locked', !ok || examLock);
  $('switchLock').hidden = ok && !examLock;
  $('autoAdvance').checked = state.auto;
  $('soundBtn').querySelector('.ic-on').toggleAttribute('hidden', !state.sound);
  $('soundBtn').querySelector('.ic-off').toggleAttribute('hidden', state.sound);
  $('soundBtn').setAttribute('aria-label', state.sound ? 'Звук включён' : 'Звук выключен');
  document.querySelectorAll('#catSwitch button').forEach(b => b.classList.toggle('active', b.dataset.cat === state.cat));
}
document.addEventListener('DOMContentLoaded', () => {
  let deferredPrompt = null;
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (/Mac/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  const ib = $('installBtn');
  if (!standalone) {
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; ib.hidden = false; });
    window.addEventListener('appinstalled', () => { ib.hidden = true; deferredPrompt = null; toast('Приложение установлено 🎉'); });
    if (ios) ib.hidden = false;
    ib.addEventListener('click', async () => {
      if (deferredPrompt) { deferredPrompt.prompt(); const ch = await deferredPrompt.userChoice; deferredPrompt = null; if (ch.outcome === 'accepted') ib.hidden = true; }
      else toast('iPhone: Поделиться → На экран «Домой», чтобы установить Ivetta PDD');
    });
  }
  state.cat = store.get('cat') === 'AB' ? 'AB' : 'CD';
  migrateLegacy();
  loadData();
  $('homeImg').addEventListener('error', () => { $('homeImg').hidden = true; $('homeFallback').toggleAttribute('hidden', false); });
  $('logoBtn').addEventListener('click', () => { sfx.tap(); show('home'); });
  $('menuBtn').addEventListener('click', () => { sfx.tap(); openSheet('menuSheet'); });
  $('homeMenuBtn').addEventListener('click', () => openSheet('menuSheet'));
  $('homeContinueBtn').addEventListener('click', () => { show('quiz'); rebuild(); });
  $('homeExamBtn').addEventListener('click', () => startExam(!!state.exam));
  $('examEnd').addEventListener('click', () => { if (!state.exam) return; toast('Завершить досрочно? Неотвеченные вопросы считаются ошибками', 'Завершить', () => { const ex = state.exam; const answeredCount = ex.i + (answeredIndex === ex.i ? 1 : 0); for (let i = answeredCount; i < ex.ids.length; i++) ex.wrong.push(ex.ids[i]); finishExam(ex.wrong.length <= EXAM_MAX_WRONG, 'Досрочное завершение'); }); });
  $('exAgain').addEventListener('click', () => startExam(false));
  $('exMenu').addEventListener('click', () => openSheet('menuSheet'));
  document.querySelectorAll('#catSwitch button').forEach(b => b.addEventListener('click', () => { sfx.tap(); setCategory(b.dataset.cat); }));
  document.querySelectorAll('[data-catpick]').forEach(b => b.addEventListener('click', () => { sfx.tap(); setCategory(b.dataset.catpick); }));
  $('scrim').addEventListener('click', closeSheets);
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeSheets));
  document.querySelectorAll('.menu-item').forEach(b => b.addEventListener('click', () => {
    const n = b.dataset.nav; sfx.tap();
    if (n === 'ticket') openSheet('ticketSheet');
    else if (n === 'topic') openSheet('topicSheet');
    else if (n === 'cat') openSheet('catSheet');
    else if (n === 'exam') startExam(!!state.exam);
    else if (n === 'home' || n === 'progress' || n === 'info') { closeSheets(); show(n); }
    else setContext(n);
  }));
  $('answerSwitch').addEventListener('click', e => { if (state.mode === 'exam') { e.preventDefault(); toast('На экзамене подсказки отключены'); return; } if (!entitled()) { e.preventDefault(); show('info'); toast('Пробный период завершён — открой пожизненный доступ'); } });
  $('showAnswer').addEventListener('change', e => { if (state.mode === 'exam') { e.target.checked = false; toast('На экзамене подсказки отключены'); return; } if (!entitled()) { e.target.checked = false; show('info'); return; } state.showAnswer = e.target.checked; save(); render(); });
  $('autoAdvance').addEventListener('change', e => { state.auto = e.target.checked; save(); if (!state.auto) clearAdvance(); });
  $('soundBtn').addEventListener('click', () => { state.sound = !state.sound; save(); syncControls(); if (state.sound) sfx.tap(); });
  $('prevBtn').addEventListener('click', prev); $('nextBtn').addEventListener('click', next);
  $('resetSectionBtn').addEventListener('click', () => { const key = ctxKey(), old = state.index; state.index = 0; state.done.delete(key); state.ledger = {}; save(); rebuild(); closeSheets(); toast('Прогресс раздела сброшен', 'Вернуть', () => { state.index = old; save(); rebuild(); }); });
  $('repeatBtn').addEventListener('click', () => { state.index = 0; state.session = { ok: 0, bad: 0 }; answeredIndex = -1; state.ledger = {}; save(); show('quiz'); render(); });
  $('nextSectionBtn').addEventListener('click', () => { if (state.mode === 'ticket') setContext('ticket', state.ticket % maxTicket() + 1); else if (state.mode === 'topic') { const i = topics.indexOf(state.topic); setContext('topic', undefined, topics[(i + 1) % topics.length] || state.topic); } else openSheet('menuSheet'); });
  $('doneMenuBtn').addEventListener('click', () => openSheet('menuSheet'));
  $('emptyMenuBtn').addEventListener('click', () => openSheet('menuSheet'));
  $('emptyRetryBtn').addEventListener('click', () => loadData().then(() => { show('quiz'); rebuild(); }));
  $('imageWrap').addEventListener('click', () => { $('lightboxImg').src = $('questionImage').src; $('lightbox').hidden = false; });
  $('lightbox').addEventListener('click', () => { $('lightbox').hidden = true; });
  $('pgRange7').addEventListener('click', () => { pgRange = 7; renderProgress(); });
  $('pgRange14').addEventListener('click', () => { pgRange = 14; renderProgress(); });
  $('cardNumber').addEventListener('input', e => { e.target.value = P.digits(e.target.value).slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 '); });
  $('cardExp').addEventListener('input', e => { const d = P.digits(e.target.value).slice(0, 4); e.target.value = d.length > 2 ? d.slice(0, 2) + '/' + d.slice(2) : d; });
  $('cardCvc').addEventListener('input', e => { e.target.value = P.digits(e.target.value).slice(0, 4); });
  $('payForm').addEventListener('submit', submitPay);
  $('restoreBtn').addEventListener('click', () => { const e = getEnt(); toast(e && e.license ? 'Покупка уже активна на этом устройстве ✓' : 'Покупок на этом устройстве не найдено'); });
  let tx = 0, ty = 0;
  $('card').addEventListener('touchstart', e => { tx = e.touches[0].clientX; ty = e.touches[0].clientY; }, { passive: true });
  $('card').addEventListener('touchend', e => { if (!$('scrim').hidden || !$('lightbox').hidden) return; const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty; if (Math.abs(dx) > 60 && Math.abs(dy) < 80) dx < 0 ? next() : prev(); }, { passive: true });
  addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeSheets(); $('lightbox').hidden = true; return; }
    if (!$('quizView').hidden && $('scrim').hidden) { if (e.key === 'ArrowRight') next(); else if (e.key === 'ArrowLeft') prev(); else if (/^[1-9]$/.test(e.key)) { const b = $('answers').children[+e.key - 1]; if (b && !b.disabled) b.click(); } }
  });
  setInterval(() => { syncControls(); if (document.body.dataset.view === 'home') refreshHome(); if (document.body.dataset.view === 'info') renderInfo(); }, 60000);
  if (!storageOK) toast('Приватный режим: прогресс сохранится только до закрытия вкладки');
  if ('serviceWorker' in navigator) { const had = !!navigator.serviceWorker.controller; navigator.serviceWorker.register('./service-worker.js').catch(() => {}); navigator.serviceWorker.addEventListener('controllerchange', () => { if (had) location.reload(); }); }
});