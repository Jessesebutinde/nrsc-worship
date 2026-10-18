import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { VerseIndex, terms, stem, highlight, fillIndex, BOOK_ORDER } from '../src/lyrics/search.js';
import { spokenRef, numberWords, refText } from '../src/lyrics/spoken.js';
import { BOOKS } from '../src/lyrics/books.js';

const book = (v, n) => JSON.parse(fs.readFileSync(`lyrics/bibles/${v}/${n}.json`, 'utf8'));
const en = new VerseIndex('en');
const lg = new VerseIndex('lg');
for (const n of BOOK_ORDER) {
  en.addBook(n, book('kjv', n));
  lg.addBook(n, book('lug68', n));
}
const top = (ix, q, opts) => {
  const r = ix.search(q, opts)[0];
  return r ? `${BOOKS[r.book - 1].en} ${r.chapter}:${r.verse}` : null;
};

test('every book of both Bibles is searchable', () => {
  assert.equal(BOOK_ORDER.length, 66);
  assert.equal(new Set(BOOK_ORDER).size, 66);
  assert.ok(en.size > 31000 && lg.size > 31000, `${en.size} / ${lg.size} verses`);
});

test('a few remembered words find the verse (KJV), modern or old English', () => {
  const cases = {
    'the lord is my shepherd': 'Psalms 23:1',
    'for god so loved the world': 'John 3:16',
    'I can do all things through Christ': 'Philippians 4:13',
    'be still and know that I am God': 'Psalms 46:10',
    'your word is a lamp to my feet': 'Psalms 119:105',
    'they that wait upon the lord shall renew': 'Isaiah 40:31',
    'all things work together for good': 'Romans 8:28',
    'trust in the lord with all your heart': 'Proverbs 3:5',
    'in the beginning was the word': 'John 1:1',
    'jesus wept': 'John 11:35',
    'faith is the substance of things hoped for': 'Hebrews 11:1',
    'the joy of the lord is your strength': 'Nehemiah 8:10',
    'weeping may endure for a night': 'Psalms 30:5',
    'he leads me beside still waters': 'Psalms 23:2',
  };
  for (const [q, want] of Object.entries(cases)) assert.equal(top(en, q), want, q);
});

test('a verse quoted in modern English is found through the World English Bible', () => {
  const web = new VerseIndex('en');
  for (const n of BOOK_ORDER) web.addBook(n, book('web', n));
  assert.ok(web.size > 31100, `${web.size} verses`);
  assert.equal(top(web, 'love is patient love is kind'), '1 Corinthians 13:4');
  assert.equal(top(web, 'come to me all you who are weary'), 'Matthew 11:28');
  assert.equal(top(web, 'be strong and courageous'), 'Joshua 1:9');
  // Its "Yahweh" is the KJV's "LORD".
  assert.equal(top(web, 'the lord is my shepherd I lack nothing'), 'Psalms 23:1');
});

test('Luganda words find the verse in the 1968 Bible', () => {
  const cases = {
    'Mukama ye musumba wange': 'Psalms 23:1',
    'Katonda bwe yayagala ensi': 'John 3:16',
    'Ekigambo kyo ye ttabaaza': 'Psalms 119:105',
    "Yesu n'akaaba amaziga": 'John 11:35',
    "Weesigenga Mukama n'omutima gwo gwonna": 'Proverbs 3:5',
  };
  for (const [q, want] of Object.entries(cases)) assert.equal(top(lg, q), want, q);
});

test('while typing, the last word may be unfinished', () => {
  assert.equal(top(en, 'the lord is my shep', { partial: true }), 'Psalms 23:1');
  assert.equal(top(en, 'faith is the subst', { partial: true }), 'Hebrews 11:1');
  assert.equal(top(lg, 'Mukama ye musum', { partial: true }), 'Psalms 23:1');
});

