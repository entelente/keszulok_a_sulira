/**
 * Készülök – Google Apps Script backend.
 *
 * A táblázathoz kötött szkript (Bővítmények → Apps Script). Webalkalmazásként
 * telepítve JSON API-t ad az alkalmazásnak: bejelentkezés Google-fiókkal,
 * adatok olvasása és írása a táblázat lapjain.
 *
 * Telepítés: lásd TELEPITES.md.
 */

// ===================================================================
// Séma: a lapok neve és oszlopai (kód kulcs → fejléc a táblázatban)
// ===================================================================

const SCHEMA = {
  users: { name: 'Felhasználók', cols: [['email', 'Email'], ['name', 'Név'], ['role', 'Szerep']] },
  subjects: { name: 'Tantárgyak', cols: [['name', 'Tantárgy'], ['color', 'Szín'], ['icon', 'Ikon'], ['equipment', 'Felszerelés']] },
  timetable: { name: 'Órarend', cols: [['day', 'Nap'], ['period', 'Óra'], ['subject', 'Tantárgy'], ['week', 'Hét']] },
  bells: { name: 'Csengetés', cols: [['period', 'Óra'], ['start', 'Kezdés'], ['end', 'Vége']] },
  holidays: { name: 'Szünetek', cols: [['from', 'Első nap'], ['to', 'Utolsó nap'], ['name', 'Megnevezés']] },
  topics: {
    name: 'Témák', cols: [['id', 'ID'], ['subject', 'Tantárgy'], ['title', 'Téma'], ['classDate', 'Órán vettük'],
      ['createdBy', 'Felvette'], ['createdAt', 'Létrehozva']],
  },
  tests: {
    name: 'Számonkérések', cols: [['id', 'ID'], ['date', 'Dátum'], ['subject', 'Tantárgy'], ['type', 'Típus'],
      ['title', 'Cím'], ['difficulty', 'Nehézség'], ['reps', 'Ismétlések'], ['window', 'Ablak (nap)'],
      ['topicIds', 'Témák (ID)'], ['note', 'Megjegyzés'], ['createdBy', 'Felvette'], ['createdAt', 'Létrehozva']],
  },
  homework: {
    name: 'Házi feladatok', cols: [['id', 'ID'], ['subject', 'Tantárgy'], ['dueDate', 'Határidő'], ['task', 'Feladat'],
      ['doneDate', 'Kész'], ['doneBy', 'Kipipálta'], ['createdBy', 'Felvette'], ['createdAt', 'Létrehozva']],
  },
  log: { name: 'Napló', cols: [['id', 'ID'], ['date', 'Dátum'], ['at', 'Időpont'], ['topicId', 'Téma ID'], ['kind', 'Típus'], ['by', 'Ki']] },
  rewards: { name: 'Jutalmak', cols: [['id', 'ID'], ['name', 'Jutalom'], ['price', 'Ár (csillag)'], ['icon', 'Ikon'], ['active', 'Aktív']] },
  requests: {
    name: 'Kérések', cols: [['id', 'ID'], ['at', 'Időpont'], ['rewardId', 'Jutalom ID'], ['rewardName', 'Jutalom'],
      ['price', 'Ár'], ['status', 'Állapot'], ['decidedBy', 'Elbírálta'], ['decidedAt', 'Elbírálva']],
  },
  settings: { name: 'Beállítások', cols: [['key', 'Kulcs'], ['value', 'Érték'], ['desc', 'Leírás']] },
  sessions: { name: 'Munkamenetek', cols: [['token', 'Token'], ['email', 'Email'], ['createdAt', 'Létrehozva'], ['lastUsed', 'Utoljára'], ['device', 'Eszköz']] },
};

const DATE_KEYS = ['classDate', 'date', 'from', 'to', 'dueDate', 'doneDate'];

// Ezeket a lapokat a program magától létrehozza, ha hiányoznak (később bekerült funkciók).
const AUTO_CREATE = ['homework'];
const TIME_KEYS = ['start', 'end'];

const DEFAULT_SETTINGS = [
  ['google_client_id', '', 'A Google Cloud OAuth kliensazonosító (…apps.googleusercontent.com). Lásd TELEPITES.md.'],
  ['konnyu_ismetles', 0, 'Könnyű számonkérés: hány ismétlés kell az átnézésen felül'],
  ['konnyu_ablak', 0, 'Könnyű: hány nappal a számonkérés előtt kezdődik az ismétlési időszak'],
  ['kozepes_ismetles', 1, 'Közepes: hány ismétlés kell'],
  ['kozepes_ablak', 3, 'Közepes: hány nappal előtte kezdődik az ismétlési időszak'],
  ['nehez_ismetles', 2, 'Nehéz: hány ismétlés kell (külön napokon)'],
  ['nehez_ablak', 4, 'Nehéz: hány nappal előtte kezdődik az ismétlési időszak'],
  ['alap_nehezseg', 'közepes', 'A gyerek által felvett számonkérés nehézsége (könnyű / közepes / nehéz)'],
  ['pont_atnezes', 1, 'Csillag egy átnézésért'],
  ['pont_ismetles', 1, 'Csillag egy ismétlésért'],
  ['bonusz_dolgozat', 5, 'Bónusz csillag, ha egy számonkérés minden témája kész lett időben'],
  ['pont_hazi', 1, 'Csillag egy elkészült házi feladatért'],
  ['elore_mutat_nap', 2, 'A számonkérés témái ennyi nappal az ismétlési időszak előtt kerülnek a mai teendők közé'],
  ['potlas_max_nap', 14, 'Egy elmaradt órai átnézés ennyi napig marad a pótolnivalók között'],
  ['munkamenet_napok', 180, 'Ennyi nap használaton kívül után kell újra bejelentkezni'],
  ['ab_het_referencia', '', 'Csak A/B hetes órarendnél: egy tetszőleges dátum egy "A" hétről'],
];

