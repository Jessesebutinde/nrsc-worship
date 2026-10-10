import test from 'node:test';
import assert from 'node:assert/strict';
import { Transport, Looper, GROOVES, expandGroove, quantizeBeat, loopLengthBars } from '../src/keys/looper.js';

const near = (a, b, eps = 1e-6, msg) => assert.ok(Math.abs(a - b) <= eps, msg || `${a} is not within ${eps} of ${b}`);

/** A fake clock, an engine that records its calls, and a runner that ticks every 25 ms like the app. */
function rig({ bpm = 120 } = {}) {
  const clock = { t: 0 };
  const calls = [];
  const engine = {
    noteOn: (part, note, vel, time) => calls.push({ type: 'on', part, note, vel, time }),
    noteOff: (part, note, time) => calls.push({ type: 'off', part, note, time }),
    click: (accent, time) => calls.push({ type: 'click', accent, time }),
  };
  const transport = new Transport({ clock: () => clock.t });
  transport.setBpm(bpm);
  const changes = { n: 0 };
  const looper = new Looper({ clock: () => clock.t, engine, transport, onChange: () => changes.n++ });
  const run = (seconds) => {
    const end = Math.round((clock.t + seconds) * 1000);
    while (Math.round(clock.t * 1000) < end) {
      clock.t = Math.round(clock.t * 1000 + 25) / 1000;
      looper.tick();
    }
  };
  const ons = (from = 0) => calls.filter((c) => c.type === 'on' && c.time >= from);
  return { clock, calls, engine, transport, looper, run, ons, changes };
}

/** Records one 4/4 bar at 120 bpm: C at beat 0 (held half a beat) and E at beat 2 (0.4 beats). Ends at t = 2.05. */
function recordBar(r) {
  const { looper, run } = r;
  looper.arm(0);
  looper.input(0, { type: 'on', note: 60, vel: 100, time: 0 });
  run(0.25);
  looper.input(0, { type: 'off', note: 60, time: 0.25 });
  run(0.75);
  looper.input(0, { type: 'on', note: 64, vel: 90, time: 1.0 });
  run(0.2);
  looper.input(0, { type: 'off', note: 64, time: 1.2 });
  run(0.85);
  looper.stopRecording(0);
}

test('transport: beats and times round-trip, tempo changes keep the position', () => {
  const clock = { t: 0 };
  const tr = new Transport({ clock: () => clock.t });
  tr.start(0);
  assert.equal(tr.beatAt(1.0), 2);
  assert.equal(tr.timeAt(2), 1.0);
  near(tr.timeAt(tr.beatAt(7.3)), 7.3, 1e-9);
  clock.t = 2.0; // beat 4
  tr.setBpm(60);
  near(tr.beatAt(2.0), 4);
  near(tr.beatAt(3.0), 5);
  assert.equal(tr.startTime, -2);
  tr.setBpm(1000);
  assert.equal(tr.bpm, 240, 'clamped');
  tr.stop();
  assert.equal(tr.beatAt(5), 0, '0 while stopped');
});

test('transport: tap tempo and position', () => {
  const clock = { t: 0 };
  let changes = 0;
  const tr = new Transport({ clock: () => clock.t, onChange: () => changes++ });
  for (const t of [10, 10.5, 11, 11.5]) {
    clock.t = t;
    tr.tap();
  }
  assert.equal(tr.bpm, 120);
  assert.ok(changes >= 1);
  clock.t = 20; // more than 2 s later: a new series
  assert.equal(tr.tap(), 120, 'a single tap keeps the tempo');
  clock.t = 20.4;
  assert.equal(tr.tap(), 150);

  tr.setBpm(120);
  tr.start(0);
  clock.t = 2.75; // beat 5.5
  assert.deepEqual(tr.position(), { bar: 2, beat: 2, phase: 0.5, beats: 5.5 });
  tr.beatsPerBar = 3;
  assert.equal(tr.position().bar, 2);
  assert.equal(tr.position().beat, 3);
});

test('loop length rounding', () => {
  assert.equal(loopLengthBars(3.9, 4), 1);
  assert.equal(loopLengthBars(4.3, 4), 1, 'just after the bar line');
  assert.equal(loopLengthBars(4.6, 4), 2);
  assert.equal(loopLengthBars(8.2, 4), 2);
  assert.equal(loopLengthBars(0.5, 4), 1);
  assert.equal(loopLengthBars(4, 4), 1);
  assert.equal(loopLengthBars(6.1, 6), 1);
});

test('quantize to the nearest grid point', () => {
  assert.equal(quantizeBeat(1.1, 0.25), 1.0);
  assert.equal(quantizeBeat(1.13, 0.25), 1.25);
  assert.equal(quantizeBeat(1.13, 0), 1.13);
});

