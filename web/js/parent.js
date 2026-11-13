// Szülői mód (számítógépre): áttekintés, kérések, számonkérések és témák szerkesztése, napló.
import { h, confirmModal, modal, toast } from './dom.js';
import * as L from './logic.js';
import {
  S, emit, today, logout, load, childName, userName,
  addTest, updateTest, deleteTest, addTopic, updateTopic, deleteTopic, decideRequest,
} from './store.js';
import { todoRow, testCard, section, emptyState, longDate, typeInfo, stateBadge, ruleText, KIND_LABEL } from './components.js';

const go = (hash) => { location.hash = hash; };

function nav(active) {
  const pendingCount = (S.data.requests || []).filter((r) => r.status === 'kerve').length;
  const item = (key, href, label) => h('a', { class: 'pnav-item' + (active === key ? ' active' : ''), href }, label);
  return h('header', { class: 'pnav' },
    h('div', { class: 'pnav-brand' }, '🎒 Készülök', h('span', { class: 'muted small' }, ' · szülői mód')),
    h('nav', { class: 'pnav-items' },
      item('attekintes', '#/', 'Áttekintés'),
      item('kerdesek', '#/kerdesek', ['Kérések', pendingCount ? h('span', { class: 'pill' }, pendingCount) : null]),
      item('szamonkeresek', '#/szamonkeresek', 'Számonkérések'),
      item('temak', '#/temak', 'Témák'),
      item('naplo', '#/naplo', 'Napló')),
    h('div', { class: 'pnav-right' },
      h('button', { class: 'btn small ghost', onclick: () => load(), title: 'Adatok újratöltése a táblázatból' }, '↻ Frissítés'),
      h('span', { class: 'muted small' }, S.me.name),
      h('button', { class: 'btn small ghost', onclick: logout }, 'Kijelentkezés')),
  );
}

export function renderParent(root, path, param) {
  const views = {
    '': ['attekintes', overview],
    kerdesek: ['kerdesek', requestsView],
    szamonkeresek: ['szamonkeresek', testsView],
    szamonkeres: ['szamonkeresek', testEditView],
    temak: ['temak', topicsView],
    naplo: ['naplo', logView],
  };
  const [key, fn] = views[path] || views[''];
  const page = h('main', { class: 'ppage' });
  root.append(nav(key), page);
  fn(page, param);
}

// =====================================================================
// Áttekintés
// =====================================================================

function stat(label, value, sub) {
  return h('div', { class: 'stat' }, h('div', { class: 'stat-label' }, label), h('div', { class: 'stat-value' }, value), sub ? h('div', { class: 'muted small' }, sub) : null);
}

function overview(page) {
  const d = S.data;
  const t = today();
  const todos = L.computeTodos(d, t);
  const pts = L.points(d, t);
  const total = todos.ma.length + todos.keszMa.length;
  const pendingReq = (d.requests || []).filter((r) => r.status === 'kerve');

  page.append(
    h('h1', null, `${childName()} · ${longDate(t)}`),
    pendingReq.length ? h('a', { class: 'news', href: '#/kerdesek' }, `🎁 ${pendingReq.length} jutalomkérés vár jóváhagyásra →`) : null,
    h('div', { class: 'stats' },
      stat('Mai teendők', total ? `${todos.keszMa.length} / ${total}` : '–', total ? null : 'ma nincs teendő'),
      stat('Sorozat', `🔥 ${L.streak(d, t)} nap`),
      stat('Elkölthető csillag', `⭐ ${pts.available}`, `összesen ${pts.total}, elköltve ${pts.spent}${pts.pending ? `, függőben ${pts.pending}` : ''}`),
      stat('Pótolnivaló', String(todos.potlas.length), 'elmaradt órai átnézés')),
    h('div', { class: 'grid2' },
      h('div', { class: 'col' },
        section('Mai teendők', null, total
          ? h('div', { class: 'todo-list' }, [...todos.ma.map((x) => todoRow(x, { readOnly: true })), ...todos.keszMa.map((x) => todoRow(x, { done: true, readOnly: true }))])
          : emptyState('🙂', 'Ma nincs teendője.')),
        todos.potlas.length ? section('Pótolnivaló', null, h('div', { class: 'todo-list calm' }, todos.potlas.map((x) => todoRow(x, { readOnly: true })))) : null,
        todos.kesobb.length ? section(`Később esedékes (${todos.kesobb.length})`, null, h('div', { class: 'todo-list' }, todos.kesobb.map((x) => todoRow(x, { readOnly: true })))) : null),
      h('div', { class: 'col' },
        section('Közelgő számonkérések', h('a', { class: 'btn small secondary', href: '#/szamonkeres/uj' }, '+ Új'),
          L.upcomingTests(d, t).length
            ? h('div', { class: 'test-list' }, L.upcomingTests(d, t).map((x) => testCard(x, { href: `#/szamonkeres/${x.id}` })))
            : emptyState('📭', 'Nincs felvett számonkérés.')))),
  );
}

