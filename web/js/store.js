// Az alkalmazás állapota és a mentő műveletek.
import * as L from './logic.js';
import { api, getToken, setToken } from './api.js';
import { toast } from './dom.js';

export const S = {
  phase: 'loading', // loading | login | ready | error
  me: null,
  data: null,
  error: null,
  loginError: null,
  busy: 0,
  pending: new Set(), // témák, amelyek pipálása épp mentés alatt van
  lastLoad: 0,
};

const listeners = new Set();
export function onChange(fn) { listeners.add(fn); }
export function emit() { for (const fn of listeners) fn(); }

export const today = () => L.localToday();
export const isParent = () => S.me && S.me.role === 'parent';

function handleError(e, { fatal = false } = {}) {
  if (e.code === 'AUTH') {
    setToken(null);
    S.phase = 'login';
    S.me = null;
    S.data = null;
    S.loginError = e.message;
  } else if (fatal) {
    S.phase = 'error';
    S.error = e.message;
  } else {
    toast(e.message, 'error');
  }
}

export async function start() {
  if (!getToken()) { S.phase = 'login'; emit(); return; }
  await load();
}

export async function load({ silent = false } = {}) {
  try {
    const r = await api('bootstrap');
    S.me = r.me;
    S.data = r.data;
    S.phase = 'ready';
    S.error = null;
    S.lastLoad = Date.now();
  } catch (e) {
    handleError(e, { fatal: !silent || S.phase !== 'ready' });
  }
  emit();
}

export async function login(idToken) {
  S.busy++; S.loginError = null; emit();
  try {
    const r = await api('login', { idToken, device: navigator.userAgent });
    setToken(r.token);
    await load();
  } catch (e) {
    S.loginError = e.message;
    S.phase = 'login';
  } finally {
    S.busy--; emit();
  }
}

export async function logout() {
  try { await api('logout'); } catch { /* mindegy */ }
  setToken(null);
  S.me = null; S.data = null; S.phase = 'login';
  emit();
}

// ---------- segédek a helyi adatok frissítéséhez ----------

function upsert(list, item) {
  const i = list.findIndex((x) => x.id === item.id);
  if (i >= 0) list[i] = item; else list.push(item);
}

function applyResult(r) {
  const d = S.data;
  if (r.topic) upsert(d.topics, r.topic);
  if (r.topics) r.topics.forEach((t) => upsert(d.topics, t));
  if (r.test) upsert(d.tests, r.test);
  if (r.tests) r.tests.forEach((t) => upsert(d.tests, t));
  if (r.request) upsert(d.requests, r.request);
}

/** Mentés "Mentés…" jelzéssel. Siker esetén a választ adja vissza, hiba esetén null-t. */
async function mutate(action, payload, apply = applyResult) {
  S.busy++; emit();
  try {
    const r = await api(action, payload);
    apply(r);
    return r;
  } catch (e) {
    handleError(e);
    return null;
  } finally {
    S.busy--; emit();
  }
}

// ---------- tanulás pipálása (azonnal látszik, a mentés a háttérben fut) ----------

export function studiedToday(topicId) {
  const t = today();
  return S.data.log.some((l) => l.topicId === topicId && l.date === t);
}

export async function toggleStudy(topicId) {
  if (S.pending.has(topicId)) return null;
  const d = S.data;
  const t = today();
  const mine = d.log.filter((l) => l.topicId === topicId && l.date === t);
  S.pending.add(topicId);

  if (mine.length) {
    d.log = d.log.filter((l) => !mine.includes(l));
    emit();
    try {
      for (const l of mine) await api('undoStudy', { id: l.id });
      return { undone: true };
    } catch (e) {
      d.log.push(...mine);
      handleError(e);
      return null;
    } finally {
      S.pending.delete(topicId); emit();
    }
  }

  const kind = L.nextKind(d.log, topicId);
  const tmp = { id: 'tmp_' + Date.now(), date: t, at: '', topicId, kind, by: S.me.email };
  d.log.push(tmp);
  emit();
  try {
    const r = await api('logStudy', { topicId });
    d.log = d.log.filter((l) => l !== tmp && l.id !== r.entry.id);
    d.log.push(r.entry);
    const gain = L.setting(d, r.entry.kind === 'ismetles' ? 'pont_ismetles' : 'pont_atnezes');
    toast(`+${gain} ⭐  Ügyes vagy!`, 'success');
    return { kind: r.entry.kind };
  } catch (e) {
    d.log = d.log.filter((l) => l !== tmp);
    handleError(e);
    return null;
  } finally {
    S.pending.delete(topicId); emit();
  }
}

// ---------- témák és számonkérések ----------

export const addTopic = (p) => mutate('addTopic', p);
export const updateTopic = (p) => mutate('updateTopic', p);
export const deleteTopic = (id) => mutate('deleteTopic', { id }, (r) => {
  S.data.topics = S.data.topics.filter((t) => t.id !== r.id);
  applyResult(r);
});
export const addTest = (p) => mutate('addTest', p);
export const updateTest = (p) => mutate('updateTest', p);
export const deleteTest = (id) => mutate('deleteTest', { id }, (r) => {
  S.data.tests = S.data.tests.filter((t) => t.id !== r.id);
});

// ---------- jutalmak ----------

export const requestReward = (rewardId) => mutate('requestReward', { rewardId });
export const cancelRequest = (id) => mutate('cancelRequest', { id });
export const decideRequest = (id, approve) => mutate('decideRequest', { id, approve });

// ---------- névfeloldás ----------

export function userName(email) {
  if (!email) return '';
  const u = (S.data.users || []).find((x) => x.email && x.email === String(email).toLowerCase());
  if (u) return u.name;
  if (S.me && S.me.email === String(email).toLowerCase()) return S.me.name;
  return String(email).split('@')[0];
}

export function childName() {
  const c = (S.data.users || []).find((u) => u.role === 'child');
  return c ? c.name : 'Gyerek';
}
