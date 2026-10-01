import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../shared.js';

const W = globalThis.NRSCWorship;
const THEMES = [
  { id: 1, name: 'Glory of God' }, { id: 2, name: 'Prayer' }, { id: 3, name: 'Praise & Victory' }, { id: 4, name: 'Holy Spirit' },
];

test('CSV parser handles quotes, commas, line breaks and semicolons', () => {
  const rows = W.parseCSV('title,lyrics\n"Yesu, Yesu","Line 1\nLine ""2"""\r\nNext,x\n');
  assert.deepEqual(rows, [['title', 'lyrics'], ['Yesu, Yesu', 'Line 1\nLine "2"'], ['Next', 'x']]);
  assert.deepEqual(W.parseCSV('title;key\nA;G'), [['title', 'key'], ['A', 'G']]);
});

test('CSV import maps loose headers, themes and warns about unknown ones', () => {
  const csv = [
    'Song Title,Other title,Lang,Type,Key,BPM,YouTube,Themes,Luganda,English',
    'Tukutendereza Yesu,We praise you Jesus,both,fast,g,120,youtu.be/abc123,"Glory of God; praise and victory; Joy",Tukutendereza,We praise you',
    'Nkwagala,,lg,,,,,Prayer,Nkwagala nnyo,',
  ].join('\n');
  const { format, rows } = W.parseImport(csv, THEMES);
  assert.equal(format, 'csv');
  assert.equal(rows.length, 2);
  const [a, b] = rows;
  assert.deepEqual(a.errors, []);
  assert.equal(a.song.title, 'Tukutendereza Yesu');
  assert.equal(a.song.title_alt, 'We praise you Jesus');
  assert.equal(a.song.session, 'praise');
  assert.equal(a.song.language, 'both');
  assert.equal(a.song.song_key, 'G');
  assert.equal(a.song.tempo_bpm, 120);
  assert.equal(a.song.youtube_url, 'https://youtu.be/abc123');
  assert.deepEqual(a.theme_ids, [1, 3]);
  assert.match(a.warnings.join(' '), /Unknown theme: Joy/);
  assert.equal(b.song.session, 'praise'); // missing session → Praise, with a warning
  assert.match(b.warnings.join(' '), /No session given/);
  assert.equal(b.song.language, 'luganda');
  assert.deepEqual(b.theme_ids, [2]);
});

test('pasted text import: header lines, [Luganda]/[English] parts, --- between songs', () => {
  const text = `Tukutendereza Yesu
Alt: We praise you Jesus
Session: Praise
Key: G
Themes: Glory of God, Holy Spirit

[Luganda]
Tukutendereza Yesu
Yesu Omwana gw'endiga

[English]
We praise you Jesus
---
Title: Mwoyo Mutukuvu
Session: worship
Language: Luganda

Mwoyo Mutukuvu jjangu
Jjangu otujjuze
---

---
Broken Song
Session: medium`;
  const { format, rows } = W.parseImport(text, THEMES);
  assert.equal(format, 'text');
  assert.equal(rows.length, 3);
  assert.equal(rows[0].song.title, 'Tukutendereza Yesu');
  assert.equal(rows[0].song.title_alt, 'We praise you Jesus');
  assert.equal(rows[0].song.lyrics_luganda, "Tukutendereza Yesu\nYesu Omwana gw'endiga");
  assert.equal(rows[0].song.lyrics_english, 'We praise you Jesus');
  assert.equal(rows[0].song.language, 'both');
  assert.deepEqual(rows[0].theme_ids, [1, 4]);
  assert.equal(rows[1].song.session, 'worship');
  assert.equal(rows[1].song.lyrics_luganda, 'Mwoyo Mutukuvu jjangu\nJjangu otujjuze');
  assert.match(rows[2].errors.join(' '), /Praise or Worship/);
});

test('duplicate titles inside one import are flagged', () => {
  const { rows } = W.parseImport('title,session\nAmazing Grace,worship\namazing grace,worship', THEMES);
  assert.deepEqual(rows[0].errors, []);
  assert.match(rows[1].errors[0], /Same title as song 1/);
});

