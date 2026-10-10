// Lyric proofreading (src/lyrics/luganda.js) against the real word lists and Bible text.
// Precision first: each rule has cases it must stay quiet on, and real verses must get almost no tags.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Dictionary, wordsOf } from '../src/lyrics/spell.js';
import {
  checkLyrics,
  applyLyricFix,
  applyLyricFixes,
  proofLines,
  looksLuganda,
  spellingFix,
  SAFE_KINDS,
  KINDS,
} from '../src/lyrics/luganda.js';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const LG = read('lyrics/bibles/lug68/words.txt').split('\n').filter(Boolean);
const EN = read('lyrics/bibles/kjv/words.txt').split('\n').filter(Boolean);
const chapters = (bible, n) => JSON.parse(read(`lyrics/bibles/${bible}/${n}.json`));

function dictionary(without) {
  return new Dictionary().addList('lg', without ? LG.filter((w) => !without.has(w)) : LG).addList('en', EN);
}
const DICT = dictionary();

/** Suggestions as compact strings: "kind word -> fix". */
const tags = (text, opts = {}) =>
  checkLyrics(text, DICT, { language: 'lg', ...opts }).map((f) => `${f.kind} ${f.word.trim() || JSON.stringify(f.word)} -> ${f.fix}`);
const quiet = (text, opts) => assert.deepEqual(tags(text, opts), [], text);
const fixed = (text, opts = {}) => applyLyricFixes(text, checkLyrics(text, DICT, { language: 'lg', ...opts }));

let bibleText = null;
function wholeBible() {
  if (!bibleText) {
    const parts = [];
    for (let b = 1; b <= 66; b++) parts.push(chapters('lug68', b).flat().join('\n'));
    bibleText = parts.join('\n');
  }
  return bibleText;
}

// ------------------------------------------------------------------ word lists

test('named word lists: places in each list, and every Bible word is in the Luganda list', () => {
  assert.equal(DICT.rankIn('lg', 'mu'), 0);
  assert.ok(DICT.rankIn('lg', 'erinnya') >= 0 && DICT.rankIn('lg', 'erinnya') < 100);
  assert.equal(DICT.rankIn('en', 'erinnya'), -1);
  assert.ok(DICT.rankIn('en', 'shepherd') >= 0);
  assert.equal(DICT.rankIn('nope', 'mu'), -1);
  assert.ok(DICT.has('Mukama') && DICT.has('the'));
  const lg = new Set(LG);
  for (const v of chapters('lug68', 19).flat()) for (const w of wordsOf(v)) assert.ok(lg.has(w), w);
  // Luganda words end in a vowel and use Luganda letter pairs; English ones mostly don't.
  for (const w of ['omwana', 'tukutendereza', 'kkuŋŋaaniro', 'erinnya']) assert.ok(looksLuganda(w, DICT), w);
  for (const w of ['shepherd', 'christ', 'worship', 'great', 'thy', 'psalm']) assert.ok(!looksLuganda(w, DICT), w);
  assert.deepEqual(SAFE_KINDS, ['grammar', 'punctuation', 'capital']);
  assert.ok(KINDS.includes('spelling') && !SAFE_KINDS.includes('spelling'));
});

// ------------------------------------------------------------------ 1. elision

