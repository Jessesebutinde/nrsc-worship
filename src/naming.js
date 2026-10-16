// Song names: display fallbacks, file names, setlist parsing, suggestions
// and the personal song library. Pure functions only.

const SMALL = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with']);

/** Generic backend labels like "Song 1" are placeholders, not names. */
export function isGenericLabel(label) {
  return !label || /^\s*(song|track|part|music|worship|segment|clip)\s*#?\s*\d*\s*$/i.test(label);
}

export function displayName(song, index) {
  const n = (song.name || '').trim();
  return n || `Song ${index + 1}`;
}

/** Folds case, accents and punctuation so "Way-maker" ~ "way maker". */
export function normalizeTitle(s) {
  return String(s || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function sanitizeFilename(s) {
  return String(s || '')
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 90)
    .trim();
}

export function pad2(n) {
  return String(n).padStart(2, '0');
}

/** "03 - Way Maker" (no extension). */
export function songFileBase(index, title) {
  return sanitizeFilename(`${pad2(index + 1)} - ${title}`) || `${pad2(index + 1)} - Song ${index + 1}`;
}

export function smartTitleCase(s) {
  const t = s.trim();
  const letters = t.replace(/[^\p{L}]/gu, '');
  if (!letters) return t;
  const allLower = letters === letters.toLowerCase();
  const allUpper = letters === letters.toUpperCase() && letters.length > 3;
  if (!allLower && !allUpper) return t;
  return t
    .toLowerCase()
    .split(/(\s+)/)
    .map((w, i, arr) => {
      if (/^\s+$/.test(w)) return w;
      const first = i === 0;
      const last = i === arr.length - 1;
      if (!first && !last && SMALL.has(w)) return w;
      if (w === 'i' || /^i'/.test(w)) return 'I' + w.slice(1);
      return w.replace(/^([^\p{L}]*)(\p{L})/u, (_, p, c) => p + c.toUpperCase());
    })
    .join('');
}

// ---------------------------------------------------------------- setlists

const HEADER = /^(set\s*-?\s*list|songs?|worship( set| songs| team)?|praise( and| &) worship|today'?s? (songs|set(list)?)|sunday( service)?|service|order of service|ministration|praise|worship)\s*:?\s*$/i;
const CHAT_PREFIX = /^\[?\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4},?\s+\d{1,2}:\d{2}(:\d{2})?\s*([ap]\.?m\.?)?\]?\s*(-\s*)?[^:]{1,40}:\s*/i;
const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}]/gu;

/**
 * Turns a pasted setlist (from WhatsApp, Slack, an email...) into titles.
 * dropArtist: remove " - Artist" / " by Artist" endings.
 */