// ===================================================================
// Belépési pontok
// ===================================================================

function doGet(e) {
  const action = e && e.parameter && e.parameter.action;
  if (action === 'config') {
    return respond_(function () { return { googleClientId: String(settings_().google_client_id || '').trim() }; });
  }
  return ContentService.createTextOutput('Készülök API – működik.');
}

function doPost(e) {
  return respond_(function () {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    return dispatch_(body);
  });
}

function respond_(fn) {
  let out;
  try {
    out = { ok: true, data: fn() };
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    out = { ok: false, code: err.code || 'ERROR', error: err.code ? err.message : 'Váratlan hiba: ' + (err && err.message) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function appError_(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

const ACTIONS = {
  // név: [függvény, ír-e, kinek szabad ('any' | 'parent' | 'child')]
  bootstrap: [bootstrap_, false, 'any'],
  logout: [logout_, true, 'any'],
  addTopic: [addTopic_, true, 'any'],
  updateTopic: [updateTopic_, true, 'any'],
  deleteTopic: [deleteTopic_, true, 'parent'],
  addTest: [addTest_, true, 'any'],
  updateTest: [updateTest_, true, 'any'],
  deleteTest: [deleteTest_, true, 'any'],
  addHomework: [addHomework_, true, 'any'],
  updateHomework: [updateHomework_, true, 'any'],
  deleteHomework: [deleteHomework_, true, 'any'],
  setHomeworkDone: [setHomeworkDone_, true, 'any'],
  logStudy: [logStudy_, true, 'child'],
  undoStudy: [undoStudy_, true, 'child'],
  requestReward: [requestReward_, true, 'child'],
  cancelRequest: [cancelRequest_, true, 'child'],
  decideRequest: [decideRequest_, true, 'parent'],
};

function dispatch_(body) {
  if (body.action === 'login') return withLock_(function () { return login_(body); });
  const def = ACTIONS[body.action];
  if (!def) throw appError_('BAD_REQUEST', 'Ismeretlen művelet: ' + body.action);
  const user = auth_(body.token);
  if (def[2] !== 'any' && user.role !== def[2]) {
    throw appError_('FORBIDDEN', def[2] === 'parent' ? 'Ezt csak szülő teheti meg.' : 'Ezt csak a gyerek fiókjából lehet.');
  }
  const run = function () { return def[0](user, body); };
  return def[1] ? withLock_(run) : run();
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw appError_('BUSY', 'Most éppen más is ment. Próbáld újra egy pillanat múlva.');
  try { return fn(); } finally { lock.releaseLock(); }
}

// ===================================================================
// Táblázat-kezelés
// ===================================================================

let ss__ = null;
function ss_() {
  if (ss__) return ss__;
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  ss__ = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss__) throw appError_('SETUP', 'Nem található a táblázat. Futtasd a „Táblázat előkészítése” menüpontot.');
  return ss__;
}

function tz_() { return ss_().getSpreadsheetTimeZone() || 'Europe/Budapest'; }
function now_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm:ss'); }
function today_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd'); }
function newId_(prefix) { return prefix + Utilities.getUuid().replace(/-/g, '').slice(0, 10); }

/** A lap. Az AUTO_CREATE lapokat íráskor létrehozza; `optional`-lel olvasáskor null-t ad, ha nincs. */
function sheet_(key, opts) {
  const ss = ss_();
  let sh = ss.getSheetByName(SCHEMA[key].name);
  if (!sh && AUTO_CREATE.indexOf(key) >= 0) {
    if (opts && opts.optional) return null;
    sh = createSheet_(ss, key);
  }
  if (!sh) throw appError_('SETUP', 'Hiányzik a(z) „' + SCHEMA[key].name + '” lap. Futtasd a Készülök → Táblázat előkészítése menüpontot.');
  return sh;
}

function createSheet_(ss, key) {
  const def = SCHEMA[key];
  const sh = ss.insertSheet(def.name);
  const headers = def.cols.map(function (c) { return c[1]; });
  sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#E3EBF6');
  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, headers.length);
  formatSheet_(sh, key);
  return sh;
}

function headerMap_(sh, key) {
  const lastCol = Math.max(sh.getLastColumn(), 1);
  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  const map = {};
  SCHEMA[key].cols.forEach(function (c) {
    const i = headers.indexOf(c[1]);
    if (i >= 0) map[c[0]] = i;
  });
  return { headers: headers, map: map };
}

function looseDate_(s) {
  const m = String(s).match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (!m) return String(s).trim();
  return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
}

/** A lap sorai objektumként; minden objektum kap egy `_row` mezőt (sor száma). */
function readTable_(key) {
  const sh = sheet_(key, { optional: true });
  if (!sh) return [];
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  const hm = headerMap_(sh, key);
  const rng = sh.getRange(2, 1, lastRow - 1, hm.headers.length);
  const vals = rng.getValues();
  const disp = rng.getDisplayValues();
  const tz = tz_();
  const out = [];
  vals.forEach(function (row, r) {
    if (row.every(function (v) { return v === '' || v === null; })) return;
    const o = { _row: r + 2 };
    SCHEMA[key].cols.forEach(function (c) {
      const k = c[0], i = hm.map[k];
      if (i === undefined) { o[k] = ''; return; }
      let v = row[i];
      if (TIME_KEYS.indexOf(k) >= 0) v = disp[r][i];
      else if (v instanceof Date) v = Utilities.formatDate(v, tz, DATE_KEYS.indexOf(k) >= 0 ? 'yyyy-MM-dd' : 'yyyy-MM-dd HH:mm:ss');
      else if (typeof v === 'string') v = DATE_KEYS.indexOf(k) >= 0 && v ? looseDate_(v) : v.trim();
      o[k] = v;
    });
    out.push(o);
  });
  return out;
}

/** Képlet-befecskendezés ellen: a felhasználói szöveg ne kezdődhessen '=' '+' '@' jellel. */
function safe_(v) {
  if (typeof v !== 'string') return v;
  return /^[=+@]/.test(v) ? "'" + v : v;
}

function appendRow_(key, obj) {
  const sh = sheet_(key);
  const hm = headerMap_(sh, key);
  const row = hm.headers.map(function () { return ''; });
  Object.keys(hm.map).forEach(function (k) {
    if (obj[k] !== undefined && obj[k] !== null) row[hm.map[k]] = safe_(obj[k]);
  });
  sh.appendRow(row);
}

function updateRow_(key, rowNum, patch) {
  const sh = sheet_(key);
  const hm = headerMap_(sh, key);
  Object.keys(patch).forEach(function (k) {
    if (hm.map[k] === undefined) return;
    sh.getRange(rowNum, hm.map[k] + 1).setValue(safe_(patch[k]));
  });
}

function deleteRow_(key, rowNum) { sheet_(key).deleteRow(rowNum); }

function findById_(key, id, field) {
  const f = field || 'id';
  const row = readTable_(key).filter(function (x) { return String(x[f]) === String(id); })[0];
  if (!row) throw appError_('NOT_FOUND', 'Nem található (lehet, hogy közben törölték). Frissítsd az oldalt.');
  return row;
}

function norm_(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function settings_() {
  const out = {};
  readTable_('settings').forEach(function (r) { if (r.key) out[String(r.key).trim()] = r.value; });
  return out;
}

// ===================================================================
// Normalizálás: amit kézzel írtok a táblázatba, abból egységes adat lesz
// ===================================================================

const DAY_MAP = { hetfo: 1, kedd: 2, szerda: 3, csutortok: 4, pentek: 5, szombat: 6, vasarnap: 7 };
const DAY_ABBR = { h: 1, k: 2, sze: 3, cs: 4, p: 5, szo: 6, v: 7 };

function normDay_(v) {
  if (typeof v === 'number') return v;
  const n = norm_(v).replace(/\.$/, '');
  if (/^\d+$/.test(n)) return Number(n);
  if (DAY_ABBR[n]) return DAY_ABBR[n];
  for (const k in DAY_MAP) if (n.indexOf(k) === 0 || (n.length >= 3 && k.indexOf(n) === 0)) return DAY_MAP[k];
  return 0;
}

function normRole_(v) {
  const n = norm_(v);
  if (n.indexOf('sz') === 0 || n === 'parent') return 'parent';
  if (n.indexOf('gy') === 0 || n === 'child') return 'child';
  return '';
}

function normDifficulty_(v) {
  const n = norm_(v);
  if (n.indexOf('konny') === 0) return 'konnyu';
  if (n.indexOf('nehez') === 0) return 'nehez';
  return 'kozepes';
}
const DIFFICULTY_LABEL = { konnyu: 'könnyű', kozepes: 'közepes', nehez: 'nehéz' };

function normType_(v) {
  const n = norm_(v);
  if (n.indexOf('temaz') === 0) return 'temazaro';
  if (n.indexOf('feleles') === 0) return 'feleles';
  if (n.indexOf('bead') === 0) return 'beadando';
  return 'dolgozat';
}
const TYPE_LABEL = { dolgozat: 'dolgozat', temazaro: 'témazáró', feleles: 'felelés', beadando: 'beadandó' };

function normKind_(v) { return norm_(v).indexOf('ism') === 0 ? 'ismetles' : 'atnezes'; }
const KIND_LABEL = { atnezes: 'átnézés', ismetles: 'ismétlés' };

function normStatus_(v) {
  const n = norm_(v);
  if (n.indexOf('jova') === 0) return 'jovahagyva';
  if (n.indexOf('elut') === 0) return 'elutasitva';
  if (n.indexOf('vissza') === 0) return 'visszavonva';
  return 'kerve';
}
const STATUS_LABEL = { kerve: 'kérve', jovahagyva: 'jóváhagyva', elutasitva: 'elutasítva', visszavonva: 'visszavonva' };

function numOrBlank_(v) {
  if (v === '' || v === null || v === undefined) return '';
  const n = Number(v);
  return isFinite(n) ? n : '';
}

function splitIds_(v) {
  return String(v || '').split(/[,;\s]+/).map(function (s) { return s.trim(); }).filter(String);
}

function users_() {
  return readTable_('users').map(function (u) {
    return { email: norm_(u.email), name: String(u.name || '').trim() || String(u.email).split('@')[0], role: normRole_(u.role) };
  }).filter(function (u) { return u.email && u.role; });
}

function findUser_(email) {
  const e = norm_(email);
  return users_().filter(function (u) { return u.email === e; })[0] || null;
}

function topicOut_(t) {
  return { id: String(t.id), subject: String(t.subject), title: String(t.title), classDate: t.classDate || '', createdBy: t.createdBy || '', createdAt: t.createdAt || '' };
}

function testOut_(t) {
  return {
    id: String(t.id), date: t.date, subject: String(t.subject), type: normType_(t.type), title: String(t.title || ''),
    difficulty: normDifficulty_(t.difficulty), reps: numOrBlank_(t.reps), window: numOrBlank_(t.window),
    topicIds: splitIds_(t.topicIds), note: String(t.note || ''), createdBy: t.createdBy || '', createdAt: t.createdAt || '',
  };
}

function logOut_(l) {
  return { id: String(l.id), date: l.date, at: l.at, topicId: String(l.topicId), kind: normKind_(l.kind), by: norm_(l.by) };
}

function requestOut_(r) {
  return {
    id: String(r.id), at: r.at, rewardId: String(r.rewardId), rewardName: String(r.rewardName), price: Number(r.price) || 0,
    status: normStatus_(r.status), decidedBy: r.decidedBy || '', decidedAt: r.decidedAt || '',
  };
}

function homeworkOut_(h) {
  return {
    id: String(h.id), subject: String(h.subject), dueDate: h.dueDate || '', task: String(h.task || ''),
    doneDate: h.doneDate || '', doneBy: norm_(h.doneBy), createdBy: h.createdBy || '', createdAt: h.createdAt || '',
  };
}

function rewardOut_(r) {
  const a = norm_(r.active);
  return { id: String(r.id), name: String(r.name), price: Number(r.price) || 0, icon: String(r.icon || '🎁'), active: !(a === 'nem' || a === 'false' || a === 'n') };
}

// ===================================================================
// Bejelentkezés
// ===================================================================

function login_(body) {
  const clientId = String(settings_().google_client_id || '').trim();
  if (!clientId) throw appError_('SETUP', 'A Beállítások lapon nincs kitöltve a google_client_id.');
  if (!body.idToken) throw appError_('AUTH', 'Hiányzik a Google-azonosító.');

  const resp = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(body.idToken), { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) throw appError_('AUTH', 'A Google-bejelentkezést nem sikerült ellenőrizni. Próbáld újra.');
  const info = JSON.parse(resp.getContentText());
  const issOk = info.iss === 'accounts.google.com' || info.iss === 'https://accounts.google.com';
  if (info.aud !== clientId || !issOk || String(info.email_verified) !== 'true') {
    throw appError_('AUTH', 'A Google-bejelentkezés érvénytelen.');
  }
  const user = findUser_(info.email);
  if (!user) throw appError_('FORBIDDEN', 'Ez a Google-fiók (' + info.email + ') nincs felvéve a Felhasználók lapra.');

  const token = 's_' + Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  const now = now_();
  appendRow_('sessions', { token: token, email: user.email, createdAt: now, lastUsed: now, device: String(body.device || '').slice(0, 100) });
  return { token: token, me: user };
}

function auth_(token) {
  if (!token) throw appError_('AUTH', 'Jelentkezz be.');
  const cache = CacheService.getScriptCache();
  let email = cache.get('sess_' + token);
  if (!email) {
    const s = readTable_('sessions').filter(function (x) { return x.token === token; })[0];
    if (!s) throw appError_('AUTH', 'Lejárt a bejelentkezés. Jelentkezz be újra.');
    const maxDays = Number(settings_().munkamenet_napok) || 180;
    const last = s.lastUsed ? new Date(String(s.lastUsed).replace(' ', 'T')) : null;
    const ageDays = last && !isNaN(last) ? (Date.now() - last.getTime()) / 86400000 : 0;
    if (ageDays > maxDays) {
      deleteRow_('sessions', s._row);
      throw appError_('AUTH', 'Lejárt a bejelentkezés. Jelentkezz be újra.');
    }
    if (ageDays > 1) updateRow_('sessions', s._row, { lastUsed: now_() });
    email = norm_(s.email);
    cache.put('sess_' + token, email, 600);
  }
  const user = findUser_(email);
  if (!user) throw appError_('AUTH', 'Ez a fiók már nincs a Felhasználók lapon.');
  user.token = token;
  return user;
}

function logout_(user) {
  const s = readTable_('sessions').filter(function (x) { return x.token === user.token; })[0];
  if (s) deleteRow_('sessions', s._row);
  CacheService.getScriptCache().remove('sess_' + user.token);
  return true;
}

// ===================================================================
// Adatok
// ===================================================================

function bootstrap_(user) {
  const settings = settings_();
  delete settings.google_client_id;
  const isParent = user.role === 'parent';
  return {
    me: { email: user.email, name: user.name, role: user.role },
    serverToday: today_(),
    data: {
      settings: settings,
      users: users_().map(function (u) { return { name: u.name, role: u.role, email: isParent ? u.email : undefined }; }),
      subjects: readTable_('subjects').filter(function (s) { return s.name; }).map(function (s) {
        return { name: String(s.name).trim(), color: String(s.color || ''), icon: String(s.icon || ''), equipment: String(s.equipment || '') };
      }),
      timetable: readTable_('timetable').map(function (r) {
        return { day: normDay_(r.day), period: Number(r.period) || 0, subject: String(r.subject || '').trim(), week: String(r.week || '').trim().toUpperCase() };
      }).filter(function (r) { return r.day && r.subject; }),
      bells: readTable_('bells').map(function (b) { return { period: Number(b.period) || 0, start: b.start, end: b.end }; }),
      holidays: readTable_('holidays').filter(function (h) { return h.from; }).map(function (h) { return { from: h.from, to: h.to || h.from, name: String(h.name || '') }; }),
      topics: readTable_('topics').filter(function (t) { return t.id; }).map(topicOut_),
      tests: readTable_('tests').filter(function (t) { return t.id && t.date; }).map(testOut_),
      log: readTable_('log').filter(function (l) { return l.id && l.date; }).map(logOut_),
      homework: readTable_('homework').filter(function (h) { return h.id && h.subject; }).map(homeworkOut_),
      rewards: readTable_('rewards').filter(function (r) { return r.id && r.name; }).map(rewardOut_)
        .filter(function (r) { return isParent || r.active; }),
      requests: readTable_('requests').filter(function (r) { return r.id; }).map(requestOut_),
    },
  };
}

function cleanText_(v, max) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max || 200);
}

function validDate_(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d || ''))) throw appError_('BAD_REQUEST', 'Hibás dátum.');
  return d;
}

