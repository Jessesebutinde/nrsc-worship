// The engine stays light enough for a phone: shared reverbs, effects that cost nothing when off,
// voice budgets that keep release tails in check, and light levels that sound the same.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EngineCore, BUDGETS } from '../src/keys/dsp/engine-core.js';
import { ReverbPool, PartChain, reverbRoom, mergeFx } from '../src/keys/fx.js';
import { wantLight } from '../src/keys/engine.js';
import { presetById } from '../src/keys/presets.js';

// ------------------------------------------------------------------ a tiny stand-in for Web Audio

class FakeParam {
  constructor(v = 0) {
    this.value = v;
  }
  cancelScheduledValues() {}
  setTargetAtTime(v) {
    this.value = v;
  }
  setValueAtTime(v) {
    this.value = v;
  }
}
class FakeNode {
  constructor(ctx, kind) {
    this.ctx = ctx;
    this.kind = kind;
    this.outs = new Set();
    for (const p of ['gain', 'frequency', 'Q', 'delayTime', 'threshold', 'knee', 'ratio', 'attack', 'release', 'pan', 'detune']) this[p] = new FakeParam(1);
    ctx.nodes.push(this);
  }
  connect(dest) {
    this.outs.add(dest);
    return dest;
  }
  disconnect(dest) {
    if (dest === undefined) this.outs.clear();
    else this.outs.delete(dest);
  }
  start() {}
  setPeriodicWave() {}
}
function fakeContext() {
  const ctx = { sampleRate: 48000, currentTime: 0, nodes: [] };
  const make = (kind) => () => new FakeNode(ctx, kind);
  for (const k of ['Gain', 'BiquadFilter', 'Delay', 'DynamicsCompressor', 'WaveShaper', 'Oscillator', 'ChannelSplitter', 'ChannelMerger', 'StereoPanner', 'Convolver']) ctx['create' + k] = make(k);
  ctx.createPeriodicWave = () => ({});
  ctx.createBuffer = (ch, len) => ({ length: len, copyToChannel() {} });
  return ctx;
}
/** Is `to` reachable from `from` through connections? */
function reaches(from, to, seen = new Set()) {
  if (from === to) return true;
  if (seen.has(from)) return false;
  seen.add(from);
  for (const n of from.outs) if (reaches(n, to, seen)) return true;
  return false;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ reverbs

test('parts asking for the same room share one convolver, and only a few rooms ever run', () => {
  const ctx = fakeContext();
  const out = ctx.createGain();
  const pool = new ReverbPool(ctx, out, { max: 2 });
  const a = pool.acquire({ type: 'hall', decay: 3.1, damp: 0.52 });
  const b = pool.acquire({ type: 'hall', decay: 2.9, damp: 0.5 });
  assert.equal(a, b, 'nearly the same hall is the same room');
  const c = pool.acquire({ type: 'plate', decay: 1.2, damp: 0.5 });
  assert.notEqual(c, a);
  assert.equal(pool.running, 2);
  const d = pool.acquire({ type: 'hall', decay: 6, damp: 0.4 });
  assert.equal(pool.running, 2, 'past the cap a part joins the closest running room');
  assert.equal(d, a, 'a long hall joins the hall, not the plate');
  assert.equal(ctx.nodes.filter((n) => n.kind === 'Convolver').length, 2);
  assert.notEqual(reverbRoom({ type: 'shimmer', decay: 7 }).key, reverbRoom({ type: 'hall', decay: 7 }).key);
});

test('a room nobody uses is torn down after its tail', async () => {
  const ctx = fakeContext();
  const pool = new ReverbPool(ctx, ctx.createGain(), { max: 3 });
  const room = pool.acquire({ type: 'room', decay: 0.1, damp: 0.5 });
  pool.release(room);
  assert.equal(pool.rooms.size, 1, 'the tail rings on for a moment');
  await wait(1250);
  assert.equal(pool.rooms.size, 0);
});

test('an effect that is off is unwired, so it costs no processing', async () => {
  const ctx = fakeContext();
  const pool = new ReverbPool(ctx, ctx.createGain());
  const chain = new PartChain(ctx, { reverbs: pool });
  const delay = chain.stages.delay;
  chain.set(mergeFx({ delay: { on: true, mix: 0.3 } }), 120);
  assert.ok(delay.wired && reaches(chain.input, delay.dL), 'on: the delay line is in the signal path');
  chain.set(mergeFx({}), 120);
  assert.ok(delay.wired, 'still wired while its wet level fades');
  await wait(400);
  assert.ok(!delay.wired && !reaches(chain.input, delay.dL), 'off: out of the path');
  assert.ok(reaches(chain.input, chain.output), 'the dry sound still passes');
  for (const k of ['comp', 'drive', 'eq', 'mod', 'trem', 'rotary']) assert.ok(!chain.stages[k].wired, `${k} never wired`);
});

test("a part's reverb is a send into the shared room that follows the fader", () => {
  const ctx = fakeContext();
  const out = ctx.createGain();
  const pool = new ReverbPool(ctx, out);
  const chain = new PartChain(ctx, { reverbs: pool });
  chain.set(mergeFx({ reverb: { on: true, type: 'hall', decay: 3, mix: 0.3 } }), 120);
  const rv = chain.stages.reverb;
  assert.ok(reaches(chain.input, out), 'the part reaches the shared room');
  assert.ok(Math.abs(rv.dry.gain.value - 0.7) < 1e-9, 'the dry level drops by the mix');
  assert.ok(Math.abs(rv.level.gain.value - 0.3) < 1e-9);
  chain.setPost(0);
  assert.equal(rv.post.gain.value, 0, 'a muted part sends nothing');
});

// ------------------------------------------------------------------ voices

const outs = () => Array.from({ length: 11 }, () => [new Float32Array(128), new Float32Array(128)]);
function playChords(core, part, chords, beatSecs) {
  const o = outs();
  let t = 0,
    maxVoices = 0;
  for (const ch of chords) {
    for (const n of ch) core.handle({ t: 'note', part, note: n, vel: 100, on: true });
    for (let b = 0; b < (beatSecs * core.sr) / 128; b++) {
      core.render(o, t, 128);
      t += 128 / core.sr;
      maxVoices = Math.max(maxVoices, core.voiceCount);
    }
    for (const n of ch) core.handle({ t: 'note', part, note: n, vel: 0, on: false });
  }
  return maxVoices;
}

test('a long-release pad played chord after chord stays within its voice budget', () => {
  const chords = [];
  for (let i = 0; i < 24; i++) chords.push([48 + (i % 5), 55 + (i % 3), 60 + (i % 4), 64 + (i % 2)]);
  for (const level of [0, 1, 2]) {
    const core = new EngineCore(48000, 11);
    core.setLight(level);
    core.handle({ t: 'program', part: 0, prog: presetById('oceans-pad').prog });
    const max = playChords(core, 0, chords, 0.25);
    // tails over budget fade for a moment, so allow one chord on top
    assert.ok(max <= BUDGETS[level].part + 8, `level ${level}: ${max} voices`);
  }
});

test('light levels thin synth stacks without changing their loudness', () => {
  const loud = (level) => {
    const core = new EngineCore(48000, 11);
    core.setLight(level);
    core.handle({ t: 'program', part: 0, prog: presetById('super-saw').prog });
    for (const n of [48, 55, 60, 64]) core.handle({ t: 'note', part: 0, note: n, vel: 100, on: true });
    const o = outs();
    let e = 0;
    for (let b = 0; b < 600; b++) {
      core.render(o, b * 0.00267, 128);
      if (b > 200) for (let i = 0; i < 128; i++) e += o[0][0][i] ** 2 + o[0][1][i] ** 2;
    }
    return 10 * Math.log10(e);
  };
  const full = loud(0);
  for (const level of [1, 2]) assert.ok(Math.abs(loud(level) - full) < 1.5, `level ${level}: ${(loud(level) - full).toFixed(2)} dB`);
});

test('the plucked string sounds equally loud at 32, 44.1 and 48 kHz', () => {
  const level = (sr) => {
    let e = 0,
      n = 0;
    for (let note = 40; note <= 76; note += 4) {
      const core = new EngineCore(sr, 11);
      core.handle({ t: 'program', part: 0, prog: presetById('sebene-solo').prog });
      core.handle({ t: 'note', part: 0, note, vel: 100, on: true });
      const o = outs();
      for (let b = 0; b < (0.5 * sr) / 128; b++) {
        core.render(o, (b * 128) / sr, 128);
        for (let i = 0; i < 128; i++) e += o[0][0][i] ** 2;
        n += 128;
      }
    }
    return 10 * Math.log10(e / n);
  };
  const ref = level(44100);
  for (const sr of [32000, 48000]) assert.ok(Math.abs(level(sr) - ref) < 1, `${sr}: ${(level(sr) - ref).toFixed(2)} dB`);
});

test('the engine mode setting picks the light level', () => {
  assert.equal(wantLight({ engineMode: 'full', autoLight: 2 }), 0, 'full is full, whatever happened before');
  assert.equal(wantLight({ engineMode: 'light', autoLight: 0 }), 1);
  assert.equal(wantLight({ engineMode: 'light', autoLight: 2 }), 2);
  assert.equal(wantLight({ engineMode: 'auto', autoLight: 0 }), 0, 'Node is not a phone');
  assert.equal(wantLight({ engineMode: 'auto', autoLight: 1 }), 1, 'remembers that this device fell behind');
});
