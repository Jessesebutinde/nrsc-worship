// Bible text: importing files, loading chapters, and turning verses into slides.
//
// A version's text is stored per book as chapters of verses: chapters[c - 1][v - 1] = text.
// Built-in versions are static JSON next to the page (lyrics/bibles/<id>/<book>.json);
// imported ones live in IndexedDB on the device that imported them.

import { bookByCode, bookByNumber, findBook, formatRef } from './books.js';
import { idbGet, idbSet } from './idb.js';
import { onlineConfig, saveOnlineConfig, isOnlineId, fetchChapter } from './online.js';
import { SPLIT_SCALE, validSplit, parseSplit } from './state.js';
import { splitAtPauses } from './split.js';

export const BUILTIN_VERSIONS = [
  {
    id: 'lug68',
    name: 'Luganda 1968',
    lang: 'lg',
    label: 'Luganda 1968',
    notice:
      'Ekitabo Ekitukuvu ekiyitibwa Baibuli (Luganda Bible 1968). © United Bible Societies 1968; British and ' +
      'Foreign Bible Society 1954, 1967, 1972, 1994; The Bible Society of Uganda 2013.',
  },
  { id: 'kjv', name: 'King James Version', lang: 'en', label: 'KJV', notice: 'Public domain.' },
  // Modern English; also always searched, so a verse quoted in today's words is found.
  { id: 'web', name: 'World English Bible', lang: 'en', label: 'WEB', notice: 'Public domain.' },
];

// ------------------------------------------------------------------ parsing files

function put(books, n, c, v, text) {
  if (!n || !c || !v || !text) return;
  let chapters = books.get(n);
  if (!chapters) books.set(n, (chapters = []));
  while (chapters.length < c) chapters.push([]);
  const ch = chapters[c - 1];
  while (ch.length < v) ch.push('');
  ch[v - 1] = text;
}

function bookFromToken(tok) {
  const t = String(tok).trim();
  if (/^\d{1,2}$/.test(t)) return bookByNumber(+t);
  return bookByCode(t) || findBook(t);
}

/**
 * Reads Bible text in any of these shapes and returns Map(book number -> chapters):
 * - eBible VPL lines: "PSA 23:1 text" (also "Zabbuli 23:1 text", "Psalm 23:1 text")
 * - tab separated: book, chapter, verse, text (book as code, number or name; a header row is skipped)
 * - USFM: \id PSA ... \c 23 ... \v 1 text
 * - XML: <book number="19"><chapter number="23"><verse number="1">text</verse> (also Zefania's BIBLEBOOK/CHAPTER/VERS)
 * - JSON: [{book, chapter, verse, text}] (or b/c/v/t), or {"PSA": [[...verses], ...chapters]}
 * `clean` post-processes each verse's text.
 */