function requireSubject_(name) {
  const n = norm_(name);
  const s = readTable_('subjects').filter(function (x) { return norm_(x.name) === n; })[0];
  if (!s) throw appError_('BAD_REQUEST', 'Ismeretlen tantárgy: ' + name);
  return String(s.name).trim();
}

function createTopic_(user, subject, title, classDate) {
  const t = cleanText_(title);
  if (!t) throw appError_('BAD_REQUEST', 'Írd be a téma nevét.');
  const topic = {
    id: newId_('t_'), subject: subject, title: t, classDate: classDate ? validDate_(classDate) : '',
    createdBy: user.email, createdAt: now_(),
  };
  appendRow_('topics', topic);
  return topic;
}

function addTopic_(user, body) {
  const subject = requireSubject_(body.subject);
  const topic = createTopic_(user, subject, body.title, body.classDate);
  const changedTests = [];
  (body.testIds || []).forEach(function (id) {
    const t = findById_('tests', id);
    const ids = splitIds_(t.topicIds);
    if (ids.indexOf(topic.id) < 0) ids.push(topic.id);
    updateRow_('tests', t._row, { topicIds: ids.join(', ') });
    t.topicIds = ids.join(', ');
    changedTests.push(testOut_(t));
  });
  return { topic: topicOut_(topic), tests: changedTests };
}

