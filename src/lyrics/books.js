// The 66 books: USFM code, English and Luganda names (Luganda names and short
// forms are the headers of the Biblica Luganda Bible), plus extra aliases.
// Book numbers are 1-based positions in this list.

const RAW = [
  ['GEN', 'Genesis', 'Olubereberye', 'Lub', 'gn|ge'],
  ['EXO', 'Exodus', 'Okuva', 'Kuv', 'ex'],
  ['LEV', 'Leviticus', 'Ebyabaleevi', 'Lv', "eby'abaleevi|lev"],
  ['NUM', 'Numbers', 'Okubala', 'Kbl', 'nm|nb'],
  ['DEU', 'Deuteronomy', 'Ekyamateeka Olwokubiri', 'Ma', 'dt|ekyamateeka'],
  ['JOS', 'Joshua', 'Yoswa', 'Yos', 'jsh'],
  ['JDG', 'Judges', 'Ekyabalamuzi', 'Bal', 'jg|abalamuzi'],
  ['RUT', 'Ruth', 'Luusi', 'Lus', 'rt'],
  ['1SA', '1 Samuel', '1 Samwiri', '1Sa', ''],
  ['2SA', '2 Samuel', '2 Samwiri', '2Sa', ''],
  ['1KI', '1 Kings', '1 Bassekabaka', '1Bk', ''],
  ['2KI', '2 Kings', '2 Bassekabaka', '2Bk', ''],
  ['1CH', '1 Chronicles', '1 Ebyomumirembe', '1By', ''],
  ['2CH', '2 Chronicles', '2 Ebyomumirembe', '2By', ''],
  ['EZR', 'Ezra', 'Ezera', 'Ezr', ''],
  ['NEH', 'Nehemiah', 'Nekkemiya', 'Nek', ''],
  ['EST', 'Esther', 'Eseza', 'Es', ''],
  ['JOB', 'Job', 'Yobu', 'Yob', 'jb'],
  ['PSA', 'Psalms', 'Zabbuli', 'Zab', 'psalm|ps|psa|pss'],
  ['PRO', 'Proverbs', 'Engero', 'Nge', 'prv|pr'],
  ['ECC', 'Ecclesiastes', 'Omubuulizi', 'Mub', 'eccl|qoh'],
  ['SNG', 'Song of Songs', 'Oluyimba', 'Lu', 'song of solomon|sos|canticles|oluyimba lwa sulemaani'],
  ['ISA', 'Isaiah', 'Isaaya', 'Is', ''],
  ['JER', 'Jeremiah', 'Yeremiya', 'Yer', 'jr'],
  ['LAM', 'Lamentations', 'Okukungubaga', 'Kgb', 'la'],
  ['EZK', 'Ezekiel', 'Ezeekyeri', 'Ez', 'ezek|ezekyeri'],
  ['DAN', 'Daniel', 'Danyeri', 'Dan', 'dn'],
  ['HOS', 'Hosea', 'Koseya', 'Kos', ''],
  ['JOL', 'Joel', 'Yoweeri', 'Yo', 'jl'],
  ['AMO', 'Amos', 'Amosi', 'Am', ''],
  ['OBA', 'Obadiah', 'Obadiya', 'Ob', ''],
  ['JON', 'Jonah', 'Yona', 'Yon', 'jnh'],
  ['MIC', 'Micah', 'Mikka', 'Mi', ''],
  ['NAM', 'Nahum', 'Nakkumu', 'Nak', 'na'],
  ['HAB', 'Habakkuk', 'Kaabakuuku', 'Kbk', ''],
  ['ZEP', 'Zephaniah', 'Zeffaniya', 'Zef', ''],
  ['HAG', 'Haggai', 'Kaggayi', 'Kag', ''],
  ['ZEC', 'Zechariah', 'Zekkaliya', 'Zek', ''],
  ['MAL', 'Malachi', 'Malaki', 'Mal', ''],
  ['MAT', 'Matthew', 'Matayo', 'Mat', 'mt'],
  ['MRK', 'Mark', 'Makko', 'Mak', 'mk|mr'],
  ['LUK', 'Luke', 'Lukka', 'Luk', 'lk'],
  ['JHN', 'John', 'Yokaana', 'Yk', 'jn'],
  ['ACT', 'Acts', "Ebikolwa by'Abatume", 'Bik', 'ebikolwa'],
  ['ROM', 'Romans', 'Abaruumi', 'Bar', 'rm'],
  ['1CO', '1 Corinthians', '1 Abakkolinso', '1Ko', ''],
  ['2CO', '2 Corinthians', '2 Abakkolinso', '2Ko', ''],
  ['GAL', 'Galatians', 'Abaggalatiya', 'Bag', ''],
  ['EPH', 'Ephesians', 'Abaefeso', 'Bef', ''],
  ['PHP', 'Philippians', 'Abafiripi', 'Baf', 'phil'],
  ['COL', 'Colossians', 'Abakkolosaayi', 'Bak', ''],
  ['1TH', '1 Thessalonians', '1 Basessaloniika', '1Bs', '1 abassessaloniika|1 thess'],
  ['2TH', '2 Thessalonians', '2 Basessaloniika', '2Bs', '2 abassessaloniika|2 thess'],
  ['1TI', '1 Timothy', '1 Timoseewo', '1Ti', ''],
  ['2TI', '2 Timothy', '2 Timoseewo', '2Ti', ''],
  ['TIT', 'Titus', 'Tito', 'Tit', ''],
  ['PHM', 'Philemon', 'Firemooni', 'Fir', 'phlm'],
  ['HEB', 'Hebrews', 'Abaebbulaniya', 'Beb', ''],
  ['JAS', 'James', 'Yakobo', 'Yak', 'jm'],
  ['1PE', '1 Peter', '1 Peetero', '1Pe', ''],
  ['2PE', '2 Peter', '2 Peetero', '2Pe', ''],
  ['1JN', '1 John', '1 Yokaana', '1Yk', ''],
  ['2JN', '2 John', '2 Yokaana', '2Yk', ''],
  ['3JN', '3 John', '3 Yokaana', '3Yk', ''],
  ['JUD', 'Jude', 'Yuda', 'Yud', ''],
  ['REV', 'Revelation', 'Okubikkulirwa', 'Kub', 'rv|apocalypse|revelations'],
];

