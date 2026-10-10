// Finding a verse from a few words of it ("the Lord is my shepherd", "Mukama ye musumba"):
// a small full-text index over the Bible versions, ranked like a search engine (BM25), with a
// bonus for words in the same order. Old and modern English are folded together (thee / you,
// leadeth / leads), Luganda ŋ and ng' are the same. No external service.

const ARCHAIC = {
  thee: 'you', thou: 'you', ye: 'you', thy: 'your', thine: 'your', hath: 'has', hast: 'has', doth: 'does',
  dost: 'does', art: 'are', saith: 'says', shalt: 'shall', wilt: 'will', canst: 'can', didst: 'did',
  unto: 'to', spake: 'spoke', yea: 'yes', nay: 'no',
};

/** The search form of a word: lower case, no accents; English loses its endings (leadeth, leads -> lead). */
export function stem(word, lang = 'en') {
  let w = String(word).toLowerCase();
  if (lang !== 'en') return w;
  w = ARCHAIC[w] || w;
  if (w.length > 4) w = w.replace(/(eth|est|ing|ed|es|s)$/, '');
  if (w.length > 3) w = w.replace(/e$/, '');
  return w;
}

/** The words of a text as search terms. */
export function terms(text, lang = 'en') {
  return (
    String(text || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/ŋ/g, 'ng')
      .match(/[a-z]+/g) || []
  )
    .filter((w) => w.length > 1 || lang !== 'en')
    .map((w) => stem(w, lang));
}

const K1 = 1.2;
const B = 0.6;

/** An index over one Bible version; books are added as they arrive. */
export class VerseIndex {
  constructor(lang = 'en') {
    this.lang = lang;
    this.docs = []; // [book, chapter, verse, text, terms]
    this.post = new Map(); // term -> [doc, tf, doc, tf, ...]
    this.books = new Set();
    this.totalLen = 0;
  }

  /** chapters = [[verse text, ...], ...] for book number `book`. */
  addBook(book, chapters) {
    if (this.books.has(book) || !chapters) return;
    this.books.add(book);
    chapters.forEach((verses, c) =>
      (verses || []).forEach((text, v) => {
        if (!text) return;
        const ts = terms(text, this.lang);
        const id = this.docs.length;
        this.docs.push([book, c + 1, v + 1, text, ts]);
        this.totalLen += ts.length;
        const tf = new Map();
        for (const t of ts) tf.set(t, (tf.get(t) || 0) + 1);
        for (const [t, n] of tf) {
          let p = this.post.get(t);
          if (!p) this.post.set(t, (p = []));
          p.push(id, n);
        }
      }),
    );
  }

  get size() {
    return this.docs.length;
  }

  /**
   * The query's distinctive words (in under 1 in 12 verses), for marking matches; with `partial` the
   * unfinished last word is a prefix ("shep*").
   */
  keyTerms(query, partial = false) {
    const q = terms(query, this.lang);
    const n = this.docs.length || 1;
    const last = partial && q.length && !this.post.has(q[q.length - 1]) ? `${q.pop()}*` : null;
    const rare = q.filter((t) => (this.post.get(t) || []).length / 2 <= n / 12);
    const out = rare.length || last ? rare : q;
    return last ? [...out, last] : out;
  }

  /** Terms in the index starting with `prefix` (for the word still being typed), most common first. */
  expand(prefix, limit = 12) {
    const out = [];
    for (const [t, p] of this.post) if (t.length > prefix.length && t.startsWith(prefix)) out.push([p.length, t]);
    return out.sort((a, b) => b[0] - a[0]).slice(0, limit).map((x) => x[1]);
  }

