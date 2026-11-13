// A Code.gs futtatása egy kis, szimulált Google Apps Script környezetben.
// Nem teljes Google-utánzat: csak annyit tud, amennyi a backend végigpróbálásához kell.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const CODE = fs.readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8');
const pad = (n) => String(n).padStart(2, '0');

// A dátumoknak a Code.gs saját JavaScript-környezetéből kell jönniük, különben az instanceof Date nem működik.
let CtxDate = Date;

// A Google Sheets a beírt szöveget automatikusan átalakítja (dátum, szám) – ezt utánozzuk.
function sheetsConvert(v) {
  if (typeof v !== 'string') return v;
  if (v.startsWith("'")) return v.slice(1);
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new CtxDate(+m[1], +m[2] - 1, +m[3]);
  m = v.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (m) return new CtxDate(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  if (/^\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

function formatDate(d, _tz, pattern) {
  return pattern
    .replace('yyyy', d.getFullYear()).replace('MM', pad(d.getMonth() + 1)).replace('dd', pad(d.getDate()))
    .replace('HH', pad(d.getHours())).replace('mm', pad(d.getMinutes())).replace('ss', pad(d.getSeconds()));
}

function makeSheet(name, ss) {
  const rows = [];
  const width = () => rows.reduce((m, r) => Math.max(m, r.length), 0);
  const chain = new Proxy({}, { get: () => () => chain });
  const range = (r, c, nr = 1, nc = 1) => ({
    getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => (rows[r - 1 + i] || [])[c - 1 + j] ?? '')),
    getDisplayValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => {
      const v = (rows[r - 1 + i] || [])[c - 1 + j] ?? '';
      return v instanceof CtxDate ? `${v.getHours()}:${pad(v.getMinutes())}` : String(v);
    })),
    setValues: (vals) => { vals.forEach((row, i) => row.forEach((v, j) => { (rows[r - 1 + i] ||= [])[c - 1 + j] = sheetsConvert(v); })); return chain; },
    setValue: (v) => { (rows[r - 1] ||= [])[c - 1] = sheetsConvert(v); return chain; },
    setFontWeight: () => chain, setBackground: () => chain, setNumberFormat: () => chain, setDataValidation: () => chain,
  });
  const api = {
    _rows: rows,
    getName: () => name,
    getLastRow: () => { for (let i = rows.length; i > 0; i--) if ((rows[i - 1] || []).some((v) => v !== '' && v != null)) return i; return 0; },
    getLastColumn: () => width(),
    getMaxRows: () => 1000,
    getRange: (r, c, nr, nc) => (typeof r === 'string' ? chain : range(r, c, nr, nc)),
    appendRow: (vals) => { rows[api.getLastRow()] = vals.map(sheetsConvert); },
    deleteRow: (n) => { rows.splice(n - 1, 1); },
    setFrozenRows: () => {}, autoResizeColumns: () => {},
    getParent: () => ss,
  };
  return api;
}

function makeEnv() {
  const sheets = new Map();
  const ss = {
    getId: () => 'ss1',
    getSpreadsheetTimeZone: () => 'Europe/Budapest',
    setSpreadsheetTimeZone: () => {},
    getSheetByName: (n) => sheets.get(n) || null,
    insertSheet: (n) => {
      const sh = makeSheet(n, ss);
      sheets.set(n, sh);
      return sh;
    },
    getSheets: () => [...sheets.values()],
    deleteSheet: (sh) => sheets.delete(sh.getName()),
  };
  const props = new Map();
  const cache = new Map();
  let tokenInfo = null;
  let uuid = 0;
  const ctx = {
    console: { log() {}, error() {} },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ss, openById: () => ss,
      getUi: () => { throw new Error('nincs UI'); },
      newDataValidation: () => new Proxy({}, { get: () => function () { return this; } }),
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props.get(k) ?? null, setProperty: (k, v) => props.set(k, v) }) },
    CacheService: { getScriptCache: () => ({ get: (k) => cache.get(k) ?? null, put: (k, v) => cache.set(k, v), remove: (k) => cache.delete(k) }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    Utilities: { formatDate, getUuid: () => `${String(++uuid).padStart(8, '0')}-0000-4000-8000-abcdef123456` },
    Session: { getActiveUser: () => ({ getEmail: () => 'anya@example.com' }) },
    UrlFetchApp: { fetch: () => ({ getResponseCode: () => (tokenInfo ? 200 : 400), getContentText: () => JSON.stringify(tokenInfo) }) },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (s) => ({ text: s, setMimeType() { return this; } }),
    },
  };
  vm.createContext(ctx);
  CtxDate = vm.runInContext('Date', ctx);
  vm.runInContext(CODE + '\n;globalThis.__t = { doPost, doGet, tablazatElokeszitese, readTable_ };', ctx);
  const call = (body) => JSON.parse(ctx.__t.doPost({ postData: { contents: JSON.stringify(body) } }).text);
  return { ss, sheets, ctx, call, setTokenInfo: (t) => { tokenInfo = t; }, api: ctx.__t };
}