// =====================================================================
// Jutalomkérések
// =====================================================================

const STATUS_TEXT = { kerve: 'Vár', jovahagyva: 'Jóváhagyva', elutasitva: 'Elutasítva', visszavonva: 'Visszavonta' };

function requestsView(page) {
  const d = S.data;
  const pts = L.points(d, today());
  const pending = (d.requests || []).filter((r) => r.status === 'kerve').sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const rest = (d.requests || []).filter((r) => r.status !== 'kerve').sort((a, b) => String(b.at).localeCompare(String(a.at)));

  page.append(
    h('h1', null, 'Jutalomkérések'),
    h('p', { class: 'muted' }, `${childName()} egyenlege: ⭐ ${pts.balance} (ebből függőben ${pts.pending}). A jutalmakat a táblázat Jutalmak lapján szerkesztheted.`),
    section('Jóváhagyásra vár', null, pending.length ? h('div', { class: 'list' }, pending.map((r) => h('div', { class: 'list-row' },
      h('span', null, h('strong', null, r.rewardName), ` · ${r.price} ⭐ · ${String(r.at).slice(0, 16)}`),
      h('span', { class: 'row' },
        h('button', { class: 'btn small secondary', onclick: async () => { if (await decideRequest(r.id, false)) toast('Elutasítva.'); } }, 'Elutasítom'),
        h('button', {
          class: 'btn small primary', onclick: async () => {
            if (pts.balance < r.price && !(await confirmModal('Nincs elég csillag', `Az egyenleg (${pts.balance}) kevesebb, mint az ár (${r.price}). Mégis jóváhagyod?`, 'Jóváhagyom'))) return;
            if (await decideRequest(r.id, true)) toast('Jóváhagyva, a csillagok levonva.', 'success');
          },
        }, 'Jóváhagyom'))))) : emptyState('✔', 'Nincs függő kérés.')),
    rest.length ? section('Korábbiak', null, table(['Időpont', 'Jutalom', 'Ár', 'Állapot', 'Elbírálta'],
      rest.map((r) => [String(r.at).slice(0, 16), r.rewardName, `${r.price} ⭐`, STATUS_TEXT[r.status], userName(r.decidedBy)]))) : null,
  );
}

function table(headers, rows) {
  return h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
    h('thead', null, h('tr', null, headers.map((x) => h('th', null, x)))),
    h('tbody', null, rows.map((r) => h('tr', null, r.map((c) => h('td', null, c)))))));
}

// =====================================================================
// Számonkérések
// =====================================================================

function difficultyLabel(key) { return (L.DIFFICULTIES.find((x) => x.key === key) || {}).label || key; }

function testsView(page) {
  const d = S.data;
  const t = today();
  const sorted = [...(d.tests || [])].sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = sorted.filter((x) => x.date >= t);
  const past = sorted.filter((x) => x.date < t).reverse();
  const rowOf = (x) => {
    const p = L.testProgress(d, x, t);
    const rule = p.rule;
    return [
      x.date, `${L.subjectInfo(d, x.subject).icon} ${x.subject}`, typeInfo(x.type).label, x.title || '–',
      `${difficultyLabel(rule.difficulty)} (${rule.reps}× / ${rule.window} nap)`,
      p.count ? `${p.ready} / ${p.count}` : 'nincs téma', userName(x.createdBy),
      h('a', { class: 'btn small secondary', href: `#/szamonkeres/${x.id}` }, 'Szerkesztés'),
    ];
  };
  const headers = ['Dátum', 'Tantárgy', 'Típus', 'Cím', 'Nehézség', 'Kész témák', 'Felvette', ''];
  page.append(
    h('div', { class: 'row space' }, h('h1', null, 'Számonkérések'), h('a', { class: 'btn primary', href: '#/szamonkeres/uj' }, '+ Új számonkérés')),
    section('Közelgő', null, upcoming.length ? table(headers, upcoming.map(rowOf)) : emptyState('📭', 'Nincs közelgő számonkérés.')),
    past.length ? h('details', { class: 'section' }, h('summary', null, `Korábbiak (${past.length})`), table(headers, past.map(rowOf))) : null,
  );
}

