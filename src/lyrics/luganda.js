// Proofreading for song lyrics in Luganda (and English): small suggestions for elision,
// spelling, punctuation and capitals on sacred names. Pure functions, no DOM.
//
// Precision first: a wrong tag on a correct Luganda word is worse than a missed mistake, so
// every rule stays quiet unless the word lists back it (the Luganda 1968 Bible and the KJV;
// words from the user's other songs count as right). The Bible evidence behind each rule, and
// the false-positive checks on real verses, are in tests/luganda.test.mjs.
//
// checkLyrics(text, dict, opts) -> [{ start, end, word, fix, kind, why, label, key, at? }]
//   start/end index the original text; `word` is the text there now and `fix` replaces it.
//   kind: 'spelling' | 'grammar' | 'punctuation' | 'capital'. `label` is what the tag shows,
//   `why` a one-line reason, `key` what "It's right" remembers, `at` the word the tag hangs
//   under when it is not the first one (omwana in "na omwana").

export const KINDS = ['spelling', 'grammar', 'punctuation', 'capital'];
/** Kinds that "Fix all" applies without asking: they never change what a word means. */
export const SAFE_KINDS = ['grammar', 'punctuation', 'capital'];

const APOS = "'’ʼ";
const LETTERS = '\\p{L}\\p{M}\\p{N}';
const TOKEN = new RegExp(`[${LETTERS}]+(?:[${APOS}][${LETTERS}]+)*`, 'gu');
const LABEL_LINE = /^\s*\[[^\]\n]*\]\s*$/;
const isVowel = (c) => 'aeiou'.includes(String(c || '').toLowerCase());
const lower = (s) => String(s).toLowerCase();
const isUpper = (c) => c !== c.toLowerCase() && c === c.toUpperCase();
const capital = (w) => w.charAt(0).toUpperCase() + w.slice(1);

/** Copies the case of `like` onto `word` (first letter, or every letter for ALL CAPS). */
function withCase(word, like) {
  if (like.length > 1 && like === like.toUpperCase() && like !== like.toLowerCase()) return word.toUpperCase();
  return isUpper(like.charAt(0)) ? capital(word) : word;
}

// ------------------------------------------------------------------ word lists

const inList = (dict, name, w) => !!dict && dict.rankIn && dict.rankIn(name, w) >= 0;
/** Luganda list membership; a dictionary built without named lists counts as all-Luganda. */
const inLg = (dict, w) => (dict && dict.lists && dict.lists.lg ? inList(dict, 'lg', w) : !!dict && dict.has(w));
const inEn = (dict, w) => inList(dict, 'en', w);
const known = (dict, w) => !!dict && dict.has(w);

// Letter pairs that occur in at least 20 Luganda words. A word made only of these, ending in a
// vowel, "looks Luganda": 99% of the Luganda list does, 2% of the English-only KJV words do.
const shapes = new WeakMap();
function lugandaPairs(dict) {
  const list = dict && dict.lists && dict.lists.lg;
  if (!list) return null;
  if (!shapes.has(list)) {
    // Counted in typed arrays (50,000 words, once per page): letters get small numbers, ^ and $
    // mark the ends, and last[p] is the last word that counted pair p, so each word counts it once.
    const K = 64;
    const code = new Map([['^', 0], ['$', 1]]);
    const num = (ch) => {
      if (!code.has(ch)) code.set(ch, Math.min(code.size, K - 1));
      return code.get(ch);
    };
    const count = new Int32Array(K * K);
    const last = new Int32Array(K * K);
    let n = 0;
    for (const w of list.keys()) {
      n++;
      let prev = 0;
      for (let i = 0; i <= w.length; i++) {
        const c = i === w.length ? 1 : num(w[i]);
        const p = prev * K + c;
        if (last[p] !== n) {
          last[p] = n;
          count[p]++;
        }
        prev = c;
      }
    }
    const chars = [...code.keys()];
    const pairs = new Set();
    for (let a = 0; a < chars.length; a++) {
      for (let b = 0; b < chars.length; b++) if (count[a * K + b] >= 20) pairs.add(chars[a] + chars[b]);
    }
    shapes.set(list, pairs);
  }
  return shapes.get(list);
}

export function looksLuganda(word, dict) {
  const w = lower(word);
  if (!/[aeiou]$/.test(w) || /[^a-zŋ]/.test(w)) return false;
  const pairs = lugandaPairs(dict);
  if (!pairs) return !/[chqx]/.test(w);
  const s = `^${w}$`;
  for (let i = 0; i < s.length - 1; i++) if (!pairs.has(s.slice(i, i + 2))) return false;
  return true;
}

