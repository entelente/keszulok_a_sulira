// Gyerek mód: nagy gombok, kevés gépelés, nyugodt visszajelzések.
import { h, add, confirmModal, modal, toast } from './dom.js';
import * as L from './logic.js';
import {
  S, emit, today, addTest, addTopic, updateTest, deleteTest, requestReward, cancelRequest, logout, addHomework, deleteHomework,
} from './store.js';
import {
  todoRow, lessonCard, testCard, section, emptyState, progressBar, subjectDot, longDate, capitalize,
  typeInfo, testTopicRow, ruleText, daysUntilText, weekTimetable, weekTabs, defaultWeekOffset, homeworkRow,
} from './components.js';

const go = (hash) => { location.hash = hash; };
const replace = (hash) => { location.replace(hash); };

function store(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* nem baj */ } }

// =====================================================================
// Főképernyő
// =====================================================================

let lessonDay = null; // a kiválasztott nap az órák panelen (null = automatikus)

function defaultLessonDay(t) {
  const hour = new Date().getHours();
  if (L.isSchoolDay(S.data, t) && hour < 14) return t;
  return L.nextSchoolDays(S.data, L.addDays(t, 1), 1)[0] || t;
}

function lessonDayLabel(t, d) {
  if (d === t) return 'Ma';
  if (d === L.addDays(t, 1)) return 'Holnap';
  return capitalize(L.dayName(d));
}

function topBar(t) {
  const pts = L.points(S.data, t);
  const st = L.streak(S.data, t);
  return h('header', { class: 'topbar' },
    h('div', null,
      h('div', { class: 'hello' }, `Szia, ${S.me.name}!`),
      h('div', { class: 'today' }, longDate(t))),
    h('div', { class: 'chips' },
      h('span', { class: 'chip fire', title: 'Ennyi napja tanulsz egymás után' }, `🔥 ${st} nap`),
      h('a', { class: 'chip star', href: '#/jutalmak', title: 'Csillagaid' }, `⭐ ${pts.available}`)),
  );
}

function rewardNews() {
  const seen = new Set(store('keszulok_seen_requests', []));
  const fresh = (S.data.requests || []).filter((r) => (r.status === 'jovahagyva' || r.status === 'elutasitva') && !seen.has(r.id)
    && r.decidedAt && L.diffDays(today(), String(r.decidedAt).slice(0, 10)) <= 7);
  if (!fresh.length) return null;
  return h('div', { class: 'news' },
    fresh.map((r) => h('div', null, r.status === 'jovahagyva'
      ? `🎉 Jóváhagyták: ${r.rewardName}!`
      : `Most nem fért bele: ${r.rewardName}. A csillagaid megmaradtak.`)),
    h('button', { class: 'btn small secondary', onclick: () => { save('keszulok_seen_requests', [...seen, ...fresh.map((r) => r.id)]); emit(); } }, 'Rendben'));
}

