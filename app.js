'use strict';
const NS = 'ivetta.v3.';
const $ = id => document.getElementById(id);
const P = window.IvettaPayments;
const TRIAL_MS = P.TRIAL_DAYS * 864e5;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const mem = new Map(); let storageOK = true;
try { localStorage.setItem(NS + 't', '1'); localStorage.removeItem(NS + 't'); } catch (e) { storageOK = false; }
const store = {
  get(k) { try { return storageOK ? localStorage.getItem(NS + k) : (mem.get(k) ?? null); } catch (e) { return mem.get(k) ?? null; } },
  set(k, v) { try { storageOK ? localStorage.setItem(NS + k, v) : mem.set(k, v); } catch (e) { mem.set(k, v); } }
};
const state = { mode: 'all', ticket: 1, topic: '', index: 0, showAnswer: false, auto: true, sound: true, mistakes: new Set(), done: new Set(), mastered: new Set(), session: { ok: 0, bad: 0 } };
let allQuestions = [], topics = [], current = [], answeredIndex = -1, lastChoice = -1, advanceTimer = null, topicError = false, pgRange = 14;
const ctxKey = (m = state.mode, t = state.ticket, tp = state.topic) => m === 'ticket' ? 'ticket:' + t : m === 'topic' ? 'topic:' + tp : m;
const titleOf = () => state.mode === 'ticket' ? 'Билет ' + state.ticket : state.mode === 'topic' ? state.topic : state.mode === 'mistakes' ? 'Мои ошибки' : 'Все вопросы';
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
function getDaily() { try { return JSON.parse(store.get('daily') || '{}'); } catch (e) { return {}; } }
function recordDaily(ok) {
  const d = getDaily(), k = todayKey(), r = d[k] || { a: 0, c: 0, w: 0 };
  r.a++; ok ? r.c++ : r.w++; d[k] = r;
  const keys = Object.keys(d).sort(); while (keys.length > 90) delete d[keys.shift()];
  store.set('daily', JSON.stringify(d));
}
function streak(d) {
  let s = 0, dt = new Date();
  if (!d[todayKey()] || !d[todayKey()].a) dt.setDate(dt.getDate() - 1);
  for (;;) { const k = dt.toLocaleDateString('sv-SE'); if (d[k] && d[k].a) { s++; dt.setDate(dt.getDate() - 1); } else break; }
  return s;
}
function save() {
  store.set('p:' + ctxKey(), String(state.index));
  store.set('last', JSON.stringify({ mode: state.mode, ticket: state.ticket, topic: state.topic }));
  store.set('prefs', JSON.stringify({ showAnswer: state.showAnswer, auto: state.auto, sound: state.sound }));
  store.set('mistakes', JSON.stringify([...state.mistakes]));
  store.set('done', JSON.stringify([...state.done]));
  store.set('mastered', JSON.stringify([...state.mastered]));
}
function load() {
  try {
    const l = JSON.parse(store.get('last') || 'null');
    if (l) { state.mode = l.mode || 'all'; state.ticket = l.ticket || 1; state.topic = l.topic || ''; }
    const p = JSON.parse(store.get('prefs') || 'null');
    if (p) { state.showAnswer = !!p.showAnswer; state.auto = p.auto !== false; state.sound = p.sound !== false; }
    state.mistakes = new Set(JSON.parse(store.get('mistakes') || '[]'));
    state.done = new Set(JSON.parse(store.get('done') || '[]'));
    state.mastered = new Set(JSON.parse(store.get('mastered') || '[]'));
  } catch (e) {}
  state.index = parseInt(store.get('p:' + ctxKey()) || '0', 10) || 0;
  if (!entitled()) state.showAnswer = false;
}
let actx = null;
function ac() { if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (actx && actx.state === 'suspended') actx.resume(); return actx; }
function tone(f, d, t, g, w) { const c = ac(); if (!c || !state.sound) return; const o = c.createOscillator(), v = c.createGain(), s = c.currentTime + (w || 0); o.type = t || 'sine'; o.frequency.value = f; v.gain.setValueAtTime(.0001, s); v.gain.exponentialRampToValueAtTime(g || .12, s + .015); v.gain.exponentialRampToValueAtTime(.0001, s + d); o.connect(v).connect(c.destination); o.start(s); o.stop(s + d + .05); }
const sfx = { tap: () => tone(520, .06, 'triangle', .05), ok: () => { tone(660, .12); tone(880, .18, 'sine', .1, .09); }, bad: () => tone(150, .22, 'square', .06), win: () => [523, 659, 784, 1043].forEach((f, i) => tone(f, .22, 'sine', .1, i * .11)) };
addEventListener('pointerdown', () => ac(), { once: true });
async function loadData() {
  try { allQuestions = await (await fetch('./tickets_cd_2026.json')).json(); }
  catch (e) { $('questionText').textContent = 'Не удалось загрузить базу вопросов.'; return; }
  try { topics = await (await fetch('./topics.json')).json(); } catch (e) { topics = []; }
  load(); syncControls(); show('home'); rebuild();
}
async function rebuild() {
  clearAdvance(); topicError = false;
  let list = allQuestions;
  if (state.mode === 'ticket') list = allQuestions.filter(q => q.ticket === state.ticket);
  else if (state.mode === 'mistakes') list = allQuestions.filter(q => state.mistakes.has(q.id));
  else if (state.mode === 'topic') {
    try { const d = await (await fetch('./topics/' + encodeURIComponent(state.topic) + '.json')).json(); const ids = new Set(d.map(x => x.id)); list = allQuestions.filter(q => ids.has(q.id)); }
    catch (e) { topicError = true; list = []; }
  }
  current = list; if (state.index >= current.length) state.index = 0;
  answeredIndex = -1; lastChoice = -1; render(); refreshMenu();
}
function setContext(mode, ticket, topic) {
  save(); state.mode = mode;
  if (ticket !== undefined) state.ticket = ticket;
  if (topic !== undefined) state.topic = topic;
  state.index = parseInt(store.get('p:' + ctxKey()) || '0', 10) || 0;
  state.session = { ok: 0, bad: 0 }; save(); closeSheets(); show('quiz'); rebuild();
}
function show(v) {
  ['home', 'quiz', 'progress', 'info', 'done', 'empty'].forEach(x => $(x + 'View').hidden = x !== v);
  document.body.dataset.view = v;
  $('appbarMid').style.visibility = v === 'quiz' ? 'visible' : 'hidden';
  if (v === 'home') refreshHome();
  if (v === 'progress') renderProgress();
  if (v === 'info') renderInfo();
  if (v === 'quiz') render();
}
function render() {
  if (!current.length) {
    show('empty');
    $('emptyText').textContent = topicError ? 'Не удалось загрузить тему «' + state.topic + '».' : state.mode === 'mistakes' ? 'Ошибок пока нет — так держать!' : 'В этом разделе пока нет вопросов.';
    $('emptyRetryBtn').hidden = !topicError; return;
  }
  const q = current[state.index], total = current.length, answered = answeredIndex === state.index;
  $('sectionTitle').textContent = titleOf();
  $('sectionCount').textContent = (state.index + 1) + ' / ' + total;
  $('progressFill').style.width = ((state.index + 1) / total * 100) + '%';
  $('qChip').textContent = 'Билет ' + q.ticket;
  $('questionText').textContent = q.text;
  const wrap = $('imageWrap'), img = $('questionImage');
  if (q.image) { const n = String(q.image).split('/').pop(); wrap.hidden = false; img.onerror = () => { img.onerror = () => { wrap.hidden = true; }; img.src = './' + n; }; img.src = './images/' + n; }
  else wrap.hidden = true;
  const box = $('answers'); box.innerHTML = '';
  q.answers.forEach((a, i) => {
    const ok = a.isCorrect === true || (a.isCorrect === undefined && q.correctIndex === i);
    const b = document.createElement('button'); b.className = 'answer';
    b.innerHTML = '<span class="num">' + (i + 1) + '</span><span></span>'; b.lastElementChild.textContent = a.text;
    if (answered) { b.disabled = true; if (ok) b.classList.add('correct'); else if (i === lastChoice) b.classList.add('wrong'); }
    else if (state.showAnswer && entitled() && ok) b.classList.add('reveal');
    b.addEventListener('click', () => answer(i, ok, q)); box.appendChild(b);
  });
  $('prevBtn').disabled = state.index === 0; $('nextBtn').disabled = state.index === total - 1;
  $('autoBar').classList.remove('pending');
}
function answer(i, ok, q) {
  if (answeredIndex === state.index) return;
  answeredIndex = state.index; lastChoice = i;
  [...$('answers').children].forEach((b, k) => {
    b.disabled = true;
    const good = q.answers[k].isCorrect === true || (q.answers[k].isCorrect === undefined && q.correctIndex === k);
    if (good) b.classList.add('correct'); else if (k === i) b.classList.add('wrong');
  });
  if (ok) { state.session.ok++; state.mistakes.delete(q.id); state.mastered.add(q.id); sfx.ok(); }
  else { state.session.bad++; state.mistakes.add(q.id); sfx.bad(); }
  recordDaily(ok); save();
  if (state.auto) { $('autoBar').classList.add('pending'); advanceTimer = setTimeout(() => state.index < current.length - 1 ? next() : complete(), 900); }
}
function clearAdvance() { clearTimeout(advanceTimer); advanceTimer = null; $('autoBar').classList.remove('pending'); }
function next() { clearAdvance(); if (state.index < current.length - 1) { state.index++; answeredIndex = -1; save(); render(); } else complete(); }
function prev() { clearAdvance(); if (state.index > 0) { state.index--; answeredIndex = -1; save(); render(); } }
function complete() {
  clearAdvance(); state.done.add(ctxKey()); save();
  const s = state.session, t = s.ok + s.bad;
  $('doneTitle').textContent = state.mode === 'ticket' ? 'Билет ' + state.ticket + ' пройден!' : 'Раздел пройден!';
  $('doneStats').textContent = t ? 'Верно: ' + s.ok + ' · Ошибок: ' + s.bad + ' · Точность: ' + Math.round(s.ok / t * 100) + '%' : 'Отличная работа!';
  $('nextSectionBtn').textContent = state.mode === 'ticket' ? 'Билет ' + (state.ticket % 40 + 1) + ' →' : state.mode === 'topic' ? 'Следующая тема →' : 'В меню';
  show('done'); sfx.win(); confetti(); refreshMenu();
}
function refreshHome() {
  const st = entStatus(), d = getDaily();
  $('homeChip').textContent = st.kind === 'licensed' ? '✓ Пожизненный доступ' : st.kind === 'trial' ? 'Пробный период: ' + daysLeft(st.left) + ' дн.' : 'Пробный период завершён · «Ответ» 399 ₽';
  $('homeStreak').textContent = streak(d);
  $('homeToday').textContent = (d[todayKey()] || {}).a || 0;
  $('homeContinueBtn').textContent = 'Продолжить: ' + titleOf() + ' →';
}
function renderProgress() {
  const d = getDaily(), t = d[todayKey()] || { a: 0, c: 0, w: 0 };
  $('pgToday').textContent = t.a; $('pgCorrect').textContent = t.c;
  $('pgAcc').textContent = t.a ? Math.round(t.c / t.a * 100) + '%' : '—';
  $('pgStreak').textContent = streak(d);
  let total = 0, corr = 0; Object.values(d).forEach(r => { total += r.a; corr += r.c; });
  $('pgTotal').textContent = total;
  $('pgMastered').textContent = state.mastered.size + ' / ' + (allQuestions.length || 800);
  $('pgMistakes').textContent = state.mistakes.size;
  const N = pgRange, days = [];
  for (let i = N - 1; i >= 0; i--) { const dt = new Date(); dt.setDate(dt.getDate() - i); const k = dt.toLocaleDateString('sv-SE'); days.push({ k, r: d[k] || { a: 0 }, today: i === 0, wd: 'впсрчптсб'[dt.getDay()] }); }
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
function closeSheets() { $('scrim').hidden = true; ['menuSheet', 'ticketSheet', 'topicSheet'].forEach(i => $(i).hidden = true); }
function refreshMenu() {
  const b = (k, tot) => { const v = parseInt(store.get('p:' + k) || '0', 10) || 0; return v > 0 ? 'с ' + (v + 1) + (tot ? '/' + tot : '') : ''; };
  $('badgeAll').textContent = b('all', allQuestions.length);
  $('badgeTicket').textContent = [...state.done].filter(k => k.startsWith('ticket:')).length ? '✓ ' + [...state.done].filter(k => k.startsWith('ticket:')).length : '';
  $('badgeTopic').textContent = b('topic:' + state.topic);
  $('badgeMistakes').textContent = state.mistakes.size ? state.mistakes.size + ' шт.' : '';
  $('badgeProgress').textContent = ((getDaily()[todayKey()] || {}).a || 0) + ' сегодня';
  const st = entStatus();
  $('badgeInfo').textContent = st.kind === 'licensed' ? '✓' : st.kind === 'trial' ? daysLeft(st.left) + ' дн.' : '399 ₽';
}
function buildTickets() {
  const g = $('ticketGrid'); g.innerHTML = '';
  for (let n = 1; n <= 40; n++) {
    const b = document.createElement('button'); b.className = 'ticket-btn'; b.textContent = n;
    const k = 'ticket:' + n, p = parseInt(store.get('p:' + k) || '0', 10) || 0;
    if (state.done.has(k)) b.classList.add('done'); else if (p > 0) b.classList.add('started');
    if (state.mode === 'ticket' && state.ticket === n) b.classList.add('current');
    b.addEventListener('click', () => { sfx.tap(); setContext('ticket', n); }); g.appendChild(b);
  }
}
function buildTopics() {
  const l = $('topicList'); l.innerHTML = '';
  topics.forEach(name => {
    const b = document.createElement('button'); b.className = 'topic-btn';
    const p = parseInt(store.get('p:topic:' + name) || '0', 10) || 0;
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
  cv.width = innerWidth * devicePixelRatio; cv.height = innerHeight * devicePixelRatio; ctx.scale(devicePixelRatio, devicePixelRatio);
  const cols = ['#8B5CF6', '#3D5AFE', '#16A34A', '#F59E0B', '#D7263D', '#0EA5A5'];
  const ps = Array.from({ length: 130 }, () => ({ x: innerWidth / 2 + (Math.random() - .5) * 120, y: innerHeight * .35, vx: (Math.random() - .5) * 9, vy: -Math.random() * 11 - 3, s: Math.random() * 7 + 4, r: Math.random() * Math.PI, vr: (Math.random() - .5) * .3, c: cols[Math.random() * cols.length | 0], life: 1 }));
  cancelAnimationFrame(cRAF); const t0 = performance.now();
  (function loop(t) { const dt = Math.min((t - t0) / 1000, 2.4); ctx.clearRect(0, 0, innerWidth, innerHeight); ps.forEach(p => { p.vy += .22; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life = 1 - dt / 2.4; ctx.save(); ctx.globalAlpha = Math.max(p.life, 0); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * .6); ctx.restore(); }); if (dt < 2.4) cRAF = requestAnimationFrame(loop); else ctx.clearRect(0, 0, innerWidth, innerHeight); })(t0);
}
function syncControls() {
  const ok = entitled();
  if (!ok) state.showAnswer = false;
  $('showAnswer').checked = state.showAnswer;
  $('answerSwitch').classList.toggle('locked', !ok);
  $('switchLock').hidden = ok;
  $('autoAdvance').checked = state.auto;
  $('soundBtn').querySelector('.ic-on').hidden = !state.sound;
  $('soundBtn').querySelector('.ic-off').hidden = state.sound;
}
document.addEventListener('DOMContentLoaded', () => {
  loadData();
  $('homeImg').addEventListener('error', () => { $('homeImg').hidden = true; $('homeFallback').hidden = false; });
  $('logoBtn').addEventListener('click', () => { sfx.tap(); show('home'); });
  $('menuBtn').addEventListener('click', () => { sfx.tap(); openSheet('menuSheet'); });
  $('homeMenuBtn').addEventListener('click', () => openSheet('menuSheet'));
  $('homeContinueBtn').addEventListener('click', () => { show('quiz'); rebuild(); });
  $('scrim').addEventListener('click', closeSheets);
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeSheets));
  document.querySelectorAll('.menu-item').forEach(b => b.addEventListener('click', () => {
    const n = b.dataset.nav; sfx.tap();
    if (n === 'ticket') openSheet('ticketSheet');
    else if (n === 'topic') openSheet('topicSheet');
    else if (n === 'home' || n === 'progress' || n === 'info') { closeSheets(); show(n); }
    else setContext(n);
  }));
  $('answerSwitch').addEventListener('click', e => { if (!entitled()) { e.preventDefault(); show('info'); toast('Пробный период завершён — открой пожизненный доступ'); } });
  $('showAnswer').addEventListener('change', e => { if (!entitled()) { e.target.checked = false; show('info'); return; } state.showAnswer = e.target.checked; save(); render(); });
  $('autoAdvance').addEventListener('change', e => { state.auto = e.target.checked; save(); if (!state.auto) clearAdvance(); });
  $('soundBtn').addEventListener('click', () => { state.sound = !state.sound; save(); syncControls(); if (state.sound) sfx.tap(); });
  $('prevBtn').addEventListener('click', prev); $('nextBtn').addEventListener('click', next);
  $('resetSectionBtn').addEventListener('click', () => { const k = ctxKey(), old = state.index; state.index = 0; state.done.delete(k); save(); rebuild(); closeSheets(); toast('Прогресс раздела сброшен', 'Вернуть', () => { state.index = old; save(); rebuild(); }); });
  $('repeatBtn').addEventListener('click', () => { state.index = 0; state.session = { ok: 0, bad: 0 }; answeredIndex = -1; save(); show('quiz'); render(); });
  $('nextSectionBtn').addEventListener('click', () => { if (state.mode === 'ticket') setContext('ticket', state.ticket % 40 + 1); else if (state.mode === 'topic') { const i = topics.indexOf(state.topic); setContext('topic', undefined, topics[(i + 1) % topics.length] || state.topic); } else openSheet('menuSheet'); });
  $('doneMenuBtn').addEventListener('click', () => openSheet('menuSheet'));
  $('emptyMenuBtn').addEventListener('click', () => openSheet('menuSheet'));
  $('emptyRetryBtn').addEventListener('click', rebuild);
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
  setInterval(() => { syncControls(); if (document.body.dataset.view === 'home') refreshHome(); }, 60000);
  if (!storageOK) toast('Приватный режим: прогресс сохранится только до закрытия вкладки');
  if ('serviceWorker' in navigator) { const had = !!navigator.serviceWorker.controller; navigator.serviceWorker.register('./service-worker.js').catch(() => {}); navigator.serviceWorker.addEventListener('controllerchange', () => { if (had) location.reload(); }); }
});