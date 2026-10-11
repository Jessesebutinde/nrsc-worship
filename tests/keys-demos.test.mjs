import test from 'node:test';
import assert from 'node:assert/strict';
import { parseChord, voicing, bassNote, timeline, transposeChord } from '../src/keys/music.js';
import { ROLES, phrase } from '../src/keys/phrases.js';
import { SOUND_GUIDE, RIG_GUIDE, STYLES, soundDemo, rigDemo, BED_PROGRAMS, KIT_FOR_STYLE } from '../src/keys/guide.js';
import { PRESETS, presetById } from '../src/keys/presets.js';
import { COMBOS, COMBO_GROUPS, combosIn, buildPerformance, comboById } from '../src/keys/combos.js';
import { SONGBOOK, SONG_STYLES, songPerformance, demoBars } from '../src/keys/songbook.js';
import { GROOVES } from '../src/keys/looper.js';
import { DemoPlayer } from '../src/keys/demo.js';
import { Router } from '../src/keys/router.js';
import { newPart } from '../src/keys/state.js';

test('chord symbols parse to pitch classes, slash basses and extensions', () => {
  assert.deepEqual(parseChord('C').pcs, [0, 4, 7]);
  assert.deepEqual(parseChord('F#m7/C#').pcs, [6, 9, 1, 4]);
  assert.equal(parseChord('F#m7/C#').bass, 1);
  assert.deepEqual(parseChord('Bbmaj7').intervals, [0, 4, 7, 11]);
  assert.deepEqual(parseChord('A7sus4').intervals, [0, 5, 7, 10]);
  assert.ok(parseChord('Bm(add9)').intervals.includes(14), 'unknown suffix keeps the 9th it names');
  assert.equal(parseChord('N.C.'), null);
  assert.equal(transposeChord('F#m7/C#', -1), 'Fm7/C');
});

test('voicings stay in range, keep their chord tones and move smoothly', () => {
  let prev = null;
  for (const name of ['G', 'D/F#', 'Em7', 'Cadd9', 'G']) {
    const c = parseChord(name);
    const v = voicing(c, { low: 55, high: 79, size: 4, prev });
    assert.equal(v.length, 4, name);
    assert.ok(v[0] >= 55 && v[3] <= 79, `${name} ${v}`);
    for (const n of v) assert.ok(c.pcs.includes(n % 12), `${name}: ${n} is a chord tone`);
    if (prev) assert.ok(v.reduce((s, x, i) => s + Math.abs(x - prev[i]), 0) <= 16, `${name} moves smoothly`);
    prev = v;
  }
  assert.equal(bassNote(parseChord('D/F#'), { low: 28, high: 47 }) % 12, 6);
  const tl = timeline(['C', ['F', 'G'], '%']);
  assert.deepEqual(tl.map((s) => [s.beat, s.dur, s.chord.name]), [[0, 4, 'C'], [4, 2, 'F'], [6, 6, 'G']]);
});

test('every playing role produces notes inside its range, in time, with sane lengths', () => {
  const tl = timeline(['A', 'D', 'E7', 'F#m7']);
  for (const [name, role] of Object.entries(ROLES)) {
    if (name === 'drums') continue;
    const ev = phrase(name, { tl });
    assert.ok(ev.length > 0, `${name} plays`);
    const [lo, hi] = role.range;
    for (const e of ev) {
      assert.ok(e.note >= lo - 12 && e.note <= hi + 12, `${name}: note ${e.note} near ${lo}-${hi}`);
      assert.ok(e.beat >= 0 && e.beat < 16 && e.dur > 0 && e.dur <= 16 && e.vel >= 1 && e.vel <= 127, `${name}: ${JSON.stringify(e)}`);
    }
    if (role.mono) {
      // a single line: never two notes starting together
      const starts = ev.map((e) => e.beat.toFixed(3));
      assert.equal(new Set(starts).size, starts.length, `${name} is one note at a time`);
    }
  }
  // seeded: the same demo every time
  assert.deepEqual(phrase('lead', { tl, seed: 3 }), phrase('lead', { tl, seed: 3 }));
});