function updateTopic_(user, body) {
  const t = findById_('topics', body.id);
  if (user.role !== 'parent' && norm_(t.createdBy) !== user.email) throw appError_('FORBIDDEN', 'Ezt a témát csak szülő módosíthatja.');
  const patch = {};
  if (body.title !== undefined) { patch.title = cleanText_(body.title); if (!patch.title) throw appError_('BAD_REQUEST', 'A téma neve nem lehet üres.'); }
  if (body.subject !== undefined) patch.subject = requireSubject_(body.subject);
  if (body.classDate !== undefined) patch.classDate = body.classDate ? validDate_(body.classDate) : '';
  updateRow_('topics', t._row, patch);
  Object.keys(patch).forEach(function (k) { t[k] = patch[k]; });
  return { topic: topicOut_(t) };
}

function deleteTopic_(user, body) {
  const t = findById_('topics', body.id);
  const changedTests = [];
  readTable_('tests').forEach(function (test) {
    const ids = splitIds_(test.topicIds);
    if (ids.indexOf(t.id) >= 0) {
      const rest = ids.filter(function (x) { return x !== t.id; }).join(', ');
      updateRow_('tests', test._row, { topicIds: rest });
      test.topicIds = rest;
      changedTests.push(testOut_(test));
    }
  });
  deleteRow_('topics', t._row);
  return { id: t.id, tests: changedTests };
}

