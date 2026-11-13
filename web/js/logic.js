// Készülök – tiszta üzleti logika (nincs benne DOM és hálózat, ezért tesztelhető).
// Minden dátum 'yyyy-mm-dd' formátumú szöveg, így nincs időzóna-probléma.

export const DEFAULTS = {
  konnyu_ismetles: 0, konnyu_ablak: 0,
  kozepes_ismetles: 1, kozepes_ablak: 3,
  nehez_ismetles: 2, nehez_ablak: 4,
  pont_atnezes: 1, pont_ismetles: 1, bonusz_dolgozat: 5,
  elore_mutat_nap: 2,
  potlas_max_nap: 14,
};

export const DIFFICULTIES = [
  { key: 'konnyu', label: 'könnyű' },
  { key: 'kozepes', label: 'közepes' },
  { key: 'nehez', label: 'nehéz' },
];

export const TEST_TYPES = [
  { key: 'dolgozat', label: 'Dolgozat', icon: '📝' },
  { key: 'temazaro', label: 'Témazáró', icon: '📚' },
  { key: 'feleles', label: 'Felelés', icon: '🗣️' },
  { key: 'beadando', label: 'Beadandó', icon: '📄' },
];

export const DAY_NAMES = ['hétfő', 'kedd', 'szerda', 'csütörtök', 'péntek', 'szombat', 'vasárnap'];
export const MONTH_NAMES = ['január', 'február', 'március', 'április', 'május', 'június',
  'július', 'augusztus', 'szeptember', 'október', 'november', 'december'];

// ---------- segédfüggvények ----------