export function renderHome(root) {
  const d = S.data;
  const t = today();
  const todos = L.computeTodos(d, t);
  const hwt = L.homeworkTodos(d, t);
  const hwRow = (it) => homeworkRow(it.homework, { onOpen: openHomework });
  const openCount = todos.ma.length + hwt.ma.length;
  const doneCount = todos.keszMa.length + hwt.keszMa.length;
  const total = openCount + doneCount;

  // --- mai teendők (elöl a házik, mert azoknak a következő óráig kész kell lenniük)
  const todayList = [
    ...hwt.ma.map(hwRow),
    ...todos.ma.map((it) => todoRow(it)),
    ...hwt.keszMa.map(hwRow),
    ...todos.keszMa.map((it) => todoRow(it, { done: true })),
  ];
  let todayEmpty = null;
  if (!total) todayEmpty = emptyState('🙂', 'Ma nincs teendőd.');
  else if (!openCount) todayEmpty = h('div', { class: 'all-done' }, '🎉 Mára minden kész! Szép munka!');

  const todaySection = section('Mai teendőim',
    total ? h('span', { class: 'count' }, `${doneCount} / ${total} kész`) : null,
    total ? progressBar(doneCount / total, { tone: openCount ? 'primary' : 'ok', label: 'Mai haladás' }) : null,
    todayEmpty,
    h('div', { class: 'todo-list' }, todayList),
  );

  const catchUpCount = todos.potlas.length + hwt.potlas.length;
  const catchUp = catchUpCount ? section('Pótolnivaló',
    h('span', { class: 'count' }, `${catchUpCount}`),
    h('p', { class: 'hint' }, 'Ezek az órák már elmúltak, de még nincs kész minden. Ha van időd, pótold!'),
    h('div', { class: 'todo-list calm' }, [...hwt.potlas.map(hwRow), ...todos.potlas.map((it) => todoRow(it))])) : null;

  const laterCount = todos.kesobb.length + hwt.kesobb.length;
  const later = laterCount ? h('details', { class: 'section later' },
    h('summary', null, `Később is ráér (${laterCount})`),
    h('p', { class: 'hint' }, 'Ezeket most még nem kell, de ha előre megcsinálod, az is jó.'),
    h('div', { class: 'todo-list' }, [...hwt.kesobb.map(hwRow), ...todos.kesobb.map((it) => todoRow(it))])) : null;

  // --- órák
  if (!lessonDay || lessonDay < t) lessonDay = defaultLessonDay(t);
  const dayOptions = [...new Set([L.isSchoolDay(d, t) ? t : null, ...L.nextSchoolDays(d, L.addDays(t, 1), 2)].filter(Boolean))].slice(0, 3);
  if (!dayOptions.includes(lessonDay)) lessonDay = dayOptions[0] || t;
  const lessons = L.lessonsOn(d, lessonDay);
  const lessonsSection = section('Órák', h('a', { class: 'home-week-link', href: '#/het' }, '🗓️ Egész hét →'),
    h('div', { class: 'tabs', role: 'tablist' }, dayOptions.map((x) => h('button', {
      class: 'tab' + (x === lessonDay ? ' active' : ''), role: 'tab', 'aria-selected': x === lessonDay ? 'true' : 'false',
      onclick: () => { lessonDay = x; emit(); },
    }, lessonDayLabel(t, x)))),
    h('div', { class: 'lesson-date muted' }, longDate(lessonDay)),
    lessons.length ? h('div', { class: 'lesson-list' }, lessons.map((l) => lessonCard(l, lessonDay)))
      : emptyState('🏖️', 'Ezen a napon nincs óra.'),
  );

  // --- számonkérések
  const tests = L.upcomingTests(d, t).slice(0, 8);
  const testsSection = section('Közelgő számonkérések', null,
    tests.length ? h('div', { class: 'test-list' }, tests.map((x) => testCard(x)))
      : emptyState('📭', 'Nincs felvett számonkérés. Ha lesz, vedd fel a „Dolgozat” gombbal!'));

  add(root, 
    topBar(t),
    rewardNews(),
    h('div', { class: 'grid2' },
      h('div', { class: 'col' }, todaySection, catchUp, later),
      h('div', { class: 'col' }, lessonsSection, testsSection)),
    actionBar(),
  );
}

function actionBar() {
  return h('nav', { class: 'actionbar' },
    h('a', { class: 'action', href: '#/uj-dolgozat/1', onclick: () => { testWiz = null; } }, h('span', { class: 'action-icon' }, '📝'), 'Dolgozat'),
    h('a', { class: 'action', href: '#/uj-hazi/1', onclick: () => { hwWiz = null; } }, h('span', { class: 'action-icon' }, '🏠'), 'Házi'),
    h('a', { class: 'action', href: '#/uj-tema/1', onclick: () => { topicWiz = null; } }, h('span', { class: 'action-icon' }, '📘'), 'Órán vettük'),
    h('a', { class: 'action', href: '#/het' }, h('span', { class: 'action-icon' }, '🗓️'), 'Órarend'),
    h('a', { class: 'action', href: '#/jutalmak' }, h('span', { class: 'action-icon' }, '🎁'), 'Jutalmak'),
  );
}

function pageHead(title, { back = '#/', step, steps } = {}) {
  return h('header', { class: 'pagehead' },
    h('a', { class: 'back', href: back, 'aria-label': 'Vissza' }, '‹ Vissza'),
    h('h1', null, title),
    steps ? h('div', { class: 'steps', 'aria-label': `${step}. lépés a ${steps}-ből` },
      Array.from({ length: steps }, (_, i) => h('span', { class: 'step' + (i < step ? ' on' : '') }))) : h('span'),
  );
}

function topicChoices(subject, selected, onToggle, exclude = []) {
  const n = L.norm(subject);
  const list = (S.data.topics || [])
    .filter((x) => L.norm(x.subject) === n && !exclude.includes(x.id))
    .sort((a, b) => String(b.classDate || b.createdAt).localeCompare(String(a.classDate || a.createdAt)))
    .slice(0, 30);
  if (!list.length) return null;
  return h('div', { class: 'chips-wrap' }, list.map((x) => h('button', {
    class: 'chip-btn' + (selected.has(x.id) ? ' on' : ''), 'aria-pressed': selected.has(x.id) ? 'true' : 'false',
    onclick: () => onToggle(x.id),
  }, (selected.has(x.id) ? '✓ ' : '') + x.title)));
}

