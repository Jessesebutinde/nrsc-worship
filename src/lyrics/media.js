// Pictures and videos kept on this device: the list lives in localStorage, the files themselves in
// IndexedDB (a picture is far too big for localStorage). Shared by the Media tab and the Google orb,
// which both add to it; anything showing the list listens for 'ls-media' and reads it again.

import { idbSet, idbDel } from './idb.js';

export const LS_MEDIA = 'ls-media';
const EVT = 'ls-media';

/** The pictures and videos added on this device, oldest first: [{ id, title, type, src }]. */
export function myMedia() {
  try {
    const v = JSON.parse(localStorage.getItem(LS_MEDIA));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function save(list) {
  try {
    localStorage.setItem(LS_MEDIA, JSON.stringify(list));
  } catch {
    /* storage full or blocked */
  }
  if (typeof dispatchEvent === 'function' && typeof Event === 'function') dispatchEvent(new Event(EVT));
}

/** Calls f whenever the list changes (returns the function that stops listening). */
export function onMediaChange(f) {
  addEventListener(EVT, f);
  return () => removeEventListener(EVT, f);
}

export const isVideoUrl = (u) => /\.(mp4|webm|m4v|mov|ogv)(\?|$)/i.test(String(u));

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** A title for a picture from its file name or address. */
export function titleOf(name) {
  const base = String(name || '')
    .split('/')
    .pop()
    .split('?')[0];
  const t = decodeURIComponent(base).replace(/\.[^.]+$/, '').replace(/[-_+]+/g, ' ').trim();
  return t || 'Picture';
}

/**
 * Keeps files (File or Blob objects with a type) on this device. Returns { added, tooBig }: the
 * entries added, and the names of files IndexedDB would not take.
 */
export async function addMediaFiles(files, { title = '' } = {}) {
  const added = [];
  const tooBig = [];
  for (const f of files) {
    const id = newId();
    const name = f.name || title || 'picture';
    try {
      await idbSet('files', `media:${id}`, f);
      added.push({ id, title: title || titleOf(name), type: String(f.type || '').startsWith('video') ? 'video' : 'image', src: `idb:media:${id}` });
    } catch {
      tooBig.push(name);
    }
  }
  if (added.length) save([...myMedia(), ...added]);
  return { added, tooBig };
}

/** Keeps a picture or video link. Returns the entry (an existing one for the same link is replaced). */
export function addMediaUrl(u, { title = '' } = {}) {
  const url = String(u || '').trim();
  if (!url) return null;
  const m = { id: `u:${url}`, title: title || titleOf(url), type: isVideoUrl(url) ? 'video' : 'image', src: url };
  save([...myMedia().filter((x) => x.id !== m.id), m]);
  return m;
}

export function removeMedia(m) {
  if (m.src && m.src.startsWith('idb:')) idbDel('files', m.src.slice(4)).catch(() => {});
  save(myMedia().filter((x) => x.id !== m.id));
}

/** A data: URL (a thumbnail dragged out of Google Images) as a File that can be kept. */
export async function dataUrlToFile(dataUrl, name = 'picture') {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
  return new File([blob], `${name}.${ext}`, { type: blob.type });
}

/**
 * What a drop or a paste brought: picture or video files ({ files }), or a picture's address
 * ({ url }, http(s) or data:), or null. Browsers describe a dragged picture several ways at once
 * (the file, a uri-list, an <img> in HTML, plain text); the first usable one wins.
 */
export function droppedPicture(dt) {
  if (!dt) return null;
  const files = [...((dt.files && dt.files.length ? dt.files : dt.items ? [...dt.items].map((i) => (i.kind === 'file' ? i.getAsFile() : null)) : []) || [])].filter(
    (f) => f && /^(image|video)\//.test(f.type),
  );
  if (files.length) return { files };
  const get = (t) => {
    try {
      return String(dt.getData(t) || '');
    } catch {
      return '';
    }
  };
  const okUrl = (u) => /^(https?:\/\/\S+|data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+)$/i.test(u);
  const uri = get('text/uri-list')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('#'));
  if (uri && okUrl(uri)) return { url: uri };
  const htmlText = get('text/html');
  const img = /<img[^>]+src\s*=\s*["']([^"']+)["']/i.exec(htmlText);
  if (img && okUrl(img[1].replace(/&amp;/g, '&'))) return { url: img[1].replace(/&amp;/g, '&') };
  const plain = get('text/plain').trim();
  if (plain && okUrl(plain)) return { url: plain };
  return null;
}

/** A Google search for the companion window: the web, or pictures. */
export function googleUrl(q, kind = 'images') {
  const u = new URL('https://www.google.com/search');
  u.searchParams.set('q', String(q || '').trim());
  if (kind === 'images') u.searchParams.set('tbm', 'isch');
  return u.href;
}
