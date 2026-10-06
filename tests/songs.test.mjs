import test from 'node:test';
import assert from 'node:assert/strict';
import { fromDetected, splitSong, mergeWithNext, setEdge, sectionClips, exportPlan, addSong } from '../src/songs.js';

// Shape taken from a real ready job.
const BACKEND = [
  {
    n: 1, bpm: 117.2, key: 'E major', note: 'long', check: true, end_s: 1246.4, label: 'Song 1', medley: true, start_s: 0.0,
    sections: [
      { end_s: 44.0, label: 'Part A', start_s: 0.0 },
      { end_s: 92.0, label: 'Part A', start_s: 44.0 },
      { end_s: 294.0, label: 'Part B', start_s: 92.0 },
      { end_s: 334.0, label: 'Part B', start_s: 294.0 },
      { end_s: 786.0, label: 'Part C', start_s: 334.0 },
    ],
    medley_at: [339.0, 974.0], confidence: 62,
  },
  { n: 2, bpm: 125.0, key: 'G major', note: '', check: false, end_s: 2399.98, label: 'Song 2', medley: false, start_s: 1257.1, sections: [], medley_at: [], confidence: 80 },
];

test('fromDetected keeps names empty and generic labels out', () => {
  const songs = fromDetected(BACKEND);
  assert.equal(songs.length, 2);
  assert.equal(songs[0].name, '');
  assert.equal(songs[0].backendLabel, null);
  assert.deepEqual(songs[0].medleyAt, [339, 974]);
  assert.equal(songs[0].sections.length, 5);
});

test('split a medley at a suggested point', () => {
  let songs = fromDetected(BACKEND);
  songs[0].name = 'Way Maker';
  songs = splitSong(songs, songs[0].id, 339);
  assert.equal(songs.length, 3);
  assert.equal(songs[0].end, 339);
  assert.equal(songs[1].start, 339);
  assert.equal(songs[0].name, 'Way Maker', 'first part keeps its name');
  assert.equal(songs[1].name, '', 'new part is never auto-named');
  assert.deepEqual(songs[1].medleyAt, [974]);
  assert.equal(songs[1].bpm, null, "medley tempo isn't copied to parts");
  assert.equal(songs[0].sections.at(-1).end, 339);
  assert.equal(songs[1].sections[0].start, 339);
  // Out of range: no change.
  assert.equal(splitSong(songs, songs[0].id, 5000), songs);
});

test('merge with next', () => {
  let songs = fromDetected(BACKEND);
  songs = mergeWithNext(songs, songs[0].id);
  assert.equal(songs.length, 1);
  assert.equal(songs[0].end, 2399.98);
});

test('edges stay inside the audio and keep a minimum length', () => {
  let songs = fromDetected(BACKEND);
  const id = songs[0].id;
  songs = setEdge(songs, id, 'start', -5, 2400);
  assert.equal(songs[0].start, 0);
  songs = setEdge(songs, id, 'start', 5000, 2400);
  assert.equal(songs[0].start, 1245.4);
  songs = setEdge(songs, songs[1].id, 'end', 9999, 2400);
  assert.equal(songs[1].end, 2400);
});

test('section clips inherit the song title', () => {
  const [song] = fromDetected(BACKEND);
  song.sectionNames = { 'Part A': 'Verse', 'Part B': 'Chorus' };
  const clips = sectionClips(song, 'Way Maker');
  assert.deepEqual(
    clips.map((c) => [c.title, c.start, c.end]),
    [
      ['Way Maker - Verse', 0, 92],
      ['Way Maker - Chorus', 92, 334],
      ['Way Maker - Part C', 334, 786],
    ],
  );
});

test('export plan: selected songs, fallback names, optional clips', () => {
  let songs = fromDetected(BACKEND);
  songs[0].name = 'Way Maker';
  songs[0].clips = true;
  songs[1].selected = true;
  let plan = exportPlan(songs);
  assert.equal(plan[0].title, 'Way Maker');
  assert.equal(plan.filter((p) => p.kind === 'section').length, 3);
  assert.equal(plan.at(-1).title, 'Song 2');
  songs[1].selected = false;
  plan = exportPlan(songs);
  assert.ok(plan.every((p) => p.songId === songs[0].id));
});

test('add a missed song keeps order', () => {
  let songs = fromDetected(BACKEND);
  songs = addSong(songs, 1250, 1255);
  assert.deepEqual(songs.map((s) => s.start), [0, 1250, 1257.1]);
});