function addTest_(user, body) {
  const subject = requireSubject_(body.subject);
  const date = validDate_(body.date);
  const isParent = user.role === 'parent';
  const s = settings_();
  const newTopics = (body.newTopics || []).map(function (title) { return createTopic_(user, subject, title, ''); });
  const ids = (body.topicIds || []).map(String).concat(newTopics.map(function (t) { return t.id; }));
  const difficulty = isParent && body.difficulty ? normDifficulty_(body.difficulty) : normDifficulty_(s.alap_nehezseg || 'közepes');
  const test = {
    id: newId_('d_'), date: date, subject: subject, type: TYPE_LABEL[normType_(body.type)], title: cleanText_(body.title),
    difficulty: DIFFICULTY_LABEL[difficulty], reps: isParent ? numOrBlank_(body.reps) : '', window: isParent ? numOrBlank_(body.window) : '',
    topicIds: ids.join(', '), note: cleanText_(body.note, 500), createdBy: user.email, createdAt: now_(),
  };
  appendRow_('tests', test);
  return { test: testOut_(test), topics: newTopics.map(topicOut_) };
}

function updateTest_(user, body) {
  const t = findById_('tests', body.id);
  const isParent = user.role === 'parent';
  const patch = {};
  const newTopics = (body.newTopics || []).map(function (title) { return createTopic_(user, String(t.subject), title, ''); });
  if (body.topicIds !== undefined || newTopics.length) {
    const ids = (body.topicIds !== undefined ? body.topicIds.map(String) : splitIds_(t.topicIds))
      .concat(newTopics.map(function (x) { return x.id; }));
    patch.topicIds = ids.filter(function (x, i, a) { return a.indexOf(x) === i; }).join(', ');
  }
  if (body.title !== undefined) patch.title = cleanText_(body.title);
  if (body.note !== undefined) patch.note = cleanText_(body.note, 500);
  if (isParent) {
    if (body.date !== undefined) patch.date = validDate_(body.date);
    if (body.subject !== undefined) patch.subject = requireSubject_(body.subject);
    if (body.type !== undefined) patch.type = TYPE_LABEL[normType_(body.type)];
    if (body.difficulty !== undefined) patch.difficulty = DIFFICULTY_LABEL[normDifficulty_(body.difficulty)];
    if (body.reps !== undefined) patch.reps = numOrBlank_(body.reps);
    if (body.window !== undefined) patch.window = numOrBlank_(body.window);
  }
  updateRow_('tests', t._row, patch);
  Object.keys(patch).forEach(function (k) { t[k] = patch[k]; });
  return { test: testOut_(t), topics: newTopics.map(topicOut_) };
}

