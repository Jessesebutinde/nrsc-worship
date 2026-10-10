// What the operator says into the mic, turned into a Bible reference: "Psalm twenty three verse
// one to four", "John three sixteen", "first John chapter one verse nine", "Zabbuli amakumi abiri
// mu ssatu olunyiriri olusooka". Number words (English and Luganda) become digits; book names
// are found anywhere in the sentence; the last reference said wins.

import { findBook, normName } from './books.js';

const EN_UNITS = { zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const EN_TEENS = {
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const EN_TENS = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
// Luganda: units (with their common class prefixes), tens and hundred.
const LG_UNITS = {
  emu: 1, omu: 1, limu: 1, kimu: 1, gumu: 1, kamu: 1, lumu: 1,
  bbiri: 2, biri: 2, ebiri: 2,
  ssatu: 3, satu: 3, esatu: 3, ttaano: 5, taano: 5, etaano: 5,
  nnya: 4, ennya: 4, mukaaga: 6, musanvu: 7, munaana: 8, mwenda: 9,
};
const LG_TENS = { kkumi: 10, ekkumi: 10, abiri: 20, asatu: 30, ana: 40, ataano: 50, nkaaga: 60, nsanvu: 70, kinaana: 80, kyenda: 90 };
const LG_HUNDRED = { kikumi: 100, ekikumi: 100 };
// "The first / second verse" in Luganda.
const LG_ORDINAL = { olusooka: 1, olwokubiri: 2, olwokusatu: 3, olwokuna: 4, olwokutaano: 5 };

// Words that only join a reference together.
const FILLER = new Set([
  'chapter', 'chapters', 'verse', 'verses', 'versus', 'vs', 'v', 'colon', 'and', 'the', 'book', 'of', 'in', 'at', 'from', 'read',
  'reading', 'turn', 'to', 'let', 'us', 'lets', 'open', 'our', 'bibles', 'bible', 'please',
  'essuula', 'olunyiriri', 'ennyiriri', 'olunyiriri', 'mu', 'ekitabo', 'kya', 'mu', 'na', 'amakumi', 'tusome', 'tugende',
]);
const RANGE = new Set(['to', 'through', 'thru', 'till', 'until', 'dash', 'okutuuka', 'okutuusa', 'okutuka', 'paka']);

/** Words and numbers of a sentence, with number words (English or Luganda) turned into numbers. */
export function numberWords(text) {
  const raw = String(text || '')
    .toLowerCase()
    .replace(/(\d+)\s*[:.]\s*(\d+)/g, '$1 $2')
    .replace(/(\d)\s*[-–—]\s*(\d)/g, '$1 to $2')
    .replace(/(\d)(st|nd|rd|th)\b/g, '$1')
    .replace(/[^a-z0-9'’ŋ ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const out = [];
  let cur = null; // number being built
  let stage = 0; // 0 none, 1 hundreds, 2 tens, 3 units/teens
  const flush = () => {
    if (cur != null) out.push(cur);
    cur = null;
    stage = 0;
  };
  for (let i = 0; i < raw.length; i++) {
    const w = raw[i];
    if (/^\d+$/.test(w)) {
      flush();
      out.push(+w);
      continue;
    }
    if (w === 'hundred' || LG_HUNDRED[w]) {
      cur = (cur || 1) * 100;
      stage = 1;
      continue;
    }
    if (w === 'a' && (raw[i + 1] === 'hundred')) continue;
    if ((w === 'and' || w === 'mu' || w === 'na') && cur != null && stage < 3) {
      // "a hundred and nineteen", "amakumi abiri mu ssatu", "kkumi na mukaaga"
      const nx = raw[i + 1];
      if (nx && (EN_UNITS[nx] != null || EN_TEENS[nx] || EN_TENS[nx] || LG_UNITS[nx] || LG_TENS[nx])) continue;
    }
    if (w === 'amakumi') continue;
    const tens = EN_TENS[w] || LG_TENS[w];
    const teen = EN_TEENS[w];
    const unit = EN_UNITS[w] != null ? EN_UNITS[w] : LG_UNITS[w];
    if (tens) {
      if (cur != null && stage >= 2) flush();
      cur = (cur || 0) + tens;
      stage = 2;
    } else if (teen) {
      if (cur != null && stage >= 2) flush();
      cur = (cur || 0) + teen;
      stage = 3;
    } else if (unit != null) {
      if (cur != null && stage >= 3) flush();
      cur = (cur || 0) + unit;
      stage = 3;
    } else if (LG_ORDINAL[w]) {
      flush();
      out.push(LG_ORDINAL[w]);
    } else {
      flush();
      out.push(w);
    }
  }
  flush();
  return out;
}

const ORDINAL_WORD = { first: 1, second: 2, third: 3, '1st': 1, '2nd': 2, '3rd': 3 };

/**
 * The last Bible reference in a spoken sentence: { book, chapter, from, to, at } or null.
 * `at` is where it started (word index), so the caller can tell a new reference from an old one.
 */
export function spokenRef(text) {
  const words = numberWords(text);
  let found = null;
  for (let i = 0; i < words.length; i++) {
    if (typeof words[i] === 'number' && !(i + 1 < words.length && typeof words[i + 1] === 'string')) continue;
    // A book name of up to four words, maybe after "first" / "1" (1 John), or a Luganda name
    // with a trailing number word ("Yokaana ekisooka" is rare; the 1968 Bible writes "1 Yokaana").
    let book = null;
    let end = i;
    for (let len = 4; len >= 1 && !book; len--) {
      const span = words.slice(i, i + len);
      if (span.length < len || span.some((w) => typeof w === 'number' && w > 3) ) continue;
      let name = span.map((w) => (typeof w === 'number' ? String(w) : w)).join(' ');
      if (typeof span[0] === 'string' && ORDINAL_WORD[span[0]]) name = `${ORDINAL_WORD[span[0]]} ${span.slice(1).join(' ')}`;
      if (typeof span[span.length - 1] === 'number') continue;
      if (FILLER.has(normName(name))) continue;
      const b = exactBook(name);
      if (b) {
        book = b;
        end = i + len;
      }
    }
    if (!book) continue;
    // The numbers after it: chapter, verse, and the end of a range.
    const nums = [];
    let range = false;
    let j = end;
    for (; j < words.length && nums.length < 3; j++) {
      const w = words[j];
      if (typeof w === 'number') nums.push(w);
      else if (RANGE.has(w) && nums.length >= 2) range = true;
      else if (FILLER.has(w)) continue;
      else break;
    }
    if (!nums.length) continue;
    const [chapter, from = null, to0 = null] = nums;
    let to = from == null ? null : to0 != null && (range || nums.length === 3) ? to0 : from;
    if (to != null && to < from) to = from;
    found = { book, chapter, from, to, at: i };
    i = j - 1;
  }
  return found;
}

// Exact book names only (no prefixes): in speech, "and" or "so" must never become a book.
function exactBook(name) {
  const k = normName(name);
  if (k.length < 2) return null;
  const b = findBook(k);
  if (!b) return null;
  const names = [b.en, b.lg, b.lgShort, b.code, ...b.extra.split('|'), b.en === 'Psalms' ? 'psalm' : '']
    .filter(Boolean)
    .map((n) => normName(n));
  const plain = k.replace(/^([123]) /, '$1 ');
  return names.includes(plain) || names.includes(plain.replace(/s$/, '')) ? b : null;
}

/** "Psalm 23:1-4" style text for a spoken reference. */
export function refText(r) {
  if (!r) return '';
  const v = r.from == null ? '' : `:${r.from}${r.to != null && r.to !== r.from ? `-${r.to}` : ''}`;
  return `${r.book.en === 'Psalms' ? 'Psalm' : r.book.en} ${r.chapter}${v}`;
}