export function parseBibleText(text, { clean = (t) => t.replace(/\s+/g, ' ').trim() } = {}) {
  const books = new Map();
  const src = String(text).replace(/^\uFEFF/, '');
  const add = (book, c, v, t) => book && put(books, book.n, +c, +v, clean(String(t)));
  const trimmed = src.trim();

  if (trimmed.startsWith('<')) {
    let book = null;
    let c = 0;
    const tags = /<(book|biblebook|chapter|verse|vers)\b([^>]*)>|<\/(verse|vers)>/gi;
    let m;
    let open = null;
    while ((m = tags.exec(src))) {
      if (m[3]) {
        if (open) add(book, c, open.v, decodeXml(src.slice(open.at, m.index).replace(/<[^>]*>/g, ' ')));
        open = null;
        continue;
      }
      const tag = m[1].toLowerCase();
      const num = (name) => {
        const a = new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i').exec(m[2]);
        return a ? a[1] : null;
      };
      if (tag === 'book' || tag === 'biblebook') {
        const id = num('number') || num('bnumber') || num('code') || num('bname') || num('name');
        book = id ? bookFromToken(id) : null;
        c = 0;
      } else if (tag === 'chapter') c = +(num('number') || num('cnumber') || 0);
      else open = { v: +(num('number') || num('vnumber') || 0), at: m.index + m[0].length };
    }
    return books;
  }

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    const data = JSON.parse(trimmed);
    if (Array.isArray(data)) {
      for (const r of data) add(bookFromToken(r.book ?? r.b), r.chapter ?? r.c, r.verse ?? r.v, r.text ?? r.t ?? '');
    } else {
      for (const [k, chapters] of Object.entries(data)) {
        const book = bookFromToken(k);
        if (!book || !Array.isArray(chapters)) continue;
        chapters.forEach((vs, ci) => (vs || []).forEach((t, vi) => t && add(book, ci + 1, vi + 1, t)));
      }
    }
    return books;
  }

  if (/^\\id\s/m.test(src)) {
    let book = null;
    let c = 0;
    let cur = null;
    const flush = () => {
      if (cur) add(book, c, cur.v, cleanUsfm(cur.text));
      cur = null;
    };
    for (const line of src.split(/\r?\n/)) {
      const id = /^\\id\s+(\S+)/.exec(line);
      if (id) {
        flush();
        book = bookByCode(id[1]);
        c = 0;
        continue;
      }
      const ch = /^\\c\s+(\d+)/.exec(line);
      if (ch) {
        flush();
        c = +ch[1];
        continue;
      }
      // Several \v can share a line.
      const parts = line.split(/(?=\\v\s+\d+)/);
      for (const p of parts) {
        const v = /^\\v\s+(\d+)\S*\s*(.*)$/.exec(p);
        if (v) {
          flush();
          cur = { v: +v[1], text: v[2] };
        } else if (cur && !/^\\(s\d?|ms\d?|mr|r|d|sp|h|toc\d|mt\d?|imt\d?|ip|is\d?|rem|cl|cp)\b/.test(p.trim())) {
          cur.text += ` ${p}`;
        }
      }
    }
    flush();
    return books;
  }

  for (const raw of src.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.includes('\t')) {
      const [b, c, v, ...rest] = line.split('\t');
      if (/^\d+$/.test(c) && /^\d+$/.test(v)) add(bookFromToken(b), c, v, rest.join(' '));
      continue;
    }
    const m = /^(.+?)\s+(\d+)[:.](\d+)\s+(.+)$/.exec(line);
    if (m) add(bookFromToken(m[1]), m[2], m[3], m[4]);
  }
  return books;
}