function deleteTest_(user, body) {
  const t = findById_('tests', body.id);
  if (user.role !== 'parent' && norm_(t.createdBy) !== user.email) throw appError_('FORBIDDEN', 'Ezt csak szülő törölheti.');
  deleteRow_('tests', t._row);
  return { id: t.id };
}

// ---------- házi feladatok ----------

function addHomework_(user, body) {
  const hw = {
    id: newId_('h_'), subject: requireSubject_(body.subject), dueDate: validDate_(body.dueDate), task: cleanText_(body.task, 300),
    doneDate: '', doneBy: '', createdBy: user.email, createdAt: now_(),
  };
  appendRow_('homework', hw);
  return { homework: homeworkOut_(hw) };
}

function requireOwnHomework_(user, hw, what) {
  if (user.role !== 'parent' && norm_(hw.createdBy) !== user.email) throw appError_('FORBIDDEN', 'Ezt a házit csak szülő ' + what + '.');
}

function updateHomework_(user, body) {
  const hw = findById_('homework', body.id);
  requireOwnHomework_(user, hw, 'módosíthatja');
  const patch = {};
  if (body.task !== undefined) patch.task = cleanText_(body.task, 300);
  if (body.dueDate !== undefined) patch.dueDate = validDate_(body.dueDate);
  if (body.subject !== undefined) patch.subject = requireSubject_(body.subject);
  updateRow_('homework', hw._row, patch);
  Object.keys(patch).forEach(function (k) { hw[k] = patch[k]; });
  return { homework: homeworkOut_(hw) };
}

function deleteHomework_(user, body) {
  const hw = findById_('homework', body.id);
  requireOwnHomework_(user, hw, 'törölheti');
  deleteRow_('homework', hw._row);
  return { id: String(hw.id) };
}

/** Kész / nincs kész. A gyerek csak a saját mai pipáját vonhatja vissza, a szülő bármikor. */
function setHomeworkDone_(user, body) {
  const hw = findById_('homework', body.id);
  let patch = null;
  if (body.done) {
    if (!hw.doneDate) patch = { doneDate: today_(), doneBy: user.email };
  } else if (hw.doneDate) {
    if (user.role !== 'parent' && (hw.doneDate !== today_() || norm_(hw.doneBy) !== user.email)) {
      throw appError_('FORBIDDEN', 'Csak a mai pipát lehet visszavonni.');
    }
    patch = { doneDate: '', doneBy: '' };
  }
  if (patch) {
    updateRow_('homework', hw._row, patch);
    Object.keys(patch).forEach(function (k) { hw[k] = patch[k]; });
  }
  return { homework: homeworkOut_(hw) };
}

