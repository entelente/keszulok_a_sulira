// Belépési pont: útvonalak, bejelentkezés, kirajzolás.
import { h, add, clear } from './dom.js';
import { S, onChange, emit, start, load, login, logout, isParent, today } from './store.js';
import { getConfig, isConfigured } from './api.js';
import { renderHome, renderAddTest, renderAddTopic, renderTestDetail, renderRewards, renderWeek, renderAddHomework } from './child.js';
import { renderParent } from './parent.js';

const root = document.getElementById('app');

function parseRoute() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const conv = (x) => (x !== undefined && /^\d+$/.test(x) ? Number(x) : x);
  return { path: parts[0] || '', param: conv(parts[1]) };
}

// ---------- képernyők ----------

function centered(...kids) {
  return h('div', { class: 'center-screen' }, h('div', { class: 'center-card' }, ...kids));
}

function brand() {
  return [h('div', { class: 'brand-icon', 'aria-hidden': 'true' }, '🎒'), h('h1', { class: 'brand' }, 'Készülök')];
}

let gsiReady = null;
function loadGsi() {
  if (!gsiReady) {
    gsiReady = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = resolve;
      s.onerror = () => { gsiReady = null; reject(new Error('A Google bejelentkezés nem töltődött be.')); };
      document.head.appendChild(s);
    });
  }
  return gsiReady;
}

let clientId = null;

async function mountGoogleButton(el, msgEl) {
  try {
    if (!clientId) clientId = (await getConfig()).googleClientId;
    if (!clientId) { msgEl.textContent = 'A táblázat Beállítások lapján még nincs kitöltve a google_client_id.'; return; }
    await loadGsi();
    google.accounts.id.initialize({
      client_id: clientId,
      callback: (resp) => login(resp.credential),
      auto_select: false,
      cancel_on_tap_outside: true,
      use_fedcm_for_prompt: true,
    });
    google.accounts.id.renderButton(el, { theme: 'filled_blue', size: 'large', shape: 'pill', text: 'signin_with', locale: 'hu', width: 280 });
  } catch (e) {
    msgEl.textContent = e.message;
  }
}

function loginScreen() {
  if (!isConfigured()) {
    return centered(...brand(), h('p', null, 'Az alkalmazás még nincs beállítva: a config.js fájlba be kell írni az Apps Script webalkalmazás címét.'),
      h('p', { class: 'muted' }, 'Lásd: TELEPITES.md'));
  }
  const btn = h('div', { class: 'gsi-btn' });
  const msg = h('p', { class: 'login-msg' }, S.loginError || '');
  const card = centered(...brand(),
    h('p', null, 'Jelentkezz be a Google-fiókoddal.'),
    btn,
    S.busy ? h('p', { class: 'muted' }, 'Bejelentkezés…') : null,
    msg);
  requestAnimationFrame(() => mountGoogleButton(btn, msg));
  return card;
}

function errorScreen() {
  return centered(...brand(),
    h('p', null, 'Most nem sikerült betölteni az adatokat.'),
    h('p', { class: 'muted' }, S.error || ''),
    h('div', { class: 'row center' },
      h('button', { class: 'btn primary', onclick: () => { S.phase = 'loading'; emit(); load(); } }, 'Újrapróbálom'),
      h('button', { class: 'btn ghost', onclick: logout }, 'Kijelentkezés')));
}

function loadingScreen() {
  return centered(...brand(), h('div', { class: 'spinner', 'aria-label': 'Betöltés' }));
}

// ---------- kirajzolás ----------

let lastPhase = null;
let lastLogin = null;

function render() {
  // a bejelentkező képernyőt nem rajzoljuk újra feleslegesen (a Google gomb újra betöltődne)
  const loginKey = S.phase === 'login' ? `${S.busy}|${S.loginError}` : null;
  if (S.phase === 'login' && lastPhase === 'login' && loginKey === lastLogin) return;
  lastPhase = S.phase; lastLogin = loginKey;

  const scrollY = window.scrollY;
  clear(root);
  document.body.classList.toggle('parent-mode', !!(S.phase === 'ready' && isParent()));

  if (S.phase === 'loading') { add(root, loadingScreen()); return; }
  if (S.phase === 'login') { add(root, loginScreen()); return; }
  if (S.phase === 'error') { add(root, errorScreen()); return; }

  const { path, param } = parseRoute();
  if (isParent()) {
    renderParent(root, path, param);
  } else {
    switch (path) {
      case 'uj-dolgozat': renderAddTest(root, param || 1); break;
      case 'uj-tema': renderAddTopic(root, param || 1); break;
      case 'uj-hazi': renderAddHomework(root, param || 1); break;
      case 'dolgozat': renderTestDetail(root, param); break;
      case 'jutalmak': renderRewards(root); break;
      case 'het': renderWeek(root, param); break;
      default: renderHome(root);
    }
  }
  if (S.busy) add(root, h('div', { class: 'saving', role: 'status' }, 'Mentés…'));
  if (!routeChanged) window.scrollTo(0, scrollY);
  routeChanged = false;
}

let routeChanged = false;
window.addEventListener('hashchange', () => { routeChanged = true; render(); window.scrollTo(0, 0); });

onChange(render);

// ---------- frissítés, ha az app újra előtérbe kerül ----------

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.phase === 'ready' && Date.now() - S.lastLoad > 60_000) load({ silent: true });
});

// éjfélkor (vagy ha sokáig nyitva marad) frissüljön a "ma"
let shownDay = today();
setInterval(() => {
  if (today() !== shownDay) { shownDay = today(); emit(); }
}, 60_000);

// ---------- service worker (telepíthetőség, gyors indulás) ----------

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => { /* nem kötelező */ });
}

start();