test('record a bar, then keep it going from where the player is', () => {
  const r = rig();
  const { looper, transport, calls, run, ons } = r;
  looper.arm(0);
  assert.equal(looper.track(0).state, 'armed');
  assert.equal(transport.running, false, 'waits for the first note');
  recordBar(r);
  assert.equal(transport.running, true);
  assert.equal(transport.startTime, 0, 'beat 0 is the first note');
  assert.equal(calls.length, 0, 'nothing is played back during the take');
  const t = looper.track(0);
  assert.equal(t.state, 'playing');
  assert.equal(t.bars, 1, '4.1 beats round down to one bar');
  assert.deepEqual(
    t.events.map((e) => [e.beat, e.note, e.vel]),
    [
      [0, 60, 100],
      [2, 64, 90],
    ],
  );
  near(t.events[0].dur, 0.5);
  near(t.events[1].dur, 0.4);
  run(4); // t = 6.05
  const on = ons();
  assert.deepEqual(on.map((c) => c.note), [64, 60, 64, 60], 'no restart: beat 2 of the running bar comes first');
  on.forEach((c, i) => near(c.time, 3 + i, 1e-3));
  assert.ok(on.every((c) => c.part === 0));
  const offs = calls.filter((c) => c.type === 'off');
  near(offs[0].time, 3.2, 1e-3, 'E lasts 0.4 beats');
  near(offs[1].time, 4.25, 1e-3, 'C lasts half a beat');
  assert.ok(r.changes.n >= 3, 'the UI was told about arm, record and play');
});

test('mute cuts what is already scheduled, play comes back on the grid', () => {
  const r = rig();
  const { looper, calls, run, ons, clock } = r;
  recordBar(r);
  run(0.9); // t = 2.95: the E at 3.0 is already with the engine
  assert.equal(ons(2.5).length, 1);
  const before = calls.length;
  looper.mute(0);
  assert.equal(looper.track(0).state, 'muted');
  const cut = calls.slice(before);
  assert.ok(cut.length >= 1 && cut.every((c) => c.type === 'off' && c.note === 64));
  near(cut[0].time, 3.001, 1e-6, 'cut right as it starts');
  const muted = calls.length;
  run(1.55); // t = 4.5
  assert.equal(calls.length, muted, 'silent while muted');
  looper.play(0);
  assert.equal(looper.track(0).state, 'playing');
  run(1);
  const back = ons(clock.t - 1);
  assert.equal(back.length, 1);
  near(back[0].time, 5.0, 1e-3, 'the next occurrence lands on the loop grid');
  assert.equal(back[0].note, 64);
  looper.toggle(0);
  assert.equal(looper.track(0).state, 'muted');
  looper.toggle(0);
  assert.equal(looper.track(0).state, 'playing');
});

test('clear empties the track and stops scheduling', () => {
  const r = rig();
  const { looper, calls, run, ons, clock } = r;
  recordBar(r);
  run(0.9);
  const before = calls.length;
  looper.clear(0);
  assert.equal(looper.track(0).state, 'empty');
  assert.deepEqual(looper.track(0).events, []);
  assert.ok(calls.slice(before).every((c) => c.type === 'off'));
  const cleared = calls.length;
  run(2);
  assert.equal(calls.length, cleared);
  assert.equal(looper.serialize().tracks.length, 0);
});

test('overdub keeps the length and adds notes while the loop plays on', () => {
  const r = rig();
  const { looper, run, ons, clock } = r;
  recordBar(r);
  looper.track(0).overdub = true;
  run(0.05); // t = 2.1
  looper.arm(0);
  assert.equal(looper.track(0).recStart, 8, 'the next bar line');
  run(1.9); // t = 4.0: the bar line
  assert.equal(looper.track(0).state, 'recording');
  assert.equal(ons(2.5).length, 2, 'the loop kept playing (3.0 and 4.0)');
  run(0.5);
  looper.input(0, { type: 'on', note: 67, vel: 80, time: 4.5 });
  run(0.25);
  looper.input(0, { type: 'off', note: 67, time: 4.75 });
  run(0.25); // t = 5.0, beat 10
  looper.stopRecording(0);
  const t = looper.track(0);
  assert.equal(t.bars, 1);
  assert.deepEqual(t.events.map((e) => [e.beat, e.note]), [
    [0, 60],
    [1, 67],
    [2, 64],
  ]);
  run(2);
  const g = ons(clock.t - 2);
  assert.deepEqual(g.map((c) => [c.note, c.time]), [
    [64, 5],
    [60, 6],
    [67, 6.5],
    [64, 7], // within the lookahead of the last tick
  ]);
});