test('Bible evidence: particles before a vowel are joined, names after ne/ba/wa are not', () => {
  const text = wholeBible();
  const count = (re) => (text.match(re) || []).length;
  // nga before a lower-case vowel: joined 5,360 times, apart 78.
  assert.ok(count(/(?<![\p{L}'’])ng['’][aeiou]/gu) > 50 * count(/(?<![\p{L}'’])nga [aeiou]/gu));
  // na apart before a vowel: once in the whole Bible.
  assert.ok(count(/(?<![\p{L}'’])na [aeiou]/gu) <= 2);
  assert.ok(count(/(?<![\p{L}'’])by['’][aeiou]/gu) > 500 && count(/(?<![\p{L}'’])bya [aeiou]/gu) === 0);
  // Capitals: "ne Alooni", "ba Isiraeri" stay apart; only na joins one (n'Abaleevi), and is never left apart.
  assert.ok(count(/(?<![\p{L}'’])ne [AEIOU]/gu) > 900);
  assert.ok(count(/(?<![\p{L}'’])ba [AEIOU]/gu) > 1000 && count(/(?<![\p{L}'’])b['’][AEIOU]/gu) < 100);
  assert.ok(count(/(?<![\p{L}'’])n['’][AEIOU]/gu) > 400 && count(/(?<![\p{L}'’])na [AEIOU]/gu) === 0);
});

test('elision before a vowel is grammar: na omwana -> n\'omwana', () => {
  assert.deepEqual(tags('Twagala okuyimba na omwana wo'), ["grammar na -> n'"]);
  assert.equal(fixed('Twagala okuyimba na omwana wo'), "Twagala okuyimba n'omwana wo");
  assert.equal(fixed('nga abantu bonna bakutendereza'), "ng'abantu bonna bakutendereza");
  assert.equal(fixed('Ebigambo bya obulamu'), "Ebigambo by'obulamu");
  assert.equal(fixed('Erinnya lya omwana'), "Erinnya ly'omwana");
  assert.equal(fixed('Omwana wa omuntu'), "Omwana w'omuntu");
  assert.equal(fixed('Amaanyi ga omwoyo'), "Amaanyi g'omwoyo");
  assert.equal(fixed('Ennyimba za okusinza'), "Ennyimba z'okusinza");
  assert.equal(fixed('Ekitiibwa kya omulokozi'), "Ekitiibwa ky'omulokozi");
  assert.equal(fixed('Na omwana'), "N'omwana"); // first word of the song, and its capital kept
  assert.equal(fixed('NA OMWANA'), "N'OMWANA");
  assert.equal(fixed('na Abaleevi ne Isaaka'), "n'Abaleevi ne Isaaka");
  // The song's own apostrophe is used.
  assert.equal(fixed('Tukwebaza n’essanyu na omwana'), 'Tukwebaza n’essanyu n’omwana');
  const [f] = checkLyrics('Twagala na omwana', DICT, { language: 'lg' });
  assert.equal(f.label, "n'omwana");
  assert.match(f.why, /na before a vowel joins: n'omwana/);
});

test('elision stays quiet where the Bible keeps words apart', () => {
  quiet('ne Alooni ne Musa'); // ne + name
  quiet('Abantu ba Isiraeri');
  quiet('nga era ne bagenda'); // nga era: never joined in the Bible
  quiet('oba nga ali mulamu');
  quiet('Ludda wa oyo?'); // wa = where
  quiet('Naagenda wa okuva eri omwoyo gwo?');
  quiet('na oh, na eh, nga ayi'); // sounds, not words
  quiet('Yesu ne amazing grace', { language: 'mixed' }); // English after the particle
  quiet('na na na na');
  quiet('Tujja na\nomwana'); // never across a line break
  quiet("Twagala n'omwana");
  quiet('I want to go na away', { language: 'en' });
});

// ------------------------------------------------------------------ 2. space after an apostrophe

test("no space after an elision apostrophe: n' essanyu -> n'essanyu", () => {
  assert.deepEqual(tags("Tukwebaza n' essanyu"), ["punctuation n' -> n'"]);
  assert.equal(fixed("Tukwebaza n' essanyu"), "Tukwebaza n'essanyu");
  assert.equal(fixed('Erinnya ly’ omwana'), 'Erinnya ly’omwana');
  assert.equal(fixed("Mu kisa ky' omwana"), "Mu kisa ky'omwana");
  quiet("I keep singin' and dancin'", { language: 'en' });
  quiet("Yagamba nti 'Yee' era n'agenda");
  quiet("Mukama' bwe yagamba");
});

// ------------------------------------------------------------------ 3, 4. sound rules

test('nasal assimilation: nb -> mb, np -> mp, nr -> nd, mt -> nt, mk -> nk, mg -> ng', () => {
  assert.deepEqual(tags('okunpi enragaano emkya emgalo omumtu'), [
    'spelling okunpi -> okumpi',
    'spelling enragaano -> endagaano',
    'spelling emkya -> enkya',
    'spelling emgalo -> engalo',
    'spelling omumtu -> omuntu',
  ]);
  // okuyinba is printed once in the Bible (a misprint); okuyimba is far more common.
  assert.deepEqual(tags('Okuyinba kwaffe'), ['spelling Okuyinba -> Okuyimba']);
  quiet('Kamkwamba'); // the fix is not a Luganda word: say nothing
  quiet('Kankwamba wange');
});

test('r after e and i, l elsewhere, only when the Bible backs it', () => {
  assert.deepEqual(tags('oburamu elinnya Yelusaalemi'), [
    'spelling oburamu -> obulamu',
    'spelling elinnya -> erinnya',
    'spelling Yelusaalemi -> Yerusaalemi',
  ]);
  quiet('Kristo Maria Marko Isiraeri Petero Gabrieli');
  quiet('pray for more glory', { language: 'en' });
});

// ------------------------------------------------------------------ 5. capitals

test('sacred names take a capital', () => {
  assert.deepEqual(tags('katonda wange, mukama wange'), ['capital katonda -> Katonda', 'capital mukama -> Mukama']);
  assert.deepEqual(tags('yesu kristo'), ['capital yesu -> Yesu', 'capital kristo -> Kristo']);
  assert.equal(fixed('omwoyo omutukuvu'), 'Omwoyo Omutukuvu');
  assert.equal(fixed('Yakuwa yire, yakuwa nissi'), 'Yakuwa yire, Yakuwa nissi');
  assert.equal(fixed('emmanweri ali naffe'), 'Emmanweri ali naffe');
  assert.equal(fixed("ky'oli mukama"), "ky'oli Mukama");
  assert.equal(fixed('jesus christ is lord', { language: 'en' }), 'Jesus Christ is Lord');
  assert.equal(fixed('My lord and my god', { language: 'en' }), 'My Lord and my God');
  assert.equal(fixed('o lord you are good', { language: 'en' }), 'o Lord you are good');
});

test('capitals stay quiet on false gods, human masters, verbs and ALL CAPS', () => {
  quiet('Tewali katonda omulala');
  quiet('Naye ba katonda bo be weekoledde bali ludda wa?');
  quiet('Omuddu tasinga mukama we');
  quiet('Kye yakuwa okugirya'); // yakuwa: "he gave you"
  quiet('omwoyo gwange gukusinza'); // spirit, not the Holy Spirit
  quiet('KATONDA WANGE, MUKAMA');
  quiet('A wretch like me, a god of gold', { language: 'en' });
});

// ------------------------------------------------------------------ 6. punctuation

test('punctuation: spaces around marks, doubled marks, double spaces', () => {
  assert.equal(fixed('Nkwebaza , ggwe'), 'Nkwebaza, ggwe');
  assert.equal(fixed('wange,nkwagala'), 'wange, nkwagala');
  assert.equal(fixed('Ayi Mukama !'), 'Ayi Mukama!');
  assert.equal(fixed('Tukwebaza ,,'), 'Tukwebaza,');
  assert.equal(fixed('Tukwebaza..'), 'Tukwebaza.');
  assert.equal(fixed('Amiina.Alleluya'), 'Amiina. Alleluya');
  assert.equal(fixed('Mukama  wange'), 'Mukama wange');
  assert.equal(fixed('Ani;oyo?Ye Yesu'), 'Ani; oyo? Ye Yesu');
  const [f] = checkLyrics('Nkwebaza , ggwe', DICT, { language: 'lg' });
  assert.equal(f.kind, 'punctuation');
  assert.equal(f.label, 'Nkwebaza,');
  assert.match(f.why, /No space before a comma/);
  const [g] = checkLyrics('wange,nkwagala', DICT, { language: 'lg' });
  assert.equal(g.label, ', nkwagala');
});

test('punctuation leaves ellipses, numbers, abbreviations, labels and line starts alone', () => {
  quiet('Tukwebaza...');
  quiet('Tukwebaza…');
  quiet('Yokaana 3:16');
  quiet('Abantu 1,000');
  quiet('Born in the U.S.A today', { language: 'en' });
  quiet('e.g. this one', { language: 'en' });
  quiet('   Mukama wange'); // indentation
  quiet('[Chorus x2]\nMukama wange');
  quiet('[Verse 1 ,  ]');
  quiet('Mukama wange\n\n\nYesu');
});

// ------------------------------------------------------------------ 7. spelling from the lists

test('spelling: doubled or single letters, swapped letters, letter pairs Luganda never writes', () => {
  assert.deepEqual(tags('erinya okukiriza Yerusalemi waggluu Katobda'), [
    'spelling erinya -> erinnya',
    'spelling okukiriza -> okukkiriza',
    'spelling Yerusalemi -> Yerusaalemi',
    'spelling waggluu -> waggulu',
    'spelling Katobda -> Katonda',
  ]);
  assert.equal(fixed('Erinya lyo'), 'Erinnya lyo');
  assert.equal(fixed('ERINYA LYO'), 'ERINNYA LYO');
  assert.deepEqual(tags('what a graet day', { language: 'en' }), ['spelling graet -> great']);
  const s = spellingFix('erinya', DICT, 'lg');
  assert.equal(s.fix, 'erinnya');
  assert.match(s.why, /Double letter: the Luganda Bible writes erinnya/);
});

test('spelling stays quiet on English, names, chants, title words, the other songs and "It\'s right"', () => {
  quiet("gonna okay awesome yeah I'm you're", { language: 'mixed' });
  quiet('Namasuba Kampala Mengo Namirembe Lubaga Ntinda Wakiso Kiwanuka Nalubega Ssebaggala');
  quiet('Yezu Maria Yozefu Petro Paulo Daudi Saulo Kristu Mikaeri Kizito Lwanga'); // other churches' spellings
  quiet('tunaakuyimbiranga ndikutendereza otukuumye wanfiirira tumusinze');
  quiet('Hosana hosana, yeeyee yeeyee', { language: 'mixed' }); // sung twice: meant
  quiet('nyo nyo nyo');
  quiet('Okuyiimba kwange', { title: 'Okuyiimba kwange' });
  quiet('Tumutendereze bulijjo', { known: new Set(['tumutendereze']) });
  assert.deepEqual(tags('Erinya lyo'), ['spelling Erinya -> Erinnya']);
  quiet('Erinya lyo', { ignored: ['erinya'] });
  quiet('Twagala na omwana', { ignored: ['na omwana'] });
  quiet('yesu wange', { ignored: ['yesu'] });
});

// ------------------------------------------------------------------ applying

test('applying suggestions: one at a time, all at once, and never on stale text', () => {
  const text = 'yesu mukama wange,nkwagala\nna omwana';
  const flags = checkLyrics(text, DICT, { language: 'lg' });
  assert.equal(flags.length, 4);
  assert.equal(applyLyricFix(text, flags[0]), 'Yesu mukama wange,nkwagala\nna omwana');
  assert.equal(applyLyricFixes(text, flags), "Yesu Mukama wange, nkwagala\nn'omwana");
  // The text changed under the flag: nothing happens.
  assert.equal(applyLyricFix(`x${text}`, flags[0]), `x${text}`);
  assert.equal(applyLyricFix(text, null), text);
  // Overlapping fixes: the first applied wins.
  const a = { start: 0, end: 4, word: 'yesu', fix: 'Yesu' };
  const b = { start: 2, end: 6, word: 'su m', fix: 'XX' };
  assert.equal(applyLyricFixes(text, [a, b]).slice(0, 6), 'yeXXuk');
});

// ------------------------------------------------------------------ proof view

test('proof lines: words, labels, gaps, and each tag on its word', () => {
  const text = "[Chorus]\nKatonda wange nkwebaza , ggwe\n\nTwagala na omwana\nwange,nkwagala";
  const flags = checkLyrics(text, DICT, { language: 'lg' });
  const lines = proofLines(text, flags);
  assert.equal(lines.length, 5);
  assert.deepEqual(lines[0], { start: 0, label: true, text: '[Chorus]', parts: [] });
  assert.ok(lines[2].empty);
  // The parts of a line put back together are the line.
  text.split('\n').forEach((l, i) => {
    if (!lines[i].label && !lines[i].empty) assert.equal(lines[i].parts.map((p) => p.text).join(''), l);
  });
  const hosts = lines.flatMap((l) => l.parts.filter((p) => p.flags.length).map((p) => [p.text, p.flags.map((f) => f.label)]));
  assert.deepEqual(hosts, [
    ['nkwebaza', ['nkwebaza,']],
    ['omwana', ["n'omwana"]], // the join hangs under the word it leads into
    ['nkwagala', [', nkwagala']],
  ]);
  // The stray space before the comma is its own part, highlighted.
  assert.deepEqual(
    lines[1].parts.filter((p) => p.under).map((p) => [p.text, p.under]),
    [
      ['nkwebaza', 'punctuation'],
      [' ,', 'punctuation'],
    ],
  );
  // "na", the space and "omwana" are all marked as one join.
  assert.deepEqual(
    lines[3].parts.filter((p) => p.under).map((p) => p.text),
    ['na', ' ', 'omwana'],
  );
  assert.deepEqual(proofLines('', []), [{ start: 0, empty: true, parts: [] }]);
});

// ------------------------------------------------------------------ real text

test('real Luganda verses get essentially no tags (Psalms and John, 3,340 verses)', () => {
  const found = [];
  let verses = 0;
  for (const book of [19, 43]) {
    for (const chapter of chapters('lug68', book)) {
      verses += chapter.length;
      for (const f of checkLyrics(chapter.join('\n'), DICT, { language: 'lg' })) found.push(f);
    }
  }
  assert.equal(verses, 3340);
  const serious = found.filter((f) => f.kind !== 'punctuation');
  // What is left are the Bible's own slips: "waggluu" for waggulu, "Yelusaalemi", "nga omuzira".
  assert.ok(serious.length <= 8, serious.map((f) => `${f.kind} ${f.word} -> ${f.fix}`).join('\n'));
  const spelling = found.filter((f) => f.kind === 'spelling').map((f) => f.word);
  for (const w of spelling) assert.ok(['waggluu', 'Yelusaalemi'].includes(w), w);
  assert.ok(found.length <= 10);
});

test('real words the lists have never seen: spelling tags under 0.5% of them', () => {
  // Every word found only in Psalms and John is taken out of the Luganda list, then those books are checked.
  const inBooks = new Set();
  const elsewhere = new Set();
  for (let b = 1; b <= 66; b++) {
    const target = b === 19 || b === 43 ? inBooks : elsewhere;
    for (const v of chapters('lug68', b).flat()) for (const w of wordsOf(v)) target.add(w);
  }
  const unseen = new Set([...inBooks].filter((w) => !elsewhere.has(w)));
  const dict = dictionary(unseen);
  let tokens = 0;
  const tagged = [];
  for (const b of [19, 43]) {
    for (const v of chapters('lug68', b).flat()) {
      for (const w of wordsOf(v)) if (unseen.has(w)) tokens++;
      for (const f of checkLyrics(v, dict, { language: 'lg' })) if (f.kind === 'spelling') tagged.push(f.word);
    }
  }
  assert.ok(unseen.size > 3000 && tokens > 3500);
  assert.ok(tagged.length / tokens < 0.005, `${tagged.length} of ${tokens}: ${tagged.join(' ')}`);
});

test('English verses (KJV Psalms and John) get essentially no tags', () => {
  let n = 0;
  for (const book of [19, 43]) {
    for (const chapter of chapters('kjv', book)) n += checkLyrics(chapter.join('\n'), DICT, { language: 'en' }).length;
  }
  assert.ok(n <= 2, String(n));
});

// ------------------------------------------------------------------ a song

const SONG = `[Verse 1]
Katonda wange nkwebaza , ggwe ali waggulu
yesu mukama wange,nkwagala nnyo
Twagala okuyimba na omwana wo
nga abantu bonna bakutendereza

[Chorus]
Erinya lyo litukuzibwe  mu nsi yonna
Omwoyo omutukuvu jjangu ojjuze ennyumba eno
Tukwebaza n' essanyu ,,
Okuyinba kwaffe kubeere kwa Yesu

[Verse 2]
Jesus you are my lord and my god
Hosana hosana, alleluya`;

test('a realistic song: exact suggestions, then "Fix all safe ones" leaves only spelling', () => {
  const flags = checkLyrics(SONG, DICT, { language: 'mixed', title: 'Nkwebaza Yesu' });
  assert.deepEqual(
    flags.map((f) => [f.kind, f.word, f.fix, f.label]),
    [
      ['punctuation', ' ,', ',', 'nkwebaza,'],
      ['capital', 'yesu', 'Yesu', 'Yesu'],
      ['capital', 'mukama', 'Mukama', 'Mukama'],
      ['punctuation', ',', ', ', ', nkwagala'],
      ['grammar', 'na ', "n'", "n'omwana"],
      ['grammar', 'nga ', "ng'", "ng'abantu"],
      ['spelling', 'Erinya', 'Erinnya', 'Erinnya'],
      ['punctuation', '  ', ' ', 'one space'],
      ['capital', 'omutukuvu', 'Omutukuvu', 'Omutukuvu'],
      ['punctuation', "n' ", "n'", "n'essanyu"],
      ['punctuation', ' ,,', ',', 'essanyu,'],
      ['spelling', 'Okuyinba', 'Okuyimba', 'Okuyimba'],
      ['capital', 'lord', 'Lord', 'Lord'],
      ['capital', 'god', 'God', 'God'],
    ],
  );
  for (const f of flags) assert.ok(f.why.length > 10 && !f.why.includes('\n'), f.why);
  const safe = applyLyricFixes(SONG, flags.filter((f) => SAFE_KINDS.includes(f.kind)));
  assert.equal(
    safe,
    `[Verse 1]
Katonda wange nkwebaza, ggwe ali waggulu
Yesu Mukama wange, nkwagala nnyo
Twagala okuyimba n'omwana wo
ng'abantu bonna bakutendereza

[Chorus]
Erinya lyo litukuzibwe mu nsi yonna
Omwoyo Omutukuvu jjangu ojjuze ennyumba eno
Tukwebaza n'essanyu,
Okuyinba kwaffe kubeere kwa Yesu

[Verse 2]
Jesus you are my Lord and my God
Hosana hosana, alleluya`,
  );
  assert.deepEqual(
    checkLyrics(safe, DICT, { language: 'mixed' }).map((f) => `${f.kind} ${f.word} -> ${f.fix}`),
    ['spelling Erinya -> Erinnya', 'spelling Okuyinba -> Okuyimba'],
  );
  // Fixing the spelling too leaves nothing.
  const all = applyLyricFixes(safe, checkLyrics(safe, DICT, { language: 'mixed' }));
  assert.deepEqual(checkLyrics(all, DICT, { language: 'mixed' }), []);
});

test('checking is quick enough to run as the operator types', () => {
  const long = Array.from({ length: 8 }, () => SONG).join('\n\n');
  checkLyrics(long, DICT, { language: 'mixed' }); // warm the caches
  const t = performance.now();
  for (let i = 0; i < 5; i++) checkLyrics(`${long}\nx${i}`, DICT, { language: 'mixed' });
  assert.ok((performance.now() - t) / 5 < 50);
});