function newTopicInput(state, placeholder = 'pl. Igeidők') {
  const addNew = () => {
    const v = (state.newText || '').trim();
    if (!v) return;
    if (!state.newTopics.includes(v)) state.newTopics.push(v);
    state.newText = '';
    state.focusNew = true;
    emit();
  };
  const input = h('input', {
    type: 'text', class: 'input', id: 'new-topic', placeholder, maxlength: 120, value: state.newText || '',
    enterkeyhint: 'done', autocomplete: 'off',
    oninput: (e) => { state.newText = e.target.value; },
    onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); addNew(); } },
  });
  if (state.focusNew) { state.focusNew = false; requestAnimationFrame(() => document.getElementById('new-topic')?.focus()); }
  return h('div', null,
    h('div', { class: 'row' }, input, h('button', { class: 'btn secondary', onclick: addNew }, '+ Hozzáadom')),
    state.newTopics.length ? h('div', { class: 'chips-wrap' }, state.newTopics.map((x) => h('button', {
      class: 'chip-btn on new', 'aria-label': 'Eltávolítás: ' + x,
      onclick: () => { state.newTopics = state.newTopics.filter((y) => y !== x); emit(); },
    }, '✓ ' + x + '  ✕'))) : null);
}

// =====================================================================
// Új dolgozat
// =====================================================================

let testWiz = null;

export function renderAddTest(root, step) {
  const d = S.data;
  const t = today();
  if (!testWiz) testWiz = { date: null, subject: null, type: null, title: '', topicIds: new Set(), newTopics: [], newText: '' };
  const w = testWiz;
  if ((step >= 2 && !w.date) || (step >= 3 && !w.subject) || (step >= 4 && !w.type)) { go('#/uj-dolgozat/1'); return; }
  if (step === 'kesz' && !w.savedId) { go('#/'); return; }

  if (step === 1) {
    const days = L.nextSchoolDays(d, L.addDays(t, 1), 15);
    const monday = (x) => L.addDays(x, 1 - L.weekday(x));
    const groups = new Map();
    for (const x of days) {
      const wk = Math.round(L.diffDays(monday(x), monday(t)) / 7);
      if (!groups.has(wk)) groups.set(wk, []);
      groups.get(wk).push(x);
    }
    const weekLabel = (n) => (n === 0 ? 'Ezen a héten' : n === 1 ? 'Jövő héten' : `${n} hét múlva`);
    add(root, pageHead('Új dolgozat', { step: 1, steps: 4 }),
      h('h2', { class: 'question' }, 'Melyik napon lesz?'),
      [...groups].map(([wk, list]) => h('div', { class: 'week' },
        h('div', { class: 'week-label' }, weekLabel(wk)),
        h('div', { class: 'day-grid' }, list.map((x) => h('button', {
          class: 'day-btn' + (w.date === x ? ' on' : ''),
          onclick: () => { w.date = x; w.subject = null; go('#/uj-dolgozat/2'); },
        },
        h('span', { class: 'day-name' }, capitalize(L.dayName(x))),
        h('span', { class: 'day-date' }, L.monthDay(x)),
        h('span', { class: 'day-icons' }, L.lessonsOn(d, x).map((l) => L.subjectInfo(d, l.subject).icon).join(' ')))))),
      ));
    return;
  }

  if (step === 2) {
    const subjects = [...new Set(L.lessonsOn(d, w.date).map((l) => l.subject))];
    const others = (d.subjects || []).map((s) => s.name).filter((n) => !subjects.includes(n));
    const pick = (name) => { w.subject = name; w.topicIds = new Set(); go('#/uj-dolgozat/3'); };
    add(root, pageHead('Új dolgozat', { back: '#/uj-dolgozat/1', step: 2, steps: 4 }),
      h('h2', { class: 'question' }, `Melyik órán? (${L.dayName(w.date)}, ${L.monthDay(w.date)})`),
      h('div', { class: 'big-grid' }, subjects.map((name) => subjectButton(name, () => pick(name)))),
      others.length ? h('details', { class: 'more' }, h('summary', null, 'Nincs a listában?'),
        h('div', { class: 'big-grid small' }, others.map((name) => subjectButton(name, () => pick(name))))) : null,
    );
    return;
  }

  if (step === 3) {
    add(root, pageHead('Új dolgozat', { back: '#/uj-dolgozat/2', step: 3, steps: 4 }),
      h('h2', { class: 'question' }, 'Mi lesz?'),
      h('div', { class: 'big-grid' }, L.TEST_TYPES.map((ty) => h('button', {
        class: 'big-btn' + (w.type === ty.key ? ' on' : ''),
        onclick: () => { w.type = ty.key; go('#/uj-dolgozat/4'); },
      }, h('span', { class: 'big-icon' }, ty.icon), ty.label))));
    return;
  }

  if (step === 4) {
    const subj = L.subjectInfo(d, w.subject);
    const toggle = (id) => { if (w.topicIds.has(id)) w.topicIds.delete(id); else w.topicIds.add(id); emit(); };
    const chips = topicChoices(w.subject, w.topicIds, toggle);
    const saveIt = async () => {
      if (w.newText && w.newText.trim() && !w.newTopics.includes(w.newText.trim())) w.newTopics.push(w.newText.trim());
      const r = await addTest({ date: w.date, subject: w.subject, type: w.type, title: w.title, topicIds: [...w.topicIds], newTopics: w.newTopics });
      if (r) { w.savedId = r.test.id; replace('#/uj-dolgozat/kesz'); }
    };
    add(root, pageHead('Új dolgozat', { back: '#/uj-dolgozat/3', step: 4, steps: 4 }),
      h('div', { class: 'summary-line' }, subjectDot(w.subject), ` ${subj.name} ${typeInfo(w.type).label.toLowerCase()} · ${L.dayName(w.date)}, ${L.monthDay(w.date)}`),
      h('h2', { class: 'question' }, 'Miből lesz?'),
      chips ? h('p', { class: 'hint' }, 'Koppints azokra a témákra, amik kellenek:') : null,
      chips,
      h('p', { class: 'hint' }, chips ? 'Vagy írj be újat:' : 'Írd be a témákat egyesével:'),
      newTopicInput(w),
      h('label', { class: 'field' }, h('span', null, 'Címe (nem kötelező)'),
        h('input', { type: 'text', class: 'input', maxlength: 120, value: w.title, placeholder: 'pl. Petőfi Sándor', oninput: (e) => { w.title = e.target.value; } })),
      h('p', { class: 'hint' }, 'A témákat később is hozzáadhatod.'),
      h('div', { class: 'footer-actions' }, h('button', { class: 'btn primary big', onclick: saveIt, disabled: S.busy > 0 }, 'Mentés')),
    );
    return;
  }

  // kész
  const test = d.tests.find((x) => x.id === w.savedId);
  add(root, h('div', { class: 'done-screen' },
    h('div', { class: 'done-emoji' }, '✅'),
    h('h1', null, 'Felvetted!'),
    test ? h('p', { class: 'big-text' }, `${L.subjectInfo(d, test.subject).name} ${typeInfo(test.type).label.toLowerCase()}: ${L.dayName(test.date)}, ${L.monthDay(test.date)}`) : null,
    h('div', { class: 'footer-actions' },
      h('a', { class: 'btn secondary big', href: `#/dolgozat/${w.savedId}` }, 'Megnézem'),
      h('a', { class: 'btn primary big', href: '#/', onclick: () => { testWiz = null; } }, 'Rendben')),
  ));
}

