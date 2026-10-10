// Supabase sign-in (email magic link) and the shared song table, over plain fetch.
// Only used when src/lyrics/config.js has a project; everything else works without it.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const LS_SESSION = 'ls-session';
export const cloudConfigured = () => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const cloudConfig = () => (cloudConfigured() ? { url: SUPABASE_URL, key: SUPABASE_ANON_KEY } : null);

async function call(path, { method = 'GET', body, token, headers = {} } = {}) {
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}${path}`, {
      method,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Could not reach the cloud. Check the internet connection.');
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg = (data && (data.msg || data.message || data.error_description || data.error)) || `HTTP ${res.status}`;
    throw new Error(res.status === 402 ? 'The Supabase project is over its quota.' : msg);
  }
  return data;
}

export function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(LS_SESSION) || 'null');
  } catch {
    return null;
  }
}

function saveSession(s) {
  if (s) localStorage.setItem(LS_SESSION, JSON.stringify(s));
  else localStorage.removeItem(LS_SESSION);
}

export async function sendMagicLink(email) {
  const back = location.href.split('#')[0];
  await call(`/auth/v1/otp?redirect_to=${encodeURIComponent(back)}`, {
    method: 'POST',
    body: { email, create_user: true },
  });
}

/** After the magic link lands here (#access_token=...), store the session and tidy the address bar. */
export async function captureSession() {
  const h = new URLSearchParams(location.hash.replace(/^#/, ''));
  if (h.get('error_description')) {
    history.replaceState(null, '', location.pathname + location.search);
    throw new Error(h.get('error_description'));
  }
  const access = h.get('access_token');
  if (!access) return loadSession();
  history.replaceState(null, '', location.pathname + location.search);
  const user = await call('/auth/v1/user', { token: access });
  const s = {
    access_token: access,
    refresh_token: h.get('refresh_token'),
    expires_at: Date.now() / 1000 + Number(h.get('expires_in') || 3600),
    email: user && user.email,
  };
  saveSession(s);
  return s;
}

async function token() {
  let s = loadSession();
  if (!s) throw new Error('Sign in first.');
  if (s.expires_at - 60 < Date.now() / 1000) {
    try {
      const r = await call('/auth/v1/token?grant_type=refresh_token', {
        method: 'POST',
        body: { refresh_token: s.refresh_token },
      });
      s = { ...s, access_token: r.access_token, refresh_token: r.refresh_token, expires_at: r.expires_at || Date.now() / 1000 + r.expires_in };
      saveSession(s);
    } catch (e) {
      saveSession(null);
      throw new Error(`Signed out (${e.message}). Sign in again.`);
    }
  }
  return s.access_token;
}

export function signOut() {
  saveSession(null);
}

const toRow = (s) => ({
  id: s.id,
  title: s.title,
  language: s.language,
  preset: s.preset,
  lyrics_raw: s.text,
  slides: s.slides,
  tags: s.tags || [],
  deleted: Boolean(s.deleted),
  updated_at: new Date(s.updatedAt).toISOString(),
});

const fromRow = (r) => ({
  id: r.id,
  title: r.title,
  language: r.language,
  preset: r.preset,
  text: r.lyrics_raw,
  slides: r.slides,
  tags: r.tags || [],
  deleted: r.deleted,
  updatedAt: Date.parse(r.updated_at),
});

export async function pullSongs() {
  const rows = await call('/rest/v1/lyric_songs?select=*&order=title', { token: await token() });
  return (rows || []).map(fromRow);
}

export async function pushSongs(songs) {
  if (!songs.length) return;
  await call('/rest/v1/lyric_songs?on_conflict=id', {
    method: 'POST',
    token: await token(),
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: songs.map(toRow),
  });
}
