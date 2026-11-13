import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../web/js/logic.js';

// 2026-11-16 hétfő
function baseData(extra = {}) {
  return {
    settings: {},
    subjects: [
      { name: 'Magyar', color: '#4A6FA5', icon: '📖' },
      { name: 'Matek', color: '#3F9C6D', icon: '➗' },
    ],
    // magyar: hétfő, szerda; matek: kedd, csütörtök
    timetable: [
      { day: 1, period: 1, subject: 'Magyar' },
      { day: 2, period: 1, subject: 'Matek' },
      { day: 3, period: 2, subject: 'Magyar' },
      { day: 4, period: 1, subject: 'Matek' },
      { day: 5, period: 1, subject: 'Matek', week: 'A' },
    ],
    bells: [{ period: 1, start: '08:00', end: '08:45' }],
    holidays: [],
    topics: [],
    tests: [],
    log: [],
    rewards: [],
    requests: [],
    ...extra,
  };
}
const logEntry = (topicId, date, kind = 'atnezes') => ({ id: 'l' + topicId + date, topicId, date, kind });

test('dátum segédfüggvények', () => {
  assert.equal(L.weekday('2026-11-16'), 1);
  assert.equal(L.weekday('2026-11-22'), 7);
  assert.equal(L.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(L.addDays('2026-03-29', -1), '2026-03-28'); // óraátállítás környéke
  assert.equal(L.diffDays('2026-11-20', '2026-11-16'), 4);
  assert.equal(L.relDay('2026-11-16', '2026-11-17'), 'holnap');
  assert.equal(L.relDay('2026-11-16', '2026-11-19'), 'csütörtök');
  assert.equal(L.relDay('2026-11-16', '2026-11-24'), 'kedd, november 24.');
});

test('órarend, szünet, A/B hét', () => {
  const d = baseData({ holidays: [{ from: '2026-11-18', to: '2026-11-18', name: 'szünet' }] });
  assert.deepEqual(L.lessonsOn(d, '2026-11-16').map((l) => l.subject), ['Magyar']);
  assert.equal(L.lessonsOn(d, '2026-11-16')[0].start, '08:00');
  assert.equal(L.lessonsOn(d, '2026-11-18').length, 0); // szünet
  assert.equal(L.lessonsOn(d, '2026-11-21').length, 0); // szombat
  // a következő magyaróra hétfő után: szerda szünet → jövő hétfő
  assert.equal(L.nextLessonDate(d, 'magyar', '2026-11-16'), '2026-11-23');

  const ab = baseData({ settings: { ab_het_referencia: '2026-11-18' } }); // ez a hét "A"
  assert.equal(L.weekLetter(ab, '2026-11-20'), 'A');
  assert.equal(L.weekLetter(ab, '2026-11-27'), 'B');
  assert.equal(L.lessonsOn(ab, '2026-11-20').length, 1);
  assert.equal(L.lessonsOn(ab, '2026-11-27').length, 0);
});

test('ismétlési szabály: alapértékek és felülírás', () => {
  const d = baseData();
  assert.deepEqual(L.testRule(d, { difficulty: 'közepes' }), { difficulty: 'kozepes', reps: 1, window: 3 });
  assert.deepEqual(L.testRule(d, { difficulty: 'nehéz' }), { difficulty: 'nehez', reps: 2, window: 4 });
  assert.deepEqual(L.testRule(d, { difficulty: 'könnyű' }), { difficulty: 'konnyu', reps: 0, window: 0 });
  assert.deepEqual(L.testRule(d, { difficulty: '' }), { difficulty: 'kozepes', reps: 1, window: 3 });
  assert.deepEqual(L.testRule(d, { difficulty: 'könnyű', reps: 3, window: '' }), { difficulty: 'konnyu', reps: 3, window: 3 });
  const custom = baseData({ settings: { kozepes_ablak: 5 } });
  assert.equal(L.testRule(custom, { difficulty: 'közepes' }).window, 5);
});

test('téma állapota dolgozathoz (közepes: 1 ismétlés az utolsó 3 napban)', () => {
  const t = { date: '2026-11-26' }; // csütörtök
  const rule = { reps: 1, window: 3 };
  assert.equal(L.topicTestState(t, rule, [], '2026-11-16').status, 'uj');
  // korán átnézte → várakozik
  let st = L.topicTestState(t, rule, ['2026-11-16'], '2026-11-20');
  assert.equal(st.status, 'atnezve');
  assert.equal(st.repeatFrom, '2026-11-23');
  // ismétlési időszakban → ismételni kell
  assert.equal(L.topicTestState(t, rule, ['2026-11-16'], '2026-11-23').status, 'ismetelni');
  // ismételt → kész
  assert.equal(L.topicTestState(t, rule, ['2026-11-16', '2026-11-24'], '2026-11-24').status, 'kesz');
  // ha az első átnézés már az időszakba esik, az is elég
  assert.equal(L.topicTestState(t, rule, ['2026-11-25'], '2026-11-25').status, 'kesz');
  // dolgozat napján végzett tanulás nem számít
  assert.equal(L.topicTestState(t, rule, ['2026-11-16', '2026-11-26'], '2026-11-26').status, 'nem_kesz');
});

test('nehéz: 2 különböző nap kell', () => {
  const t = { date: '2026-11-26' };
  const rule = { reps: 2, window: 4 };
  let st = L.topicTestState(t, rule, ['2026-11-23'], '2026-11-23');
  assert.equal(st.status, 'ma_kesz');
  assert.equal(st.done, 2); assert.equal(st.total, 3);
  assert.equal(L.topicTestState(t, rule, ['2026-11-23'], '2026-11-24').status, 'ismetelni');
  assert.equal(L.topicTestState(t, rule, ['2026-11-23', '2026-11-24'], '2026-11-24').status, 'kesz');
});

test('órai téma: a következő óráig át kell nézni, utána pótolnivaló', () => {
  const d = baseData({ topics: [{ id: 't1', subject: 'Magyar', title: 'Petőfi', classDate: '2026-11-16' }] });
  let todos = L.computeTodos(d, '2026-11-16');
  assert.equal(todos.ma.length, 1);
  assert.equal(todos.ma[0].lessonDeadline, '2026-11-18');
  assert.equal(todos.ma[0].kind, 'atnezes');
  // szerdán (óra napja) még teendő, csütörtökön már pótolnivaló
  assert.equal(L.computeTodos(d, '2026-11-18').ma.length, 1);
  todos = L.computeTodos(d, '2026-11-19');
  assert.equal(todos.ma.length, 0);
  assert.equal(todos.potlas.length, 1);
  // 14 napnál régebbi elmaradás lekerül
  assert.equal(L.computeTodos(d, '2026-12-10').potlas.length, 0);
  // átnézte → kész ma
  d.log = [logEntry('t1', '2026-11-16')];
  todos = L.computeTodos(d, '2026-11-16');
  assert.equal(todos.ma.length, 0);
  assert.equal(todos.keszMa.length, 1);
  assert.equal(L.computeTodos(d, '2026-11-17').ma.length, 0);
});

test('dolgozat témái: később → ma → ismétlés', () => {
  const d = baseData({
    topics: [{ id: 't1', subject: 'Matek', title: 'Törtek', classDate: '' }],
    tests: [{ id: 'd1', date: '2026-11-26', subject: 'Matek', difficulty: 'közepes', topicIds: ['t1'] }],
  });
  // közepes: ablak 3 + előre 2 → 5 nappal előtte (nov. 21.) kerül a mai teendők közé
  assert.equal(L.computeTodos(d, '2026-11-16').kesobb.length, 1);
  assert.equal(L.computeTodos(d, '2026-11-21').ma.length, 1);
  d.log = [logEntry('t1', '2026-11-17')];
  assert.equal(L.computeTodos(d, '2026-11-18').ma.length, 0);
  assert.equal(L.computeTodos(d, '2026-11-18').kesobb.length, 0);
  const t = L.computeTodos(d, '2026-11-23');
  assert.equal(t.ma.length, 1);
  assert.equal(t.ma[0].kind, 'ismetles');
  // dolgozat után már nincs teendő
  assert.equal(L.computeTodos(d, '2026-11-27').ma.length, 0);
});

test('haladás', () => {
  const d = baseData({
    topics: [{ id: 't1', subject: 'Matek', title: 'A' }, { id: 't2', subject: 'Matek', title: 'B' }],
    tests: [{ id: 'd1', date: '2026-11-26', subject: 'Matek', difficulty: 'közepes', topicIds: ['t1', 't2', 'torolt'] }],
    log: [logEntry('t1', '2026-11-17')],
  });
  const p = L.testProgress(d, d.tests[0], '2026-11-18');
  assert.equal(p.count, 2);
  assert.equal(p.done, 1); assert.equal(p.total, 4);
  assert.equal(p.ready, 0);
});

test('sorozat: hétvége és teendő nélküli nap nem szakítja meg', () => {
  const d = baseData({
    topics: [
      { id: 't1', subject: 'Magyar', title: 'A', classDate: '2026-11-13' },
      { id: 't2', subject: 'Matek', title: 'B', classDate: '2026-11-17' },
    ],
  });
  // péntek (13) tanult, hétvége kimarad, hétfő (16): nem volt teendője, kedd (17) tanult
  d.log = [logEntry('t1', '2026-11-13'), logEntry('t2', '2026-11-17')];
  assert.equal(L.streak(d, '2026-11-17'), 2);
  // szerdán még nem tanult: nem szakad meg
  assert.equal(L.streak(d, '2026-11-18'), 2);
  // csütörtökön: szerdán volt teendő (t3), de nem tanult → megszakadt
  d.topics.push({ id: 't3', subject: 'Magyar', title: 'C', classDate: '2026-11-18' });
  assert.equal(L.streak(d, '2026-11-19'), 0);
});

test('csillagok: tanulás, bónusz, költés', () => {
  const d = baseData({
    topics: [{ id: 't1', subject: 'Matek', title: 'A' }],
    tests: [{ id: 'd1', date: '2026-11-26', subject: 'Matek', difficulty: 'közepes', topicIds: ['t1'] }],
    log: [logEntry('t1', '2026-11-17'), logEntry('t1', '2026-11-24', 'ismetles')],
    requests: [
      { id: 'r1', price: 1, status: 'jovahagyva' },
      { id: 'r2', price: 2, status: 'kerve' },
      { id: 'r3', price: 9, status: 'elutasitva' },
    ],
  });
  let p = L.points(d, '2026-11-25');
  assert.equal(p.total, 2); assert.equal(p.bonus, 0);
  p = L.points(d, '2026-11-26'); // a dolgozat napján megjön a bónusz
  assert.equal(p.bonus, 5);
  assert.equal(p.total, 7);
  assert.equal(p.spent, 1);
  assert.equal(p.balance, 6);
  assert.equal(p.available, 4);
});

test('később felvett témák nem számítanak visszamenőleg (sorozat)', () => {
  const d = baseData({
    topics: [{ id: 't1', subject: 'Magyar', title: 'A', classDate: '2026-11-16', createdAt: '2026-11-19 17:00:00' }],
  });
  assert.equal(L.computeTodos(d, '2026-11-17').ma.length, 0);
  assert.equal(L.computeTodos(d, '2026-11-19').potlas.length, 1);
});
