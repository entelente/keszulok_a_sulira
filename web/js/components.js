// Közös építőelemek a gyerek és a szülői nézethez.
import { h } from './dom.js';
import * as L from './logic.js';
import { S, today, toggleStudy, studiedToday } from './store.js';

export const KIND_LABEL = { atnezes: 'Átnézés', ismetles: 'Ismétlés' };

export function typeInfo(key) {
  return L.TEST_TYPES.find((t) => t.key === key) || L.TEST_TYPES[0];
}

export function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

export function longDate(d) { return `${capitalize(L.dayName(d))}, ${L.monthDay(d)}`; }

export function daysUntilText(today, d) {
  const n = L.diffDays(d, today);
  if (n === 0) return 'ma';
  if (n === 1) return 'holnap';
  return `${n} nap múlva`;
}

export function subjectDot(name, size = '') {
  const s = L.subjectInfo(S.data, name);
  return h('span', { class: 'subject-dot ' + size, style: { '--subj': s.color }, 'aria-hidden': 'true' }, s.icon);
}

export function progressBar(ratio, { tone = 'primary', label = '' } = {}) {
  const pct = Math.round(Math.max(0, Math.min(1, ratio || 0)) * 100);
  return h('div', { class: 'progress ' + tone, role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': label },
    h('div', { class: 'progress-fill', style: { width: pct + '%' } }));
}

export function emptyState(emoji, text) {
  return h('div', { class: 'empty' }, h('span', { class: 'empty-emoji', 'aria-hidden': 'true' }, emoji), h('span', null, text));
}

export function section(title, extra, ...content) {
  return h('section', { class: 'section' },
    h('div', { class: 'section-head' }, h('h2', null, title), extra || null),
    ...content);
}

// ---------- teendő sor ----------

function todoReason(item, t) {
  const parts = [];
  const test = item.tests && item.tests.length ? [...item.tests].sort((a, b) => a.date.localeCompare(b.date))[0] : null;
  if (test) parts.push(`${typeInfo(test.type).icon} ${typeInfo(test.type).label}: ${L.relDay(t, test.date)}`);
  if (item.lessonDeadline) {
    parts.push(item.lessonDeadline < t
      ? `Az óra már elmúlt (${L.relDay(t, item.lessonDeadline)})`
      : `Következő óra: ${L.relDay(t, item.lessonDeadline)}`);
  }
  return parts.join(' · ');
}

/** Egy pipálható teendő. `item`: a logic.computeTodos egy eleme. */
export function todoRow(item, { done = false, readOnly = false } = {}) {
  const t = today();
  const topic = item.topic;
  const pending = S.pending.has(topic.id);
  const subj = L.subjectInfo(S.data, topic.subject);
  const label = `${KIND_LABEL[item.kind]} · ${subj.name}`;
  return h('div', { class: 'todo' + (done ? ' done' : ''), style: { '--subj': subj.color } },
    readOnly
      ? h('span', { class: 'check' + (done ? ' on' : ''), 'aria-hidden': 'true' }, done ? '✓' : '')
      : h('button', {
        class: 'check' + (done ? ' on' : '') + (pending ? ' pending' : ''),
        'aria-label': (done ? 'Visszavonás: ' : 'Kész: ') + topic.title,
        'aria-pressed': done ? 'true' : 'false',
        disabled: pending,
        onclick: () => toggleStudy(topic.id),
      }, done ? '✓' : ''),
    h('div', { class: 'todo-main' },
      h('div', { class: 'todo-title' }, topic.title),
      h('div', { class: 'todo-sub' }, h('span', { class: 'todo-subject' }, subj.icon + ' ' + label),
        !done && todoReason(item, t) ? h('span', { class: 'todo-reason' }, todoReason(item, t)) : null),
    ),
  );
}

// ---------- óra kártya ----------

export function lessonCard(lesson, date) {
  const subj = L.subjectInfo(S.data, lesson.subject);
  const tests = (S.data.tests || []).filter((t) => t.date === date && L.norm(t.subject) === L.norm(lesson.subject));
  return h('div', { class: 'lesson', style: { '--subj': subj.color } },
    h('div', { class: 'lesson-period' }, h('span', { class: 'lesson-num' }, lesson.period + '.'),
      lesson.start ? h('span', { class: 'lesson-time' }, lesson.start) : null),
    h('span', { class: 'lesson-icon', 'aria-hidden': 'true' }, subj.icon),
    h('div', { class: 'lesson-main' },
      h('div', { class: 'lesson-name' }, subj.name),
      tests.map((t) => h('div', { class: 'badge test' }, `${typeInfo(t.type).icon} ${typeInfo(t.type).label.toUpperCase()}${t.title ? ' – ' + t.title : ''}`)),
      subj.equipment ? h('div', { class: 'badge equip' }, '🎒 ' + subj.equipment) : null,
    ),
  );
}

// ---------- számonkérés kártya ----------

export function testCard(test, { href } = {}) {
  const t = today();
  const subj = L.subjectInfo(S.data, test.subject);
  const prog = L.testProgress(S.data, test, t);
  const ti = typeInfo(test.type);
  const status = prog.count === 0
    ? h('span', { class: 'muted' }, 'Még nincs téma – koppints ide, és add hozzá!')
    : h('span', null, `${prog.ready} / ${prog.count} téma kész`);
  return h('a', { class: 'test-card', href: href || `#/dolgozat/${test.id}`, style: { '--subj': subj.color } },
    h('div', { class: 'test-card-head' },
      h('span', { class: 'lesson-icon', 'aria-hidden': 'true' }, subj.icon),
      h('div', { class: 'test-card-title' },
        h('div', { class: 'strong' }, `${subj.name} ${ti.label.toLowerCase()}`),
        test.title ? h('div', { class: 'muted' }, test.title) : null),
      h('div', { class: 'test-card-date' },
        h('div', { class: 'strong' }, capitalize(L.relDay(t, test.date))),
        h('div', { class: 'muted' }, daysUntilText(t, test.date))),
    ),
    progressBar(prog.ratio, { tone: prog.ready === prog.count && prog.count ? 'ok' : 'primary', label: 'Felkészülés' }),
    h('div', { class: 'test-card-foot' }, status),
  );
}

// ---------- téma állapot egy számonkéréshez ----------

export function stateBadge(st, t) {
  switch (st.status) {
    case 'uj': return h('span', { class: 'state uj' }, 'Át kell nézni');
    case 'atnezve': return h('span', { class: 'state atnezve' }, `Átnézve · következő ismétlés: ${L.relDay(t, st.repeatFrom)}`);
    case 'ismetelni': return h('span', { class: 'state ismetelni' }, 'Ma ismételd');
    case 'ma_kesz': return h('span', { class: 'state makesz' }, 'Mára kész · holnap még egyszer');
    case 'kesz': return h('span', { class: 'state kesz' }, '⭐ Kész');
    default: return h('span', { class: 'state nemkesz' }, 'Nem lett kész');
  }
}

/** Téma sor a számonkérés részletein. */
export function testTopicRow(test, st, { readOnly = false } = {}) {
  const t = today();
  const topic = st.topic;
  const doneToday = studiedToday(topic.id);
  const canToggle = !readOnly && test.date > t && (doneToday || st.status === 'uj' || st.status === 'ismetelni');
  const pending = S.pending.has(topic.id);
  const on = doneToday || st.status === 'kesz';
  return h('div', { class: 'todo' + (on ? ' done' : '') },
    canToggle
      ? h('button', {
        class: 'check' + (doneToday ? ' on' : '') + (pending ? ' pending' : ''),
        'aria-label': (doneToday ? 'Visszavonás: ' : 'Kész: ') + topic.title,
        disabled: pending,
        onclick: () => toggleStudy(topic.id),
      }, doneToday ? '✓' : '')
      : h('span', { class: 'check static' + (on ? ' on' : ''), 'aria-hidden': 'true' }, st.status === 'kesz' ? '⭐' : (on ? '✓' : '')),
    h('div', { class: 'todo-main' },
      h('div', { class: 'todo-title' }, topic.title),
      h('div', { class: 'todo-sub' }, stateBadge(st, t)),
    ),
  );
}

export function ruleText(rule) {
  if (rule.reps === 0) return 'Elég minden témát egyszer átnézni.';
  const words = { 1: 'egyszer', 2: 'kétszer', 3: 'háromszor', 4: 'négyszer', 5: 'ötször' };
  const times = rule.reps === 1 ? 'egyszer' : `${words[rule.reps] || rule.reps + '×'} (külön napokon)`;
  return `Minden témát nézz át, aztán ismételd ${times} a számonkérés előtti ${rule.window} napban.`;
}
