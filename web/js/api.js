// Kapcsolat az Apps Script API-val.
import { API_URL } from '../config.js';

const TOKEN_KEY = 'keszulok_token';

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* privát mód: nem tudunk menteni */ }
}

export class ApiError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export function isConfigured() {
  return typeof API_URL === 'string' && /^https:\/\/script\.google\.com\//.test(API_URL);
}

async function readJson(res) {
  try { return await res.json(); } catch { throw new ApiError('SERVER', 'Hibás válasz érkezett a szervertől.'); }
}

/**
 * POST kérés. A Content-Type szándékosan text/plain: így a böngésző nem küld
 * előzetes (CORS preflight) kérést, amit az Apps Script nem tudna kezelni.
 */
export async function api(action, payload = {}) {
  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...payload, action, token: getToken() }),
      redirect: 'follow',
    });
  } catch {
    throw new ApiError('NETWORK', 'Nincs internetkapcsolat, vagy most nem érhető el a szerver.');
  }
  const j = await readJson(res);
  if (!j.ok) throw new ApiError(j.code || 'ERROR', j.error || 'Ismeretlen hiba.');
  return j.data;
}

export async function getConfig() {
  let res;
  try { res = await fetch(API_URL + '?action=config', { redirect: 'follow' }); }
  catch { throw new ApiError('NETWORK', 'Nincs internetkapcsolat, vagy most nem érhető el a szerver.'); }
  const j = await readJson(res);
  if (!j.ok) throw new ApiError(j.code || 'ERROR', j.error);
  return j.data;
}