  /**
   * Verses for a query: [{ book, chapter, verse, text, score, hits }] best first. `partial`: the last
   * word may be unfinished (typing), so it also matches words that start with it.
   */
  search(query, { limit = 8, partial = false } = {}) {
    const q = terms(query, this.lang);
    if (!q.length || !this.docs.length) return [];
    const n = this.docs.length;
    const avg = this.totalLen / n || 1;
    const scores = new Map();
    const groups = q.map((t, i) => (partial && i === q.length - 1 && !this.post.has(t) ? this.expand(t) : [t]));
    // Words in more than a fifth of all verses ("the", "and", "of") only help order the results,
    // unless the query has nothing else.
    const df = (g) => g.reduce((m, t) => Math.max(m, (this.post.get(t) || []).length / 2), 0);
    const rare = groups.filter((g) => df(g) <= n / 5);
    (rare.length ? rare : groups).forEach((group) => {
      const seen = new Map();
      for (const t of group) {
        const p = this.post.get(t);
        if (!p) continue;
        const idf = Math.log(1 + (n - p.length / 2 + 0.5) / (p.length / 2 + 0.5));
        for (let i = 0; i < p.length; i += 2) {
          const d = p[i];
          const tf = p[i + 1];
          const len = this.docs[d][4].length;
          const s = (idf * tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * len) / avg));
          seen.set(d, Math.max(seen.get(d) || 0, s));
        }
      }
      for (const [d, s] of seen) {
        const cur = scores.get(d) || [0, 0];
        scores.set(d, [cur[0] + s, cur[1] + 1]);
      }
    });
    // Verses with more of the words first, then by score; the best few get a bonus for word order.
    const ranked = [...scores].sort((a, b) => b[1][1] - a[1][1] || b[1][0] - a[1][0]).slice(0, 60);
    const qset = q.join(' ');
    const out = ranked.map(([d, [s, hits]]) => {
      const ts = this.docs[d][4];
      let run = 0;
      for (let i = 0; i < ts.length; i++) {
        let k = 0;
        while (k < q.length && i + k < ts.length && ts[i + k] === q[k]) k++;
        if (k > run) run = k;
        // Also a run starting part-way into the query ("my shepherd" inside a longer query).
        for (let j = 1; j < q.length && run < q.length - j; j++) {
          let m = 0;
          while (j + m < q.length && i + m < ts.length && ts[i + m] === q[j + m]) m++;
          if (m > run) run = m;
        }
      }
      const order = run > 1 ? run * 1.5 : 0;
      const coverage = hits / (rare.length || q.length);
      return { d, score: s * (0.5 + coverage) + order + (ts.join(' ').includes(qset) ? 4 : 0), hits };
    });
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, limit).map(({ d, score, hits }) => {
      const [book, chapter, verse, text] = this.docs[d];
      return { book, chapter, verse, text, score, hits, of: rare.length || q.length };
    });
  }
}

/**
 * Splits `text` into [plain, matched, plain, …] pieces for showing which words matched. `query` is
 * the words searched for, or a list of search terms (VerseIndex.keyTerms).
 */
export function highlight(text, query, lang = 'en') {
  const list = Array.isArray(query) ? query : terms(query, lang);
  const want = new Set(list.filter((t) => !t.endsWith('*')));
  const prefixes = list.filter((t) => t.endsWith('*')).map((t) => t.slice(0, -1));
  const out = [];
  let last = 0;
  for (const m of String(text).matchAll(/[\p{L}]+/gu)) {
    const t = terms(m[0], lang)[0];
    if (t && (want.has(t) || prefixes.some((p) => t.startsWith(p)))) {
      out.push(text.slice(last, m.index), m[0]);
      last = m.index + m[0].length;
    }
  }
  out.push(text.slice(last));
  return out;
}

/**
 * Fills `index` with a Bible version, book by book in BOOK_ORDER, calling onBook(count) after each.
 * `load(bookNumber)` returns the book's chapters (bible.js loadBook).
 */
export async function fillIndex(index, load, onBook = () => {}) {
  let count = 0;
  for (const n of BOOK_ORDER) {
    try {
      index.addBook(n, await load(n));
    } catch {
      /* a missing book is skipped */
    }
    onBook(++count);
    // Let the page breathe between books.
    await new Promise((r) => setTimeout(r, 0));
  }
}

// The order books are fetched in: the most read first, so suggestions start useful at once.
export const BOOK_ORDER = [
  19, 43, 40, 45, 1, 20, 23, 42, 41, 44, 46, 49, 50, 58, 59, 62, 66, 47, 48, 51, 52, 53, 54, 55, 56, 57, 60, 61, 63, 64, 65,
  2, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 21, 22, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39,
  3, 4,
];