function setup() {
  const env = makeEnv();
  env.api.tablazatElokeszitese();
  // gyerek e-mail és client id beírása
  const users = env.sheets.get('Felhasználók')._rows;
  users[2] = ['gyerek@example.com', 'Bence', 'gyerek'];
  const settings = env.sheets.get('Beállítások')._rows;
  settings.find((r) => r[0] === 'google_client_id')[1] = 'cid.apps.googleusercontent.com';
  return env;
}

function loginAs(env, email) {
  env.setTokenInfo({ aud: 'cid.apps.googleusercontent.com', iss: 'https://accounts.google.com', email, email_verified: 'true' });
  const r = env.call({ action: 'login', idToken: 'x' });
  assert.equal(r.ok, true, r.error);
  return r.data.token;
}

test('előkészítés: minden lap létrejön mintaadatokkal', () => {
  const env = setup();
  for (const n of ['Felhasználók', 'Tantárgyak', 'Órarend', 'Csengetés', 'Szünetek', 'Témák', 'Számonkérések', 'Napló', 'Jutalmak', 'Kérések', 'Beállítások', 'Munkamenetek']) {
    assert.ok(env.sheets.get(n), n);
  }
  assert.equal(env.sheets.get('Felhasználók')._rows[1][0], 'anya@example.com');
  // második futtatás nem ír felül semmit
  const before = env.sheets.get('Órarend')._rows.length;
  env.api.tablazatElokeszitese();
  assert.equal(env.sheets.get('Órarend')._rows.length, before);
});

test('bejelentkezés: ismeretlen fiók, rossz aud, jó fiók', () => {
  const env = setup();
  env.setTokenInfo({ aud: 'cid.apps.googleusercontent.com', iss: 'accounts.google.com', email: 'idegen@example.com', email_verified: 'true' });
  assert.equal(env.call({ action: 'login', idToken: 'x' }).code, 'FORBIDDEN');
  env.setTokenInfo({ aud: 'masik', iss: 'accounts.google.com', email: 'anya@example.com', email_verified: 'true' });
  assert.equal(env.call({ action: 'login', idToken: 'x' }).code, 'AUTH');
  assert.equal(env.call({ action: 'bootstrap', token: 'kitalalt' }).code, 'AUTH');
  const token = loginAs(env, 'Anya@Example.com');
  const b = env.call({ action: 'bootstrap', token });
  assert.equal(b.ok, true, b.error);
  assert.equal(b.data.me.role, 'parent');
  assert.equal(b.data.data.settings.google_client_id, undefined);
  assert.equal(b.data.data.timetable[0].day, 1);
  assert.equal(b.data.data.bells[0].start, '8:00');
  assert.equal(b.data.data.holidays[0].from, '2026-12-21');
  assert.ok(b.data.data.subjects.length >= 5);
  const cfg = JSON.parse(env.api.doGet({ parameter: { action: 'config' } }).text);
  assert.equal(cfg.data.googleClientId, 'cid.apps.googleusercontent.com');
});

