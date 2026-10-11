import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, reduce, songItem, lineRanges } from '../src/lyrics/state.js';
import { followCommand, validKey, readFollowKeys, FOLLOW_KEYS } from '../src/lyrics/keys.js';

const song = songItem({
  id: 's',
  title: 'Amazing Grace',
  slides: [{ lines: ['Amazing grace how', 'sweet the sound'] }, { lines: ['That saved a wretch'] }, { lines: ['like me'] }],
});
const at = (s) => `${s.index}:${s.wc ? s.wc.join('-') : '-'}`;
const run = (s, cmds) => cmds.map((c) => at((s = reduce(s, c, 'r')))) && s;
const J = { type: 'word', dir: 1 };
const F = { type: 'word', dir: -1 };
const U = { type: 'word', dir: 1, unit: 'line' };

test('J moves word by word and on to the next slide after the last word', () => {
  let s = reduce(emptyState(), { type: 'item', item: song }, 'r');
  assert.equal(s.wc, null, 'a new song starts with no word picked');
  const seen = [];
  for (let i = 0; i < 12; i++) seen.push(at((s = reduce(s, J, 'r'))));
  assert.deepEqual(seen, ['0:0-0', '0:1-1', '0:2-2', '0:3-3', '0:4-4', '0:5-5', '1:0-0', '1:1-1', '1:2-2', '1:3-3', '2:0-0', '2:1-1']);
  s = reduce(s, J, 'r');
  assert.equal(at(s), '2:1-1', 'stops on the last word of the song');
});

test('F moves back, across to the previous slide, and off before the first word', () => {
  let s = reduce(emptyState(), { type: 'item', item: song, index: 1 }, 'r');
  s = run(s, [J, J]);
  assert.equal(at(s), '1:1-1');
  const seen = [];
  for (let i = 0; i < 3; i++) seen.push(at((s = reduce(s, F, 'r'))));
  assert.deepEqual(seen, ['1:0-0', '0:5-5', '0:4-4']);
  s = reduce(s, { type: 'goto', index: 0 }, 'r');
  s = reduce(s, J, 'r');
  s = reduce(s, F, 'r');
  assert.equal(at(s), '0:-', 'before the first word of the song the cursor goes off');
});

test('U lights a whole line at a time, then the next slide', () => {
  assert.deepEqual(lineRanges(song.slides[0]), [[0, 2], [3, 5]]);
  let s = reduce(emptyState(), { type: 'item', item: song }, 'r');
  const seen = [];
  for (let i = 0; i < 5; i++) seen.push(at((s = reduce(s, U, 'r'))));
  assert.deepEqual(seen, ['0:0-2', '0:3-5', '1:0-3', '2:0-1', '2:0-1']);
  s = reduce(s, { type: 'word', dir: -1, unit: 'line' }, 'r');
  assert.equal(at(s), '1:0-3');
});

test('changing slide any other way starts it with no word picked; a word can be picked directly', () => {
  let s = reduce(emptyState(), { type: 'item', item: song }, 'r');
  s = run(s, [J, J]);
  assert.equal(reduce(s, { type: 'next' }, 'r').wc, null);
  assert.equal(reduce(s, { type: 'goto', index: 0 }, 'r').wc, null, 'clicking the same slide starts it again');
  assert.equal(reduce(s, { type: 'set', patch: { index: 2 } }, 'r').wc, null);
  assert.deepEqual(reduce(s, { type: 'set', patch: { look: 'neon' } }, 'r').wc, [1, 1], 'other settings keep it');
  assert.deepEqual(reduce(s, { type: 'word', at: 4 }, 'r').wc, [4, 4]);
  assert.deepEqual(reduce(s, { type: 'word', at: 99 }, 'r').wc, [1, 1], 'a word that is not there is ignored');
  assert.equal(reduce(s, { type: 'word', off: true }, 'r').wc, null);
});

test('scripture does not follow word by word', () => {
  const scrip = { kind: 'scripture', id: 'x', versions: [], slides: [{ verses: [{ verse: 1, primary: 'Mukama ye' }] }] };
  const s = reduce(reduce(emptyState(), { type: 'item', item: scrip }, 'r'), J, 'r');
  assert.equal(s.wc, null);
});

test('J, F and U by default; other letters can be chosen, but not ones already in use', () => {
  assert.deepEqual(FOLLOW_KEYS, { next: 'j', prev: 'f', line: 'u' });
  assert.deepEqual(followCommand('j'), J);
  assert.deepEqual(followCommand('F'), F, 'Caps Lock does not matter');
  assert.deepEqual(followCommand('u'), U);
  assert.equal(followCommand('b'), null);
  assert.deepEqual(followCommand('k', { next: 'k', prev: 'd', line: 'i' }), J);
  for (const k of [' ', 'b', 'c', 'l', 'v', '.', 'ArrowRight', 'jj', '']) assert.equal(validKey(k), false, k);
  for (const k of ['j', 'f', 'u', 'k', 'd', '7']) assert.equal(validKey(k), true, k);
  // No storage here (node): the defaults.
  assert.deepEqual(readFollowKeys(), FOLLOW_KEYS);
});

test('text size steps: Smaller, Standard, Large, Larger, Huge, never past the ends', async () => {
  const { TEXT_SIZES, stepSize } = await import('../src/lyrics/state.js');
  assert.deepEqual(TEXT_SIZES, [0.85, 1, 1.2, 1.4, 1.7]);
  assert.equal(stepSize(1, 1), 1.2);
  assert.equal(stepSize(1.2, 1), 1.4);
  assert.equal(stepSize(1.7, 1), 1.7);
  assert.equal(stepSize(1, -1), 0.85);
  assert.equal(stepSize(0.85, -1), 0.85);
  assert.equal(stepSize(undefined, 1), 1.2, 'no size yet counts as Standard');
  const e = emptyState();
  assert.equal(e.lSize, 1);
  assert.equal(e.sSize, 1);
});
