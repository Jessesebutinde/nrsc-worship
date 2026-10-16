// Licensed Bibles online (NIV, Amplified, NLT, ...): fetched chapter by chapter from API.Bible, the
// American Bible Society's service, with the church's own key. The key and the chapters already
// read stay on this laptop; nothing of a licensed Bible is ever published with the app.
//
// API.Bible asks every web app to report what it shows through its Fair Use Management System
// (FUMS): each response carries a token, and the tracker script reports it. That is done here.

export const API_BASE = 'https://rest.api.bible/v1';
export const FUMS_SCRIPT = 'https://pkg.api.bible/fumsV3.min.js';
const LS_ONLINE = 'ls-online-bibles';

/** The key and the Bibles added on this laptop: { key, bibles: [{ id, abbreviation, name, lang, copyright }] }. */
export function onlineConfig() {
  try {
    const c = JSON.parse(localStorage.getItem(LS_ONLINE) || '{}');
    return { key: c.key || '', bibles: Array.isArray(c.bibles) ? c.bibles : [] };
  } catch {
    return { key: '', bibles: [] };
  }
}

export function saveOnlineConfig(c) {
  try {
    localStorage.setItem(LS_ONLINE, JSON.stringify({ key: c.key || '', bibles: c.bibles || [] }));
  } catch {
    /* private window */
  }
}

/** The app's version id for a Bible from the service. */
export const onlineId = (bibleId) => `api:${bibleId}`;
export const isOnlineId = (id) => String(id || '').startsWith('api:');

const LANG = { eng: 'en', lug: 'lg' };

async function call(path, key, fetchImpl = globalThis.fetch) {
  let res;
  try {
    res = await fetchImpl(`${API_BASE}${path}`, { headers: { 'api-key': key } });
  } catch {
    throw new Error('The online Bible could not be reached. Is the laptop online?');
  }
  if (res.status === 401 || res.status === 403) throw new Error('The online Bible key was not accepted. Check it in Settings → Online Bibles.');
  if (res.status === 404) throw new Error('That chapter is not in this online Bible.');
  if (res.status === 429) throw new Error("The online Bible's monthly limit is used up for now.");
  if (!res.ok) throw new Error(`The online Bible answered with an error (HTTP ${res.status}).`);
  return res.json();
}

/** The Bibles this key may use, English and Luganda first: [{ id, abbreviation, name, lang, copyright, description }]. */
export async function listBibles(key, fetchImpl) {
  const { data } = await call('/bibles', key, fetchImpl);
  const list = (data || []).map((b) => ({
    id: b.id,
    abbreviation: b.abbreviationLocal || b.abbreviation || '',
    name: b.nameLocal || b.name || b.id,
    lang: LANG[(b.language && b.language.id) || ''] || 'other',
    langName: (b.language && (b.language.nameLocal || b.language.name)) || '',
    copyright: b.copyright || '',
    description: b.descriptionLocal || b.description || '',
  }));
  const rank = (b) => (b.lang === 'en' ? 0 : b.lang === 'lg' ? 1 : 2);
  return list.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/**
 * The verses of a chapter from the service's JSON content: every piece of text carries the id of
 * its verse (GEN.1.1), so the pieces are gathered by verse, whatever paragraphs, poetry lines or
 * character styles they sit in. Verse-number markers, section titles and notes are left out.
 */
export function versesFromJson(content) {
  const parts = new Map();
  const walk = (items) => {
    for (const it of items || []) {
      if (it.type === 'text') {
        const vid = it.attrs && it.attrs.verseId;
        const n = vid ? Number(String(vid).split('.').pop()) : 0;
        if (n > 0 && it.text) parts.set(n, [...(parts.get(n) || []), it.text]);
      } else if (it.type === 'tag' && it.name === 'verse') {
        // The verse number itself: not text.
      } else if (it.items) walk(it.items);
    }
  };
  for (const block of content || []) walk(block.items || (block.type === 'text' ? [block] : []));
  const max = Math.max(0, ...parts.keys());
  const out = [];
  for (let v = 1; v <= max; v++) out.push(clean((parts.get(v) || []).join(' ')));
  return out;
}

/** The verses of a chapter from the service's plain-text content ("[1] In the beginning ..."). */
export function versesFromText(text) {
  const out = [];
  for (const m of String(text || '').matchAll(/\[(\d+)\]\s*([^[]*)/g)) {
    const n = Number(m[1]);
    if (n > 0) out[n - 1] = clean(m[2]);
  }
  for (let i = 0; i < out.length; i++) if (out[i] == null) out[i] = '';
  return out;
}

const clean = (t) => String(t).replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();

/**
 * One chapter of an online Bible: { verses, copyright }. Verses are an array of strings, verse 1
 * first. The response's usage token is reported to the service, as its terms ask.
 */
export async function fetchChapter(key, bibleId, bookCode, chapter, fetchImpl) {
  const q = 'content-type=json&include-notes=false&include-titles=false&include-chapter-numbers=false&include-verse-numbers=false';
  const { data, meta } = await call(`/bibles/${bibleId}/chapters/${bookCode}.${chapter}?${q}`, key, fetchImpl);
  const content = data && data.content;
  const verses = Array.isArray(content) ? versesFromJson(content) : versesFromText(content);
  if (meta && meta.fumsToken) trackView(meta.fumsToken);
  return { verses, copyright: (data && data.copyright) || '' };
}

// ------------------------------------------------------------------ fair use reporting

let fumsLoaded = false;
/** Reports a scripture view to API.Bible's Fair Use Management System (in a browser only). */
export function trackView(token) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  // The tracker's own queue, so a view counts even before its script has arrived.
  window.fumsData = window.fumsData || [];
  window.fums =
    window.fums ||
    function fums() {
      window.fumsData.push(arguments);
    };
  if (!fumsLoaded) {
    fumsLoaded = true;
    const s = document.createElement('script');
    s.src = FUMS_SCRIPT;
    s.async = true;
    document.body.appendChild(s);
  }
  try {
    window.fums('trackView', token);
  } catch {
    /* the tracker is the service's concern */
  }
}