function subjectButton(name, onclick, on = false) {
  const s = L.subjectInfo(S.data, name);
  return h('button', { class: 'big-btn subj' + (on ? ' on' : ''), style: { '--subj': s.color }, onclick },
    h('span', { class: 'big-icon' }, s.icon), s.name);
}

// =====================================================================
// Házi feladat
// =====================================================================

let hwWiz = null;

/** A legutóbbi tanítási nap (ma, vagy hétvégén a péntek): ezen kaphatta a házit. */
function lastSchoolDay(t) {
  for (let i = 0; i < 14; i++) {
    const x = L.addDays(t, -i);
    if (L.isSchoolDay(S.data, x)) return x;
  }
  return t;
}

function openHomework(hw) {
  const t = today();
  const subj = L.subjectInfo(S.data, hw.subject);
  const mine = L.norm(hw.createdBy) === L.norm(S.me.email);
  const actions = [];
  if (mine) {
    actions.push({
      label: 'Törlöm', kind: 'secondary',
      onClick: async () => {
        if (await confirmModal('Törlöd ezt a házit?', 'Ha rosszul vetted fel, nyugodtan töröld, és vedd fel újra.', 'Törlöm')) await deleteHomework(hw.id);
      },
    });
  }
  actions.push({ label: 'Bezárás', kind: 'primary' });
  modal({
    title: `🏠 ${subj.icon} ${subj.name} házi`,
    body: [
      h('p', { class: 'big-text' }, hw.task || 'Nincs leírás.'),
      hw.dueDate ? h('p', null, `Határidő: ${longDate(hw.dueDate)} (${L.relDay(t, hw.dueDate)})`) : null,
      hw.doneDate ? h('p', null, `✓ Kész: ${L.relDay(t, hw.doneDate)}`) : h('p', { class: 'muted' }, 'Ha megcsináltad, pipáld ki a listában.'),
    ],
    actions,
  });
}