export function parseSetlist(text, { dropArtist = true } = {}) {
  const out = [];
  for (let line of String(text || '').split(/\r?\n/)) {
    line = line.replace(CHAT_PREFIX, '');
    line = line.replace(EMOJI, ' ');
    line = line.replace(/^\s*(\(?\d{1,2}[.):\]]|\d{1,2}\s*-\s+|[-–—*•·●▪►>~+]+|#\d+)\s*/, '');
    line = line.replace(/\s+/g, ' ').trim();
    if (!line || HEADER.test(line) || /\b(set\s*-?\s*list|song\s*list|order of service)\b/i.test(line)) continue;
    if (/^(https?:\/\/|www\.)/i.test(line)) continue;
    const raw = line;
    // Keys, tempos and times: "(Key of G)", "[Bb]", "- key: E", "120bpm", "3:45".
    line = line.replace(/[([]\s*(key\s*(of|:|-)?\s*)?[A-G](#|b|♯|♭)?\s*(m|min|minor|maj|major)?\s*[)\]]/gi, ' ');
    line = line.replace(/[([][^)\]]*\b(key|bpm|tempo|capo)\b[^)\]]*[)\]]/gi, ' ');
    line = line.replace(/\s*[-–—|,]?\s*\bkey\s*(of|:|-|=)?\s*[A-G](#|b|♯|♭)?\s*(m|min|minor|maj|major)?\b.*$/i, '');
    line = line.replace(/\s*[-–—|,]?\s*\b(in|key)\s+[A-G](#|b|♯|♭)?\s*(m|min|minor|maj|major)?\s*$/, '');
    line = line.replace(/\s*\b\d{2,3}\s*bpm\b/gi, ' ');
    line = line.replace(/\s*[-–—|]?\s*\(?\d{1,2}:\d{2}\)?\s*$/, '');
    if (dropArtist) {
      line = line.replace(/\s+(-|–|—|\||by)\s+.+$/i, '');
      line = line.replace(/\s*\((by|feat\.?|ft\.?)\s[^)]*\)\s*$/i, '');
    }
    line = line.replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').replace(/\s+/g, ' ').trim();
    line = line.replace(/[.,;:\-–—]+$/, '').trim();
    if (!line || HEADER.test(line) || !/[\p{L}\p{N}]/u.test(line)) continue;
    out.push({ raw, title: smartTitleCase(line) });
  }
  return out;
}

// ----------------------------------------------------------------- library

export function emptyLibrary() {
  return { v: 1, items: {} };
}

/** Records that `useKey` (job:song) is named `title`; removes its old name. */
export function libraryRecord(lib, useKey, title, info = {}, now = Date.now()) {
  const items = { ...lib.items };
  for (const [k, item] of Object.entries(items)) {
    if (item.uses && item.uses[useKey]) {
      const uses = { ...item.uses };
      delete uses[useKey];
      items[k] = { ...item, uses };
    }
  }
  const t = (title || '').trim();
  const key = normalizeTitle(t);
  if (key) {
    const prev = items[key] || { title: t, uses: {}, added: now };
    items[key] = {
      ...prev,
      title: prev.title || t,
      hidden: false,
      uses: { ...prev.uses, [useKey]: { bpm: info.bpm ?? null, key: info.key ?? null, at: now } },
    };
  }
  return { ...lib, items };
}

export function libraryAdd(lib, title, now = Date.now()) {
  const t = title.trim();
  const key = normalizeTitle(t);
  if (!key) return lib;
  const prev = lib.items[key];
  return {
    ...lib,
    items: { ...lib.items, [key]: { uses: {}, added: now, ...prev, title: prev?.title || t, hidden: false } },
  };
}

export function libraryRename(lib, oldKey, title) {
  const item = lib.items[oldKey];
  const key = normalizeTitle(title);
  if (!item || !key) return lib;
  const items = { ...lib.items };
  delete items[oldKey];
  const into = items[key];
  items[key] = into
    ? { ...into, title: title.trim(), uses: { ...into.uses, ...item.uses } }
    : { ...item, title: title.trim() };
  return { ...lib, items };
}

export function libraryHide(lib, key) {
  const item = lib.items[key];
  if (!item) return lib;
  return { ...lib, items: { ...lib.items, [key]: { ...item, hidden: true } } };
}

export function libraryList(lib) {
  return Object.entries(lib.items || {})
    .filter(([, i]) => !i.hidden)
    .map(([key, i]) => {
      const uses = Object.values(i.uses || {});
      return {
        key,
        title: i.title,
        count: uses.length,
        last: uses.reduce((m, u) => Math.max(m, u.at || 0), i.added || 0),
        bpms: uses.map((u) => u.bpm).filter((b) => b > 0),
        keys: uses.map((u) => u.key).filter(Boolean),
      };
    })
    .sort((a, b) => b.count - a.count || b.last - a.last || a.title.localeCompare(b.title));
}

export function mergeLibraries(a, b) {
  const items = { ...a.items };
  for (const [k, item] of Object.entries(b.items || {})) {
    const prev = items[k];
    items[k] = prev ? { ...prev, uses: { ...prev.uses, ...item.uses }, hidden: prev.hidden && item.hidden } : item;
  }
  return { v: 1, items };
}

// ------------------------------------------------------------- suggestions

function tempoClose(a, b) {
  if (!a || !b) return false;
  for (const m of [1, 2, 0.5]) if (Math.abs(a * m - b) / b < 0.04) return true;
  return false;
}

function matchScore(title, typed) {
  const t = normalizeTitle(title);
  const q = normalizeTitle(typed);
  if (!q) return 1;
  if (t === q) return 5;
  if (t.startsWith(q)) return 4;
  if (t.split(' ').some((w) => w.startsWith(q))) return 3;
  if (t.includes(q)) return 2;
  // Initials: "wm" -> "Way Maker"
  const initials = t
    .split(' ')
    .map((w) => w[0])
    .join('');
  if (q.length >= 2 && !q.includes(' ') && initials.startsWith(q)) return 2;
  // Letters in order: "gdnss" -> "Goodness"
  let i = 0;
  for (const ch of t) if (ch === q[i]) i++;
  if (i === q.length && q.length >= 3) return 1;
  return 0;
}

/**
 * Name suggestions for one song. Nothing here is ever applied
 * automatically: the UI shows these as chips the user can tap.
 *
 * sources: backend label (if it is a real name), the pasted setlist,
 * and the personal library ranked by use, recency and (only as a hint)
 * tempo/key seen when you named songs before.
 */
export function suggestNames({ song, typed = '', library, setlist = [], taken = [], limit = 6, now = Date.now() }) {
  const out = [];
  const seen = new Set();
  const takenSet = new Set(taken.map(normalizeTitle));
  const current = normalizeTitle(song.name);
  const push = (title, reason, source, score) => {
    const k = normalizeTitle(title);
    if (!k || seen.has(k) || k === current) return;
    seen.add(k);
    out.push({ title, reason, source, score, taken: takenSet.has(k) });
  };

  if (song.backendLabel && !isGenericLabel(song.backendLabel)) {
    const m = matchScore(song.backendLabel, typed);
    if (m) push(song.backendLabel, 'from the job', 'backend', 100 + m);
  }
  for (const line of setlist) {
    if (takenSet.has(normalizeTitle(line.title))) continue;
    const m = matchScore(line.title, typed);
    if (m) push(line.title, 'pasted setlist', 'setlist', 50 + m * 2);
  }
  if (library) {
    for (const item of libraryList(library)) {
      const m = matchScore(item.title, typed);
      if (!m) continue;
      let score = m * 3 + Math.log2(1 + item.count);
      const days = (now - item.last) / 86400000;
      score += Math.max(0, 1 - days / 120);
      const reasons = [];
      if (item.count) reasons.push(`used ${item.count}×`);
      if (song.bpm && item.bpms.some((b) => tempoClose(b, song.bpm))) {
        score += 1.5;
        reasons.push('similar tempo');
      }
      if (song.key && item.keys.includes(song.key)) {
        score += 1;
        reasons.push('same key');
      }
      push(item.title, reasons.join(' · ') || 'in your library', 'library', score);
    }
  }
  // Untaken names first; names already used in this service last.
  out.sort((a, b) => (a.taken - b.taken) || b.score - a.score);
  return out.slice(0, limit);
}
