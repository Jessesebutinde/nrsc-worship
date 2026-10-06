import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSetlist,
  sanitizeFilename,
  songFileBase,
  displayName,
  smartTitleCase,
  isGenericLabel,
  emptyLibrary,
  libraryRecord,
  libraryList,
  libraryAdd,
  libraryRename,
  libraryHide,
  mergeLibraries,
  suggestNames,
  normalizeTitle,
} from '../src/naming.js';
import { youtubeId, canonicalUrl } from '../src/youtube.js';
import { fmtTime, parseTime } from '../src/util.js';

test('setlist pasted from WhatsApp', () => {
  const text = `[10/5/26, 8:14 AM] Grace Worship: Setlist for Sunday 🙌
1. Way Maker - Sinach (Key of E)
2) goodness of god
3. BUILD MY LIFE – Pat Barrett
• Ọlọrun Ọba [Bb]
- Here I Am to Worship by Tim Hughes
5 - Holy Forever 72bpm
🎵 What a Beautiful Name 4:51

https://youtu.be/abcdefghijk`;
  const titles = parseSetlist(text).map((l) => l.title);
  assert.deepEqual(titles, [
    'Way Maker',
    'Goodness of God',
    'Build My Life',
    'Ọlọrun Ọba',
    'Here I Am to Worship',
    'Holy Forever',
    'What a Beautiful Name',
  ]);
});

test('setlist: keep text after a dash when asked', () => {
  const [l] = parseSetlist('1. Jesus - Lord of All', { dropArtist: false });
  assert.equal(l.title, 'Jesus - Lord of All');
});

test('setlist: header-only lines are skipped', () => {
  assert.deepEqual(parseSetlist('Setlist:\nWorship\n\nSongs\nOceans').map((l) => l.title), ['Oceans']);
});

test('setlist: "in G" key endings', () => {
  assert.equal(parseSetlist('Great Are You Lord in G')[0].title, 'Great Are You Lord');
  assert.equal(parseSetlist('Way maker key: E')[0].title, 'Way maker');
});

test('file names', () => {
  assert.equal(sanitizeFilename('What/a: "Beautiful" Name?'), 'What a Beautiful Name');
  assert.equal(songFileBase(0, 'Way Maker'), '01 - Way Maker');
  assert.equal(songFileBase(11, '  '), '12 -');
  assert.equal(songFileBase(2, '...'), '03 -');
  assert.equal(sanitizeFilename('..hidden.'), 'hidden');
});

test('display name falls back to "Song N"', () => {
  assert.equal(displayName({ name: '' }, 2), 'Song 3');
  assert.equal(displayName({ name: '  Oceans ' }, 0), 'Oceans');
});

test('generic backend labels are not names', () => {
  assert.ok(isGenericLabel('Song 1'));
  assert.ok(isGenericLabel('song'));
  assert.ok(isGenericLabel(null));
  assert.ok(!isGenericLabel('Way Maker'));
});

test('title case only for all-lower or all-caps', () => {
  assert.equal(smartTitleCase('this is amazing grace'), 'This Is Amazing Grace');
  assert.equal(smartTitleCase('GOD OF THE CITY'), 'God of the City');
  assert.equal(smartTitleCase('iTunes Song'), 'iTunes Song');
});

test('library learns and forgets per song', () => {
  let lib = emptyLibrary();
  lib = libraryRecord(lib, 'job1:a', 'Way Maker', { bpm: 68, key: 'E major' }, 1000);
  lib = libraryRecord(lib, 'job2:b', 'way maker', { bpm: 70 }, 2000);
  lib = libraryRecord(lib, 'job2:c', 'Oceans', {}, 2000);
  let list = libraryList(lib);
  assert.equal(list[0].title, 'Way Maker');
  assert.equal(list[0].count, 2);
  // Renaming a song moves its use to the new title.
  lib = libraryRecord(lib, 'job2:b', 'Goodness of God', {}, 3000);
  list = libraryList(lib);
  assert.equal(list.find((i) => i.title === 'Way Maker').count, 1);
  // Clearing the name removes the use.
  lib = libraryRecord(lib, 'job2:c', '', {}, 3000);
  assert.equal(list.length, 3);
  assert.equal(libraryList(lib).find((i) => i.title === 'Oceans').count, 0);
});