export function renderAddHomework(root, step) {
  const d = S.data;
  const t = today();
  if (!hwWiz) hwWiz = { subject: null, dueDate: null, task: '', saved: null };
  const w = hwWiz;
  if ((step >= 2 && !w.subject) || (step >= 3 && !w.dueDate)) { go('#/uj-hazi/1'); return; }
  if (step === 'kesz' && !w.saved) { go('#/'); return; }

  if (step === 1) {
    const day = lastSchoolDay(t);
    const recent = [...new Set(L.lessonsOn(d, day).map((l) => l.subject))];
    const others = (d.subjects || []).map((s) => s.name).filter((n) => !recent.includes(n));
    const pick = (name) => { w.subject = name; w.dueDate = null; go('#/uj-hazi/2'); };
    add(root, pageHead('Házi feladat', { step: 1, steps: 3 }),
      h('h2', { class: 'question' }, 'Melyik órán kaptad?'),
      recent.length ? [
        h('p', { class: 'hint' }, day === t ? 'Mai órák:' : `${capitalize(L.dayName(day))}i órák:`),
        h('div', { class: 'big-grid' }, recent.map((n) => subjectButton(n, () => pick(n), w.subject === n))),
        h('details', { class: 'more' }, h('summary', null, 'Másik tantárgy'), h('div', { class: 'big-grid small' }, others.map((n) => subjectButton(n, () => pick(n))))),
      ] : h('div', { class: 'big-grid small' }, others.map((n) => subjectButton(n, () => pick(n)))),
    );
    return;
  }

  if (step === 2) {
    const next = [];
    let from = t;
    for (let i = 0; i < 3; i++) {
      const x = L.nextLessonDate(d, w.subject, from);
      if (!x) break;
      next.push(x);
      from = x;
    }
    const otherDays = L.nextSchoolDays(d, L.addDays(t, 1), 10).filter((x) => !next.includes(x));
    const pick = (x) => { w.dueDate = x; go('#/uj-hazi/3'); };
    const dayBtn = (x, tag) => h('button', { class: 'day-btn' + (w.dueDate === x ? ' on' : ''), onclick: () => pick(x) },
      h('span', { class: 'day-name' }, capitalize(L.dayName(x))),
      h('span', { class: 'day-date' }, L.monthDay(x)),
      tag ? h('span', { class: 'day-tag' }, tag) : null);
    add(root, pageHead('Házi feladat', { back: '#/uj-hazi/1', step: 2, steps: 3 }),
      h('div', { class: 'summary-line' }, subjectDot(w.subject), ' ' + L.subjectInfo(d, w.subject).name),
      h('h2', { class: 'question' }, 'Mikorra kell?'),
      next.length
        ? h('div', { class: 'day-grid' }, next.map((x, i) => dayBtn(x, i === 0 ? 'következő óra' : null)))
        : h('p', { class: 'hint' }, 'Ennek a tantárgynak nem találtam órát az órarendben. Válassz napot:'),
      h('details', { class: 'more', open: !next.length }, h('summary', null, 'Másik nap'),
        h('div', { class: 'day-grid' }, otherDays.map((x) => dayBtn(x)))),
    );
    return;
  }

  if (step === 3) {
    const saveIt = async () => {
      const r = await addHomework({ subject: w.subject, dueDate: w.dueDate, task: (w.task || '').trim() });
      if (r) { w.saved = r.homework; replace('#/uj-hazi/kesz'); }
    };
    add(root, pageHead('Házi feladat', { back: '#/uj-hazi/2', step: 3, steps: 3 }),
      h('div', { class: 'summary-line' }, subjectDot(w.subject), ` ${L.subjectInfo(d, w.subject).name} · határidő: ${L.relDay(t, w.dueDate)}`),
      h('h2', { class: 'question' }, 'Mi a feladat?'),
      h('input', {
        type: 'text', class: 'input big', id: 'hw-task', maxlength: 300, value: w.task, placeholder: 'pl. 45. oldal, 3. feladat',
        autocomplete: 'off', enterkeyhint: 'done',
        oninput: (e) => { w.task = e.target.value; },
        onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } },
      }),
      h('p', { class: 'hint' }, 'Nem kötelező kitölteni.'),
      h('div', { class: 'footer-actions' }, h('button', { class: 'btn primary big', onclick: saveIt, disabled: S.busy > 0 }, 'Mentés')),
    );
    return;
  }

  // kész
  const hw = w.saved;
  add(root, h('div', { class: 'done-screen' },
    h('div', { class: 'done-emoji' }, '✅'),
    h('h1', null, 'Felvetted!'),
    h('p', { class: 'big-text' }, `${L.subjectInfo(d, hw.subject).name} házi · határidő: ${L.relDay(t, hw.dueDate)}`),
    hw.task ? h('p', null, hw.task) : null,
    h('p', { class: 'hint' }, 'Ha megcsináltad, pipáld ki a teendőid között.'),
    h('div', { class: 'footer-actions' },
      h('button', { class: 'btn secondary big', onclick: () => { hwWiz = null; go('#/uj-hazi/1'); } }, 'Még egy házi'),
      h('a', { class: 'btn primary big', href: '#/', onclick: () => { hwWiz = null; } }, 'Kész')),
  ));
}