// ---------- tanulás ----------

function logStudy_(user, body) {
  const topic = findById_('topics', body.topicId);
  const today = today_();
  const log = readTable_('log').map(logOut_);
  const existing = log.filter(function (l) { return l.topicId === topic.id && l.date === today; })[0];
  if (existing) return { entry: existing };
  const kind = log.some(function (l) { return l.topicId === topic.id; }) ? 'ismetles' : 'atnezes';
  const entry = { id: newId_('n_'), date: today, at: now_(), topicId: topic.id, kind: KIND_LABEL[kind], by: user.email };
  appendRow_('log', entry);
  return { entry: logOut_(entry) };
}

function undoStudy_(user, body) {
  const l = findById_('log', body.id);
  if (l.date !== today_()) throw appError_('FORBIDDEN', 'Csak a mai pipát lehet visszavonni.');
  if (norm_(l.by) !== user.email) throw appError_('FORBIDDEN', 'Ezt nem te pipáltad.');
  deleteRow_('log', l._row);
  return { id: String(l.id) };
}

function requestReward_(user, body) {
  const r = rewardOut_(findById_('rewards', body.rewardId));
  if (!r.active) throw appError_('BAD_REQUEST', 'Ez a jutalom most nem kérhető.');
  const req = { id: newId_('k_'), at: now_(), rewardId: r.id, rewardName: r.name, price: r.price, status: STATUS_LABEL.kerve, decidedBy: '', decidedAt: '' };
  appendRow_('requests', req);
  return { request: requestOut_(req) };
}

function cancelRequest_(user, body) {
  const r = findById_('requests', body.id);
  if (normStatus_(r.status) !== 'kerve') throw appError_('BAD_REQUEST', 'Ezt a kérést már elbírálták.');
  const patch = { status: STATUS_LABEL.visszavonva, decidedBy: user.email, decidedAt: now_() };
  updateRow_('requests', r._row, patch);
  Object.keys(patch).forEach(function (k) { r[k] = patch[k]; });
  return { request: requestOut_(r) };
}

function decideRequest_(user, body) {
  const r = findById_('requests', body.id);
  if (normStatus_(r.status) !== 'kerve') throw appError_('BAD_REQUEST', 'Ezt a kérést már elbírálták.');
  const patch = { status: body.approve ? STATUS_LABEL.jovahagyva : STATUS_LABEL.elutasitva, decidedBy: user.email, decidedAt: now_() };
  updateRow_('requests', r._row, patch);
  Object.keys(patch).forEach(function (k) { r[k] = patch[k]; });
  return { request: requestOut_(r) };
}

// ===================================================================
// Táblázat előkészítése (egyszer kell futtatni a szerkesztőből vagy a menüből)
// ===================================================================

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Készülök')
    .addItem('Táblázat előkészítése', 'tablazatElokeszitese')
    .addToUi();
}

/**
 * Az összes szükséges engedély megadása (a szerkesztőből kell futtatni).
 * Az engedélykérő ablakban MINDEN pontot be kell jelölni („Összes kijelölése”),
 * különösen a „Csatlakozás külső szolgáltatáshoz” pontot: ezzel ellenőrzi a
 * szkript a Google-bejelentkezést.
 */
function engedelyezes() {
  if (typeof ScriptApp !== 'undefined' && ScriptApp.requireAllScopes) {
    ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL);
  }
  // Próbahívás a bejelentkezés-ellenőrző végpontra (token nélkül hibát ad, az itt rendben van).
  const code = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=proba', { muteHttpExceptions: true }).getResponseCode();
  Logger.log('Minden engedély megvan. (Próbahívás válaszkódja: ' + code + ', ez így rendben van.)');
}