let form = null;

function testEditView(page, id) {
  const d = S.data;
  const t = today();
  const isNew = id === 'uj';
  const test = isNew ? null : d.tests.find((x) => x.id === id);
  if (!isNew && !test) { page.append(emptyState('🤔', 'Ez a számonkérés már nincs meg.'), h('a', { href: '#/szamonkeresek' }, '← Vissza')); return; }

  if (!form || form.id !== id) {
    form = test ? {
      id, date: test.date, subject: test.subject, type: test.type, title: test.title, difficulty: test.difficulty,
      reps: test.reps === '' ? '' : String(test.reps), window: test.window === '' ? '' : String(test.window), note: test.note,
      topicIds: new Set(test.topicIds), newTopics: [], newText: '',
    } : {
      id, date: L.addDays(t, 7), subject: (d.subjects[0] || {}).name || '', type: 'dolgozat', title: '', difficulty: 'kozepes',
      reps: '', window: '', note: '', topicIds: new Set(), newTopics: [], newText: '',
    };
  }
  const f = form;
  const ruleDefault = L.testRule(d, { difficulty: f.difficulty });
  const field = (label, control, hint) => h('label', { class: 'field' }, h('span', null, label), control, hint ? h('span', { class: 'muted small' }, hint) : null);
  const select = (key, options, onchange) => h('select', { class: 'input', onchange: (e) => { f[key] = e.target.value; if (onchange) onchange(); emit(); } },
    options.map(([v, label]) => h('option', { value: v, selected: f[key] === v }, label)));
  const text = (key, attrs = {}) => h('input', { ...attrs, class: 'input', value: f[key], oninput: (e) => { f[key] = e.target.value; } });

  const subjectTopics = (d.topics || []).filter((x) => L.norm(x.subject) === L.norm(f.subject))
    .sort((a, b) => String(b.classDate || b.createdAt).localeCompare(String(a.classDate || a.createdAt)));
  const idx = L.indexLog(d.log);
  const prog = test ? L.testProgress(d, test, t) : null;
  const stateOf = (topicId) => (prog ? prog.states.find((s) => s.topic.id === topicId) : null);

  const addNew = () => {
    const v = f.newText.trim();
    if (v && !f.newTopics.includes(v)) f.newTopics.push(v);
    f.newText = '';
    emit();
    requestAnimationFrame(() => document.getElementById('p-new-topic')?.focus());
  };

  const saveIt = async () => {
    if (f.newText.trim()) addNew();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date)) { toast('Adj meg dátumot!', 'error'); return; }
    const payload = {
      date: f.date, subject: f.subject, type: f.type, title: f.title, difficulty: f.difficulty,
      reps: f.reps, window: f.window, note: f.note, topicIds: [...f.topicIds].filter((x) => subjectTopics.some((s) => s.id === x) || (test && test.topicIds.includes(x))), newTopics: f.newTopics,
    };
    const r = isNew ? await addTest(payload) : await updateTest({ id, ...payload });
    if (r) { toast('Mentve.', 'success'); form = null; go('#/szamonkeresek'); }
  };

  const remove = async () => {
    if (await confirmModal('Törlés', 'Biztosan törlöd ezt a számonkérést? A témák és a napló megmaradnak.', 'Törlöm')) {
      if (await deleteTest(id)) { form = null; go('#/szamonkeresek'); }
    }
  };

  page.append(
    h('a', { class: 'back', href: '#/szamonkeresek', onclick: () => { form = null; } }, '‹ Számonkérések'),
    h('h1', null, isNew ? 'Új számonkérés' : 'Számonkérés szerkesztése'),
    test ? h('p', { class: 'muted' }, `Felvette: ${userName(test.createdBy)} · ${String(test.createdAt).slice(0, 16)}`) : null,
    h('div', { class: 'form-grid' },
      field('Dátum', text('date', { type: 'date' })),
      field('Tantárgy', select('subject', (d.subjects || []).map((s) => [s.name, `${s.icon} ${s.name}`]))),
      field('Típus', select('type', L.TEST_TYPES.map((x) => [x.key, `${x.icon} ${x.label}`]))),
      field('Cím', text('title', { maxlength: 120, placeholder: 'nem kötelező' })),
      field('Nehézség', select('difficulty', L.DIFFICULTIES.map((x) => [x.key, x.label]))),
      field('Ismétlések száma', text('reps', { type: 'number', min: 0, max: 10, placeholder: `alap: ${ruleDefault.reps}` }), 'üresen hagyva a nehézség alapértéke'),
      field('Ismétlési időszak (nap)', text('window', { type: 'number', min: 0, max: 30, placeholder: `alap: ${ruleDefault.window}` }), 'hány nappal előtte kezdődik'),
      field('Megjegyzés', text('note', { maxlength: 500 }))),
    h('p', { class: 'hint' }, ruleText(L.testRule(d, { difficulty: f.difficulty, reps: f.reps, window: f.window }))),
    section('Témák', null,
      subjectTopics.length ? h('div', { class: 'check-list' }, subjectTopics.map((x) => {
        const st = stateOf(x.id);
        const last = (idx.get(x.id) || []).slice(-1)[0];
        return h('label', { class: 'check-row' },
          h('input', { type: 'checkbox', checked: f.topicIds.has(x.id), onchange: (e) => { if (e.target.checked) f.topicIds.add(x.id); else f.topicIds.delete(x.id); } }),
          h('span', { class: 'grow' }, x.title, x.classDate ? h('span', { class: 'muted small' }, ` · órán: ${x.classDate}`) : null),
          last ? h('span', { class: 'muted small' }, `utoljára tanulta: ${last}`) : h('span', { class: 'muted small' }, 'még nem tanulta'),
          st && f.topicIds.has(x.id) ? stateBadge(st, t) : null);
      })) : h('p', { class: 'muted' }, 'Ennek a tantárgynak még nincs témája.'),
      h('div', { class: 'row' },
        h('input', {
          class: 'input', id: 'p-new-topic', placeholder: 'Új téma neve', value: f.newText, maxlength: 120,
          oninput: (e) => { f.newText = e.target.value; }, onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); addNew(); } },
        }),
        h('button', { class: 'btn secondary', onclick: addNew }, '+ Hozzáadás')),
      f.newTopics.length ? h('div', { class: 'chips-wrap' }, f.newTopics.map((x) => h('button', {
        class: 'chip-btn on new', onclick: () => { f.newTopics = f.newTopics.filter((y) => y !== x); emit(); },
      }, `új: ${x}  ✕`))) : null),
    h('div', { class: 'row space' },
      !isNew ? h('button', { class: 'btn ghost danger', onclick: remove }, 'Törlés') : h('span'),
      h('div', { class: 'row' },
        h('a', { class: 'btn secondary', href: '#/szamonkeresek', onclick: () => { form = null; } }, 'Mégse'),
        h('button', { class: 'btn primary', onclick: saveIt, disabled: S.busy > 0 }, 'Mentés'))),
  );
}