// =====================================================================
// Órán vettük (új téma)
// =====================================================================

let topicWiz = null;

export function renderAddTopic(root, step) {
  const d = S.data;
  const t = today();
  if (!topicWiz) topicWiz = { subject: null, title: '', when: 0, testIds: new Set(), saved: null };
  const w = topicWiz;
  if (step >= 2 && !w.subject) { go('#/uj-tema/1'); return; }
  if (step === 'kesz' && !w.saved) { go('#/'); return; }

  if (step === 1) {
    const todays = [...new Set(L.lessonsOn(d, t).map((l) => l.subject))];
    const others = (d.subjects || []).map((s) => s.name).filter((n) => !todays.includes(n));
    const pick = (name) => { w.subject = name; w.testIds = new Set(); go('#/uj-tema/2'); };
    add(root, pageHead('Órán vettük', { step: 1, steps: 2 }),
      h('h2', { class: 'question' }, 'Melyik órán?'),
      todays.length ? h('div', { class: 'big-grid' }, todays.map((n) => subjectButton(n, () => pick(n), w.subject === n))) : null,
      todays.length
        ? h('details', { class: 'more' }, h('summary', null, 'Másik tantárgy'), h('div', { class: 'big-grid small' }, others.map((n) => subjectButton(n, () => pick(n)))))
        : h('div', { class: 'big-grid small' }, others.map((n) => subjectButton(n, () => pick(n)))),
    );
    return;
  }

  if (step === 2) {
    const tests = L.upcomingTests(d, t).filter((x) => L.norm(x.subject) === L.norm(w.subject) && x.date > t);
    const whenOpts = [{ v: 0, label: 'Ma' }, { v: 1, label: 'Tegnap' }, { v: 2, label: 'Tegnapelőtt' }];
    const saveIt = async () => {
      const title = (w.title || '').trim();
      if (!title) { toast('Írd be, mit vettetek!', 'info'); document.getElementById('topic-title')?.focus(); return; }
      const r = await addTopic({ subject: w.subject, title, classDate: L.addDays(t, -w.when), testIds: [...w.testIds] });
      if (r) { w.saved = r.topic; replace('#/uj-tema/kesz'); }
    };
    add(root, pageHead('Órán vettük', { back: '#/uj-tema/1', step: 2, steps: 2 }),
      h('div', { class: 'summary-line' }, subjectDot(w.subject), ' ' + L.subjectInfo(d, w.subject).name),
      h('h2', { class: 'question' }, 'Mit vettetek?'),
      h('input', {
        type: 'text', class: 'input big', id: 'topic-title', maxlength: 120, value: w.title, placeholder: 'pl. Törtek összeadása',
        autocomplete: 'off', enterkeyhint: 'done',
        oninput: (e) => { w.title = e.target.value; },
        onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } },
      }),
      h('h2', { class: 'question' }, 'Mikor?'),
      h('div', { class: 'seg' }, whenOpts.map((o) => h('button', {
        class: 'seg-btn' + (w.when === o.v ? ' on' : ''), onclick: () => { w.when = o.v; emit(); },
      }, o.label))),
      tests.length ? [
        h('h2', { class: 'question' }, 'Kell valamelyik dolgozathoz is?'),
        h('div', { class: 'chips-wrap' }, tests.map((x) => h('button', {
          class: 'chip-btn' + (w.testIds.has(x.id) ? ' on' : ''),
          onclick: () => { if (w.testIds.has(x.id)) w.testIds.delete(x.id); else w.testIds.add(x.id); emit(); },
        }, `${w.testIds.has(x.id) ? '✓ ' : ''}${typeInfo(x.type).icon} ${L.relDay(t, x.date)}${x.title ? ' – ' + x.title : ''}`))),
      ] : null,
      h('div', { class: 'footer-actions' }, h('button', { class: 'btn primary big', onclick: saveIt, disabled: S.busy > 0 }, 'Mentés')),
    );
    if (!w.title) requestAnimationFrame(() => document.getElementById('topic-title')?.focus());
    return;
  }

  // kész
  const topic = w.saved;
  const deadline = topic.classDate ? L.nextLessonDate(d, topic.subject, topic.classDate) : null;
  add(root, h('div', { class: 'done-screen' },
    h('div', { class: 'done-emoji' }, '✅'),
    h('h1', null, 'Felvetted!'),
    h('p', { class: 'big-text' }, topic.title),
    deadline ? h('p', null, `Nézd át a következő ${L.subjectInfo(d, topic.subject).name.toLowerCase()}óráig: ${L.relDay(t, deadline)}.`) : null,
    h('div', { class: 'footer-actions' },
      h('button', { class: 'btn secondary big', onclick: () => { topicWiz = { subject: topic.subject, title: '', when: w.when, testIds: new Set(w.testIds), saved: null }; go('#/uj-tema/2'); } }, 'Még egy téma'),
      h('a', { class: 'btn primary big', href: '#/', onclick: () => { topicWiz = null; } }, 'Kész')),
  ));
}