test('arming while running waits for the bar line and replaces the loop', () => {
  const r = rig();
  const { looper, run, ons, calls } = r;
  recordBar(r);
  run(0.05); // t = 2.1 (beat 4.2)
  looper.arm(0);
  assert.equal(looper.track(0).state, 'armed');
  assert.equal(looper.track(0).recStart, 8);
  run(1.85); // t = 3.95: the old loop is still heard (the E at 3.0) but nothing past beat 8
  assert.equal(ons(2.5).length, 1);
  const before = calls.length;
  run(0.1); // t = 4.05
  assert.equal(looper.track(0).state, 'recording');
  assert.deepEqual(looper.track(0).events, [], 'replaced');
  assert.equal(calls.slice(before).filter((c) => c.type === 'on').length, 0, 'the old downbeat at 4.0 was never sent');
  // Stop within the first eighth of a bar, a note still held: it lasts to the loop end.
  looper.input(0, { type: 'on', note: 62, vel: 70, time: 4.05 });
  run(2.1); // t = 6.15, beat 12.3
  looper.stopRecording(0);
  const t = looper.track(0);
  assert.equal(t.state, 'playing');
  assert.equal(t.bars, 1);
  assert.deepEqual(t.events.map((e) => [e.beat, e.note]), [[0, 62]]);
  near(t.events[0].dur, 4 - 0.1, 1e-9, 'held to the loop end');
  // A toggle while armed cancels the take and the loop goes on.
  run(0.5);
  looper.arm(0);
  assert.equal(t.state, 'armed');
  looper.toggle(0);
  assert.equal(t.state, 'playing');
  assert.equal(t.events.length, 1);
});

test('count-in starts the transport and clicks a bar before recording', () => {
  const r = rig();
  const { looper, transport, calls, run } = r;
  looper.countIn = 1;
  looper.arm(0);
  assert.equal(transport.running, true);
  assert.equal(looper.track(0).state, 'armed');
  run(1.9);
  assert.equal(looper.track(0).state, 'armed');
  const clicks = calls.filter((c) => c.type === 'click');
  assert.deepEqual(clicks.map((c) => [c.accent, c.time]), [
    [true, 0],
    [false, 0.5],
    [false, 1],
    [false, 1.5],
    [true, 2],
  ]);
  run(0.15); // t = 2.05
  assert.equal(looper.track(0).state, 'recording');
  assert.equal(calls.filter((c) => c.type === 'click').length, 5, 'no clicks once the take runs');
  run(1);
  looper.stopRecording(0);
  assert.equal(looper.track(0).state, 'empty', 'nothing was played: no loop');
  assert.equal(transport.running, true, 'the transport goes on');
});

test('grooves expand per lane with accents, in 4/4 and 6/8', () => {
  const ev = expandGroove('sebene');
  const g = GROOVES.find((x) => x.id === 'sebene');
  assert.equal(g.bars, 2);
  assert.deepEqual(
    ev.filter((e) => e.note === 36).map((e) => e.beat),
    [0, 1, 2, 3, 4, 5, 6, 7],
  );
  const snare = ev.filter((e) => e.note === 38);
  assert.equal(snare.length, 32, 'continuous 16ths');
  assert.deepEqual(
    snare.slice(0, 4).map((e) => [e.beat, e.vel]),
    [
      [0, 118],
      [0.25, 48],
      [0.5, 96],
      [0.75, 118],
    ],
  );
  assert.ok(ev.every((e) => e.beat >= 0 && e.beat < 8 && e.dur === 0.2));
  assert.ok(ev.some((e) => e.note === 46 && e.beat === 7.75), 'open hat on the a of 4 in bar 2');
  assert.equal(expandGroove(g, 1).length, ev.filter((e) => e.beat < 4).length);

  const six = GROOVES.find((x) => x.id === 'worship68');
  assert.equal(six.beatsPerBar, 6);
  const e6 = expandGroove(six);
  assert.deepEqual(e6.filter((e) => e.note === 36).map((e) => e.beat), [0, 3, 6, 9, 11]);
  assert.ok(e6.every((e) => e.beat < 12));
  assert.deepEqual(e6.filter((e) => e.note === 42 && e.beat < 6).map((e) => e.beat), [0, 1, 2, 3, 4, 5]);

  assert.deepEqual(GROOVES.map((x) => x.id), ['sebene', 'ndombolo', 'rumba', 'worship44', 'worship68', 'pop']);
  for (const x of GROOVES) {
    assert.ok(expandGroove(x).length > 0, x.id);
    // A lane must tile the groove exactly, or a typo would shift every bar after the first.
    const total = x.bars * x.beatsPerBar * x.steps;
    for (const [note, lane] of Object.entries(x.lanes)) {
      assert.equal(total % lane.replace(/\s/g, '').length, 0, `${x.id} ${note}`);
    }
  }
  assert.deepEqual(expandGroove('nope'), []);
});

