import test from 'node:test';
import assert from 'node:assert/strict';
import { versesFromJson, versesFromText, listBibles, fetchChapter, onlineId, isOnlineId, API_BASE } from '../src/lyrics/online.js';
import { loadChapter, passageItem, onlineVersions } from '../src/lyrics/bible.js';
import { parseRef } from '../src/lyrics/books.js';

// A chapter as the service returns it (content-type=json): paragraphs, a poetry line, a character
// style around some words, a verse-number marker, a section title with no verse id.
const content = [
  { name: 'para', type: 'tag', attrs: { style: 's1' }, items: [{ text: 'The Beginning', type: 'text' }] },
  {
    name: 'para',
    type: 'tag',
    attrs: { style: 'p' },
    items: [
      { name: 'verse', type: 'tag', attrs: { number: '1', style: 'v', sid: 'GEN 1:1' }, items: [{ text: '1', type: 'text' }] },
      { text: 'In the beginning God created the heavens and the earth. ', type: 'text', attrs: { verseId: 'GEN.1.1', verseOrgIds: ['GEN.1.1'] } },
      { name: 'verse', type: 'tag', attrs: { number: '2', style: 'v' }, items: [{ text: '2', type: 'text' }] },
      { text: 'Now the earth was formless and empty, ', type: 'text', attrs: { verseId: 'GEN.1.2' } },
      {
        name: 'char',
        type: 'tag',
        attrs: { style: 'nd' },
        items: [{ text: 'darkness', type: 'text', attrs: { verseId: 'GEN.1.2' } }],
      },
      { text: ' was over the surface of the deep. ', type: 'text', attrs: { verseId: 'GEN.1.2' } },
    ],
  },
  { name: 'para', type: 'tag', attrs: { style: 'q1' }, items: [{ text: 'And God said, “Let there be light,”', type: 'text', attrs: { verseId: 'GEN.1.3' } }] },
  { name: 'para', type: 'tag', attrs: { style: 'q2' }, items: [{ text: 'and there was light.', type: 'text', attrs: { verseId: 'GEN.1.3' } }] },
];

test('verses are gathered by verse id, whatever paragraphs and styles they sit in', () => {
  const v = versesFromJson(content);
  assert.equal(v.length, 3);
  assert.equal(v[0], 'In the beginning God created the heavens and the earth.');
  assert.equal(v[1], 'Now the earth was formless and empty, darkness was over the surface of the deep.');
  assert.equal(v[2], 'And God said, “Let there be light,” and there was light.');
  assert.deepEqual(versesFromText('The Beginning\n [1] In the beginning God created the heavens and the earth. \n [2] Now the earth was formless. \n'), [
    'In the beginning God created the heavens and the earth.',
    'Now the earth was formless.',
  ]);
  assert.deepEqual(versesFromText('[2] only two'), ['', 'only two'], 'a missing verse is an empty string');
});

const fakeApi = (log = []) => async (url, opts) => {
  log.push([url, opts && opts.headers && opts.headers['api-key']]);
  const u = new URL(url);
  if (u.pathname.endsWith('/bibles'))
    return {
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          { id: 'zzz-01', abbreviation: 'LUG', name: 'Luganda test', language: { id: 'lug', name: 'Luganda' } },
          { id: 'niv-01', abbreviation: 'NIV', name: 'New International Version', language: { id: 'eng', name: 'English' }, copyright: '© Biblica' },
          { id: 'fra-01', abbreviation: 'LSG', name: 'Louis Segond', language: { id: 'fra', name: 'French' } },
          { id: 'amp-01', abbreviation: 'AMP', name: 'Amplified Bible', language: { id: 'eng', name: 'English' } },
        ],
      }),
    };
  const m = u.pathname.match(/\/bibles\/([^/]+)\/chapters\/([A-Z0-9]+)\.(\d+)$/);
  if (m) {
    if (opts.headers['api-key'] !== 'good-key') return { ok: false, status: 401, json: async () => ({}) };
    if (m[2] === 'GEN' && m[3] === '1')
      return { ok: true, status: 200, json: async () => ({ data: { id: 'GEN.1', content, copyright: 'Holy Bible, New International Version® © Biblica' }, meta: { fumsToken: 'tok-1' } }) };
    return { ok: false, status: 404, json: async () => ({}) };
  }
  return { ok: false, status: 500, json: async () => ({}) };
};

