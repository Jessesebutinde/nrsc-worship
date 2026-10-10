// Spelling suggestions for Luganda and English lyrics, from word lists built out of
// the Bible text and the song library. No external service.

/** Lowercase words (apostrophes split elisions: "ly’omuddo" -> "ly", "omuddo"). */
export function wordsOf(text) {
  return (String(text || '').normalize('NFC').toLowerCase().match(/\p{L}+/gu) || []).filter((w) => w.length > 1);
}

/** Bounded Levenshtein distance (returns max + 1 once it is certainly larger than max). */
export function distance(a, b, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

export class Dictionary {
  /** `lists` are arrays of words, most frequent first. */
  constructor(...lists) {
    this.rank = new Map();
    this.byLen = new Map();
    for (const list of lists) for (const w of list) this.add(w);
  }

  add(word) {
    const w = String(word).toLowerCase();
    if (!w || this.rank.has(w)) return;
    this.rank.set(w, this.rank.size);
    if (!this.byLen.has(w.length)) this.byLen.set(w.length, []);
    this.byLen.get(w.length).push(w);
  }

  addText(text) {
    for (const w of wordsOf(text)) this.add(w);
  }

  has(word) {
    return this.rank.has(String(word).toLowerCase());
  }

  get size() {
    return this.rank.size;
  }

  /** Closest known words: smallest edit distance first, then most common. */
  suggest(word, limit = 3) {
    const w = String(word).toLowerCase();
    const max = w.length <= 4 ? 1 : 2;
    const hits = [];
    for (let len = w.length - max; len <= w.length + max; len++) {
      for (const cand of this.byLen.get(len) || []) {
        const d = distance(w, cand, max);
        if (d <= max) hits.push([d, this.rank.get(cand), cand]);
      }
    }
    hits.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    return hits.slice(0, limit).map((h) => h[2]);
  }
}

/**
 * Unknown words in lyrics text with suggestions: [{ word, start, end, suggestions }].
 * Section labels like [Chorus] and words with digits are skipped. Positions index the original text.
 */
export function checkText(text, dict, { limit = 3 } = {}) {
  if (!dict || !dict.size) return [];
  const out = [];
  const src = String(text || '');
  const re = /\p{L}+/gu;
  let m;
  const labelSpans = [...src.matchAll(/^\s*\[[^\]\n]*\]\s*$/gmu)].map((x) => [x.index, x.index + x[0].length]);
  while ((m = re.exec(src))) {
    const word = m[0];
    if (word.length < 3) continue;
    const start = m.index;
    if (labelSpans.some(([a, b]) => start >= a && start < b)) continue;
    if (dict.has(word)) continue;
    out.push({ word, start, end: start + word.length, suggestions: dict.suggest(word, limit) });
  }
  return out;
}

/** Replaces one flagged word, keeping its capitalisation. */
export function applyFix(text, flag, replacement) {
  let r = replacement;
  if (flag.word[0] === flag.word[0].toUpperCase()) r = r[0].toUpperCase() + r.slice(1);
  if (flag.word === flag.word.toUpperCase() && flag.word.length > 1) r = r.toUpperCase();
  return text.slice(0, flag.start) + r + text.slice(flag.end);
}
