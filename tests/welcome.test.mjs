import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, reduce, welcomeCardOf, WELCOME_PICKS, WELCOME_IDS, WELCOME_DEFAULTS, WELCOME_ENV } from '../src/lyrics/state.js';

const on = (iso) => new Date(`${iso}T10:00:00`);

test('the idle screen picks the card by the day: Sunday service, Wednesday study, Friday prayer, else welcome', () => {
  const s = emptyState();
  assert.deepEqual(s.welcome, { pick: 'auto', cards: {} });
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