test('the Bibles a key may use are listed, English and Luganda first', async () => {
  const log = [];
  const list = await listBibles('good-key', fakeApi(log));
  assert.deepEqual(list.map((b) => b.abbreviation), ['AMP', 'NIV', 'LUG', 'LSG']);
  assert.deepEqual(list.map((b) => b.lang), ['en', 'en', 'lg', 'other']);
  assert.equal(list[1].copyright, '© Biblica');
  assert.equal(log[0][0], `${API_BASE}/bibles`);
  assert.equal(log[0][1], 'good-key', 'the key travels in the api-key header');
});

test('a chapter is fetched with the verse text only, and a bad key or missing chapter says so plainly', async () => {
  const ch = await fetchChapter('good-key', 'niv-01', 'GEN', 1, fakeApi());
  assert.equal(ch.verses.length, 3);
  assert.match(ch.copyright, /Biblica/);
  await assert.rejects(() => fetchChapter('bad-key', 'niv-01', 'GEN', 1, fakeApi()), /key was not accepted/);
  await assert.rejects(() => fetchChapter('good-key', 'niv-01', 'EXO', 1, fakeApi()), /not in this online Bible/);
  await assert.rejects(() => fetchChapter('good-key', 'niv-01', 'GEN', 1, async () => { throw new Error('offline'); }), /could not be reached/);
});

test('an online Bible is a version like any other: its chapters load on demand and are kept', async () => {
  assert.equal(onlineId('niv-01'), 'api:niv-01');
  assert.ok(isOnlineId('api:niv-01') && !isOnlineId('kjv'));
  const config = { key: 'good-key', bibles: [{ id: 'niv-01', abbreviation: 'NIV', name: 'New International Version', lang: 'en', copyright: '' }] };
  const vs = onlineVersions(config);
  assert.equal(vs.length, 1);
  assert.deepEqual([vs[0].id, vs[0].label, vs[0].lang, vs[0].online, vs[0].bibleId], ['api:niv-01', 'NIV', 'en', true, 'niv-01']);
  const store = new Map();
  const log = [];
  const opts = { fetchImpl: fakeApi(log), config, store: { get: async (k) => store.get(k), set: async (k, v) => store.set(k, v) } };
  const first = await loadChapter('api:niv-01', 1, 1, opts);
  assert.equal(first.length, 3);
  const again = await loadChapter('api:niv-01', 1, 1, opts);
  assert.equal(again[0], first[0]);
  assert.equal(log.filter(([u]) => /chapters/.test(u)).length, 1, 'the second time comes from the laptop');
  assert.ok(store.has('api:niv-01/1'), 'kept in the browser store');
  // A whole passage from the online version, with the KJV below it from the app's own files.
  const files = async (url) => {
    const m = url.match(/(lug68|kjv|web)\/(\d+)\.json$/);
    if (!m) return opts.fetchImpl(url, { headers: { 'api-key': 'good-key' } });
    const fs = await import('node:fs');
    return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(`lyrics/bibles/${m[1]}/${m[2]}.json`, 'utf8')) };
  };
  const item = await passageItem({ ref: parseRef('Genesis 1:1-2'), primaryId: 'api:niv-01', secondaryId: 'kjv', perScreen: 'one', fetchImpl: files, config, store: opts.store });
  assert.equal(item.slides.length, 2);
  assert.equal(item.slides[0].verses[0].primary, 'In the beginning God created the heavens and the earth.');
  assert.match(item.slides[0].verses[0].secondary, /^In the beginning God created the heaven and the earth/);
  assert.deepEqual(item.versions, ['NIV', 'KJV']);
});