export const BOOKS = RAW.map(([code, en, lg, lgShort, extra], i) => ({ n: i + 1, code, en, lg, lgShort, extra }));

// eBible "VPL" files use their own three-letter codes for a few books.
const VPL_CODES = {
  JOH: 'JHN', MAR: 'MRK', SOL: 'SNG', JAM: 'JAS', JOE: 'JOL', EZE: 'EZK', PHI: 'PHP', NAH: 'NAM',
  '1JO': '1JN', '2JO': '2JN', '3JO': '3JN',
};

const byCode = new Map(BOOKS.map((b) => [b.code, b]));

/** A book from a USFM code or an eBible VPL code (null if unknown or not one of the 66). */
export function bookByCode(code) {
  const c = String(code || '').toUpperCase();
  return byCode.get(VPL_CODES[c] || c) || null;
}

export function bookByNumber(n) {
  return BOOKS[n - 1] || null;
}

/** Lowercase, no accents or apostrophes, single spaces; "1Samwiri" -> "1 samwiri". */
export function normName(s) {
  return String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’ʼ`.]/g, '')
    .replace(/^([123])\s*([a-z])/, '$1 $2')
    .replace(/[^a-z0-9ŋ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Every name, short form and alias (normalised) -> book.
const NAMES = BOOKS.flatMap((b) =>
  [b.en, b.lg, b.lgShort, b.code, ...b.extra.split('|')].map(normName).filter(Boolean).map((k) => [k, b]),
);

function foldOrdinal(s) {
  return s.replace(/^(i{1,3}|first|second|third|1st|2nd|3rd)\s+/, (m, w) => {
    const d = { i: 1, ii: 2, iii: 3, first: 1, second: 2, third: 3, '1st': 1, '2nd': 2, '3rd': 3 }[w];
    return `${d} `;
  });
}

/** Finds a book by any name, Luganda or English, full or a unique-enough prefix ("Zab", "Ps", "1 Yok"). */
export function findBook(name) {
  const k = foldOrdinal(normName(name));
  if (!k) return null;
  const exact = NAMES.find(([n]) => n === k);
  if (exact) return exact[1];
  const hits = new Set(NAMES.filter(([n]) => n.startsWith(k)).map(([, b]) => b));
  if (hits.size === 1) return [...hits][0];
  // Several books share the prefix: with 3+ letters take the first in Bible order, else it's too vague.
  if (hits.size > 1 && k.replace(/^[123] /, '').length >= 3) return [...hits].sort((a, b) => a.n - b.n)[0];
  return null;
}

/**
 * Parses "Zabbuli 23:1-4", "Psalm 23", "Ps 23 1", "1 Yokaana 1:9", "Yk 3:16-18".
 * Returns { book, chapter, from, to } (from/to null when the whole chapter is meant) or null.
 */
export function parseRef(text) {
  const t = String(text || '').trim();
  const m = /^(.*?[^\d\s:.,-]['’ʼ]?[^\d:]*?)\s*(\d+)(?:\s*[:.,\s]\s*(\d+)(?:\s*[-–—]\s*(\d+))?)?\s*$/.exec(t);
  if (!m) return null;
  const book = findBook(m[1]);
  if (!book) return null;
  const chapter = +m[2];
  const from = m[3] ? +m[3] : null;
  let to = m[4] ? +m[4] : from;
  if (from != null && to < from) to = from;
  if (!chapter) return null;
  return { book, chapter, from, to };
}

/** "Zabbuli 23 : 1 · Psalm 23 : 1", or one language only. */
export function formatRef(book, chapter, verse, { lg = true, en = true, part = '' } = {}) {
  const v = verse != null ? ` : ${verse}${part}` : '';
  const parts = [];
  if (lg) parts.push(`${book.lg} ${chapter}${v}`);
  if (en) parts.push(`${book.en === 'Psalms' ? 'Psalm' : book.en} ${chapter}${v}`);
  return parts.join(' · ');
}
