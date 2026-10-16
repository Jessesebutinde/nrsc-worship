// The song library, kept on this device (and mirrored to Supabase when signed in).

import { parseSlides } from './split.js';
import { SEED_SONGS } from './seed.js';

const LS_SONGS = 'ls-songs';
const LS_SEEDED = 'ls-seeded';

export function songId() {
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** A song record from its slide text. */
export function makeSong({ id = songId(), title, language = 'en', preset = 'worship', text, tags = [] }) {
  return { id, title: title.trim() || 'Untitled', language, preset, text, slides: parseSlides(text), tags, updatedAt: Date.now() };
}

export function loadSongs(storage = globalThis.localStorage) {
  let songs = [];
  try {
    songs = JSON.parse(storage.getItem(LS_SONGS) || '[]');
  } catch {
    songs = [];
  }
  if (!songs.length && !storage.getItem(LS_SEEDED)) {
    songs = SEED_SONGS.map((s) => makeSong(s));
    storage.setItem(LS_SEEDED, '1');
    saveSongs(songs, storage);
  }
  return songs;
}

export function saveSongs(songs, storage = globalThis.localStorage) {
  storage.setItem(LS_SONGS, JSON.stringify(songs));
}

export const visibleSongs = (songs) =>
  songs.filter((s) => !s.deleted).sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));

export function upsertSong(songs, song) {
  const next = songs.filter((s) => s.id !== song.id);
  next.push({ ...song, updatedAt: Date.now() });
  return next;
}

/** Deleted songs are kept as tombstones so the deletion syncs. */
export function removeSong(songs, id) {
  return songs.map((s) => (s.id === id ? { ...s, deleted: true, updatedAt: Date.now() } : s));
}

/** Newest edit wins per song. Returns { songs, push } where push = local songs the other side lacks or has older. */
export function mergeSongs(local, remote) {
  const byId = new Map(remote.map((s) => [s.id, s]));
  const push = [];
  for (const s of local) {
    const r = byId.get(s.id);
    if (!r || s.updatedAt > r.updatedAt) {
      byId.set(s.id, s);
      push.push(s);
    }
  }
  return { songs: [...byId.values()], push };
}

/** Search by title, tag or any lyric words. */
export function searchSongs(songs, query) {
  const q = query.trim().toLowerCase();
  const list = visibleSongs(songs);
  if (!q) return list;
  const scored = [];
  for (const s of list) {
    const t = s.title.toLowerCase();
    const score = t.startsWith(q)
      ? 0
      : t.includes(q)
        ? 1
        : (s.tags || []).some((x) => x.toLowerCase().includes(q))
          ? 2
          : s.text.toLowerCase().includes(q)
            ? 3
            : -1;
    if (score >= 0) scored.push([score, s]);
  }
  return scored.sort((a, b) => a[0] - b[0]).map((x) => x[1]);
}

/** Library file for moving songs between devices. */
export function exportLibrary(songs) {
  return JSON.stringify({ app: 'lyric-slides', version: 1, songs: visibleSongs(songs) }, null, 1);
}

export function importLibrary(songs, json) {
  const data = JSON.parse(json);
  const incoming = (Array.isArray(data) ? data : data.songs || []).filter((s) => s && s.title && (s.text || s.lyrics_raw));
  if (!incoming.length) throw new Error('No songs in that file.');
  const fixed = incoming.map((s) =>
    makeSong({ id: s.id, title: s.title, language: s.language, preset: s.preset, text: s.text || s.lyrics_raw, tags: s.tags }),
  );
  // An import counts as the newest edit for the songs it carries.
  return { songs: mergeSongs(fixed, songs).songs, count: fixed.length };
}