test('every sound has a demo and a tip, and every demo plays', () => {
  for (const p of PRESETS) {
    const g = SOUND_GUIDE[p.id];
    assert.ok(g, `${p.id} has a guide`);
    assert.ok(g.tip && g.tip.length > 20, `${p.id} has a tip`);
    assert.ok(STYLES[g.style], `${p.id} style ${g.style}`);
    const d = soundDemo(p.id);
    assert.ok(d.bpm > 30 && d.beats >= 16, p.id);
    assert.ok(d.tracks.reduce((n, t) => n + t.events.length, 0) > 0, `${p.id} plays notes`);
    const bed = d.tracks.find((t) => t.part === 'bed');
    if (bed) assert.ok(BED_PROGRAMS[bed.preset] || presetById(bed.preset), `${p.id} bed ${bed.preset}`);
    // a demo stays under about 20 seconds
    assert.ok((d.beats * 60) / d.bpm <= 20, `${p.id} demo length`);
  }
  for (const id of Object.keys(SOUND_GUIDE)) assert.ok(presetById(id), `guide entry ${id} has a sound`);
  for (const kit of Object.values(KIT_FOR_STYLE)) assert.equal(presetById(kit).prog.type, 'drums');
});

test('every rig has an arrangement whose keys all land on a part, grouped by style', () => {
  const grouped = new Set(COMBO_GROUPS.flatMap((g) => combosIn(g).map((c) => c.id)));
  for (const c of COMBOS) {
    assert.ok(grouped.has(c.id), `${c.id} is in a style group`);
    const g = RIG_GUIDE[c.id];
    assert.ok(g && g.tip, `${c.id} has an arrangement and a tip`);
    const perf = buildPerformance(c);
    const d = rigDemo(c.id, perf);
    const keys = d.tracks.filter((t) => t.kind === 'keys').flatMap((t) => t.events);
    assert.ok(keys.length > 0, `${c.id} plays the keys`);
    for (const e of keys) assert.ok(perf.parts.some((p) => p.enabled !== false && e.note >= p.keyLow && e.note <= p.keyHigh), `${c.id}: key ${e.note} reaches a part`);
    for (const t of d.tracks.filter((x) => x.kind === 'part')) assert.ok(perf.parts[t.part], `${c.id}: loop part ${t.part} exists`);
    if (c.groove) assert.ok(GROOVES.find((x) => x.id === c.groove), `${c.id} groove ${c.groove}`);
  }
  // twelve band rigs, two per style
  for (const fam of ['sagospel', 'naija', 'afro']) assert.ok(COMBOS.filter((c) => c.family === fam).length >= 2, fam);
  for (const id of ['elevation-anthem', 'elevation-68', 'hillsong-anthem', 'hillsong-drive', 'billie-birds', 'billie-whisper']) assert.ok(comboById(id), id);
});

test('the song book: two 2024-25 songs per style, chords that parse, a rig and a demo each', () => {
  for (const st of SONG_STYLES) assert.equal(SONGBOOK.filter((s) => s.style === st.id).length, 2, st.label);
  for (const s of SONGBOOK) {
    assert.ok(s.year >= 2024 && s.year <= 2025, `${s.title} year`);
    assert.ok(s.key && s.bpm > 40 && s.bpm < 200, `${s.title} key and tempo`);
    for (const sec of s.sections) for (const b of sec.bars.flat()) assert.ok(parseChord(b), `${s.title}: ${b}`);
    assert.ok(s.sections.some((x) => x.name === s.demo), `${s.title} demo section`);
    const perf = songPerformance(s);
    assert.equal(perf.tempo, s.bpm);
    for (const [idx, id] of Object.entries(s.swap || {})) assert.equal(perf.parts[Number(idx)].presetId, id, `${s.title} swap`);
    const d = rigDemo(s.combo, perf, { bars: demoBars(s), bpm: s.bpm, groove: s.groove, keys: s.keys });
    assert.ok(d.tracks.some((t) => t.kind === 'keys' && t.events.length), `${s.title} plays`);
    assert.ok(Array.isArray(s.sources) && s.sources.length, `${s.title} cites a source`);
    assert.ok(!/lyric/i.test(JSON.stringify(s.sections)), 'chords only');
  }
});

