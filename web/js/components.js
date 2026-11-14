// Közös építőelemek a gyerek és a szülői nézethez.
import { h, modal } from './dom.js';
import * as L from './logic.js';
import { S, today, toggleStudy, studiedToday, toggleHomework } from './store.js';

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

// ---------- házi feladat sor ----------

export function homeworkReason(hw, t) {
  if (!hw.dueDate) return '';
  if (hw.dueDate < t) return `Határidő volt: ${L.relDay(t, hw.dueDate)}`;
  return `Határidő: ${L.relDay(t, hw.dueDate)}`;
}

/**
 * Egy házi feladat: egyetlen pipa (kész / nincs kész).
 * `onOpen(hw)`: a sor szövegére koppintva (részletek, törlés).
 */
export function homeworkRow(hw, { readOnly = false, onOpen = null } = {}) {
  const t = today();
  const done = !!hw.doneDate;
  const pending = S.pending.has(hw.id);
  const subj = L.subjectInfo(S.data, hw.subject);
  // a gyerek csak a mai pipáját vonhatja vissza
  const locked = done && hw.doneDate !== t && S.me.role !== 'parent';
  return h('div', { class: 'todo hw' + (done ? ' done' : ''), style: { '--subj': subj.color } },
    readOnly || locked
      ? h('span', { class: 'check' + (done ? ' on' : ''), 'aria-hidden': 'true' }, done ? '✓' : '')
      : h('button', {
        class: 'check' + (done ? ' on' : '') + (pending ? ' pending' : ''),
        'aria-label': (done ? 'Visszavonás: ' : 'Kész: ') + (hw.task || subj.name + ' házi'),
        'aria-pressed': done ? 'true' : 'false',
        disabled: pending,
        onclick: () => toggleHomework(hw.id),
      }, done ? '✓' : ''),
    h(onOpen ? 'button' : 'div', { class: 'todo-main' + (onOpen ? ' as-button' : ''), onclick: onOpen ? () => onOpen(hw) : null },
      h('div', { class: 'todo-title' }, hw.task || `${subj.name} házi feladat`),
      h('div', { class: 'todo-sub' },
        h('span', { class: 'todo-subject' }, `🏠 Házi · ${subj.icon} ${subj.name}`),
        !done && homeworkReason(hw, t) ? h('span', { class: 'todo-reason' }, homeworkReason(hw, t)) : null),
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
      (S.data.homework || []).filter((x) => x.dueDate === date && L.norm(x.subject) === L.norm(lesson.subject))
        .map((x) => h('div', { class: 'badge hw' + (x.doneDate ? ' done' : '') }, `🏠 Házi${x.doneDate ? ' ✓' : ''}${x.task ? ': ' + x.task : ''}`)),
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

// ---------- heti órarend ----------

export const PREP = {
  jo: { icon: '✓', label: 'Kész', long: 'Mindennel kész vagy' },
  halad: { icon: '🕐', label: 'Ráér', long: 'Van még teendő, de ráér' },
  figyelem: { icon: '👀', label: 'Készülj rá', long: 'Most érdemes vele foglalkozni' },
  potolni: { icon: '↺', label: 'Pótolni', long: 'Elmúlt, de még pótolható' },
};

/** Ez a hét / jövő hét fülek. `base`: az útvonal eleje, pl. '#/het'. */
export function weekTabs(offset, base) {
  const t = today();
  const label = (n) => {
    const mon = L.addDays(L.mondayOf(t), 7 * n);
    const fri = L.addDays(mon, 4);
    return [h('span', null, n === 0 ? 'Ez a hét' : 'Jövő hét'), h('span', { class: 'tab-sub' }, `${L.monthDay(mon)} – ${L.monthDay(fri)}`)];
  };
  return h('div', { class: 'tabs', role: 'tablist' }, [0, 1].map((n) => h('a', {
    class: 'tab week-tab' + (n === offset ? ' active' : ''), role: 'tab', href: `${base}/${n}`,
    'aria-selected': n === offset ? 'true' : 'false',
  }, label(n))));
}

/** Melyik hét legyen alapból: hétvégén már a jövő hét érdekes. */
export function defaultWeekOffset() {
  return L.weekday(today()) >= 6 ? 1 : 0;
}

function prepChip(status) {
  const p = PREP[status];
  return p ? h('span', { class: 'wk-state st-' + status }, `${p.icon} ${p.label}`) : null;
}

export function prepLegend() {
  return h('div', { class: 'wk-legend' },
    ['jo', 'halad', 'figyelem', 'potolni'].map((k) => h('span', { class: 'wk-legend-item' }, prepChip(k), h('span', { class: 'muted small' }, PREP[k].long))));
}

function regularBadge(r) {
  if (r.done) return h('span', { class: 'state kesz' }, '✓ Átnézve');
  if (r.status === 'elmaradt') return h('span', { class: 'state ismetelni' }, 'Pótolni');
  if (r.status === 'lejart') return h('span', { class: 'state nemkesz' }, 'Lejárt');
  return h('span', { class: 'state uj' }, 'Át kell nézni');
}

function lessonModal(lesson, date, prep, testHref) {
  const t = today();
  const subj = L.subjectInfo(S.data, lesson.subject);
  const body = [];
  if (PREP[prep.status]) body.push(h('p', null, prepChip(prep.status), ' ', h('span', { class: 'muted' }, PREP[prep.status].long)));
  for (const { test, prog } of prep.tests) {
    const ti = typeInfo(test.type);
    body.push(h('div', { class: 'wk-modal-block' },
      h('div', { class: 'strong' }, `${ti.icon} ${ti.label}${test.title ? ' – ' + test.title : ''}`),
      prog.count
        ? [progressBar(prog.ratio, { tone: prog.ready === prog.count ? 'ok' : 'primary', label: 'Felkészülés' }),
          h('div', { class: 'muted small' }, `${prog.ready} / ${prog.count} téma kész`),
          h('ul', { class: 'wk-topics' }, prog.states.map((st) => h('li', null, st.topic.title, ' ', stateBadge(st, t))))]
        : h('div', { class: 'muted' }, 'Még nincs hozzá téma.')));
  }
  if (prep.regular.length) {
    body.push(h('div', { class: 'wk-modal-block' },
      h('div', { class: 'strong' }, '📘 Erre az órára át kell nézni'),
      h('ul', { class: 'wk-topics' }, prep.regular.map((r) => h('li', null, r.topic.title, ' ', regularBadge(r))))));
  }
  if (prep.homework.length) {
    body.push(h('div', { class: 'wk-modal-block' },
      h('div', { class: 'strong' }, '🏠 Házi feladat'),
      h('ul', { class: 'wk-topics' }, prep.homework.map((x) => h('li', null, x.homework.task || 'Házi feladat', ' ',
        x.status === 'kesz' ? h('span', { class: 'state kesz' }, '✓ Kész')
          : x.status === 'elmaradt' ? h('span', { class: 'state ismetelni' }, 'Pótolni')
            : x.status === 'lejart' ? h('span', { class: 'state nemkesz' }, 'Nem lett kész')
              : h('span', { class: 'state uj' }, 'Még nincs kész'))))));
  }
  if (prep.covered.length) {
    body.push(h('div', { class: 'wk-modal-block' },
      h('div', { class: 'strong' }, '✏️ Órán vettük'),
      h('ul', { class: 'wk-topics' }, prep.covered.map((tp) => h('li', null, tp.title)))));
  }
  if (subj.equipment) body.push(h('p', null, '🎒 ' + subj.equipment));
  if (!body.length) body.push(h('p', { class: 'muted' }, date < t ? 'Ehhez az órához nem volt teendő.' : 'Erre az órára nincs teendő. 🙂'));

  const actions = prep.tests.map(({ test }) => ({
    label: `Megnyitom: ${typeInfo(test.type).label.toLowerCase()}`, kind: 'primary',
    onClick: () => { location.hash = testHref(test); },
  }));
  actions.push({ label: 'Bezárás', kind: 'secondary' });
  modal({
    title: `${subj.icon} ${subj.name} · ${longDate(date)}, ${lesson.period}. óra${lesson.start ? ' (' + lesson.start + ')' : ''}`,
    body,
    actions,
  });
}

function lessonCell(lesson, day, col, row, prep) {
  const t = today();
  const subj = L.subjectInfo(S.data, lesson.subject);
  const p = PREP[prep.status];
  return h('button', {
    class: `wk-cell wk-lesson st-${prep.status}` + (day.date < t ? ' past' : '') + (day.date === t ? ' today' : ''),
    style: { '--subj': subj.color, '--c': col, '--r': row },
    'aria-label': `${capitalize(L.dayName(day.date))} ${lesson.period}. óra: ${subj.name}${p ? ', ' + p.label : ''}`,
  },
  h('span', { class: 'wk-top' },
    h('span', { class: 'wk-num' }, lesson.period + '.'),
    h('span', { class: 'wk-icon', 'aria-hidden': 'true' }, subj.icon),
    h('span', { class: 'wk-name' }, subj.name)),
  prep.tests.map(({ test, prog }) => h('span', { class: 'wk-test' },
    `${typeInfo(test.type).icon} ${typeInfo(test.type).label}`,
    prog.count ? h('span', { class: 'wk-frac' }, ` ${prog.ready}/${prog.count}`) : null)),
  prep.homework.length ? h('span', { class: 'wk-hw' + (prep.homework.every((x) => x.status === 'kesz') ? ' done' : '') },
    `🏠 Házi${prep.homework.every((x) => x.status === 'kesz') ? ' ✓' : ''}`) : null,
  prepChip(prep.status));
}

/**
 * Egy hét órarendje: oszlopok a napok, sorok az órák.
 * A keret színe a tantárgyé, a jelzés pedig azt mutatja, hogy állunk a felkészüléssel.
 * `testHref(test)`: hova vigyen a számonkérés megnyitása.
 */
export function weekTimetable(offset, { testHref }) {
  const d = S.data;
  const t = today();
  const monday = L.addDays(L.mondayOf(t), 7 * offset);
  const days = L.weekDays(d, monday);
  const idx = L.indexLog(d.log);
  const nowIds = new Set(L.computeTodos(d, t).ma.map((x) => x.topic.id));

  const periods = days.flatMap((x) => x.lessons.map((l) => l.period));
  if (!periods.length) {
    return emptyState('🏖️', days.some((x) => x.holiday) ? 'Ezen a héten szünet van.' : 'Ezen a héten nincs óra az órarendben.');
  }
  const minP = Math.min(...periods);
  const maxP = Math.max(...periods);
  const rows = maxP - minP + 1;
  const counts = { jo: 0, figyelem: 0, potolni: 0, tests: 0, homework: 0 };

  const cells = [];
  days.forEach((day, i) => {
    const col = i + 1;
    cells.push(h('div', {
      class: 'wk-head' + (day.date === t ? ' today' : '') + (day.date < t ? ' past' : ''),
      style: { '--c': col, '--r': 1 },
    }, h('span', { class: 'wk-dayname' }, capitalize(L.dayName(day.date))),
    h('span', { class: 'wk-date' }, day.date === t ? 'ma' : L.monthDay(day.date))));

    if (!day.lessons.length) {
      cells.push(h('div', { class: 'wk-cell wk-off', style: { '--c': col, '--r': `2 / span ${rows}` } },
        day.holiday ? '🏖️ Szünet' : 'Nincs óra'));
      return;
    }
    for (let p = minP; p <= maxP; p++) {
      const row = p - minP + 2;
      const lesson = day.lessons.find((l) => l.period === p);
      if (!lesson) {
        cells.push(h('div', { class: 'wk-cell wk-empty', style: { '--c': col, '--r': row }, 'aria-hidden': 'true' }));
        continue;
      }
      const prep = L.lessonPrep(d, day.date, lesson.subject, t, idx, nowIds);
      if (counts[prep.status] !== undefined) counts[prep.status]++;
      counts.tests += prep.tests.length;
      counts.homework += prep.homework.length;
      const cell = lessonCell(lesson, day, col, row, prep);
      cell.addEventListener('click', () => lessonModal(lesson, day.date, prep, testHref));
      cells.push(cell);
    }
  });

  const summary = [];
  if (counts.tests) summary.push(`📝 ${counts.tests} számonkérés`);
  if (counts.homework) summary.push(`🏠 ${counts.homework} házi`);
  if (counts.figyelem) summary.push(`👀 ${counts.figyelem} órára érdemes készülni`);
  if (counts.potolni) summary.push(`↺ ${counts.potolni} pótolnivaló`);
  if (counts.jo) summary.push(`✓ ${counts.jo} órára kész`);

  return h('div', { class: 'wk-wrap' },
    summary.length ? h('div', { class: 'wk-summary' }, summary.join(' · ')) : null,
    h('div', { class: 'wk-grid', style: { '--cols': days.length } }, cells),
    prepLegend());
}