// =====================================================================
// Témák
// =====================================================================

let topicFilter = '';
let newTopic = null;

function topicsView(page) {
  const d = S.data;
  const t = today();
  const idx = L.indexLog(d.log);
  const list = (d.topics || [])
    .filter((x) => !topicFilter || L.norm(x.subject) === L.norm(topicFilter))
    .sort((a, b) => String(b.classDate || b.createdAt).localeCompare(String(a.classDate || a.createdAt)));
  if (!newTopic) newTopic = { subject: topicFilter || (d.subjects[0] || {}).name || '', title: '', classDate: t };

  const regText = (x) => {
    const st = L.regularState(d, x, idx.get(x.id) || [], t);
    if (!st) return '–';
    return { kesz: '✔ átnézte', teendo: `teendő (óra: ${st.deadline || '?'})`, elmaradt: `elmaradt (óra: ${st.deadline})`, lejart: 'régen elmaradt' }[st.status];
  };
  const testsOf = (x) => (d.tests || []).filter((tt) => (tt.topicIds || []).includes(x.id)).map((tt) => `${tt.date} ${typeInfo(tt.type).label.toLowerCase()}`).join(', ');

  const add = async () => {
    if (!newTopic.title.trim()) { toast('Írd be a téma nevét!', 'error'); return; }
    const r = await addTopic({ subject: newTopic.subject, title: newTopic.title, classDate: newTopic.classDate || '' });
    if (r) { newTopic.title = ''; toast('Hozzáadva.', 'success'); }
  };

  page.append(
    h('h1', null, 'Témák'),
    h('div', { class: 'panel' },
      h('h2', null, 'Új téma'),
      h('div', { class: 'form-grid' },
        h('label', { class: 'field' }, h('span', null, 'Tantárgy'), h('select', { class: 'input', onchange: (e) => { newTopic.subject = e.target.value; } },
          (d.subjects || []).map((s) => h('option', { value: s.name, selected: newTopic.subject === s.name }, `${s.icon} ${s.name}`)))),
        h('label', { class: 'field' }, h('span', null, 'Téma'), h('input', { class: 'input', value: newTopic.title, maxlength: 120, oninput: (e) => { newTopic.title = e.target.value; }, onkeydown: (e) => { if (e.key === 'Enter') add(); } })),
        h('label', { class: 'field' }, h('span', null, 'Órán vettük'), h('input', { class: 'input', type: 'date', value: newTopic.classDate, oninput: (e) => { newTopic.classDate = e.target.value; } }),
          h('span', { class: 'muted small' }, 'ha üres, nem kerül a rendszeres átnézendők közé')),
        h('div', { class: 'field end' }, h('button', { class: 'btn primary', onclick: add, disabled: S.busy > 0 }, '+ Hozzáadás')))),
    h('div', { class: 'row' }, h('span', null, 'Szűrés:'),
      h('select', { class: 'input auto', onchange: (e) => { topicFilter = e.target.value; emit(); } },
        h('option', { value: '' }, 'Minden tantárgy'),
        (d.subjects || []).map((s) => h('option', { value: s.name, selected: topicFilter === s.name }, s.name)))),
    list.length ? table(['Tantárgy', 'Téma', 'Órán vettük', 'Órai átnézés', 'Tanulta', 'Számonkérés', 'Felvette', ''],
      list.map((x) => [
        `${L.subjectInfo(d, x.subject).icon} ${x.subject}`, x.title, x.classDate || '–', regText(x),
        (idx.get(x.id) || []).length ? `${(idx.get(x.id) || []).length}× (utoljára ${(idx.get(x.id) || []).slice(-1)[0]})` : '–',
        testsOf(x) || '–', userName(x.createdBy),
        h('button', { class: 'btn small secondary', onclick: () => editTopic(x) }, 'Szerkesztés'),
      ])) : emptyState('📘', 'Nincs még téma.'),
  );
}

