// Sharing the song library between laptops, through one private gist on the church's own GitHub
// account. A gist is a small file GitHub keeps for you; a token with only the "gist" permission can
// read and write gists and nothing else (it cannot touch the app's code or anything else). Each laptop
// keeps its own copy of the songs, and every save, every return to the page and every minute or so the
// copy and the gist are merged: the newest edit of each song wins and a deleted song stays deleted.
// Only the lyrics travel (the slides are cut again on the other laptop). The token stays in that
// laptop's browser, like the online Bible key.

import { parseSlides } from './split.js';
import { mergeSongs } from './library.js';

export const API = 'https://api.github.com';
export const GIST_FILE = 'lyric-slides-songs.json';
export const GIST_DESC = 'Lyric Slides song library (Namasuba Redeemed)';
// Opens GitHub's "new token" page with only the gist box ticked and a name filled in.
export const TOKEN_URL = `https://github.com/settings/tokens/new?scopes=gist&description=${encodeURIComponent('Lyric Slides songs')}`;
const LS_SHARE = 'ls-share';
const MAX_PAGES = 10;

const store = () => {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
};

/** What this laptop has set up: { token, gistId } (both empty when it is not sharing). */
export function shareConfig(storage = store()) {
  try {
    const c = JSON.parse((storage && storage.getItem(LS_SHARE)) || '{}');
    return { token: c.token || '', gistId: c.gistId || '' };
  } catch {
    return { token: '', gistId: '' };
  }
}

export function saveShareConfig(c, storage = store()) {
  try {
    if (!storage) return;
    if (c && c.token && c.gistId) storage.setItem(LS_SHARE, JSON.stringify({ token: c.token, gistId: c.gistId }));
    else storage.removeItem(LS_SHARE);
  } catch {
    /* private window: sharing lasts until the page closes */
  }
}

export const isSharing = (c = shareConfig()) => Boolean(c.token && c.gistId);

// ------------------------------------------------------------------ the setup link

const enc = (s) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const dec = (s) => atob(String(s).replace(/-/g, '+').replace(/_/g, '/'));
const TOKEN_RE = /^[A-Za-z0-9_]{20,255}$/;
const ID_RE = /^[0-9a-f]{8,64}$/i;

/** A link that sets another laptop up: the token and the gist go after the # (never sent anywhere). */
export function setupLink(c, base) {
  return `${String(base).split('#')[0]}#share=${enc(JSON.stringify({ t: c.token, g: c.gistId }))}`;
}