// ------------------------------------------------------------------ tokens and lines

/** The prefixes an apostrophe joins to the next word (n'omwana, olw'ekisa), as the Bible writes them. */
const PREFIXES = new Set(
  'n ng ky by ly gy y z w k b g lw kw gw bw tw mw olw eby eky ey ab ogw ez ow ery ag obw egy okw ak aw otw omw ek eg og ew abw iw'.split(
    ' ',
  ),
);

function linesOf(src) {
  const out = [];
  let pos = 0;
  for (const text of src.split('\n')) {
    out.push({ text, start: pos, label: LABEL_LINE.test(text) });
    pos += text.length + 1;
  }
  return out;
}

/** Words on a line: { text, start, end, parts, main } with absolute positions. `main` is the word an
 *  elision prefix leads into (omwana in n'omwana), or null for joins that are not elisions (don't). */
function tokensOf(line) {
  const out = [];
  for (const m of line.text.matchAll(TOKEN)) {
    const start = line.start + m.index;
    const parts = [];
    let at = start;
    for (const p of m[0].split(/['’ʼ]/)) {
      parts.push({ text: p, start: at, end: at + p.length });
      at += p.length + 1;
    }
    const lead = parts.slice(0, -1);
    const main = lead.every((p) => PREFIXES.has(lower(p.text))) ? parts[parts.length - 1] : null;
    out.push({ text: m[0], start, end: start + m[0].length, parts, main });
  }
  return out;
}

/** 'lg', 'en' or 'mixed' from the words on a line that only one Bible has; `fallback` when it can't tell. */
function langOf(tokens, dict, fallback) {
  let lg = 0;
  let en = 0;
  for (const t of tokens) {
    for (const p of t.parts) {
      const w = lower(p.text);
      if (w.length < 2) continue;
      const a = inLg(dict, w);
      const b = inEn(dict, w);
      if (a && !b) lg++;
      else if (b && !a) en++;
    }
  }
  if (lg + en < 2) return fallback;
  if (en > lg * 2) return 'en';
  if (lg > en * 2) return 'lg';
  return 'mixed';
}

/** The apostrophe this song uses most (' unless it prefers ’ or ʼ). */
function songApostrophe(src) {
  const n = { "'": 0, '’': 0, 'ʼ': 0 };
  for (const m of src.matchAll(/\p{L}(['’ʼ])/gu)) n[m[1]]++;
  return Object.keys(n).reduce((a, b) => (n[b] > n[a] ? b : a), "'");
}

// ------------------------------------------------------------------ 1. elision before a vowel

/** Particles that lose their final vowel before a word starting with a vowel: na omwana -> n'omwana. */
const ELIDE = {
  na: 'n', ne: 'n', nga: 'ng', kya: 'ky', bya: 'by', lya: 'ly', gya: 'gy', ya: 'y', za: 'z', wa: 'w',
  ka: 'k', ba: 'b', ga: 'g', lwa: 'lw', kwa: 'kw', gwa: 'gw', bwa: 'bw', twa: 'tw', mwa: 'mw',
};
// Sounds, not words: the Bible has no evidence for joining these, and songs repeat them.
const INTERJECTIONS = /^(?:[aeiou]+h*|[aeiou]h+[aeiou]*|ayi|ai|oyee?|aye|ow)$/;
// Where the Bible does not join: "nga era" (3 of 3), "oba nga" (31 of 141), and wa meaning
// "where / until when" after these verbs (olituusa wa okugaana, ludda wa oyo, bavudde wa okujja).
const NO_JOIN_NEXT = { nga: ['era'] };
const NO_JOIN_AFTER = { nga: /^oba$/, wa: /(?:tuusa|^ludda|^va|vudde)$/ };

function elisionFlags(tokens, line, ctx, out) {
  for (let i = 0; i < tokens.length - 1; i++) {
    const t = tokens[i];
    const next = tokens[i + 1];
    const p = lower(t.text);
    if (!ELIDE[p] || t.parts.length > 1) continue;
    if (t.start > 0 && APOS.includes(ctx.src.charAt(t.start - 1))) continue;
    const gap = ctx.src.slice(t.end, next.start);
    if (!/^[ \t]+$/.test(gap)) continue;
    const head = next.parts[0].text;
    const h = lower(head);
    if (!isVowel(h.charAt(0)) || h.length < 2 || INTERJECTIONS.test(h) || /\p{N}/u.test(h)) continue;
    // Before a capital the Bible joins only na (n'Abaleevi, n'Omwoyo: 498 times, never apart),
    // while "ne Alooni", "ba Isiraeri", "wa Isiraeri" stay apart (thousands of times).
    if (isUpper(head.charAt(0)) && p !== 'na' && !line.caps) continue;
    if (NO_JOIN_NEXT[p] && NO_JOIN_NEXT[p].includes(h)) continue;
    const prev = tokens[i - 1];
    if (NO_JOIN_AFTER[p] && prev && NO_JOIN_AFTER[p].test(lower(prev.text))) continue;
    // wa asking "where?" (Naagenda wa okuva eri omwoyo gwo?) is not "of": its sentence ends in a question mark.
    if (p === 'wa' && (ctx.src.slice(next.start).match(/[.!?\n]/) || [''])[0] === '?') continue;
    // The next word must be Luganda: in the Luganda list, or shaped like Luganda and not English.
    if (!inLg(ctx.dict, h) && (inEn(ctx.dict, h) || !looksLuganda(h, ctx.dict))) continue;
    const joined = withCase(ELIDE[p], t.text) + ctx.apos;
    out.push({
      start: t.start,
      end: next.start,
      at: next.start,
      fix: joined,
      kind: 'grammar',
      label: `${joined}${next.text}`,
      why: `${p} before a vowel joins: ${lower(joined)}${isUpper(head.charAt(0)) && !line.caps ? head : h}`,
      key: `${p} ${h}`,
    });
  }
}

// ------------------------------------------------------------------ 2. space after an elision

function apostropheSpaceFlags(line, ctx, out) {
  const re = new RegExp(`(?<![${LETTERS}${APOS}])([${LETTERS}]{1,3})([${APOS}])([ \\t]+)(?=([${LETTERS}]+))`, 'gu');
  for (const m of line.text.matchAll(re)) {
    const prefix = m[1];
    if (!PREFIXES.has(lower(prefix)) || !isVowel(m[4].charAt(0))) continue;
    const start = line.start + m.index;
    const joined = prefix + ctx.apos;
    out.push({
      start,
      end: start + m[0].length,
      at: start + m[0].length,
      fix: joined,
      kind: 'punctuation',
      label: `${joined}${m[4]}`,
      why: `No space after the apostrophe: ${lower(joined)}${lower(m[4])}`,
      key: `${lower(prefix)}' ${lower(m[4])}`,
    });
  }
}

// ------------------------------------------------------------------ 5. capitals on sacred names

const NAMES = {
  katonda: 'Katonda', mukama: 'Mukama', yesu: 'Yesu', kristo: 'Kristo', emmanweri: 'Emmanweri',
  emmanueli: 'Emmanueli', emmanuel: 'Emmanuel', immanuel: 'Immanuel', jesus: 'Jesus', christ: 'Christ',
};
// katonda in lower case is a false god in the Bible (katonda omulala, tewali katonda, Dagoni katonda waabwe).
const IDOL_NEXT = /^(?:yenna|o?mulala|omuggya|o?munnaggwanga|omugenyi|omukazi|ki|waabwe)$/;
const IDOL_BEFORE = /^(?:tewali|waliwo|tewabanga|si|buli|ba|bakatonda)$/;
// mukama in lower case is a human master: omuddu tasinga mukama we, mukama w'ennyumba.
const SERVANTS = /(?:^|[^\p{L}])(?:o?mu|a?ba)(?:ddu|zaana)(?:$|[^\p{L}])|nnyumba/u;
// yakuwa is also a verb ("he gave you": gye yakuwa okugirya); only the name before an epithet.
const JEHOVAH = /^(?:nissi|yire|jire|shalom|shammah|rapha|rafa|rohi|tsidkenu|sabaoth|elohim)$/;
const LORD_BEFORE =
  /^(?:my|our|o|oh|the|dear|almighty|mighty|living|holy|great|risen|sovereign|faithful|praise|thank|lord|is|are|art|jesus)$/;

function capitalFlags(tokens, line, ctx, out) {
  if (line.caps) return;
  const sacred = (t) => t && t.main && NAMES[lower(t.main.text)];
  tokens.forEach((t, i) => {
    if (!t.main) return;
    const word = t.main.text;
    const w = lower(word);
    if (word !== w) return; // already capitalised (or ALL CAPS)
    const prev = tokens[i - 1];
    const next = tokens[i + 1];
    const p = prev ? lower(prev.text) : '';
    const n = next ? lower(next.text) : '';
    let fix = null;
    if (NAMES[w] && w !== 'katonda' && w !== 'mukama') fix = NAMES[w];
    else if (w === 'katonda') {
      const namedIdol = prev && isUpper(prev.text.charAt(0)) && i > 1 && !sacred(prev);
      if (!IDOL_NEXT.test(n) && !IDOL_BEFORE.test(p) && !namedIdol) fix = 'Katonda';
    } else if (w === 'mukama') {
      if (!SERVANTS.test(lower(line.text))) fix = 'Mukama';
    } else if (w === 'yakuwa') {
      if (JEHOVAH.test(n)) fix = 'Yakuwa';
    } else if (/^o?mwoyo$/.test(w) || /^o?mutukuvu$/.test(w)) {
      // Omwoyo Omutukuvu (78 times in the Bible, never in lower case when the two words touch).
      const spirit = /^o?mwoyo$/.test(w) ? next && /^o?mutukuvu$/i.test(next.text) : prev && /^o?mwoyo$/i.test(prev.text);
      if (spirit) fix = capital(w);
    } else if ((w === 'lord' || w === 'god') && line.lang === 'en') {
      if (i === 0 || LORD_BEFORE.test(p)) fix = capital(w);
    }
    if (!fix) return;
    out.push({
      start: t.main.start,
      end: t.main.end,
      fix,
      kind: 'capital',
      label: fix,
      why: `${fix} is a sacred name: write it with a capital`,
      key: w,
    });
  });
}

// ------------------------------------------------------------------ 6. punctuation spacing

const MARK_NAME = {
  ',': 'a comma', '.': 'a full stop', ';': 'a semicolon', ':': 'a colon', '!': 'an exclamation mark', '?': 'a question mark',
};
const short = (w, tail) => (w.length <= 10 ? w : tail ? `…${w.slice(-8)}` : `${w.slice(0, 8)}…`);

function punctuationFlags(line, ctx, out) {
  const t = line.text;
  for (const m of t.matchAll(/([ \t]*)([,.;:!?…]+)/g)) {
    const run = m[2];
    if (run.includes('…') || /\.\.\./.test(run)) continue; // an ellipsis is a pause, leave it
    const runStart = m.index + m[1].length;
    const runEnd = runStart + run.length;
    const before = t.charAt(m.index - 1);
    const after = t.charAt(runEnd);
    const last = run.charAt(run.length - 1);
    let fixed = run;
    const why = [];
    if (/^,{2,}$/.test(run) || run === '..') {
      fixed = run.charAt(0);
      why.push(`One ${MARK_NAME[fixed].replace(/^an? /, '')} is enough`);
    }
    // A space before the mark (not at the start of the line, and not ".5" or ".NET").
    const spaceBefore = m[1].length > 0 && m.index > 0 && /[^\s]/.test(before) && !(run === '.' && /[\p{L}\p{N}]/u.test(after));
    if (spaceBefore) why.push(`No space before ${MARK_NAME[run.charAt(0)]}`);
    let spaceAfter = false;
    if (/\p{L}/u.test(after) && !(m[1].length > 0 && !spaceBefore)) {
      if (',;:'.includes(last)) spaceAfter = true;
      else if ('!?'.includes(last)) spaceAfter = true;
      else if (last === '.' && isUpper(after)) {
        // Not after initials or abbreviations: U.S, e.g.
        const word = (t.slice(0, runStart).match(/[\p{L}.]+$/u) || [''])[0];
        spaceAfter = /^\p{L}{2,}$/u.test(word);
      }
    }
    if (spaceAfter) why.push(`Put a space after ${MARK_NAME[last]}`);
    if (!why.length) continue;
    const start = line.start + (spaceBefore ? m.index : runStart);
    const end = line.start + runEnd;
    const fix = fixed + (spaceAfter ? ' ' : '');
    const prevWord = (t.slice(0, m.index).match(/[\p{L}\p{N}'’ʼ]+$/u) || [''])[0];
    const nextWord = (t.slice(runEnd).match(/^[\p{L}\p{N}'’ʼ]+/u) || [''])[0];
    // The tag shows the mark with the word it leans on: "nkwebaza," under nkwebaza, ", nkwagala"
    // under nkwagala when only the space after it is missing.
    const onlyAfter = spaceAfter && !spaceBefore && fixed === run;
    const label = onlyAfter
      ? `${fixed} ${short(nextWord, false)}`
      : `${short(prevWord, true)}${fixed}${spaceAfter ? ` ${short(nextWord, false)}` : ''}`;
    out.push({
      start,
      end,
      ...(onlyAfter ? { at: line.start + runEnd } : {}),
      fix,
      kind: 'punctuation',
      label: label.trim() || fixed,
      why: why.join('. '),
      key: lower(`${prevWord}${ctx.src.slice(start, end)}${nextWord}`),
    });
  }
  // Two or more spaces (or a tab) between words.
  for (const m of t.matchAll(/(?<=\S)(?: {2,}|[ \t]*\t[ \t]*)(?=[^\s,.;:!?…])/g)) {
    const start = line.start + m.index;
    const prevWord = (t.slice(0, m.index).match(/[\p{L}\p{N}'’ʼ]+$/u) || [''])[0];
    const nextWord = (t.slice(m.index + m[0].length).match(/^[\p{L}\p{N}'’ʼ]+/u) || [''])[0];
    out.push({
      start,
      end: start + m[0].length,
      fix: ' ',
      kind: 'punctuation',
      label: 'one space',
      why: 'More than one space between words: one is enough',
      key: lower(`${prevWord}  ${nextWord}`),
    });
  }
}

// ------------------------------------------------------------------ 3, 4, 7. spelling

// Nasal assimilation: n becomes m before b and p, l and r become d after n, m becomes n before t, d, k, g.
const NASAL = [
  ['nb', 'mb'], ['np', 'mp'], ['nl', 'nd'], ['nr', 'nd'], ['mt', 'nt'], ['md', 'nd'], ['mk', 'nk'], ['mg', 'ng'],
];

function nasalFix(w, dict) {
  for (const [from, to] of NASAL) {
    if (!w.includes(from)) continue;
    const all = w.split(from).join(to);
    if (inLg(dict, all)) return { fix: all, why: `Luganda writes ${to}, not ${from}: ${all}` };
  }
  return null;
}

/** r after e and i, l after anything else: ebiri, erinnya, obulamu, olulimi. */
function rlFix(w, dict) {
  if (!/[lr]/.test(w)) return null;
  const want = w.replace(/(^|.)([lr]+)/g, (_, before, run) => before + (/[ei]/.test(before) ? 'r' : 'l').repeat(run.length));
  if (want === w || !inLg(dict, want)) return null;
  return { fix: want, why: `Luganda writes r after e and i, l after other letters: ${want}` };
}

// Luganda grammar lives at the edges of a word: subject, tense and object markers in the first
// letters (a-n-kyawa "he hates me", tu-naa-yimba), mood and tense in the last (-a, -e, -dde). A
// one-letter change there usually makes another real word, so spelling only speaks about the
// middle of a word, and only for the mistakes that rarely make real words: a doubled or single
// letter (erinya for erinnya, egulu for eggulu), two letters swapped, or a letter pair Luganda
// never writes (mukma). Measured on 6,130 real words held out of the dictionary (Psalms, John,
// Romans, Isaiah), this tags under 0.5% of them while fixing most doubling and swap typos.
const CONSONANT_FROM = 3; // first letter of a doubled consonant at index >= 3 (or >= 1 after e/o: eggulu)
const VOWEL_FROM = 4; // a long vowel at index >= 4 (omusaayi), not in tense markers (tunaayimba)
const TAIL = 2; // at least two letters after it (not the final syllable: ebika / ebikka)
const COMMON = { lg: 3000, en: 5000 }; // only suggest words this common in their Bible

/** Words one doubling away: [{ c, s, e, added, letter }] where s..e is the run in the longer word. */
function doublings(w) {
  const out = [];
  for (let i = 0; i < w.length; i++) {
    const ch = w[i];
    if (i > 0 && w[i - 1] === ch) continue;
    let j = i;
    while (w[j + 1] === ch) j++;
    // one more of this letter
    out.push({ c: w.slice(0, i) + ch + w.slice(i), s: i, e: j + 1, len: w.length + 1, added: true, letter: ch });
    // one fewer, if it was doubled
    if (j > i) out.push({ c: w.slice(0, i) + w.slice(i + 1), s: i, e: j, len: w.length, added: false, letter: ch });
  }
  return out;
}

function doublingAllowed(w, d) {
  const tail = d.len - 1 - d.e;
  if (tail < TAIL) return false;
  if (/[aeiou]/.test(d.letter)) return d.s >= VOWEL_FROM;
  // mm and nn often come from "me" inside a verb (a-m-manyi, okum-mira): never take one away.
  if (!d.added && /[mn]/.test(d.letter)) return false;
  return d.s >= CONSONANT_FROM || (d.s >= 1 && /^[eo]/.test(w));
}

/** Two neighbouring letters swapped (not the first letter). */
function swaps(w) {
  const out = [];
  for (let i = 1; i < w.length - 1; i++) {
    if (w[i] !== w[i + 1]) out.push(w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2));
  }
  return out;
}

/** For a word with exactly one letter pair Luganda never writes: one-letter edits around that pair.
 *  For a name, only when that pair has a consonant: Paulo, Daudi and Saulo are names too. */
function shapeRepairs(w, dict, name) {
  const pairs = lugandaPairs(dict);
  if (!pairs || !/^[a-zŋ]+[aeiou]$/.test(w)) return [];
  const s = `^${w}$`;
  const bad = [];
  for (let i = 0; i < s.length - 1; i++) if (!pairs.has(s.slice(i, i + 2))) bad.push(i);
  if (bad.length !== 1 || bad[0] < 2) return [];
  const at = bad[0] - 1; // the pair is w[at], w[at + 1]
  if (name && isVowel(w[at]) && isVowel(w[at + 1])) return [];
  const out = new Set();
  const abc = 'abcdefghijklmnopqrstuvwxyzŋ';
  for (const i of [at, at + 1]) {
    if (i < 1 || i >= w.length) continue;
    out.add(w.slice(0, i) + w.slice(i + 1));
    for (const ch of abc) out.add(w.slice(0, i) + ch + w.slice(i + 1));
  }
  for (const ch of abc) out.add(w.slice(0, at + 1) + ch + w.slice(at + 1));
  return [...out].filter((c) => looksLuganda(c, dict));
}

const spellCache = new WeakMap();

/**
 * The best spelling fix for an unknown lower-case word ({ fix, why, rule }), or null when unsure.
 * `name`: the word was written with a capital letter (a name, perhaps spelt another way).
 */
export function spellingFix(w, dict, lang = 'mixed', name = false) {
  if (!dict || !dict.rank) return null;
  const cacheKey = (dict.lists && dict.lists.lg) || dict.rank;
  if (!spellCache.has(cacheKey)) spellCache.set(cacheKey, new Map());
  const cache = spellCache.get(cacheKey);
  const k = `${lang} ${name ? 'N' : 'w'} ${w}`;
  if (!cache.has(k)) cache.set(k, findFix(w, dict, lang, name));
  return cache.get(k);
}

function findFix(w, dict, lang, name) {
  if (!/^[a-zŋ]+$/.test(w)) return null;
  // Luganda words end in a vowel: one that doesn't (gonna, worshipin) is English, or a name.
  if (!/[aeiou]$/.test(w)) lang = 'en';
  if (lang !== 'en') {
    const special = nasalFix(w, dict) || rlFix(w, dict);
    if (special) return { ...special, rule: 'sound' };
  }
  const named = dict.lists && (dict.lists.lg || dict.lists.en);
  // How common a candidate is in the line's language (lower is more common), or null if unfit.
  const score = (c) => {
    if (!dict.has(c)) return null;
    if (!named) return dict.rank.get(c);
    const lg = dict.rankIn('lg', c);
    const en = dict.rankIn('en', c);
    if (lg < 0 && en < 0) return COMMON.lg - 1; // a word added outside the named lists (addText)
    if (lang === 'en') return en >= 0 && en < COMMON.en ? en : null;
    if (lang === 'lg') return lg >= 0 && lg < COMMON.lg ? lg : null;
    if (lg >= 0 && lg < COMMON.lg) return lg;
    return en >= 0 && en < COMMON.en ? en : null;
  };
  const found = new Map();
  const consider = (c, why) => {
    const r = score(c);
    if (r !== null && !found.has(c)) found.set(c, { c, r, why });
  };
  for (const d of doublings(w)) {
    if (doublingAllowed(w, d)) consider(d.c, d.added ? 'Double letter' : 'Single letter');
  }
  if (w.length >= 4) for (const c of swaps(w)) consider(c, 'Two letters swapped');
  if (!found.size && lang !== 'en') {
    for (const c of shapeRepairs(w, dict, name)) consider(c, 'Luganda never writes these letters together');
  }
  const hits = [...found.values()].sort((a, b) => a.r - b.r);
  if (!hits.length) return null;
  // Two plausible fixes and no clear favourite: say nothing.
  if (hits[1] && hits[1].r < hits[0].r * 4 + 20) return null;
  const best = hits[0];
  const source = inLg(dict, best.c) ? 'the Luganda Bible' : inEn(dict, best.c) ? 'the KJV' : 'your songs';
  return { fix: best.c, why: `${best.why}: ${source} writes ${best.c}`, rule: 'edit' };
}

// The Bible text has its own misprints (erinya once, erinnya 831 times; emere, enyumba, bonma).
// From this place on, the Luganda list holds words printed only once or twice; such a word is
// still tagged when the usual rules find a fix among the 1,000 most common words. On the whole
// list that finds 91 words, nearly all of them misprints. A sound rule (nb -> mb, r / l) is
// surer, so its fix only has to be ten times as common: okuyinba -> okuyimba, nbuzi -> mbuzi.
const MISPRINT_FROM = 12000;
const MISPRINT_FIX = 1000;
function misprint(w, dict) {
  return !!dict.rankIn && dict.rankIn('lg', w) >= MISPRINT_FROM && dict.rankIn('en', w) < 0;
}
function misprintFix(w, res, dict) {
  const r = res ? dict.rankIn('lg', res.fix) : -1;
  if (r < 0) return null;
  return r < MISPRINT_FIX || (res.rule === 'sound' && r * 10 < dict.rankIn('lg', w)) ? res : null;
}

/** "kkung'aaniro" typed for kkuŋŋaaniro: ng' inside a word is the letter ŋ. */
function engFix(token, dict) {
  const w = lower(token.text).replace(/['’ʼ]/g, "'");
  if (!w.includes("ng'")) return null;
  for (const c of [w.replace(/ng'/g, 'ŋ'), w.replace(/ng'/g, 'ŋŋ'), w.replace(/ngng'|ng'ng'/g, 'ŋŋ').replace(/ng'/g, 'ŋ')]) {
    if (/^[a-zŋ]+$/.test(c) && inLg(dict, c)) return { fix: c, why: `ng' inside a word is the letter ŋ: ${c}` };
  }
  return null;
}

function spellingFlags(tokens, line, ctx, out) {
  tokens.forEach((t, i) => {
    let target = t.main;
    let res = null;
    // A word sung twice in a row (Hosana hosana, yee yee) is meant.
    const same = (o) => o && lower(o.text) === lower(t.text);
    if (same(tokens[i - 1]) || same(tokens[i + 1])) return;
    if (!target) {
      // A join that is not an elision: try ŋ, otherwise leave it (don't, Lord's, singin').
      res = engFix(t, ctx.dict);
      target = t;
    } else {
      const w = lower(target.text);
      if (w.length < 3 || /\p{N}/u.test(w) || ctx.title.has(w) || ctx.songWords.has(w)) return;
      const name = isUpper(target.text.charAt(0));
      if (!known(ctx.dict, w)) res = spellingFix(w, ctx.dict, line.lang, name);
      else if (misprint(w, ctx.dict)) res = misprintFix(w, spellingFix(w, ctx.dict, line.lang, name), ctx.dict);
    }
    if (!res) return;
    const fix = withCase(res.fix, target.text);
    out.push({
      start: target.start,
      end: target.end,
      fix,
      kind: 'spelling',
      label: fix,
      why: res.why,
      key: lower(target.text),
    });
  });
}

// ------------------------------------------------------------------ check and apply

const PRIORITY = { grammar: 0, capital: 1, punctuation: 2, spelling: 3 };

/**
 * Suggestions for song lyrics. `dict` is a spell.js Dictionary, ideally with named lists 'lg'
 * (Luganda Bible) and 'en' (KJV). Options: `ignored` (keys the user marked "It's right"),
 * `title` (its words are never called misspelled), `language` ('lg' | 'en' | 'mixed'),
 * `known` (a Set of lower-case words from the user's other songs, also never called misspelled).
 */
export function checkLyrics(text, dict, { ignored = [], title = '', language = 'mixed', known: songWords = null } = {}) {
  const src = String(text || '');
  const skip = new Set([...ignored].map(lower));
  const songLang = language === 'lg' || language === 'en' ? language : null;
  const lines = linesOf(src).filter((l) => !l.label && l.text.trim());
  const tokensBy = new Map(lines.map((l) => [l, tokensOf(l)]));
  const whole = langOf([...tokensBy.values()].flat(), dict, 'mixed');
  const ctx = {
    src,
    dict,
    apos: songApostrophe(src),
    title: new Set(lower(title).match(/\p{L}+/gu) || []),
    songWords: songWords || new Set(),
  };
  const found = [];
  for (const line of lines) {
    const tokens = tokensBy.get(line);
    line.lang = langOf(tokens, dict, songLang || whole);
    line.caps = !/\p{Ll}/u.test(line.text) && /\p{Lu}.*\p{Lu}/u.test(line.text);
    if (line.lang !== 'en') {
      elisionFlags(tokens, line, ctx, found);
      apostropheSpaceFlags(line, ctx, found);
    }
    capitalFlags(tokens, line, ctx, found);
    punctuationFlags(line, ctx, found);
    if (dict) spellingFlags(tokens, line, ctx, found);
  }
  // One suggestion per stretch of text: the more certain kind wins; the rest show after it is fixed.
  found.sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind] || a.start - b.start);
  const kept = [];
  for (const f of found) {
    if (skip.has(f.key)) continue;
    if (kept.some((k) => f.start < k.end && k.start < f.end)) continue;
    kept.push({ ...f, word: src.slice(f.start, f.end) });
  }
  return kept.sort((a, b) => a.start - b.start);
}

/** Applies one suggestion; returns the text unchanged if it moved since it was checked. */
export function applyLyricFix(text, flag) {
  if (!flag || text.slice(flag.start, flag.end) !== flag.word) return text;
  return text.slice(0, flag.start) + flag.fix + text.slice(flag.end);
}

/** Applies several suggestions at once (from the end, so positions stay true), skipping overlaps. */
export function applyLyricFixes(text, flags) {
  let out = text;
  let limit = Infinity;
  for (const f of [...flags].sort((a, b) => b.start - a.start)) {
    if (f.end > limit) continue;
    const next = applyLyricFix(out, f);
    if (next !== out) limit = f.start;
    out = next;
  }
  return out;
}

// ------------------------------------------------------------------ the proof view

/**
 * The text as lines of parts for the proof view, each suggestion hung on one word:
 * [{ start, label, empty, text, parts: [{ text, start, end, word, flags, under }] }].
 * `flags` are the suggestions tagged under that word; `under` is the kind of the suggestion that
 * covers the part (a word's underline, or the highlight on a stray space or comma).
 */
export function proofLines(text, flags) {
  const src = String(text || '');
  const sorted = [...(flags || [])].sort((a, b) => a.start - b.start);
  let next = 0;
  return linesOf(src).map((line) => {
    const end = line.start + line.text.length;
    if (line.label) return { start: line.start, label: true, text: line.text.trim(), parts: [] };
    if (!line.text.trim()) return { start: line.start, empty: true, parts: [] };
    while (next < sorted.length && sorted[next].start < line.start) next++;
    const mine = [];
    for (; next < sorted.length && sorted[next].start <= end; next++) mine.push(sorted[next]);
    // Spaces and marks between words, cut where a suggestion starts or ends so its highlight fits it.
    const cuts = mine.flatMap((f) => [f.start, f.end]);
    const parts = [];
    const gap = (a, b) => {
      const stops = [a, ...cuts.filter((c) => c > a && c < b).sort((x, y) => x - y), b];
      for (let i = 0; i < stops.length - 1; i++) {
        const [s, e] = [stops[i], stops[i + 1]];
        if (e > s) parts.push({ text: src.slice(s, e), start: s, end: e, word: false, flags: [], under: null });
      }
    };
    let at = line.start;
    for (const t of tokensOf(line)) {
      if (t.start > at) gap(at, t.start);
      parts.push({ text: t.text, start: t.start, end: t.end, word: true, flags: [], under: null });
      at = t.end;
    }
    if (end > at) gap(at, end);
    const words = parts.filter((p) => p.word);
    for (const f of mine) {
      // `at` names the word a tag hangs under (omwana for "na omwana"); else the word it starts in.
      const at = f.at === undefined ? f.start : f.at;
      const host =
        words.find((w) => at >= w.start && at < w.end) ||
        (f.at !== undefined && words.find((w) => w.start >= at)) ||
        words.find((w) => f.start >= w.start && f.start < w.end) ||
        [...words].reverse().find((w) => w.end <= f.start) ||
        words.find((w) => w.start >= f.start);
      if (!host) continue;
      host.flags.push(f);
      for (const p of parts) {
        if (p === host || (p.start < f.end && f.start < p.end)) p.under = p.under || f.kind;
      }
    }
    return { start: line.start, parts };
  });
}
