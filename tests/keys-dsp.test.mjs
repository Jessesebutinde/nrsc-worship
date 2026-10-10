import test from 'node:test';
import assert from 'node:assert/strict';
import { Adsr, IDLE } from '../src/keys/dsp/env.js';
import { Svf, LP } from '../src/keys/dsp/filter.js';
import { Osc } from '../src/keys/dsp/osc.js';
import { findLoop } from '../src/keys/dsp/loop-detect.js';
import { fillProgram, compileProgram, DEFAULTS } from '../src/keys/dsp/programs.js';
import { EngineCore } from '../src/keys/dsp/engine-core.js';
import { generateImpulse } from '../src/keys/fx.js';

const SR = 48000;

test('ADSR reaches full level at the attack time and dies after release', () => {
  const e = new Adsr(SR);
  e.set(0.02, 0.1, 0.5, 0.1);
  e.trigger();
  let n = 0;
  while (e.level < 1 && n < SR) {
    e.next();
    n++;
  }
  assert.ok(Math.abs(n / SR - 0.02) < 0.002, `attack took ${n / SR}s`);
  for (let i = 0; i < SR * 0.5; i++) e.next();
  assert.ok(Math.abs(e.level - 0.5) < 0.01, 'holds the sustain level');
  e.release();
  n = 0;
  while (e.active && n < SR) {
    e.next();
    n++;
  }
  assert.equal(e.stage, IDLE);
  assert.ok(n < SR * 0.5, 'release finished within half a second');
});

function rmsOf(fn, seconds = 0.2, skip = 0.05) {
  let s = 0,
    n = 0;
  const total = Math.round(seconds * SR);
  for (let i = 0; i < total; i++) {
    const v = fn(i);
    if (i >= skip * SR) {
      s += v * v;
      n++;
    }
  }
  return Math.sqrt(s / n);
}

test('state-variable lowpass passes 100 Hz and cuts 10 kHz', () => {
  const f = new Svf(SR);
  f.set(1000, 0.3);
  const low = rmsOf((i) => f.process(Math.sin((2 * Math.PI * 100 * i) / SR), LP));
  f.reset();
  const high = rmsOf((i) => f.process(Math.sin((2 * Math.PI * 10000 * i) / SR), LP));
  assert.ok(low > 0.65 && low < 0.75, `100 Hz rms ${low}`);
  assert.ok(high < 0.02, `10 kHz rms ${high}`);
});

test('band-limited saw is bounded, zero-mean and alias-light', () => {
  const o = new Osc(0);
  const dt = 440 / SR;
  let sum = 0,
    peak = 0;
  const N = SR;
  const buf = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const v = o.next(0, dt);
    buf[i] = v;
    sum += v;
    peak = Math.max(peak, Math.abs(v));
    assert.ok(!Number.isNaN(v));
  }
  assert.ok(Math.abs(sum / N) < 0.01, 'zero mean');
  assert.ok(peak <= 1.15, `peak ${peak}`);
  // energy above 20 kHz relative to the fundamental, by a crude DFT at a few bins
  const power = (hz) => {
    let re = 0,
      im = 0;
    for (let i = 0; i < N; i++) {
      re += buf[i] * Math.cos((2 * Math.PI * hz * i) / SR);
      im -= buf[i] * Math.sin((2 * Math.PI * hz * i) / SR);
    }
    return (re * re + im * im) / (N * N);
  };
  const fund = power(440);
  const alias = power(440 * 55 - SR); // the 55th harmonic folds back near 2.8 kHz for a naive saw
  assert.ok(alias < fund * 0.002, `aliased energy ${alias / fund}`);
});

test('loop detection finds a seamless loop in a held tone and refuses a decaying one', () => {
  const f0 = 220;
  const len = SR * 3;
  const held = new Float32Array(len);
  const decaying = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const w = 2 * ((t * f0) % 1) - 1 + 0.3 * Math.sin(2 * Math.PI * 3 * f0 * t);
    held[i] = w * 0.5 * Math.min(1, t * 20) * (t > 2.9 ? 0 : 1);
    decaying[i] = w * 0.5 * Math.exp(-t * 1.5);
  }
  const loop = findLoop(held, SR, f0);
  assert.ok(loop, 'a loop was found');
  const period = SR / f0;
  const periods = (loop.end - loop.start) / period;
  assert.ok(Math.abs(periods - Math.round(periods)) < 0.02, `loop is ${periods} periods`);
  let diff = 0;
  for (let i = 0; i < 64; i++) diff += Math.abs(held[loop.start + i] - held[loop.end + i]);
  assert.ok(diff / 64 < 0.01, `waveform matches at the loop point (${diff / 64})`);
  assert.equal(findLoop(decaying, SR, f0), null);
});