test('library add, rename (merges), hide, merge', () => {
  let lib = libraryAdd(emptyLibrary(), 'Oceans');
  lib = libraryRecord(lib, 'j:1', 'Oceanz', {});
  lib = libraryRename(lib, normalizeTitle('Oceanz'), 'Oceans');
  assert.equal(libraryList(lib).length, 1);
  assert.equal(libraryList(lib)[0].count, 1);
  lib = libraryHide(lib, 'oceans');
  assert.equal(libraryList(lib).length, 0);
  const other = libraryAdd(emptyLibrary(), 'Holy Forever');
  assert.equal(libraryList(mergeLibraries(lib, other)).length, 1);
});

test('suggestions: never invent, rank by typing, tempo is only a hint', () => {
  let lib = emptyLibrary();
  lib = libraryRecord(lib, 'j:1', 'Way Maker', { bpm: 68, key: 'E major' });
  lib = libraryRecord(lib, 'j:2', 'Goodness of God', { bpm: 63 });
  lib = libraryRecord(lib, 'j:3', 'Goodness of God', { bpm: 63 });
  lib = libraryRecord(lib, 'j:4', 'What a Beautiful Name', { bpm: 68 });

  const song = { name: '', bpm: 136, key: 'E major', backendLabel: null };
  const s1 = suggestNames({ song, library: lib });
  assert.equal(s1[0].title, 'Way Maker', 'double tempo + same key ranks first');
  assert.match(s1[0].reason, /similar tempo/);
  assert.ok(s1.every((s) => s.source === 'library'));

  const s2 = suggestNames({ song, typed: 'good', library: lib });
  assert.equal(s2[0].title, 'Goodness of God');
  const s3 = suggestNames({ song, typed: 'wm', library: lib });
  assert.equal(s3[0].title, 'Way Maker');

  // Names used elsewhere in this service sink to the bottom.
  const s4 = suggestNames({ song, library: lib, taken: ['Way Maker'] });
  assert.equal(s4[s4.length - 1].title, 'Way Maker');
  assert.ok(s4[s4.length - 1].taken);

  // Backend label shown only if it is a real name.
  assert.equal(suggestNames({ song: { ...song, backendLabel: 'Song 2' }, library: emptyLibrary() }).length, 0);
  const s5 = suggestNames({ song: { ...song, backendLabel: 'Oceans' }, library: emptyLibrary() });
  assert.equal(s5[0].source, 'backend');

  // Setlist lines not yet used.
  const s6 = suggestNames({ song, library: emptyLibrary(), setlist: [{ title: 'A' }, { title: 'B' }], taken: ['A'] });
  assert.deepEqual(s6.map((s) => s.title), ['B']);
});

test('youtube ids', () => {
  const id = 'M4fXU0hLHis';
  for (const u of [
    `https://www.youtube.com/live/${id}?si=UJqHV1puwb5VB4o4`,
    `https://youtu.be/${id}`,
    `youtube.com/watch?v=${id}&t=10`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://www.youtube.com/shorts/${id}`,
    id,
  ]) {
    assert.equal(youtubeId(u), id, u);
  }
  assert.equal(youtubeId('https://vimeo.com/123'), null);
  assert.equal(youtubeId('hello'), null);
  assert.equal(canonicalUrl(id), `https://www.youtube.com/watch?v=${id}`);
});

test('time formatting and parsing', () => {
  assert.equal(fmtTime(0), '0:00');
  assert.equal(fmtTime(1246.4), '20:46');
  assert.equal(fmtTime(3725), '1:02:05');
  assert.equal(fmtTime(59.96, { tenths: true }), '1:00.0');
  assert.equal(parseTime('20:46.4'), 1246.4);
  assert.equal(parseTime('1:02:05'), 3725);
  assert.equal(parseTime('90'), 90);
  assert.equal(parseTime('abc'), null);
});