test('old and modern English are folded together; matches can be marked', () => {
  assert.equal(stem('leadeth'), stem('leads'));
  assert.equal(stem('maketh'), stem('make'));
  assert.equal(stem('thee'), stem('you'));
  assert.deepEqual(terms("Ng'ombe ŋŋombe", 'lg'), ['ng', 'ombe', 'ngngombe']);
  const parts = highlight('The LORD is my shepherd; I shall not want.', 'lord shepherd');
  assert.deepEqual(parts.filter((_, i) => i % 2), ['LORD', 'shepherd']);
});

test('the index fills book by book, the most read first', async () => {
  const ix = new VerseIndex('en');
  const seen = [];
  await fillIndex(ix, async (n) => (n === 19 || n === 43 ? book('kjv', n) : null), (c) => seen.push(c));
  assert.equal(seen.length, 66);
  assert.deepEqual([...ix.books].slice(0, 2), [19, 43]);
  assert.equal(top(ix, 'for god so loved the world'), 'John 3:16');
});

test('number words, English and Luganda, become numbers', () => {
  assert.deepEqual(numberWords('one hundred and nineteen'), [119]);
  assert.deepEqual(numberWords('three sixteen'), [3, 16]);
  assert.deepEqual(numberWords('twenty three one'), [23, 1]);
  assert.deepEqual(numberWords('amakumi abiri mu ssatu'), [23]);
  assert.deepEqual(numberWords('kkumi na mukaaga'), [16]);
  assert.deepEqual(numberWords('Psalm 23:1-4'), ['psalm', 23, 1, 'to', 4]);
});

test('a spoken reference is understood wherever it is in the sentence', () => {
  const cases = {
    'Psalm twenty three verse one to four': 'Psalm 23:1-4',
    'John three sixteen': 'John 3:16',
    'first John chapter one verse nine': '1 John 1:9',
    'turn with me to Romans 8 28': 'Romans 8:28',
    'Psalms one hundred and nineteen verse one hundred and five': 'Psalm 119:105',
    'Isaiah forty verse thirty one': 'Isaiah 40:31',
    'Zabbuli amakumi abiri mu ssatu olunyiriri olusooka': 'Psalm 23:1',
    'Yokaana essuula ssatu olunyiriri kkumi na mukaaga': 'John 3:16',
    'Matthew 5:3-10': 'Matthew 5:3-10',
    'second Corinthians five seventeen': '2 Corinthians 5:17',
    'Revelation twenty one verse four': 'Revelation 21:4',
    'John chapter three': 'John 3',
    'Philippians four versus thirteen': 'Philippians 4:13',
    'Proverbs three five and six': 'Proverbs 3:5-6',
    'let us read 1 Peter 5 7': '1 Peter 5:7',
    'Genesis one one and then Exodus twenty three': 'Exodus 23',
  };
  for (const [said, want] of Object.entries(cases)) assert.equal(refText(spokenRef(said)), want, said);
  for (const said of ['and so the pastor said', 'the lord is my shepherd', 'job well done everyone', 'we had a mark of respect']) {
    assert.equal(spokenRef(said), null, said);
  }
});

import { passageItem, groupVerses, isMany } from '../src/lyrics/bible.js';
import { parseRef } from '../src/lyrics/books.js';

const fetchBook = async (url) => {
  const m = url.match(/(lug68|kjv|web)\/(\d+)\.json$/);
  return { ok: true, status: 200, json: async () => book(m[1], +m[2]) };
};