function decodeXml(t) {
  return t
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

function cleanUsfm(t) {
  return t
    .replace(/\\f\s.*?\\f\*/g, '')
    .replace(/\\x\s.*?\\x\*/g, '')
    .replace(/\\w\s+([^|\\]*)(\|[^\\]*)?\\w\*/g, '$1')
    .replace(/\\\+?[a-z]+\d?\*?/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ------------------------------------------------------------------ versions & loading

const LS_VERSIONS = 'ls-bible-versions';

export function importedVersions() {
  try {
    return JSON.parse(localStorage.getItem(LS_VERSIONS) || '[]');
  } catch {
    return [];
  }
}

/** The licensed Bibles added online on this laptop (Settings → Online Bibles), as versions. */
export function onlineVersions(config = onlineConfig()) {
  return (config.bibles || []).map((b) => ({
    id: `api:${b.id}`,
    bibleId: b.id,
    name: b.abbreviation && b.name && b.abbreviation !== b.name ? `${b.name} (${b.abbreviation})` : b.name || b.abbreviation,
    label: b.abbreviation || b.name,
    lang: b.lang === 'lg' ? 'lg' : 'en',
    notice: b.copyright || 'Licensed online through API.Bible; the text stays on this laptop.',
    online: true,
  }));
}

export function allVersions(config) {
  return [...BUILTIN_VERSIONS, ...importedVersions(), ...onlineVersions(config)];
}

export function versionById(id, config) {
  return allVersions(config).find((v) => v.id === id) || null;
}

/** Stores an imported version. Returns { id, books, verses }. */
export async function importVersion({ name, lang, label, text }) {
  const books = parseBibleText(text);
  if (!books.size) throw new Error('No verses found. Expected lines like "PSA 23:1 text" or a USFM / JSON file.');
  const id = `imp-${Date.now().toString(36)}`;
  let verses = 0;
  for (const [n, chapters] of books) {
    await idbSet('bible', `${id}/${n}`, chapters);
    verses += chapters.reduce((a, c) => a + c.filter(Boolean).length, 0);
  }
  const list = importedVersions().filter((v) => v.name !== name);
  list.push({ id, name, lang, label: label || name, notice: 'Imported on this device.', books: [...books.keys()] });
  localStorage.setItem(LS_VERSIONS, JSON.stringify(list));
  return { id, books: books.size, verses };
}

export function removeVersion(id) {
  const list = importedVersions().filter((v) => v.id !== id);
  localStorage.setItem(LS_VERSIONS, JSON.stringify(list));
}

const cache = new Map();

const idbStore = { get: (k) => idbGet('bible', k), set: (k, v) => idbSet('bible', k, v) };

/**
 * One chapter of a version: the verses as strings, verse 1 first (empty for a missing verse).
 * An online Bible's chapter is fetched the first time and kept on this laptop; the others come
 * from the version's book.
 */
export async function loadChapter(versionId, bookNumber, chapter, { base = './bibles', fetchImpl = globalThis.fetch, config = null, store = idbStore } = {}) {
  if (!isOnlineId(versionId)) {
    const book = await loadBook(versionId, bookNumber, { base, fetchImpl });
    return (book && book[chapter - 1]) || [];
  }
  const key = `${versionId}/${bookNumber}`;
  let chapters = cache.get(key);
  if (!chapters) {
    // A browser that blocks IndexedDB (a private window) still reads from the service.
    chapters = (await store.get(key).catch(() => null)) || [];
    cache.set(key, chapters);
  }
  if (Array.isArray(chapters[chapter - 1])) return chapters[chapter - 1];
  const c = config || onlineConfig();
  const bibleId = versionId.slice(4);
  const entry = (c.bibles || []).find((b) => b.id === bibleId);
  if (!c.key || !entry) throw new Error('This online Bible is no longer set up on this laptop (Settings → Online Bibles).');
  const bk = bookByNumber(bookNumber);
  const { verses, copyright } = await fetchChapter(c.key, bibleId, bk.code, chapter, fetchImpl);
  chapters[chapter - 1] = verses;
  await store.set(key, chapters).catch(() => {});
  // The publisher's copyright line, kept with the version the first time it is seen.
  if (copyright && !entry.copyright && !config) {
    entry.copyright = copyright;
    saveOnlineConfig(c);
  }
  return verses;
}

/** All chapters of one book in one version (null if the version doesn't have the book). */
export async function loadBook(versionId, bookNumber, { base = './bibles', fetchImpl = globalThis.fetch } = {}) {
  const key = `${versionId}/${bookNumber}`;
  if (cache.has(key)) return cache.get(key);
  let chapters = null;
  if (BUILTIN_VERSIONS.some((v) => v.id === versionId)) {
    const res = await fetchImpl(`${base}/${key}.json`);
    if (res.ok) chapters = await res.json();
    else if (res.status !== 404) throw new Error(`Could not load the Bible text (HTTP ${res.status}).`);
  } else {
    chapters = (await idbGet('bible', key)) || null;
  }
  cache.set(key, chapters);
  return chapters;
}

// ------------------------------------------------------------------ verse -> slides

// Sizes never shrink: a verse that does not fit is split, or continued on the next slide.
// A "fit" measures text for one language: width(text) in screen widths (1 = the full line),
// and the lines allowed. Without a browser font, lengths are counted in characters.
export const LINES = 3;
export const CHAR_FIT = {
  primary: { width: (t) => t.length / 34, lines: LINES },
  secondary: { width: (t) => t.length / 50, lines: LINES },
};

/** Lines `text` takes when wrapped at whole words (a word wider than the line still counts as one). */
export function wrapCount(text, width) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  if (!words.length) return 0;
  let lines = 1;
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (line && width(next) > 1) {
      lines += 1;
      line = w;
    } else line = next;
  }
  return lines;
}

/** The split budget scaled: k times the standard lines (Infinity: a verse is never split). */
export function scaleFit(fit, k) {
  if (!k || k === 1) return fit;
  const n = (lines) => (k === Infinity ? Infinity : Math.max(1, lines * k));
  return { primary: { width: fit.primary.width, lines: n(fit.primary.lines) }, secondary: { width: fit.secondary.width, lines: n(fit.secondary.lines) } };
}

const fitsBoth = (p, s, fit) =>
  wrapCount(p, fit.primary.width) <= fit.primary.lines && wrapCount(s, fit.secondary.width) <= fit.secondary.lines;

/**
 * Splits one verse into the fewest parts that each fit a slide, both languages split into the
 * same number of parts at natural pauses: [{ part, primary, secondary }] (part = '' | 'a' | 'b' …).
 */
export function splitVerse(primary, secondary, fit = CHAR_FIT) {
  const p = primary || '';
  const s = secondary || '';
  // Very big text may want a verse in many small parts; past 26 the parts run out of letters, so
  // the last try is kept as it is rather than giving the whole verse back.
  let last = null;
  for (let k = 1; k <= 26; k++) {
    const ps = p ? splitAtPauses(p, k) : [];
    const ss = s ? splitAtPauses(s, k) : [];
    const n = Math.max(ps.length, ss.length, 1);
    const ok = Array.from({ length: n }, (_, i) => fitsBoth(ps[i] || '', ss[i] || '', fit)).every(Boolean);
    last = Array.from({ length: n }, (_, i) => ({ part: n > 1 ? String.fromCharCode(97 + i) : '', primary: ps[i] || '', secondary: ss[i] || '' }));
    if (ok || n < k) return last;
  }
  return last || [{ part: '', primary: p, secondary: s }];
}

const wordCount = (t) => String(t || '').split(/\s+/).filter(Boolean).length;

/**
 * Splits one verse at natural pauses into the fewest parts of at most `n` words each (counted in
 * the language on top; the other follows the same number of parts).
 */
export function splitByWords(primary, secondary, n) {
  const p = primary || '';
  const s = secondary || '';
  const lead = p ? 'p' : 's';
  for (let k = 1; k <= 24; k++) {
    const ps = p ? splitAtPauses(p, k) : [];
    const ss = s ? splitAtPauses(s, k) : [];
    const m = Math.max(ps.length, ss.length, 1);
    const ok = (lead === 'p' ? ps : ss).every((t) => wordCount(t) <= n);
    if (ok || m < k) return Array.from({ length: m }, (_, i) => ({ part: m > 1 ? String.fromCharCode(97 + i) : '', primary: ps[i] || '', secondary: ss[i] || '' }));
  }
  return [{ part: '', primary: p, secondary: s }];
}

const joinSegs = (segs, key) =>
  segs
    .filter((g) => g[key])
    .map((g) => (g.part && g.part !== 'a' ? g[key] : `${g.verse} ${g[key]}`))
    .join(' ');

function slideOf(segs, book, chapter, { lg, en }) {
  const first = segs[0];
  const last = segs[segs.length - 1];
  const one = segs.length === 1;
  const range = first.verse === last.verse ? `${first.verse}` : `${first.verse}-${last.verse}`;
  return {
    verses: segs.map(({ verse, part, primary, secondary }) => ({ verse, part, primary, secondary })),
    ref: formatRef(book, chapter, range, { lg, en, part: one ? first.part : '' }),
    primary: joinSegs(segs, 'primary').replace(/^\d+ /, ''),
    secondary: joinSegs(segs, 'secondary').replace(/^\d+ /, ''),
  };
}

/**
 * Verses -> slides. `flow` packs as many whole verses (or verse parts) as fit on each slide and
 * continues at the same size until the passage ends; otherwise it is one verse per slide.
 * verses = [{ verse, primary, secondary }].
 */
export function paginate(verses, { book, chapter, fit = CHAR_FIT, flow = true, primaryLang = 'lg', secondaryLang = 'en', split = 1 }) {
  const lg = primaryLang === 'lg' || secondaryLang === 'lg';
  const en = primaryLang === 'en' || secondaryLang === 'en' || !lg;
  const langs = { lg, en };
  // `split` is how much a screen may hold before a verse is broken up (the screen shrinks or grows
  // the words to fit): a scale of the standard budget, 'never' (Infinity: every verse whole while
  // screens still share at the standard budget), { words: n } or { lines: n }.
  const words = split && typeof split === 'object' && split.words > 0 ? split.words : 0;
  const lines = split && typeof split === 'object' && split.lines > 0 ? split.lines : 0;
  const fitSplit = lines ? { primary: { width: fit.primary.width, lines }, secondary: { width: fit.secondary.width, lines } } : scaleFit(fit, words ? 1 : split);
  const fitFlow = split === Infinity ? fit : fitSplit;
  const parts = (v) => (words ? splitByWords(v.primary, v.secondary, words) : splitVerse(v.primary, v.secondary, fitSplit));
  const fitsOn = (segs) => (words ? wordCount(joinSegs(segs, 'primary') || joinSegs(segs, 'secondary')) <= words : fitsBoth(joinSegs(segs, 'primary'), joinSegs(segs, 'secondary'), fitFlow));
  const slides = [];
  let cur = [];
  for (const v of verses) {
    for (const part of parts(v)) {
      const seg = { verse: v.verse, ...part };
      if (flow && cur.length && fitsOn([...cur, seg])) {
        cur.push(seg);
        continue;
      }
      if (cur.length) slides.push(slideOf(cur, book, chapter, langs));
      cur = [seg];
    }
  }
  if (cur.length) slides.push(slideOf(cur, book, chapter, langs));
  return slides;
}

// "Many verses" screens: how much text a whole-passage screen may hold before it is split into
// several screens of about the same size (so the words stay big enough to read across the hall).
export const WHOLE_BUDGET = 1100;
export const PER_SCREEN = ['auto', 'verse', 'one', 'solo', 2, 3, 4, 6, 8, 'all', 'scroll'];
/**
 * Is this a "fill" choice (whole verses, never split, the text grown or shrunk to fill the screen)?
 * 'one' is one whole verse a screen; a number is that many; 'all' the whole passage.
 */
export const isMany = (perScreen) => perScreen === 'all' || perScreen === 'one' || perScreen === 'solo' || (Number(perScreen) >= 2 && Number(perScreen) <= 50);

/**
 * Verses -> screens of whole verses, never split: `perScreen` at a time, or 'all' (as many as fit
 * the budget, spread evenly: 14 verses that need two screens become 7 + 7).
 */
export function groupVerses(verses, perScreen, { book, chapter, primaryLang = 'lg', secondaryLang = 'en', budget = WHOLE_BUDGET, secondaryLabel = '' } = {}) {
  const lg = primaryLang === 'lg' || secondaryLang === 'lg';
  const en = primaryLang === 'en' || secondaryLang === 'en' || !lg;
  // One language at a time: each verse is two screens, the language on top alone and then the
  // other alone (shown as the main text, its version named in the reference), each as large as
  // the screen allows. A verse that has only one language is one screen.
  if (perScreen === 'solo') {
    const out = [];
    for (const v of verses) {
      const seg = { verse: v.verse, part: '', primary: v.primary || '', secondary: '' };
      if (v.primary) out.push(slideOf([seg], book, chapter, { lg, en }));
      if (v.secondary) {
        const other = slideOf([{ ...seg, primary: v.secondary }], book, chapter, { lg, en });
        out.push({ ...other, ref: secondaryLabel ? `${other.ref} · ${secondaryLabel}` : other.ref, solo: 's' });
      }
    }
    return out;
  }
  // Screen sizes: perScreen each, or (whole passage) as few screens as the budget allows, evenly.
  let sizes;
  if (perScreen === 'all') {
    const total = verses.reduce((n, v) => n + (v.primary || '').length + (v.secondary || '').length, 0);
    const screens = Math.min(verses.length, Math.max(1, Math.ceil(total / budget)));
    sizes = Array.from({ length: screens }, (_, i) => Math.floor(verses.length / screens) + (i < verses.length % screens ? 1 : 0));
  } else {
    const n = perScreen === 'one' ? 1 : Math.max(1, Math.floor(Number(perScreen)) || 1);
    sizes = Array.from({ length: Math.ceil(verses.length / n) }, () => n);
  }
  const slides = [];
  let i = 0;
  for (const size of sizes) {
    const segs = verses.slice(i, i + size).map((v) => ({ verse: v.verse, part: '', primary: v.primary || '', secondary: v.secondary || '' }));
    i += size;
    if (segs.length) slides.push(slideOf(segs, book, chapter, { lg, en }));
  }
  return slides;
}

/**
 * Builds the scripture item sent to the screen for a passage. perScreen: 'auto' (flow at the fixed
 * size), 'verse' (one verse per slide at the fixed size), a number of verses or 'all' ("many verses":
 * whole verses together, the text as large as the screen allows).
 */
/** The split key as paginate takes it: a scale, Infinity, { words } or { lines }. */
export function splitArg(key) {
  const k = validSplit(key);
  if (SPLIT_SCALE[k] != null) return SPLIT_SCALE[k];
  const { mode, n } = parseSplit(k);
  return mode === 'words' ? { words: n } : { lines: n };
}

export async function passageItem({ ref, primaryId, secondaryId, flow = true, perScreen = 'auto', fit = CHAR_FIT, split = 'standard', base, fetchImpl, config, store }) {
  const { book, chapter } = ref;
  const pv = versionById(primaryId, config);
  const sv = secondaryId ? versionById(secondaryId, config) : null;
  const opts = { base, fetchImpl, config };
  if (store) opts.store = store;
  const [pCh, sCh] = await Promise.all([
    pv ? loadChapter(pv.id, book.n, chapter, opts) : [],
    sv ? loadChapter(sv.id, book.n, chapter, opts) : [],
  ]);
  const count = Math.max(pCh.length, sCh.length);
  if (!count) throw new Error(`${book.lg} ${chapter} / ${book.en} ${chapter} isn't in the chosen Bible versions.`);
  const from = Math.min(ref.from || 1, count);
  const to = Math.min(ref.to || count, count);
  const verses = [];
  for (let v = from; v <= to; v++) verses.push({ verse: v, primary: pCh[v - 1] || '', secondary: sCh[v - 1] || '' });
  const many = isMany(perScreen);
  // Scroll: the whole passage as one long column that glides from verse to verse.
  const scroll = perScreen === 'scroll';
  if (perScreen === 'verse') flow = false;
  const langs = { primaryLang: pv ? pv.lang : 'lg', secondaryLang: sv ? sv.lang : '', secondaryLabel: sv ? sv.label : '' };
  const slides = scroll
    ? groupVerses(verses, verses.length, { book, chapter, ...langs })
    : many
      ? groupVerses(verses, perScreen, { book, chapter, ...langs })
      : paginate(verses, { book, chapter, fit, flow, split: splitArg(split), ...langs });
  const range = from === to ? `${from}` : `${from}-${to}`;
  const splitKey = validSplit(split);
  return {
    kind: 'scripture',
    id: `${book.code}.${chapter}.${range}.${primaryId}.${secondaryId || ''}.${scroll ? 'scroll' : many ? `m${perScreen}` : flow ? 'f' : 'v'}${!many && !scroll && splitKey !== 'standard' ? `-${splitKey}` : ''}`,
    split: splitKey,
    many,
    scroll,
    perScreen: scroll ? 'scroll' : many ? perScreen : flow ? 'auto' : 'verse',
    title: formatRef(book, chapter, range),
    // Enough to show a title card and to lay the passage out again for another look.
    book: { lg: book.lg, en: book.en, code: book.code },
    chapter,
    v1: from,
    v2: to,
    primaryId,
    secondaryId: secondaryId || '',
    flow,
    versions: [pv && pv.label, sv && sv.label].filter(Boolean),
    secondaryLabel: sv ? sv.label : '',
    slides,
  };
}