test('a groove track is an ordinary loop and sets the meter', () => {
  const r = rig();
  const { looper, transport, run, ons } = r;
  looper.setGroove(1, 'pop');
  assert.equal(transport.running, true);
  const t = looper.track(1);
  assert.equal(t.state, 'playing');
  assert.equal(t.groove, 'pop');
  assert.equal(t.bars, 1);
  run(2.1);
  const kicks = ons().filter((c) => c.part === 1 && c.note === 36);
  assert.deepEqual(kicks.map((c) => c.time), [0, 0.75, 1, 2], 'kick on 1, the and of 2, 3');
  looper.setGroove(1, 'worship68');
  assert.equal(transport.beatsPerBar, 6);
  looper.setGroove(1, null);
  assert.equal(t.state, 'empty');
  assert.equal(t.groove, null);
});

test('metronome clicks with the accent on beat 1', () => {
  const r = rig();
  const { looper, transport, calls, run } = r;
  looper.metronome = true;
  transport.start();
  run(2.1);
  const clicks = calls.filter((c) => c.type === 'click');
  assert.deepEqual(clicks.map((c) => [c.accent, c.time]), [
    [true, 0],
    [false, 0.5],
    [false, 1],
    [false, 1.5],
    [true, 2],
  ]);
  looper.metronome = false;
  run(1);
  assert.equal(calls.filter((c) => c.type === 'click').length, 5);
  transport.beatsPerBar = 3;
  looper.metronome = true;
  run(1.6); // t = 4.7: beats 7 (3.5 s), 8 (4 s), 9 (4.5 s, a bar line in 3/4)
  const more = calls.filter((c) => c.type === 'click').slice(5);
  assert.deepEqual(more.map((c) => [c.accent, c.time]), [
    [false, 3.5],
    [false, 4],
    [true, 4.5],
  ]);
});

test('stop silences everything, the loops resume on the next start', () => {
  const r = rig();
  const { looper, transport, calls, run, ons, clock } = r;
  recordBar(r);
  run(0.9); // t = 2.95: the E at 3.0 is scheduled
  const before = calls.length;
  looper.stop();
  assert.equal(transport.running, false);
  assert.equal(looper.track(0).state, 'playing');
  assert.ok(calls.slice(before).some((c) => c.type === 'off' && c.note === 64));
  const stopped = calls.length;
  run(1);
  assert.equal(calls.length, stopped, 'nothing while stopped');
  looper.play(0);
  assert.equal(transport.running, true);
  assert.equal(transport.startTime, clock.t);
  run(1.2);
  const back = ons(clock.t - 1.2);
  assert.deepEqual(back.map((c) => [c.note, c.time]), [
    [60, 3.95],
    [64, 4.95],
  ]);
  // A take in progress is kept by stop().
  looper.arm(2); // t = 5.15, beat 2.4: the take starts at beat 4 (t = 5.95)
  run(0.05);
  looper.input(2, { type: 'on', note: 48, vel: 100, time: clock.t });
  run(0.95); // t = 6.15
  assert.equal(looper.track(2).state, 'recording');
  assert.equal(looper.track(2).held.size, 0, 'a note before the bar line is not part of the take');
  looper.input(2, { type: 'on', note: 48, vel: 100, time: clock.t });
  run(0.5);
  looper.stop();
  assert.equal(looper.track(2).state, 'playing');
  assert.deepEqual(
    looper.track(2).events.map((e) => [e.beat, e.note, Math.round(e.dur * 1e6) / 1e6]),
    [[0.5, 48, 3.6]],
    'held to the loop end',
  );
});

test('serialize and restore round-trip', () => {
  const r = rig();
  const { looper, transport, run } = r;
  recordBar(r);
  looper.setGroove(1, 'sebene');
  looper.mute(1);
  run(0.1);
  const data = JSON.parse(JSON.stringify(looper.serialize()));
  assert.equal(data.bpm, 120);
  assert.deepEqual(
    data.tracks.map((t) => [t.part, t.bars, t.state, t.groove, t.events.length]),
    [
      [0, 1, 'playing', null, 2],
      [1, 2, 'muted', 'sebene', expandGroove('sebene').length],
    ],
  );
  assert.deepEqual(data.tracks[0].events[0], [0, 60, 100, 0.5]);

  const r2 = rig({ bpm: 90 });
  r2.looper.restore(data);
  assert.equal(r2.transport.bpm, 120);
  assert.equal(r2.transport.running, false, 'restore does not start the transport');
  assert.deepEqual(r2.looper.serialize(), data);
  assert.deepEqual(r2.looper.track(0).events, looper.track(0).events);
  assert.equal(r2.looper.track(1).state, 'muted');
  r2.looper.play(0);
  r2.run(1.1);
  assert.deepEqual(r2.ons().map((c) => [c.note, c.time]), [
    [60, 0],
    [64, 1],
  ]);
  assert.equal(transport.running, true, 'the original is untouched');
});