/** The setup in a page address's #share=…, or null. */
export function readSetupLink(hash) {
  const m = /(?:^#|&)share=([A-Za-z0-9_-]+)/.exec(String(hash || ''));
  if (!m) return null;
  try {
    const o = JSON.parse(dec(m[1]));
    return TOKEN_RE.test(o.t) && ID_RE.test(o.g) ? { token: o.t, gistId: o.g } : null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ the library as a file

const NOT_READ = 'The shared song file could not be read.';

/** The songs as the gist keeps them: lyrics only (slides are cut again on arrival, a deleted song keeps no text). */
export function pack(songs) {
  return JSON.stringify({
    app: 'lyric-slides',
    version: 1,
    saved: new Date().toISOString(),
    songs: songs.map((s) => ({
      id: s.id,
      title: s.title,
      language: s.language,
      preset: s.preset,
      text: s.deleted ? '' : s.text,
      tags: s.tags || [],
      deleted: Boolean(s.deleted),
      updatedAt: s.updatedAt,
    })),
  });
}

export function unpack(content) {
  let data;
  try {
    data = JSON.parse(content);
  } catch {
    throw new Error(NOT_READ);
  }
  const list = Array.isArray(data) ? data : data && Array.isArray(data.songs) ? data.songs : null;
  if (!list) throw new Error(NOT_READ);
  return list
    .filter((s) => s && typeof s.id === 'string' && s.id && typeof s.title === 'string')
    .map((s) => {
      const deleted = Boolean(s.deleted);
      const text = deleted ? '' : String(s.text || '');
      return {
        id: s.id,
        title: s.title,
        language: s.language || 'en',
        preset: s.preset || 'worship',
        text,
        slides: deleted ? [] : parseSlides(text),
        tags: Array.isArray(s.tags) ? s.tags : [],
        deleted,
        updatedAt: Number(s.updatedAt) || 0,
      };
    });
}

// ------------------------------------------------------------------ GitHub

const fail = (message, status) => Object.assign(new Error(message), { status });

async function call(token, path, { method = 'GET', body, fetchImpl = globalThis.fetch, raw = false } = {}) {
  // A GET carries a changing query so the browser never answers from a minute-old copy.
  const url = raw ? path : `${API}${path}${method === 'GET' ? `${path.includes('?') ? '&' : '?'}_=${Date.now()}` : ''}`;
  let res;
  try {
    res = await fetchImpl(url, {
      method,
      ...(raw ? {} : { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', ...(body ? { 'Content-Type': 'application/json' } : {}) } }),
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw fail('Could not reach GitHub. Check the internet connection.', 0);
  }
  if (res.status === 401) throw fail('GitHub did not accept that token. Make a new one and paste it again.', 401);
  if (res.status === 429 || (res.status === 403 && res.headers && res.headers.get && res.headers.get('x-ratelimit-remaining') === '0'))
    throw fail('GitHub is limiting requests for a few minutes. It will try again by itself.', 429);
  if (res.status === 403) throw fail('GitHub would not let this token use gists. Make a classic token with only the "gist" box ticked.', 403);
  if (res.status === 404) throw fail('GitHub could not find the shared song file.', 404);
  if (!res.ok) throw fail(`GitHub answered with an error (HTTP ${res.status}).`, res.status);
  if (res.status === 204) return null;
  return raw ? res.text() : res.json();
}

/** The shared gist on this account (the oldest one, so laptops that started at once all agree), or null. */
export async function findGist(token, fetchImpl) {
  const found = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const list = await call(token, `/gists?per_page=100&page=${page}`, { fetchImpl });
    for (const g of list || []) if (g.description === GIST_DESC && g.files && g.files[GIST_FILE]) found.push(g);
    if (!list || list.length < 100) break;
  }
  found.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  return found.length ? found[0].id : null;
}

export async function createGist(token, songs, fetchImpl) {
  try {
    const g = await call(token, '/gists', {
      method: 'POST',
      body: { description: GIST_DESC, public: false, files: { [GIST_FILE]: { content: pack(songs) } } },
      fetchImpl,
    });
    return g.id;
  } catch (e) {
    // A token without the gist permission is answered with "not found" when it tries to make one.
    if (e.status === 404) throw fail('GitHub would not let this token use gists. Make a classic token with only the "gist" box ticked.', 403);
    throw e;
  }
}

export async function readGist(token, id, fetchImpl) {
  const g = await call(token, `/gists/${id}`, { fetchImpl });
  const file = g.files && g.files[GIST_FILE];
  if (!file) throw fail('The shared song file is missing from that gist.', 404);
  // A file over 1 MB comes back cut short; the whole of it is at its raw address.
  const content = file.truncated && file.raw_url ? await call(token, file.raw_url, { raw: true, fetchImpl }) : file.content;
  return unpack(content);
}

export async function writeGist(token, id, songs, fetchImpl) {
  await call(token, `/gists/${id}`, { method: 'PATCH', body: { files: { [GIST_FILE]: { content: pack(songs) } } }, fetchImpl });
}

/**
 * Brings this laptop and the gist level: the newest edit of each song wins. Returns
 * { songs, pulled, pushed }: the merged library, how many songs arrived or changed here, and how
 * many were written back. Nothing is ever removed, so a bad read cannot empty the library.
 */
export async function syncSongs(local, cfg, fetchImpl) {
  const remote = await readGist(cfg.token, cfg.gistId, fetchImpl);
  const { songs, push } = mergeSongs(local, remote);
  const had = new Map(local.map((s) => [s.id, s]));
  const pulled = songs.filter((s) => {
    const l = had.get(s.id);
    return !l || s.updatedAt > l.updatedAt;
  }).length;
  if (push.length) await writeGist(cfg.token, cfg.gistId, songs, fetchImpl);
  return { songs, pulled, pushed: push.length };
}

/**
 * First time on a laptop: find the library on this GitHub account, or start it from this laptop's
 * songs, then bring the two level. Returns { cfg, songs, pulled, pushed, created }.
 */
export async function connectShare(token, local, fetchImpl) {
  let id = await findGist(token, fetchImpl);
  let created = false;
  if (!id) {
    id = await createGist(token, local, fetchImpl);
    created = true;
    // Two laptops starting at the same moment both make one: they all keep the older.
    const first = await findGist(token, fetchImpl);
    if (first && first !== id) {
      await call(token, `/gists/${id}`, { method: 'DELETE', fetchImpl }).catch(() => {});
      id = first;
      created = false;
    }
  }
  const cfg = { token, gistId: id };
  return { cfg, created, ...(await syncSongs(local, cfg, fetchImpl)) };
}
