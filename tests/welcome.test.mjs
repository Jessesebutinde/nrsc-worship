import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, reduce, welcomeCardOf, welcomeMotionOf, WELCOME_PICKS, WELCOME_IDS, WELCOME_DEFAULTS, WELCOME_ENV, WELCOME_VERSES, WELCOME_MOTIONS } from '../src/lyrics/state.js';

const on = (iso) => new Date(`${iso}T10:00:00`);

test('the idle screen picks the card by the day: Sunday service, Wednesday study, Friday prayer, else welcome', () => {
  const s = emptyState();
  assert.deepEqual(s.welcome, { pick: 'auto', cards: {}, motion: 'lively' });
  assert.equal(welcomeCardOf(s, on('2026-10-25')).id, 'sun', 'a Sunday');
  assert.equal(welcomeCardOf(s, on('2026-10-21')).id, 'wed', 'a Wednesday');
  assert.equal(welcomeCardOf(s, on('2026-10-23')).id, 'fri', 'a Friday');
  assert.equal(welcomeCardOf(s, on('2026-10-22')).id, 'any', 'a Thursday');
  assert.equal(welcomeCardOf({}, on('2026-10-25')).id, 'sun', 'an older saved state without the setting');
  assert.equal(welcomeCardOf({ welcome: { pick: 'off' } }), null, 'the plain logo');
  assert.equal(welcomeCardOf({ welcome: { pick: 'fri' } }, on('2026-10-25')).id, 'fri', 'by hand beats the day');
  assert.equal(welcomeCardOf({ welcome: { pick: 'nonsense' } }, on('2026-10-25')).id, 'sun');
  for (const id of WELCOME_IDS) {
    assert.ok(WELCOME_PICKS[id] && WELCOME_ENV[id], id);
    const c = welcomeCardOf({ welcome: { pick: id } });
    for (const k of ['kicker', 'title', 'sub', 'verse', 'ref', 'when']) assert.equal(typeof c[k], 'string', `${id}.${k}`);
  }
  assert.equal(WELCOME_DEFAULTS.sun.title, 'Welcome');
});

test('the operator\'s wording goes over the standard, line by line, and a blank line leaves it out', () => {
  const s = reduce(emptyState(), { type: 'set', patch: { welcome: { pick: 'auto', cards: { sun: { when: 'Sundays at 9:00 am', title: '' } } } } }, 'r');
  const c = welcomeCardOf(s, on('2026-10-25'));
  assert.equal(c.when, 'Sundays at 9:00 am');
  assert.equal(c.title, '', 'left out');
  assert.equal(c.verse, WELCOME_DEFAULTS.sun.verse, 'the rest stays standard');
  assert.equal(welcomeCardOf(s, on('2026-10-21')).when, WELCOME_DEFAULTS.wed.when, 'other cards untouched');
  const bad = welcomeCardOf({ welcome: { pick: 'any', cards: { any: { title: 42, extra: 'x' } } } });
  assert.equal(bad.title, 'Welcome', 'only text counts');
  assert.equal(bad.extra, undefined);
});

test('a card turns through its verses unless the operator wrote their own; the card is lively unless told otherwise', () => {
  const c = welcomeCardOf({ welcome: { pick: 'wed' } });
  assert.equal(c.verses.length, 4);
  assert.equal(c.verses[0].verse, c.verse, 'the standard verse comes first');
  assert.equal(c.verses[0].ref, c.ref);
  for (const id of WELCOME_IDS) {
    assert.equal(WELCOME_VERSES[id][0].verse, WELCOME_DEFAULTS[id].verse, id);
    for (const v of WELCOME_VERSES[id]) assert.ok(v.verse.length > 20 && /^[1-3]? ?[A-Z][a-z]+ \d+ : \d+$/.test(v.ref), `${id} ${v.ref}`);
  }
  const own = welcomeCardOf({ welcome: { pick: 'wed', cards: { wed: { verse: 'My verse.' } } } });
  assert.deepEqual(own.verses, [{ verse: 'My verse.', ref: WELCOME_DEFAULTS.wed.ref }], 'a reworded verse stays put');
  const ownRef = welcomeCardOf({ welcome: { pick: 'fri', cards: { fri: { ref: 'Luke 11 : 9' } } } });
  assert.equal(ownRef.verses.length, 1);
  assert.deepEqual(Object.keys(WELCOME_MOTIONS), ['lively', 'gentle', 'still']);
  assert.equal(emptyState().welcome.motion, 'lively');
  assert.equal(welcomeMotionOf({}), 'lively', 'an older saved state');
  assert.equal(welcomeMotionOf({ welcome: { motion: 'still' } }), 'still');
  assert.equal(welcomeMotionOf({ welcome: { motion: 'wild' } }), 'lively');
  const kept = reduce(emptyState(), { type: 'set', patch: { welcome: { pick: 'auto', cards: {}, motion: 'gentle' } } }, 'r');
  assert.equal(welcomeMotionOf(kept), 'gentle');
});
