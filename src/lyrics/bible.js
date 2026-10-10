// Bible text: importing files, loading chapters, and turning verses into slides.
//
// A version's text is stored per book as chapters of verses: chapters[c - 1][v - 1] = text.
// Built-in versions are static JSON next to the page (lyrics/bibles/<id>/<book>.json);
// imported ones live in IndexedDB on the device that imported them.

import { bookByCode, bookByNumber, findBook, formatRef } from './books.js';
import { idbGet, idbSet } from './idb.js';
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

export function allVersions() {
  return [...BUILTIN_VERSIONS, ...importedVersions()];
}

export function versionById(id) {
  return allVersions().find((v) => v.id === id) || null;
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

const fitsBoth = (p, s, fit) =>
  wrapCount(p, fit.primary.width) <= fit.primary.lines && wrapCount(s, fit.secondary.width) <= fit.secondary.lines;

/**
 * Splits one verse into the fewest parts that each fit a slide, both languages split into the
 * same number of parts at natural pauses: [{ part, primary, secondary }] (part = '' | 'a' | 'b' …).
 */
export function splitVerse(primary, secondary, fit = CHAR_FIT) {
  const p = primary || '';
  const s = secondary || '';
  for (let k = 1; k <= 12; k++) {
    const ps = p ? splitAtPauses(p, k) : [];
    const ss = s ? splitAtPauses(s, k) : [];
    const n = Math.max(ps.length, ss.length, 1);
    const ok = Array.from({ length: n }, (_, i) => fitsBoth(ps[i] || '', ss[i] || '', fit)).every(Boolean);
    if (ok || n < k)
      return Array.from({ length: n }, (_, i) => ({ part: n > 1 ? String.fromCharCode(97 + i) : '', primary: ps[i] || '', secondary: ss[i] || '' }));
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
export function paginate(verses, { book, chapter, fit = CHAR_FIT, flow = true, primaryLang = 'lg', secondaryLang = 'en' }) {
  const lg = primaryLang === 'lg' || secondaryLang === 'lg';
  const en = primaryLang === 'en' || secondaryLang === 'en' || !lg;
  const langs = { lg, en };
  const slides = [];
  let cur = [];
  for (const v of verses) {
    for (const part of splitVerse(v.primary, v.secondary, fit)) {
      const seg = { verse: v.verse, ...part };
      if (flow && cur.length && fitsBoth(joinSegs([...cur, seg], 'primary'), joinSegs([...cur, seg], 'secondary'), fit)) {
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

/** Builds the scripture item sent to the screen for a passage. */
export async function passageItem({ ref, primaryId, secondaryId, flow = true, fit = CHAR_FIT, base, fetchImpl }) {
  const { book, chapter } = ref;
  const pv = versionById(primaryId);
  const sv = secondaryId ? versionById(secondaryId) : null;
  const [pBook, sBook] = await Promise.all([
    pv ? loadBook(pv.id, book.n, { base, fetchImpl }) : null,
    sv ? loadBook(sv.id, book.n, { base, fetchImpl }) : null,
  ]);
  const pCh = (pBook && pBook[chapter - 1]) || [];
  const sCh = (sBook && sBook[chapter - 1]) || [];
  const count = Math.max(pCh.length, sCh.length);
  if (!count) throw new Error(`${book.lg} ${chapter} / ${book.en} ${chapter} isn't in the chosen Bible versions.`);
  const from = Math.min(ref.from || 1, count);
  const to = Math.min(ref.to || count, count);
  const verses = [];
  for (let v = from; v <= to; v++) verses.push({ verse: v, primary: pCh[v - 1] || '', secondary: sCh[v - 1] || '' });
  const slides = paginate(verses, {
    book,
    chapter,
    fit,
    flow,
    primaryLang: pv ? pv.lang : 'lg',
    secondaryLang: sv ? sv.lang : '',
  });
  const range = from === to ? `${from}` : `${from}-${to}`;
  return {
    kind: 'scripture',
    id: `${book.code}.${chapter}.${range}.${primaryId}.${secondaryId || ''}.${flow ? 'f' : 'v'}`,
    title: formatRef(book, chapter, range),
    versions: [pv && pv.label, sv && sv.label].filter(Boolean),
    secondaryLabel: sv ? sv.label : '',
    slides,
  };
}