function tablazatElokeszitese() {
  if (typeof ScriptApp !== 'undefined' && ScriptApp.requireAllScopes) {
    ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL);
  }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
  ss.setSpreadsheetTimeZone('Europe/Budapest');
  ss__ = ss;

  const me = Session.getActiveUser().getEmail() || 'SZULO_EMAIL@gmail.com';
  const samples = {
    users: [[me, 'Szülő', 'szülő'], ['GYEREK_EMAIL@gmail.com', 'Gyerek', 'gyerek']],
    subjects: [
      ['Magyar', '#4A6FA5', '📖', ''], ['Matek', '#3F9C6D', '➗', 'körző, vonalzó'], ['Angol', '#8E6BBF', '🇬🇧', ''],
      ['Történelem', '#B07D48', '🏰', ''], ['Természettudomány', '#2E9AA6', '🔬', ''], ['Testnevelés', '#D9774B', '👟', 'tornazsák'],
      ['Ének', '#C2649A', '🎵', ''], ['Rajz', '#D4A73B', '🎨', 'rajzfelszerelés'], ['Informatika', '#5C6F82', '💻', ''],
    ],
    timetable: [
      ['Hétfő', 1, 'Magyar', ''], ['Hétfő', 2, 'Matek', ''], ['Hétfő', 3, 'Angol', ''], ['Hétfő', 4, 'Testnevelés', ''],
      ['Kedd', 1, 'Matek', ''], ['Kedd', 2, 'Magyar', ''], ['Kedd', 3, 'Történelem', ''], ['Kedd', 4, 'Ének', ''],
      ['Szerda', 1, 'Magyar', ''], ['Szerda', 2, 'Természettudomány', ''], ['Szerda', 3, 'Matek', ''], ['Szerda', 4, 'Rajz', ''],
      ['Csütörtök', 1, 'Angol', ''], ['Csütörtök', 2, 'Matek', ''], ['Csütörtök', 3, 'Testnevelés', ''], ['Csütörtök', 4, 'Informatika', ''],
      ['Péntek', 1, 'Történelem', ''], ['Péntek', 2, 'Magyar', ''], ['Péntek', 3, 'Természettudomány', ''], ['Péntek', 4, 'Angol', ''],
    ],
    bells: [[1, '8:00', '8:45'], [2, '8:55', '9:40'], [3, '10:00', '10:45'], [4, '10:55', '11:40'], [5, '11:50', '12:35'], [6, '12:45', '13:30'], [7, '13:40', '14:25']],
    holidays: [['2026-12-21', '2027-01-03', 'Téli szünet']],
    rewards: [
      [newId_('j_'), '30 perc extra játékidő', 20, '🎮', 'igen'],
      [newId_('j_'), 'Fagyi vagy süti', 40, '🍦', 'igen'],
      [newId_('j_'), 'Én választom a vacsorát', 60, '🍕', 'igen'],
      [newId_('j_'), 'Mozi', 200, '🎬', 'igen'],
    ],
    settings: DEFAULT_SETTINGS,
  };

  const created = [];
  Object.keys(SCHEMA).forEach(function (key) {
    const def = SCHEMA[key];
    let sh = ss.getSheetByName(def.name);
    if (!sh) {
      sh = ss.insertSheet(def.name);
      created.push(def.name);
      const headers = def.cols.map(function (c) { return c[1]; });
      sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#E3EBF6');
      sh.setFrozenRows(1);
      const rows = samples[key];
      if (rows && rows.length) sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
      sh.autoResizeColumns(1, headers.length);
    } else if (key === 'settings') {
      // új beállításkulcsok pótlása, a meglévők érintetlenek maradnak
      const have = readTable_('settings').map(function (r) { return String(r.key).trim(); });
      DEFAULT_SETTINGS.forEach(function (row) { if (have.indexOf(row[0]) < 0) sh.appendRow(row); });
    }
    formatSheet_(sh, key);
  });

  ['Munkalap1', 'Sheet1', 'Lap1'].forEach(function (n) {
    const sh = ss.getSheetByName(n);
    if (sh && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });

  const msg = created.length ? 'Létrehozott lapok: ' + created.join(', ') + '.' : 'Minden lap megvolt, csak a formázást frissítettem.';
  try {
    SpreadsheetApp.getUi().alert('Készülök', msg + '\n\nKövetkező lépés: töltsd ki a Felhasználók lapot és a Beállítások lapon a google_client_id értéket (lásd TELEPITES.md).', SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    console.log(msg);
  }
}

function formatSheet_(sh, key) {
  const hm = headerMap_(sh, key);
  const rows = Math.max(sh.getMaxRows() - 1, 1);
  const col = function (k) { return hm.map[k] === undefined ? null : sh.getRange(2, hm.map[k] + 1, rows, 1); };
  const list = function (k, values) {
    const r = col(k);
    if (r) r.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(values, true).setAllowInvalid(true).build());
  };
  DATE_KEYS.forEach(function (k) { const r = col(k); if (r) r.setNumberFormat('yyyy-mm-dd'); });
  ['createdAt', 'at', 'decidedAt', 'lastUsed'].forEach(function (k) { const r = col(k); if (r) r.setNumberFormat('yyyy-mm-dd hh:mm'); });
  TIME_KEYS.forEach(function (k) { const r = col(k); if (r) r.setNumberFormat('h:mm'); });
  ['id', 'topicIds', 'topicId', 'rewardId', 'token'].forEach(function (k) { const r = col(k); if (r) r.setNumberFormat('@'); });

  if (key === 'users') list('role', ['szülő', 'gyerek']);
  if (key === 'timetable') {
    list('day', ['Hétfő', 'Kedd', 'Szerda', 'Csütörtök', 'Péntek']);
    list('week', ['A', 'B']);
    const r = col('subject');
    const subj = sh.getParent().getSheetByName(SCHEMA.subjects.name);
    if (r && subj) r.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInRange(subj.getRange('A2:A'), true).setAllowInvalid(true).build());
  }
  if (key === 'tests') {
    list('type', ['dolgozat', 'témazáró', 'felelés', 'beadandó']);
    list('difficulty', ['könnyű', 'közepes', 'nehéz']);
  }
  if (key === 'log') list('kind', ['átnézés', 'ismétlés']);
  if (key === 'rewards') list('active', ['igen', 'nem']);
  if (key === 'requests') list('status', ['kérve', 'jóváhagyva', 'elutasítva', 'visszavonva']);
}