test('song validation (the add/edit form is strict)', () => {
  const bad = W.validateSong({ title: ' ', session: '', tempo_bpm: '500', youtube_url: 'https://vimeo.com/1' });
  assert.ok(bad.errors.title && bad.errors.session && bad.errors.tempo_bpm && bad.errors.youtube_url);
  const ok = W.validateSong({ title: '  Nkwagala  ', session: 'worship', lyrics_english: 'I love you', tempo_bpm: '72 bpm' });
  assert.deepEqual(ok.errors, {});
  assert.equal(ok.song.title, 'Nkwagala');
  assert.equal(ok.song.language, 'english');
  assert.equal(ok.song.tempo_bpm, 72);
});

test('set list WhatsApp text: date, theme, sections in order', () => {
  const set = {
    service_date: '2026-10-04', theme: { name: 'Prayer' }, leader_name: 'Ruth',
    items: [
      { section: 'worship', position: 1, song: { title: 'Mwoyo Mutukuvu' } },
      { section: 'praise', position: 1, song: { title: 'Tukutendereza Yesu' } },
      { section: 'praise', position: 2, song: { title: 'Ekitiibwa' } },
    ],
  };
  const text = W.shareText({ ...set, items: [set.items[1], set.items[2], set.items[0]] }, 'https://x.app/set.html?id=1');
  assert.equal(text, [
    '🎶 *NRSC Worship — Sunday 4 October 2026*',
    'Theme: *Prayer*',
    'Leading: Ruth',
    '',
    '*PRAISE*',
    '1. Tukutendereza Yesu',
    '2. Ekitiibwa',
    '',
    '*WORSHIP*',
    '1. Mwoyo Mutukuvu',
    '',
    'https://x.app/set.html?id=1',
  ].join('\n'));
  assert.match(W.whatsappUrl(text), /^https:\/\/wa\.me\/\?text=%F0%9F%8E%B6/);
});

test('suggestions follow the theme, split by session, recently sung last', () => {
  const songs = [
    { id: 1, title: 'B song', session: 'praise', theme_ids: [2] },
    { id: 2, title: 'A song', session: 'praise', theme_ids: [2] },
    { id: 3, title: 'Slow', session: 'worship', theme_ids: [2, 1] },
    { id: 4, title: 'Other theme', session: 'praise', theme_ids: [1] },
  ];
  const s = W.suggestSongs(songs, 2, { 2: '2026-09-27' }, '2026-10-04', []);
  assert.deepEqual(s.praise.map((x) => x.song.id), [1, 2]);
  assert.equal(s.praise[1].recent, true);
  assert.deepEqual(s.worship.map((x) => x.song.id), [3]);
  assert.deepEqual(W.suggestSongs(songs, 2, {}, '2026-10-04', [1]).praise.map((x) => x.song.id), [2]);
});

test('dates: next Sunday in Kampala time and friendly formatting', () => {
  assert.equal(W.nextSunday(new Date('2026-10-01T09:00:00Z')), '2026-10-04'); // Thursday
  assert.equal(W.nextSunday(new Date('2026-10-04T08:00:00Z')), '2026-10-04'); // Sunday itself
  assert.equal(W.nextSunday(new Date('2026-10-03T22:30:00Z')), '2026-10-04'); // Sat 22:30 UTC = Sun 01:30 Kampala
  assert.equal(W.formatDate('2026-10-04'), 'Sunday 4 October 2026');
  assert.equal(W.formatDate('2026-10-04', true), 'Sun 4 Oct');
});

test('library filters: bilingual songs show under both languages', () => {
  const both = { title: 'X', language: 'both', session: 'praise', theme_ids: [1] };
  assert.equal(W.matchesFilters(both, { language: 'english' }), true);
  assert.equal(W.matchesFilters(both, { language: 'luganda' }), true);
  assert.equal(W.matchesFilters({ ...both, language: 'luganda' }, { language: 'english' }), false);
  assert.equal(W.matchesFilters(both, { session: 'worship' }), false);
  assert.equal(W.matchesFilters(both, { theme: '1', text: 'x' }), true);
});