function editTopic(topic) {
  const d = S.data;
  const f = { title: topic.title, subject: topic.subject, classDate: topic.classDate };
  modal({
    title: 'Téma szerkesztése',
    body: h('div', { class: 'form-grid one' },
      h('label', { class: 'field' }, h('span', null, 'Téma'), h('input', { class: 'input', value: f.title, maxlength: 120, oninput: (e) => { f.title = e.target.value; } })),
      h('label', { class: 'field' }, h('span', null, 'Tantárgy'), h('select', { class: 'input', onchange: (e) => { f.subject = e.target.value; } },
        (d.subjects || []).map((s) => h('option', { value: s.name, selected: L.norm(f.subject) === L.norm(s.name) }, s.name)))),
      h('label', { class: 'field' }, h('span', null, 'Órán vettük'), h('input', { class: 'input', type: 'date', value: f.classDate, oninput: (e) => { f.classDate = e.target.value; } }))),
    actions: [
      {
        label: 'Törlés', kind: 'ghost danger', onClick: async () => {
          if (await confirmModal('Törlöd a témát?', `„${topic.title}” – a számonkérésekből is kikerül. A napló bejegyzései megmaradnak.`, 'Törlöm')) await deleteTopic(topic.id);
        },
      },
      { label: 'Mégse', kind: 'secondary' },
      {
        label: 'Mentés', kind: 'primary', onClick: async () => {
          const r = await updateTopic({ id: topic.id, title: f.title, subject: f.subject, classDate: f.classDate || '' });
          return r ? undefined : true; // hiba esetén nyitva marad
        },
      },
    ],
  });
}

// =====================================================================
// Napló
// =====================================================================

function logView(page) {
  const d = S.data;
  const byId = new Map((d.topics || []).map((x) => [x.id, x]));
  const rows = [...(d.log || [])].sort((a, b) => String(b.at || b.date).localeCompare(String(a.at || a.date))).slice(0, 300);
  page.append(
    h('h1', null, 'Napló'),
    h('p', { class: 'muted' }, 'A legutóbbi 300 tanulás. A teljes napló a táblázat Napló lapján van.'),
    rows.length ? table(['Időpont', 'Tantárgy', 'Téma', 'Típus'], rows.map((l) => {
      const tp = byId.get(l.topicId);
      return [String(l.at || l.date).slice(0, 16), tp ? `${L.subjectInfo(d, tp.subject).icon} ${tp.subject}` : '–', tp ? tp.title : '(törölt téma)', KIND_LABEL[l.kind]];
    })) : emptyState('📒', 'Még nincs bejegyzés.'),
  );
}