// =====================================================================
// Számonkérés részletei
// =====================================================================

const detailState = new Map(); // dolgozat ID → { open, selected, newTopics, newText }

export function renderTestDetail(root, id) {
  const d = S.data;
  const t = today();
  const test = d.tests.find((x) => x.id === id);
  if (!test) { add(root, pageHead('Számonkérés'), emptyState('🤔', 'Ez a számonkérés már nincs meg.')); return; }
  const subj = L.subjectInfo(d, test.subject);
  const prog = L.testProgress(d, test, t);
  const ti = typeInfo(test.type);
  if (!detailState.has(id)) detailState.set(id, { open: false, selected: new Set(), newTopics: [], newText: '' });
  const ds = detailState.get(id);
  const past = test.date < t;

  const addPanel = () => {
    if (!ds.open) return h('button', { class: 'btn secondary', onclick: () => { ds.open = true; emit(); } }, '+ Téma hozzáadása');
    const toggle = (tid) => { if (ds.selected.has(tid)) ds.selected.delete(tid); else ds.selected.add(tid); emit(); };
    const chips = topicChoices(test.subject, ds.selected, toggle, test.topicIds);
    const saveIt = async () => {
      if (ds.newText && ds.newText.trim() && !ds.newTopics.includes(ds.newText.trim())) ds.newTopics.push(ds.newText.trim());
      if (!ds.selected.size && !ds.newTopics.length) { ds.open = false; emit(); return; }
      const r = await updateTest({ id, topicIds: [...test.topicIds, ...ds.selected], newTopics: ds.newTopics });
      if (r) { detailState.delete(id); toast('Hozzáadtad!', 'success'); }
    };
    return h('div', { class: 'panel' },
      chips ? [h('p', { class: 'hint' }, 'Korábbi témák:'), chips] : null,
      h('p', { class: 'hint' }, 'Új téma:'),
      newTopicInput(ds),
      h('div', { class: 'row end' },
        h('button', { class: 'btn secondary', onclick: () => { detailState.delete(id); emit(); } }, 'Mégse'),
        h('button', { class: 'btn primary', onclick: saveIt, disabled: S.busy > 0 }, 'Hozzáadom')));
  };

  const own = test.createdBy && test.createdBy === S.me.email;
  add(root, 
    pageHead(`${subj.name} ${ti.label.toLowerCase()}`),
    h('div', { class: 'detail-head', style: { '--subj': subj.color } },
      h('span', { class: 'big-icon' }, subj.icon),
      h('div', null,
        h('div', { class: 'strong big-text' }, `${capitalize(L.dayName(test.date))}, ${L.monthDay(test.date)}`),
        h('div', { class: 'muted' }, past ? 'Már elmúlt' : daysUntilText(t, test.date)),
        test.title ? h('div', null, test.title) : null)),
    prog.count ? h('div', { class: 'section' },
      h('div', { class: 'section-head' }, h('h2', null, 'Felkészülés'), h('span', { class: 'count' }, `${prog.ready} / ${prog.count} téma kész`)),
      progressBar(prog.ratio, { tone: prog.ready === prog.count ? 'ok' : 'primary' }),
      h('p', { class: 'hint' }, ruleText(prog.rule)),
      h('div', { class: 'todo-list' }, prog.states.map((st) => testTopicRow(test, st, { readOnly: past })))) : emptyState('📝', 'Még nincs téma. Add hozzá, miből lesz!'),
    !past ? addPanel() : null,
    test.note ? h('p', { class: 'note' }, '🗒️ ' + test.note) : null,
    own && !past ? h('div', { class: 'danger-zone' }, h('button', {
      class: 'btn ghost', onclick: async () => {
        if (await confirmModal('Törlöd?', 'Biztosan törlöd ezt a számonkérést? A témák megmaradnak.', 'Igen, törlöm')) {
          if (await deleteTest(id)) go('#/');
        }
      },
    }, 'Rosszul vettem fel – törlöm')) : null,
  );
}