test('gyerek folyamat: dolgozat, téma, pipálás, visszavonás, jutalom', () => {
  const env = setup();
  const kid = loginAs(env, 'gyerek@example.com');
  const parent = loginAs(env, 'anya@example.com');

  let r = env.call({ action: 'addTest', token: kid, date: '2026-11-26', subject: 'matek', type: 'dolgozat', title: '=HACK()', newTopics: ['Törtek', 'Tizedes törtek'], difficulty: 'nehéz', reps: 9 });
  assert.equal(r.ok, true, r.error);
  const test1 = r.data.test;
  assert.equal(test1.subject, 'Matek');
  assert.equal(test1.difficulty, 'kozepes'); // gyerek nem állíthat nehézséget
  assert.equal(test1.reps, '');
  assert.equal(test1.topicIds.length, 2);
  assert.equal(env.sheets.get('Számonkérések')._rows[1][4], '=HACK()'); // szövegként, nem képletként tárolva (aposztróf leszedve)

  r = env.call({ action: 'addTopic', token: kid, subject: 'Matek', title: 'Arányosság', classDate: '2026-11-13', testIds: [test1.id] });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.data.tests[0].topicIds.length, 3);
  const topicId = r.data.topic.id;

  r = env.call({ action: 'logStudy', token: kid, topicId });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.data.entry.kind, 'atnezes');
  const again = env.call({ action: 'logStudy', token: kid, topicId });
  assert.equal(again.data.entry.id, r.data.entry.id); // naponta egyszer
  assert.equal(env.call({ action: 'logStudy', token: parent, topicId }).code, 'FORBIDDEN');

  let b = env.call({ action: 'bootstrap', token: kid });
  assert.equal(b.data.data.log.length, 1);
  assert.equal(b.data.data.log[0].kind, 'atnezes');
  assert.match(b.data.data.log[0].date, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(b.data.data.tests[0].topicIds, test1.topicIds.concat(topicId));

  r = env.call({ action: 'undoStudy', token: kid, id: r.data.entry.id });
  assert.equal(r.ok, true, r.error);
  b = env.call({ action: 'bootstrap', token: kid });
  assert.equal(b.data.data.log.length, 0);

  // szülő módosítja a nehézséget
  r = env.call({ action: 'updateTest', token: parent, id: test1.id, difficulty: 'nehéz', reps: 3, window: '' });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.data.test.difficulty, 'nehez');
  assert.equal(r.data.test.reps, 3);

  // jutalom
  const reward = b.data.data.rewards[0];
  r = env.call({ action: 'requestReward', token: kid, rewardId: reward.id });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.data.request.status, 'kerve');
  assert.equal(env.call({ action: 'decideRequest', token: kid, id: r.data.request.id, approve: true }).code, 'FORBIDDEN');
  const d = env.call({ action: 'decideRequest', token: parent, id: r.data.request.id, approve: true });
  assert.equal(d.data.request.status, 'jovahagyva');
  assert.equal(env.call({ action: 'cancelRequest', token: kid, id: r.data.request.id }).code, 'BAD_REQUEST');

  // téma törlése kiveszi a dolgozatból is
  r = env.call({ action: 'deleteTopic', token: parent, id: topicId });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.data.tests[0].topicIds.includes(topicId), false);

  // gyerek törölheti a saját dolgozatát, kijelentkezés után a token érvénytelen
  assert.equal(env.call({ action: 'deleteTest', token: kid, id: test1.id }).ok, true);
  assert.equal(env.call({ action: 'logout', token: kid }).ok, true);
  assert.equal(env.call({ action: 'bootstrap', token: kid }).code, 'AUTH');
});

test('hibás bemenetek', () => {
  const env = setup();
  const kid = loginAs(env, 'gyerek@example.com');
  assert.equal(env.call({ action: 'addTest', token: kid, date: 'holnap', subject: 'Matek' }).code, 'BAD_REQUEST');
  assert.equal(env.call({ action: 'addTest', token: kid, date: '2026-11-26', subject: 'Kémia' }).code, 'BAD_REQUEST');
  assert.equal(env.call({ action: 'addTopic', token: kid, subject: 'Matek', title: '   ' }).code, 'BAD_REQUEST');
  assert.equal(env.call({ action: 'nincsilyen', token: kid }).code, 'BAD_REQUEST');
  assert.equal(env.call({ action: 'deleteTopic', token: kid, id: 'x' }).code, 'FORBIDDEN');
});