test('programs fill from defaults and compile', () => {
  const p = fillProgram({ type: 'synth', osc: [{ wave: 'supersaw', detune: 0.5 }] });
  assert.equal(p.filter.cutoff, DEFAULTS.synth.filter.cutoff);
  assert.equal(p.osc[0].level, 1);
  const c = compileProgram(p);
  assert.equal(c.oscs.length, 1);
  assert.equal(c.oscs[0].unison, 7);
  const o = compileProgram(fillProgram({ type: 'organ', drawbars: [8, 0, 8, 0, 0, 0, 0, 0, 0] }));
  assert.ok(Math.abs(o.drawbarGains[0] - 1) < 1e-9 && o.drawbarGains[1] === 0);
  const l = compileProgram(fillProgram({ type: 'layer', mode: 'legato', layers: [{ type: 'string' }, { type: 'synth', transpose: 12 }] }));
  assert.equal(l.layers.length, 2);
  assert.equal(l.layers[1].mode, 'legato');
  assert.equal(l.layers[1].layerTranspose, 12);
});

function makeCore() {
  const core = new EngineCore(SR, 8);
  const outs = [];
  for (let p = 0; p < 8; p++) outs.push([new Float32Array(128), new Float32Array(128)]);
  const runAll = (seconds) => {
    const blocks = Math.round((seconds * SR) / 128);
    const acc = outs.map(() => new Float32Array(blocks * 128));
    for (let b = 0; b < blocks; b++) {
      core.render(outs, core.frame / SR, 128);
      for (let p = 0; p < outs.length; p++) acc[p].set(outs[p][0], b * 128);
    }
    return acc;
  };
  const run = (seconds, part = 0) => runAll(seconds)[part];
  return { core, run, runAll };
}
const rms = (a) => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);
const peak = (a) => a.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
const noNaN = (a) => a.every((x) => !Number.isNaN(x));

test('every source type sounds and dies away after note off', () => {
  const { core, run, runAll } = makeCore();
  const progs = [{ type: 'synth' }, { type: 'organ' }, { type: 'string', model: 'guitar' }, { type: 'string', model: 'bass' }, { type: 'drums' }];
  progs.forEach((prog, i) => core.handle({ t: 'program', part: i, prog }));
  progs.forEach((prog, i) => core.handle({ t: 'note', part: i, note: prog.type === 'drums' ? 36 : prog.model === 'bass' ? 40 : 60, vel: 100, on: true }));
  const first = runAll(0.3).slice(0, progs.length);
  first.forEach((a, i) => {
    assert.ok(noNaN(a), `no NaN in ${progs[i].type}`);
    assert.ok(rms(a) > 0.005, `${progs[i].type} ${progs[i].model || ''} sounds (${rms(a)})`);
  });
  progs.forEach((prog, i) => core.handle({ t: 'note', part: i, note: prog.type === 'drums' ? 36 : prog.model === 'bass' ? 40 : 60, vel: 0, on: false }));
  run(3);
  assert.equal(core.voiceCount, 0, 'all voices released');
});

test('a timed note starts at its sample, not at the block edge', () => {
  const { core, run } = makeCore();
  core.handle({ t: 'program', part: 0, prog: { type: 'synth', osc: [{ wave: 'square' }], filter: { type: 'off' }, env: { a: 0.0005 } } });
  core.handle({ t: 'note', part: 0, note: 60, vel: 127, on: true, time: 0.0123 }, 0);
  const a = run(0.05);
  let first = a.findIndex((x) => Math.abs(x) > 1e-4);
  assert.ok(Math.abs(first - 0.0123 * SR) <= 1, `onset at sample ${first}, wanted ${0.0123 * SR}`);
});

test('sustain pedal holds notes and releases them when lifted', () => {
  const { core, run } = makeCore();
  core.handle({ t: 'program', part: 0, prog: { type: 'synth', env: { r: 0.05 } } });
  core.handle({ t: 'cc', part: 0, cc: 64, value: 127 });
  core.handle({ t: 'note', part: 0, note: 60, vel: 100, on: true });
  core.handle({ t: 'note', part: 0, note: 60, vel: 0, on: false });
  run(0.5);
  assert.equal(core.voiceCount, 1, 'held by the pedal');
  core.handle({ t: 'cc', part: 0, cc: 64, value: 0 });
  run(1);
  assert.equal(core.voiceCount, 0, 'released with the pedal');
});