// =====================================================================
// Jutalmak
// =====================================================================

// =====================================================================
// Heti órarend
// =====================================================================

export function renderWeek(root, param) {
  const offset = param === 0 || param === 1 ? param : defaultWeekOffset();
  add(root,
    pageHead('Órarend'),
    weekTabs(offset, '#/het'),
    weekTimetable(offset, { testHref: (test) => `#/dolgozat/${test.id}` }),
  );
}

export function renderRewards(root) {
  const d = S.data;
  const t = today();
  const pts = L.points(d, t);
  const pending = (d.requests || []).filter((r) => r.status === 'kerve');
  const history = (d.requests || []).filter((r) => r.status === 'jovahagyva' || r.status === 'elutasitva')
    .sort((a, b) => String(b.decidedAt).localeCompare(String(a.decidedAt))).slice(0, 6);
  const rewards = (d.rewards || []).filter((r) => r.active).sort((a, b) => a.price - b.price);

  const ask = async (r) => {
    const ok = await confirmModal('Ezt kéred?', h('div', { class: 'center' },
      h('div', { class: 'done-emoji' }, r.icon), h('p', { class: 'big-text' }, r.name), h('p', null, `${r.price} ⭐ · A szüleid jóváhagyják.`)), 'Igen, kérem');
    if (ok && await requestReward(r.id)) toast('Elküldve! Ha jóváhagyják, itt látod majd.', 'success');
  };

  add(root, 
    pageHead('Jutalmak'),
    h('div', { class: 'balance' },
      h('div', { class: 'balance-num' }, `⭐ ${pts.available}`),
      h('div', null, 'csillagod van'),
      h('div', { class: 'muted' }, `Eddig összesen ${pts.total} ⭐ csillagot gyűjtöttél`)),
    pending.length ? section('Jóváhagyásra vár', null, h('div', { class: 'list' }, pending.map((r) => h('div', { class: 'list-row' },
      h('span', null, `⏳ ${r.rewardName} · ${r.price} ⭐`),
      h('button', { class: 'btn small ghost', onclick: async () => { if (await confirmModal('Visszavonod?', `Visszavonod ezt a kérést: ${r.rewardName}?`, 'Igen')) cancelRequest(r.id); } }, 'Visszavonom'))))) : null,
    section('Mit kaphatsz?', null,
      rewards.length ? h('div', { class: 'reward-grid' }, rewards.map((r) => {
        const enough = pts.available >= r.price;
        return h('div', { class: 'reward' + (enough ? ' ready' : '') },
          h('div', { class: 'reward-icon' }, r.icon),
          h('div', { class: 'reward-name' }, r.name),
          h('div', { class: 'reward-price' }, `${r.price} ⭐`),
          enough
            ? h('button', { class: 'btn primary', onclick: () => ask(r), disabled: S.busy > 0 }, 'Ezt szeretném')
            : [progressBar(pts.available / r.price, { tone: 'star' }), h('div', { class: 'muted small' }, `Még ${r.price - pts.available} ⭐`)]);
      })) : emptyState('🎁', 'Még nincsenek jutalmak. Kérd meg a szüleidet, hogy írjanak be párat!')),
    history.length ? section('Korábban', null, h('div', { class: 'list' }, history.map((r) => h('div', { class: 'list-row' },
      h('span', null, `${r.status === 'jovahagyva' ? '🎉' : '–'} ${r.rewardName}`),
      h('span', { class: 'muted' }, r.status === 'jovahagyva' ? `${r.price} ⭐` : 'most nem'))))) : null,
    h('div', { class: 'danger-zone' }, h('button', {
      class: 'btn small ghost',
      onclick: async () => { if (await confirmModal('Kijelentkezel?', 'Utána újra be kell jelentkezni a Google-fiókkal.', 'Kijelentkezem')) logout(); },
    }, 'Kijelentkezés')),
  );
}