test('many verses at once: whole verses grouped by count, or the whole passage spread evenly', async () => {
  assert.ok(isMany(2) && isMany(8) && isMany('all'));
  assert.ok(!isMany('auto') && !isMany('verse') && !isMany(1));
  const vs = Array.from({ length: 21 }, (_, i) => ({ verse: i + 1, primary: 'x'.repeat(100), secondary: '' }));
  const bk = { lg: 'Yokaana', en: 'John', code: 'JHN' };
  assert.deepEqual(groupVerses(vs, 4, { book: bk, chapter: 3 }).map((s) => s.verses.length), [4, 4, 4, 4, 4, 1]);
  // 2,100 characters over a 1,100 budget: two screens, 11 + 10, never one left over.
  assert.deepEqual(groupVerses(vs, 'all', { book: bk, chapter: 3 }).map((s) => s.verses.length), [11, 10]);
  for (const s of groupVerses(vs, 'all', { book: bk, chapter: 3 })) assert.ok(s.verses.every((v) => v.part === ''), 'verses are never split');

  const ps23 = await passageItem({ ref: parseRef('Zabbuli 23'), primaryId: 'lug68', secondaryId: '', perScreen: 'all', fetchImpl: fetchBook });
  assert.equal(ps23.many, true);
  assert.equal(ps23.perScreen, 'all');
  assert.deepEqual(ps23.slides.map((s) => s.verses.length), [6], 'Psalm 23 in Luganda fits one screen');
  assert.equal(ps23.slides[0].ref, 'Zabbuli 23 : 1-6');
  const three = await passageItem({ ref: parseRef('Zabbuli 23'), primaryId: 'lug68', secondaryId: 'kjv', perScreen: 3, fetchImpl: fetchBook });
  assert.deepEqual(three.slides.map((s) => s.verses.length), [3, 3]);
  assert.notEqual(three.id, ps23.id);
  const same = await passageItem({ ref: parseRef('Zabbuli 23'), primaryId: 'lug68', secondaryId: 'kjv', perScreen: 'auto', fetchImpl: fetchBook });
  assert.equal(same.many, false);
  assert.equal(same.perScreen, 'auto');
  const one = await passageItem({ ref: parseRef('Zabbuli 23'), primaryId: 'lug68', secondaryId: 'kjv', perScreen: 'verse', fetchImpl: fetchBook });
  assert.equal(one.perScreen, 'verse');
  assert.equal(one.flow, false);
});

test('scroll: the whole passage as one column that steps verse by verse, even with reveal off', async () => {
  const { emptyState, reduce, stepsOf } = await import('../src/lyrics/state.js');
  const it = await passageItem({ ref: parseRef('Yokaana 3:1-21'), primaryId: 'lug68', secondaryId: 'kjv', perScreen: 'scroll', fetchImpl: fetchBook });
  assert.equal(it.scroll, true);
  assert.equal(it.many, false);
  assert.equal(it.perScreen, 'scroll');
  assert.equal(it.slides.length, 1);
  assert.equal(it.slides[0].verses.length, 21);
  let s = reduce({ ...emptyState(), reveal: false }, { type: 'item', item: it }, 'r');
  assert.equal(stepsOf(s), 21);
  for (let i = 0; i < 5; i++) s = reduce(s, { type: 'next' }, 'r');
  assert.deepEqual([s.index, s.sub], [0, 5]);
});

test('one whole verse a screen, never split, grown to fit', async () => {
  assert.ok(isMany('one'));
  const it = await passageItem({ ref: parseRef('Zabbuli 23'), primaryId: 'lug68', secondaryId: 'kjv', perScreen: 'one', fetchImpl: fetchBook });
  assert.equal(it.many, true);
  assert.equal(it.perScreen, 'one');
  assert.deepEqual(it.slides.map((s) => s.verses.length), [1, 1, 1, 1, 1, 1]);
  assert.ok(it.slides.every((s) => s.verses[0].part === ''), 'never split');
  // Unlike "1 verse" at the standard size, which splits John 3:16 into a and b.
  const std = await passageItem({ ref: parseRef('Yokaana 3:16'), primaryId: 'lug68', secondaryId: 'kjv', perScreen: 'verse', fetchImpl: fetchBook });
  const one = await passageItem({ ref: parseRef('Yokaana 3:16'), primaryId: 'lug68', secondaryId: 'kjv', perScreen: 'one', fetchImpl: fetchBook });
  assert.ok(std.slides.length >= 2, 'the standard size splits a long verse');
  assert.equal(one.slides.length, 1, 'one whole verse');
});