export function norm(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function setting(data, key) {
  const v = data.settings ? data.settings[key] : undefined;
  if (v === undefined || v === null || v === '') return DEFAULTS[key];
  const n = Number(v);
  return Number.isFinite(n) && String(v).trim() !== '' ? n : v;
}

// ---------- dátumok ----------

const MS_DAY = 86400000;

export function toDate(s) {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
export function fmt(dt) { return dt.toISOString().slice(0, 10); }
export function addDays(s, n) { return fmt(new Date(toDate(s).getTime() + n * MS_DAY)); }
/** a - b napokban */
export function diffDays(a, b) { return Math.round((toDate(a) - toDate(b)) / MS_DAY); }
/** 1 = hétfő … 7 = vasárnap */
export function weekday(s) { const w = toDate(s).getUTCDay(); return w === 0 ? 7 : w; }

export function localToday(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export function dayName(s) { return DAY_NAMES[weekday(s) - 1]; }

/** pl. "november 18." */
export function monthDay(s) {
  const d = toDate(s);
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}.`;
}

/** Barátságos, relatív dátumcímke: "ma", "holnap", "kedd", "jövő kedd (nov. 25.)" */
export function relDay(today, s) {
  const n = diffDays(s, today);
  if (n === 0) return 'ma';
  if (n === 1) return 'holnap';
  if (n === 2) return 'holnapután';
  if (n === -1) return 'tegnap';
  if (n < 0) return `${dayName(s)}, ${monthDay(s)}`;
  if (n < 7 && weekday(s) > weekday(today)) return dayName(s);
  return `${dayName(s)}, ${monthDay(s)}`;
}

// ---------- belső gyorsítótár (az órarend-számítások sokszor ismétlődnek) ----------

const caches = new WeakMap();
function cacheFor(data) {
  let c = caches.get(data);
  if (!c) { c = { lessons: new Map(), next: new Map() }; caches.set(data, c); }
  return c;
}

// ---------- órarend ----------

export function subjectInfo(data, name) {
  const n = norm(name);
  const s = (data.subjects || []).find((x) => norm(x.name) === n);
  return {
    name: s ? s.name : String(name || ''),
    color: (s && s.color) || '#9AA5B1',
    icon: (s && s.icon) || '📘',
    equipment: (s && s.equipment) || '',
  };
}

export function isHoliday(data, d) {
  return (data.holidays || []).some((h) => h.from && d >= String(h.from).slice(0, 10) && d <= String(h.to || h.from).slice(0, 10));
}

/** A/B hét betűje, ha a beállításokban meg van adva egy referencia-dátum egy "A" hétről. */
export function weekLetter(data, d) {
  const ref = setting(data, 'ab_het_referencia');
  if (!ref) return '';
  const r = String(ref).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r)) return '';
  const mon = (x) => addDays(x, 1 - weekday(x));
  const weeks = Math.round(diffDays(mon(d), mon(r)) / 7);
  return Math.abs(weeks) % 2 === 0 ? 'A' : 'B';
}

/** Az adott nap órái sorrendben (szünetben és órarend nélküli napon üres). */
export function lessonsOn(data, d) {
  const c = cacheFor(data);
  if (c.lessons.has(d)) return c.lessons.get(d);
  let res = [];
  if (!isHoliday(data, d)) {
    const wd = weekday(d);
    const letter = weekLetter(data, d);
    res = (data.timetable || [])
      .filter((r) => Number(r.day) === wd && r.subject && (!r.week || !letter || String(r.week).toUpperCase() === letter))
      .sort((a, b) => Number(a.period) - Number(b.period))
      .map((r) => {
        const bell = (data.bells || []).find((b) => Number(b.period) === Number(r.period));
        return { period: Number(r.period), subject: subjectInfo(data, r.subject).name, start: bell ? bell.start : '', end: bell ? bell.end : '' };
      });
  }
  c.lessons.set(d, res);
  return res;
}

export function isSchoolDay(data, d) { return lessonsOn(data, d).length > 0; }

/** A tantárgy következő órájának napja `after` után (szigorúan később). */
export function nextLessonDate(data, subject, after, maxDays = 60) {
  const c = cacheFor(data);
  const key = norm(subject) + '|' + after;
  if (c.next.has(key)) return c.next.get(key);
  let res = null;
  const n = norm(subject);
  for (let i = 1; i <= maxDays; i++) {
    const d = addDays(after, i);
    if (lessonsOn(data, d).some((l) => norm(l.subject) === n)) { res = d; break; }
  }
  c.next.set(key, res);
  return res;
}

/** A következő `count` tanítási nap `from`-tól (azt is beleértve). */
export function nextSchoolDays(data, from, count, maxScan = 60) {
  const out = [];
  for (let i = 0; i < maxScan && out.length < count; i++) {
    const d = addDays(from, i);
    if (isSchoolDay(data, d)) out.push(d);
  }
  return out;
}

// ---------- napló ----------

/** témaID → tanulási napok rendezett, egyedi listája */
export function indexLog(log) {
  const m = new Map();
  for (const l of log || []) {
    if (!m.has(l.topicId)) m.set(l.topicId, new Set());
    m.get(l.topicId).add(l.date);
  }
  const out = new Map();
  for (const [k, set] of m) out.set(k, [...set].sort());
  return out;
}

/** Ha a témát már tanulta valaha, a következő alkalom ismétlés, különben átnézés. */
export function nextKind(log, topicId) {
  return (log || []).some((l) => l.topicId === topicId) ? 'ismetles' : 'atnezes';
}

// ---------- számonkérések ----------

export function normDifficulty(v) {
  const n = norm(v);
  if (n.startsWith('konny')) return 'konnyu';
  if (n.startsWith('nehez')) return 'nehez';
  return 'kozepes';
}

function numOrNull(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

/** A számonkérés ismétlési szabálya: hány ismétlés kell, és hány nappal előtte kezdődik az időszak. */
export function testRule(data, test) {
  const difficulty = normDifficulty(test.difficulty);
  const reps = numOrNull(test.reps) ?? setting(data, difficulty + '_ismetles');
  let window = numOrNull(test.window) ?? setting(data, difficulty + '_ablak');
  window = Math.max(window, reps);
  return { difficulty, reps, window };
}

/**
 * Egy téma állapota egy adott számonkéréshez.
 *  uj        – még nem nézte át
 *  atnezve   – átnézte, az ismétlési időszak még nem kezdődött el
 *  ismetelni – ma ismételni kell
 *  ma_kesz   – ma már ismételt, de még kell (holnap) újra
 *  kesz      – kész
 *  nem_kesz  – a számonkérés napja eljött, de nem lett kész
 */
export function topicTestState(test, rule, days, today) {
  const D = test.date;
  const total = 1 + rule.reps;
  const before = days.filter((d) => d < D && d <= today);
  if (!before.length) return { status: today >= D ? 'nem_kesz' : 'uj', done: 0, total };
  const windowStart = addDays(D, -rule.window);
  const inWindow = before.filter((d) => d >= windowStart).length;
  if (rule.reps === 0 || inWindow >= rule.reps) return { status: 'kesz', done: total, total };
  const done = 1 + Math.min(inWindow, rule.reps - 1);
  if (today >= D) return { status: 'nem_kesz', done, total };
  if (today < windowStart) return { status: 'atnezve', done, total, repeatFrom: windowStart };
  if (before.includes(today)) return { status: 'ma_kesz', done, total };
  return { status: 'ismetelni', done, total };
}

export function testProgress(data, test, today, idx = indexLog(data.log)) {
  const rule = testRule(data, test);
  const topics = (test.topicIds || []).map((id) => (data.topics || []).find((t) => t.id === id)).filter(Boolean);
  let done = 0, total = 0, ready = 0;
  const states = topics.map((topic) => {
    const st = topicTestState(test, rule, idx.get(topic.id) || [], today);
    done += st.done; total += st.total;
    if (st.status === 'kesz') ready++;
    return { topic, ...st };
  });
  return { rule, states, done, total, ready, count: topics.length, ratio: total ? done / total : 0 };
}

export function upcomingTests(data, today) {
  return (data.tests || []).filter((t) => t.date >= today).sort((a, b) => a.date.localeCompare(b.date));
}

// ---------- órai témák (rendszeres tanulás) ----------

/** Órán vett téma: a következő óráig át kell nézni. */
export function regularState(data, topic, days, today) {
  if (!topic.classDate || topic.classDate > today) return null;
  const deadline = nextLessonDate(data, topic.subject, topic.classDate);
  if (days.some((d) => d >= topic.classDate)) return { status: 'kesz', deadline };
  if (deadline && today > deadline) {
    if (diffDays(today, deadline) > setting(data, 'potlas_max_nap')) return { status: 'lejart', deadline };
    return { status: 'elmaradt', deadline };
  }
  return { status: 'teendo', deadline };
}

// ---------- teendők ----------

const createdOn = (x) => String(x.createdAt || '').slice(0, 10);

/**
 * Az adott nap teendői.
 *  ma      – mai teendők
 *  potlas  – elmaradt órai átnézések
 *  kesobb  – ráér, de már most is megcsinálhatja
 *  keszMa  – ma már elvégzett témák
 */
export function computeTodos(data, today, log = data.log) {
  const idx = indexLog(log);
  const existed = (x) => !createdOn(x) || createdOn(x) <= today;
  const tests = (data.tests || []).filter((t) => t.date > today && existed(t));
  const testsByTopic = new Map();
  for (const t of tests) for (const id of t.topicIds || []) {
    if (!testsByTopic.has(id)) testsByTopic.set(id, []);
    testsByTopic.get(id).push(t);
  }
  const ahead = setting(data, 'elore_mutat_nap');
  const ma = [], potlas = [], kesobb = [], keszMa = [];

  for (const topic of data.topics || []) {
    if (!existed(topic)) continue;
    const days = idx.get(topic.id) || [];
    const relatedTests = testsByTopic.get(topic.id) || [];

    if (days.includes(today)) {
      const entry = (log || []).find((l) => l.topicId === topic.id && l.date === today);
      keszMa.push({ topic, kind: entry ? entry.kind : 'atnezes', tests: relatedTests });
      continue;
    }

    const needs = [];
    const reg = regularState(data, topic, days, today);
    if (reg && (reg.status === 'teendo' || reg.status === 'elmaradt')) {
      needs.push({ source: 'ora', deadline: reg.deadline, late: reg.status === 'elmaradt', now: true });
    }
    for (const t of relatedTests) {
      const rule = testRule(data, t);
      const st = topicTestState(t, rule, days, today);
      if (st.status === 'uj') {
        const showFrom = addDays(t.date, -(Math.max(rule.window, 1) + ahead));
        needs.push({ source: 'teszt', test: t, deadline: t.date, now: today >= showFrom });
      } else if (st.status === 'ismetelni') {
        needs.push({ source: 'teszt', test: t, deadline: t.date, now: true, repeat: true });
      }
    }
    if (!needs.length) continue;

    const deadlines = needs.map((n) => n.deadline).filter(Boolean).sort();
    const item = {
      topic,
      kind: days.length ? 'ismetles' : 'atnezes',
      deadline: deadlines[0] || null,
      lessonDeadline: (needs.find((n) => n.source === 'ora') || {}).deadline || null,
      tests: needs.filter((n) => n.test).map((n) => n.test),
    };
    const nowNeeds = needs.filter((n) => n.now && !n.late);
    if (nowNeeds.length) ma.push(item);
    else if (needs.some((n) => n.late)) potlas.push(item);
    else kesobb.push(item);
  }

  const byDeadline = (a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999');
  ma.sort(byDeadline); potlas.sort(byDeadline); kesobb.sort(byDeadline);
  return { ma, potlas, kesobb, keszMa };
}

// ---------- sorozat ----------

/**
 * Hány napja tanul egymás után. Nem szakítja meg a sorozatot az a nap,
 * amikor nem volt tanítás (hétvége, szünet), vagy nem volt mai teendője.
 * A mai nap még nem szakítja meg (még van ideje).
 */
export function streak(data, today, log = data.log) {
  const dates = new Set((log || []).map((l) => l.date));
  if (!dates.size) return 0;
  const first = [...dates].sort()[0];
  let n = dates.has(today) ? 1 : 0;
  for (let d = addDays(today, -1); d >= first; d = addDays(d, -1)) {
    if (dates.has(d)) { n++; continue; }
    if (!isSchoolDay(data, d)) continue;
    const before = log.filter((l) => l.date < d);
    if (computeTodos(data, d, before).ma.length === 0) continue;
    break;
  }
  return n;
}

// ---------- csillagok ----------

export function points(data, today, log = data.log) {
  const pA = setting(data, 'pont_atnezes');
  const pI = setting(data, 'pont_ismetles');
  const bonusEach = setting(data, 'bonusz_dolgozat');
  let earned = 0;
  for (const l of log || []) earned += l.kind === 'ismetles' ? pI : pA;

  const idx = indexLog(log);
  const topicIds = new Set((data.topics || []).map((t) => t.id));
  let bonus = 0;
  const bonusTests = [];
  for (const t of data.tests || []) {
    if (t.date > today) continue;
    const ids = (t.topicIds || []).filter((id) => topicIds.has(id));
    if (!ids.length) continue;
    const rule = testRule(data, t);
    if (ids.every((id) => topicTestState(t, rule, idx.get(id) || [], t.date).status === 'kesz')) {
      bonus += bonusEach;
      bonusTests.push(t.id);
    }
  }
  let spent = 0, pending = 0;
  for (const r of data.requests || []) {
    if (r.status === 'jovahagyva') spent += Number(r.price) || 0;
    if (r.status === 'kerve') pending += Number(r.price) || 0;
  }
  const total = earned + bonus;
  return { total, earned, bonus, bonusTests, spent, pending, balance: total - spent, available: total - spent - pending };
}