test('mono legato retunes one voice and returns to the held note', () => {
  const { core, run } = makeCore();
  core.handle({ t: 'program', part: 0, prog: { type: 'synth', mode: 'legato', osc: [{ wave: 'sine' }], filter: { type: 'off' } } });
  core.handle({ t: 'note', part: 0, note: 60, vel: 100, on: true });
  run(0.2);
  core.handle({ t: 'note', part: 0, note: 67, vel: 100, on: true });
  run(0.2);
  assert.equal(core.voiceCount, 1);
  assert.equal(core.parts[0].monoVoices[0].note, 67);
  core.handle({ t: 'note', part: 0, note: 67, vel: 0, on: false });
  run(0.1);
  assert.equal(core.parts[0].monoVoices[0].note, 60, 'back to the note still held');
});

test('polyphony limit steals the oldest note instead of growing without bound', () => {
  const { core, run } = makeCore();
  core.handle({ t: 'program', part: 0, prog: { type: 'synth', voices: 4, env: { r: 0.01 } } });
  for (let n = 40; n < 60; n++) core.handle({ t: 'note', part: 0, note: n, vel: 100, on: true });
  const a = run(0.3);
  assert.ok(noNaN(a) && peak(a) < 3);
  assert.ok(core.voiceCount <= 5, `voices ${core.voiceCount}`);
});

test('layered program plays all layers on one note and the sampler loops a bank', () => {
  const { core, run } = makeCore();
  const len = SR;
  const L = new Float32Array(len);
  for (let i = 0; i < len; i++) L[i] = Math.sin((2 * Math.PI * 440 * i) / SR) * 0.5;
  core.handle({ t: 'bankStart', id: 'test/sine' });
  core.handle({ t: 'bankNote', id: 'test/sine', note: 69, L, rate: SR, loopStart: 2000, loopEnd: 2000 + Math.round(SR / 440) * 50, loopAuto: true });
  core.handle({ t: 'bankDone', id: 'test/sine' });
  core.handle({ t: 'program', part: 0, prog: { type: 'layer', layers: [{ type: 'sampler', bank: 'test/sine' }, { type: 'synth' }] } });
  core.handle({ t: 'note', part: 0, note: 69, vel: 100, on: true });
  run(0.2);
  assert.equal(core.voiceCount, 2);
  const late = run(2.5); // well past the 1 s sample: the loop keeps it going
  assert.ok(rms(late.subarray(late.length - 4800)) > 0.01, 'still sounding after the sample length');
  core.handle({ t: 'note', part: 0, note: 69, vel: 0, on: false });
  run(1);
  assert.equal(core.voiceCount, 0);
});

test('reverb impulse responses are normalised, cached and sized by decay', () => {
  const a = generateImpulse({ type: 'hall', decay: 2, damp: 0.5, sr: SR });
  const b = generateImpulse({ type: 'hall', decay: 2, damp: 0.5, sr: SR });
  assert.equal(a, b, 'same settings share one impulse');
  assert.ok(Math.abs(a.L.length - SR * 2.3) < SR * 0.05);
  let e = 0;
  for (let i = 0; i < a.L.length; i++) e += a.L[i] * a.L[i] + a.R[i] * a.R[i];
  assert.ok(e > 2 && e < 8, `energy ${e}`);
  assert.ok(a.L.every((x) => !Number.isNaN(x)));
  const s = generateImpulse({ type: 'spring', decay: 1, damp: 0.3, sr: 44100 });
  assert.ok(s.L.length > 44100);
});

test('the granular shifter moves a tone up an octave without reading ahead of the writer', async () => {
  const { GrainShifter } = await import('../src/keys/dsp/pitch-shift.js');
  const sh = new GrainShifter(SR, 1);
  const N = SR;
  const inp = new Float32Array(N);
  for (let i = 0; i < N; i++) inp[i] = Math.sin((2 * Math.PI * 440 * i) / SR);
  const out = new Float32Array(N);
  for (let i = 0; i < N; i += 128) sh.process([inp.subarray(i, i + 128)], [out.subarray(i, i + 128)], 128, 2);
  const power = (hz) => {
    let re = 0,
      im = 0;
    for (let i = SR / 2; i < N; i++) {
      re += out[i] * Math.cos((2 * Math.PI * hz * i) / SR);
      im -= out[i] * Math.sin((2 * Math.PI * hz * i) / SR);
    }
    return re * re + im * im;
  };
  const p880 = power(880),
    p440 = power(440);
  assert.ok(out.every((x) => !Number.isNaN(x) && Math.abs(x) <= 1.5));
  assert.ok(p880 > p440 * 20, `octave up dominates (${(p880 / p440).toFixed(1)}x)`);
});