test('one language at a time: each verse is two screens, the other language named in its reference', async () => {
  assert.ok(isMany('solo'));
  const it = await passageItem({ ref: parseRef('Yokaana 3:16-17'), primaryId: 'lug68', secondaryId: 'kjv', perScreen: 'solo', fetchImpl: fetchBook });
  assert.equal(it.many, true);
  assert.equal(it.perScreen, 'solo');
  assert.equal(it.slides.length, 4);
  assert.match(it.slides[0].verses[0].primary, /^Kubanga Katonda/);
  assert.equal(it.slides[0].secondary, '');
  assert.match(it.slides[1].verses[0].primary, /^For God so loved/, 'the other language as the main text');
  assert.equal(it.slides[1].secondary, '');
  assert.equal(it.slides[1].ref, 'Yokaana 3 : 16 · John 3 : 16 · KJV');
  assert.equal(it.slides[1].solo, 's');
  assert.equal(it.slides[0].solo, undefined);
  assert.ok(it.slides.every((s) => s.verses.length === 1 && s.verses[0].part === ''), 'never split');
  const one = await passageItem({ ref: parseRef('Yokaana 3:16'), primaryId: 'lug68', secondaryId: '', perScreen: 'solo', fetchImpl: fetchBook });
  assert.equal(one.slides.length, 1, 'one language only: one screen');
});

test('how much a long verse is broken up: more, the standard, less, or never', async () => {
  const { scaleFit, CHAR_FIT } = await import('../src/lyrics/bible.js');
  assert.equal(scaleFit(CHAR_FIT, 1), CHAR_FIT);
  assert.equal(scaleFit(CHAR_FIT, 1.5).primary.lines, CHAR_FIT.primary.lines * 1.5);
  assert.equal(scaleFit(CHAR_FIT, Infinity).secondary.lines, Infinity);
  const jn = (split) => passageItem({ ref: parseRef('Yokaana 3:16-17'), primaryId: 'lug68', secondaryId: 'kjv', perScreen: 'verse', split, fetchImpl: fetchBook });
  const std = await jn('standard');
  const more = await jn('more');
  const less = await jn('less');
  const never = await jn('never');
  assert.ok(std.slides.length >= 3, 'the standard splits John 3:16');
  assert.ok(more.slides.length >= std.slides.length);
  assert.ok(less.slides.length <= std.slides.length);
  assert.equal(never.slides.length, 2, 'never: one screen per verse');
  assert.ok(never.slides.every((s) => s.verses[0].part === ''));
  assert.equal(never.split, 'never');
  assert.equal(std.split, 'standard');
  assert.notEqual(never.id, std.id);
  assert.equal((await jn('nonsense')).split, 'standard');
  // With verses flowing on, whole verses still share a screen at the standard budget.
  const flow = await passageItem({ ref: parseRef('Zabbuli 23'), primaryId: 'lug68', secondaryId: 'kjv', perScreen: 'auto', split: 'never', fetchImpl: fetchBook });
  assert.ok(flow.slides.every((s) => s.verses.every((v) => v.part === '')), 'never split');
  const flowStd = await passageItem({ ref: parseRef('Zabbuli 23'), primaryId: 'lug68', secondaryId: 'kjv', perScreen: 'auto', fetchImpl: fetchBook });
  assert.ok(flow.slides.length <= flowStd.slides.length, 'no more screens than the standard');
  const short = await passageItem({ ref: parseRef('Yokaana 11:33-36'), primaryId: '', secondaryId: 'kjv', perScreen: 'auto', split: 'never', fetchImpl: fetchBook });
  assert.ok(short.slides.length < 4, 'short verses still share a screen');
  const { emptyState, marginOf, splitOf } = await import('../src/lyrics/state.js');
  assert.equal(marginOf(emptyState()), 'look');
  assert.equal(marginOf({ sWide: true }), 'slim', 'the older edge-to-edge switch');
  assert.equal(marginOf({ sMargin: 'none', sWide: true }), 'none');
  assert.equal(splitOf({ sSplit: 'less' }), 'less');
  assert.equal(splitOf({}), 'standard');
});
