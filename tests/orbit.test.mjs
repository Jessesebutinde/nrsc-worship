import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { locateVerse, verseAt, peekOf, matchBooks, BOOK_GROUPS, perScreenOf } from '../src/lyrics/calendar.js';
import { droppedPicture, googleUrl, titleOf, isVideoUrl } from '../src/lyrics/media.js';
import { passageItem } from '../src/lyrics/bible.js';
import { parseRef } from '../src/lyrics/books.js';

const fetchBook = async (url) => {
  const m = url.match(/(lug68|kjv|web)\/(\d+)\.json$/);
  return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(`lyrics/bibles/${m[1]}/${m[2]}.json`, 'utf8')) };
};

test('a verse tile knows where its verse sits in the passage that is up, and which verse is being read', async () => {
  const it = await passageItem({ ref: parseRef('Zabbuli 23'), primaryId: 'lug68', secondaryId: 'kjv', perScreen: 3, fetchImpl: fetchBook });
  assert.deepEqual(locateVerse(it, 1), { index: 0, sub: 0 });
  assert.deepEqual(locateVerse(it, 5), { index: 1, sub: 1 });
  assert.equal(locateVerse(it, 9), null, 'not in the passage');
  assert.equal(verseAt(it, 1, 1), 5);
  assert.equal(verseAt(it, 1, 99), 6, 'past the end of the slide: its last verse');
  // A long verse split in two: the tile goes to its first half.
  const jn = await passageItem({ ref: parseRef('Yokaana 3:16-17'), primaryId: 'lug68', secondaryId: 'kjv', perScreen: 'verse', fetchImpl: fetchBook });
  const at = locateVerse(jn, 16);
  assert.deepEqual(at, { index: 0, sub: 0 });
  assert.ok(jn.slides[at.index].verses[at.sub].part === 'a' || jn.slides[at.index].verses[at.sub].part === '');
  assert.equal(locateVerse(null, 1), null);
});

test('tiles show the first words; typed letters find books in either language', () => {
  assert.equal(peekOf('1 Mukama ye musumba wange; sirisubwa.'), 'Mukama ye musumba');
  assert.equal(peekOf('   '), '');
  assert.equal(matchBooks('').length, 66);
  assert.deepEqual(matchBooks('zab').map((b) => b.en), ['Psalms']);
  assert.deepEqual(matchBooks('psalm').map((b) => b.en), ['Psalms']);
  assert.ok(matchBooks('yok').map((b) => b.en).includes('John'));
  assert.deepEqual(matchBooks('1 cor').map((b) => b.en), ['1 Corinthians']);
  assert.equal(matchBooks('zzz').length, 0);
  assert.deepEqual(BOOK_GROUPS.map(([, a, z]) => [a, z]), [[1, 39], [40, 66]]);
  assert.equal(perScreenOf({ perScreen: 'scroll' }), 'scroll');
  assert.equal(perScreenOf({ perScreen: 3 }), 3);
  assert.equal(perScreenOf({ perVerse: true }), 'verse');
  assert.equal(perScreenOf({}), 'auto');
});

const dt = (data, files = []) => ({ files, items: [], getData: (t) => data[t] || '' });

test('a picture dragged or pasted from the Google window is understood whichever way the browser describes it', () => {
  const png = { type: 'image/png', name: 'a.png' };
  assert.deepEqual(droppedPicture(dt({}, [png, { type: 'text/plain', name: 'x.txt' }])), { files: [png] });
  assert.deepEqual(droppedPicture(dt({ 'text/uri-list': '# comment\r\nhttps://example.org/pic.jpg\r\n' })), { url: 'https://example.org/pic.jpg' });
  assert.deepEqual(droppedPicture(dt({ 'text/html': '<meta charset="utf-8"><img src="https://example.org/a.jpg?x=1&amp;y=2" alt="">' })), { url: 'https://example.org/a.jpg?x=1&y=2' });
  assert.deepEqual(droppedPicture(dt({ 'text/plain': 'https://example.org/b.png' })), { url: 'https://example.org/b.png' });
  const data = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
  assert.deepEqual(droppedPicture(dt({ 'text/uri-list': data })), { url: data });
  assert.equal(droppedPicture(dt({ 'text/plain': 'just some words' })), null);
  assert.equal(droppedPicture(dt({ 'text/plain': 'javascript:alert(1)' })), null);
  assert.equal(droppedPicture(null), null);
});

test('Google opens on pictures or the web; titles come from file names and links', () => {
  assert.equal(googleUrl('prodigal son painting'), 'https://www.google.com/search?q=prodigal+son+painting&tbm=isch');
  assert.equal(googleUrl(' good samaritan ', 'web'), 'https://www.google.com/search?q=good+samaritan');
  assert.equal(titleOf('https://example.org/images/The_Good-Samaritan.jpg?size=large'), 'The Good Samaritan');
  assert.equal(titleOf(''), 'Picture');
  assert.ok(isVideoUrl('https://x/y.mp4?t=1') && !isVideoUrl('https://x/y.jpg'));
});