test('router: demo notes are timed, separate from the player and never recorded', () => {
  const log = [];
  const engine = { time: 1, noteOn: (p, n, v, at) => log.push(['on', p, n, at]), noteOff: (p, n, at) => log.push(['off', p, n, at]), cc() {}, bend() {}, allOff() {} };
  const recorded = [];
  const lit = [];
  const parts = [newPart({ keyLow: 0, keyHigh: 59 }), newPart({ keyLow: 60, keyHigh: 127 })];
  const r = new Router({ engine, getParts: () => parts, onLoopInput: (p, e) => recorded.push(e), onNote: (p, n, on) => lit.push(n) });
  r.handle({ type: 'noteon', ch: 1, note: 64, vel: 90 }); // the player
  r.handle({ type: 'noteon', ch: 1, note: 64, vel: 90, virtual: true, at: 2.5 }); // the demo, same key
  assert.deepEqual(log, [['on', 1, 64, 0], ['on', 1, 64, 2.5]], 'both sound; the demo at its time');
  assert.equal(recorded.length, 1, 'only the player is recorded');
  assert.deepEqual(lit, [64], 'only the player lights through the router');
  r.handle({ type: 'noteoff', ch: 1, note: 64, virtual: true, at: 3 });
  assert.deepEqual(log[2], ['off', 1, 64, 3]);
  r.handle({ type: 'noteon', ch: 1, note: 40, vel: 90, virtual: true, at: 3.2 });
  r.releaseVirtual();
  assert.deepEqual(log[log.length - 1], ['off', 0, 40, 0], 'a stopped demo lets go of its keys');
  assert.ok(r.active.has('1:64'), "the player's own key is still held");
});

test('demo player: schedules ahead in time order, lights keys, stops cleanly', async () => {
  const sent = [];
  const engine = { time: 10, noteOn: (p, n, v, t) => sent.push(['on', p, n, +t.toFixed(3)]), noteOff: (p, n, t) => sent.push(['off', p, n, +t.toFixed(3)]), allOff: (hard, p) => sent.push(['allOff', p]) };
  const router = { handle: (ev) => sent.push(['key', ev.type, ev.note, +ev.at.toFixed(3)]), releaseVirtual: () => sent.push(['release']) };
  const lights = [];
  const d = new DemoPlayer({ engine, router, onLight: (n, on) => lights.push([n, on]) });
  d.play({ bpm: 120, beats: 4, tracks: [{ kind: 'keys', events: [{ beat: 0, note: 60, dur: 1, vel: 90 }, { beat: 1, note: 62, dur: 1, vel: 90 }] }, { kind: 'part', part: 9, shift: 0, events: [{ beat: 0, note: 36, dur: 0.2, vel: 100 }] }] }, 'test');
  assert.ok(d.playing);
  // only what falls inside the look-ahead has been handed over: the first beat's notes, at exact times
  assert.deepEqual(sent.slice(0, 2).map((x) => x[0]).sort(), ['key', 'on']);
  assert.ok(sent.every((x) => x[0] === 'allOff' || x[x.length - 1] >= 10.12 - 1e-9), 'nothing in the past');
  assert.ok(!sent.some((x) => x[2] === 62), 'the second note waits for its turn');
  await new Promise((r) => setTimeout(r, 160));
  assert.ok(lights.some(([n, on]) => n === 60 && on), 'the key lights when it sounds');
  d.stop();
  assert.ok(!d.playing);
  assert.ok(sent.some((x) => x[0] === 'release') && sent.some((x) => x[0] === 'allOff' && x[1] === 9), 'stop releases keys and parts');
  assert.ok(lights.some(([n, on]) => n === 60 && !on), 'and turns the lights off');
});
