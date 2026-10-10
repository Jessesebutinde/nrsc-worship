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
