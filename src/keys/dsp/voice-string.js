// Plucked-string voice (extended Karplus-Strong) for the sebene solo guitar, mi-solo and bass.
// A noise burst, shaped by pick position and brightness, rings in a tuned delay loop with a damping
// filter. Mod wheel = palm mute. Legato notes re-tune the loop (hammer-on) instead of re-plucking.

import { OnePole, Allpass1, DcBlock, Biquad } from './filter.js';
import { velocityCurve, clamp, sine } from './util.js';

const BUF = 8192;
// Levels were matched at 44.1 kHz. White noise filtered to the same band carries more power per sample
// at a lower rate (light mode runs at 32 kHz), so the pluck is scaled to sound the same at any rate.
const REF_RATE = 44100;

class Str {
  constructor() {
    this.buf = new Float32Array(BUF);
    this.w = 0;
    this.delay = 100;
    this.lp = new OnePole();
    this.ap = new Allpass1();
    this.g = 0.99;
    this.excite = 0;
    this.exciteLp = new OnePole();
    this.exciteLen = 0;
    this.exciteGain = 0;
    this.combDelay = 0;
    this.thump = 0;
    this.thumpPhase = 0;
    this.thumpInc = 0;
  }
  clear() {
    this.buf.fill(0);
    this.lp.y = 0;
    this.ap.x1 = this.ap.y1 = 0;
  }
}

function tune(str, freq, sr, lpC, apA) {
  // loop length = period minus the phase delays of the loop filter and the dispersion allpass
  const lpDelay = (1 - lpC) / lpC;
  const apDelay = (1 - apA) / (1 + apA);
  str.delay = clamp(sr / freq - lpDelay - apDelay - 0.5, 2, BUF - 4);
}

export const stringRenderer = {
  init(v, prog, part, core) {
    const sr = core.sr;
    let s = v.s;
    if (!s || s.kind !== 'string') {
      s = v.s = { kind: 'string', strs: [new Str(), new Str()], dc: new DcBlock(), tone: new Biquad(), body: new Biquad(), follow: 0 };
    }
    const bass = prog.model === 'bass';
    const vel = clamp(v.vel, 0.05, 1);
    s.n = prog.unisonN;
    s.sr = sr;
    s.noiseNorm = Math.sqrt(sr / REF_RATE);
    s.thumpDecay = Math.pow(0.9985, REF_RATE / sr);
    s.followDecay = Math.pow(0.9995, REF_RATE / sr);
    s.muted = false;
    s.released = false;
    s.follow = 1;
    s.age = 0;
    s.lfoT = 0;
    // damping lowpass: brighter programs and harder hits keep more highs in the loop
    const dampHz = (bass ? 1200 : 2500) + (1 - prog.damp) * (bass ? 5000 : 9000);
    s.dampHz = dampHz;
    for (let k = 0; k < s.n; k++) {
      const str = s.strs[k];
      str.clear();
      const det = k === 0 ? 1 : 1 + prog.detune * 0.004 * (v.rng.next() + 0.5);
      str.ratio = det;
      str.lp.setCutoff(dampHz, sr);
      str.ap.a = -clamp(prog.stiff, 0, 0.5) * (bass ? 0.5 : 0.3);
      const f = v.freq * det;
      tune(str, f, sr, str.lp.c, str.ap.a);
      str.g = decayGain(prog, f, 0, false);
      // excitation: a burst about one period long, lowpassed by brightness and velocity
      const bright = clamp(prog.bright * (1 - prog.velBright) + prog.velBright * vel * prog.bright * 1.3, 0.05, 1);
      const burstHz = bass ? 600 + bright * 4500 : 1500 + bright * 9000;
      str.exciteLp.setCutoff(burstHz, sr);
      str.exciteLp.y = 0;
      str.exciteLen = Math.round(str.delay) + 2;
      str.excite = str.exciteLen;
      // the burst is one period long, so high notes get less energy: make it up to them
      const comp = Math.min(2.5, Math.pow(Math.max(1, f / 110), 0.35));
      str.exciteGain = 1.1 * comp * (0.4 + 0.6 * vel) * (k === 0 ? 1 : 0.8);
      str.comp = comp;
      // the pick never lands in quite the same place
      const h = prog.humanize || 0;
      str.combDelay = Math.max(1, Math.round(prog.pick * (1 + v.rng.bipolar() * 0.18 * h) * str.delay));
      str.combIdx = 0;
      // a fingered bass gets a soft low "thump" under the pluck
      str.thump = bass ? 0.25 * vel : 0;
      str.thumpPhase = 0;
      str.thumpInc = (f * 0.5) / sr;
    }
    s.tone.lowpass(bass ? Math.min(prog.tone, 5000) : prog.tone, 0.75, sr);
    s.tone.reset();
    s.body.peaking(bass ? 110 : 220, 1.1, prog.body * 6, sr);
    s.body.reset();
    s.dc.x1 = s.dc.y1 = 0;
    s.amp = (((1 - prog.velAmp + prog.velAmp * velocityCurve(vel * 127, prog.velCurve)) * prog.level) / Math.sqrt(s.n)) * (1 + v.rng.bipolar() * 0.07 * (prog.humanize || 0));
    s.ctrl = 0;
  },
  retune(v, prog, part, core, legato) {
    const s = v.s;
    for (let k = 0; k < s.n; k++) {
      const str = s.strs[k];
      // a hammer-on adds a small, dull pluck; a re-pluck a full one
      str.exciteLen = Math.round(str.delay) + 2;
      str.excite = str.exciteLen;
      str.exciteGain = (legato && prog.legato ? 0.35 : 1.1 * (0.4 + 0.6 * v.vel)) * (str.comp || 1);
      str.combIdx = 0;
      str.exciteLp.setCutoff(legato ? 1500 : 4000, s.sr);
    }
    s.released = false;
    s.follow = 1;
  },
  release(v, part, core) {
    const s = v.s;
    s.released = true;
    for (let k = 0; k < s.n; k++) {
      const str = s.strs[k];
      str.g = decayGain(v.prog, v.freq * str.ratio, 0, true);
    }
  },
  kill(v) {
    const s = v.s;
    s.released = true;
    for (let k = 0; k < s.n; k++) v.s.strs[k].g = 0.6;
  },
  /** Too many tails: damp the string hard, a fast but smooth fade. */
  hurry(v) {
    const s = v.s;
    s.released = true;
    for (let k = 0; k < s.n; k++) s.strs[k].g = Math.min(s.strs[k].g, 0.9);
  },
  render(v, L, R, from, to, part, core) {
    const s = v.s;
    const sr = s.sr;
    const prog = v.prog;
    const gl = v.gainL,
      gr = v.gainR;
    let i = from;
    while (i < to) {
      if (s.ctrl <= 0) {
        s.ctrl = 16;
        if (v.freq !== v.targetFreq) {
          v.freq += (v.targetFreq - v.freq) * Math.max(v.glideCoef * 16, 0.08);
          if (Math.abs(v.freq - v.targetFreq) < 0.01) v.freq = v.targetFreq;
        }
        const mute = clamp(prog.mute + part.modV * prog.modWheel.mute, 0, 1);
        s.lfoT += 16 / sr;
        const vib = prog.lfo.pitch || prog.modWheel.vibrato ? sine(s.lfoT * prog.lfo.rate) * (prog.lfo.pitch + part.modV * prog.modWheel.vibrato) : 0;
        const pm = part.bendMul * Math.exp(vib * 0.057762265);
        for (let k = 0; k < s.n; k++) {
          const str = s.strs[k];
          const f = v.freq * str.ratio * pm;
          str.lp.setCutoff(s.dampHz * (1 - 0.8 * mute), sr);
          tune(str, f, sr, str.lp.c, str.ap.a);
          str.g = decayGain(prog, f, mute, s.released);
        }
      }
      const n = Math.min(to - i, s.ctrl);
      for (let k = 0; k < n; k++) {
        let x = 0;
        for (let q = 0; q < s.n; q++) {
          const str = s.strs[q];
          const buf = str.buf;
          // fractional read
          let rp = str.w - str.delay;
          if (rp < 0) rp += BUF;
          const ri = rp | 0;
          const fr = rp - ri;
          const r2 = ri + 1 >= BUF ? 0 : ri + 1;
          const d = buf[ri] + (buf[r2] - buf[ri]) * fr;
          let y = str.ap.process(str.lp.lp(d)) * str.g;
          if (str.excite > 0) {
            // noise burst, comb-filtered at the pick position
            let e = str.exciteLp.lp(v.rng.bipolar() * s.noiseNorm);
            const ci = str.combIdx - str.combDelay;
            if (ci >= 0) e -= str.combBuf ? str.combBuf[ci & 255] : 0;
            if (!str.combBuf) str.combBuf = new Float32Array(256);
            str.combBuf[str.combIdx & 255] = e;
            str.combIdx++;
            y += e * str.exciteGain;
            str.excite--;
          }
          if (str.thump > 0.001) {
            y += sine(str.thumpPhase) * str.thump;
            str.thumpPhase += str.thumpInc;
            str.thump *= s.thumpDecay;
          }
          buf[str.w] = y;
          str.w = str.w + 1 >= BUF ? 0 : str.w + 1;
          x += y;
        }
        x = s.body.process(s.tone.process(s.dc.process(x)));
        const a = s.amp * part.exprV;
        L[i + k] += x * a * gl;
        R[i + k] += x * a * gr;
        const ax = x < 0 ? -x : x;
        s.follow = ax > s.follow ? ax : s.follow * s.followDecay;
      }
      i += n;
      s.ctrl -= n;
      s.age += n;
    }
    // finished when the string has rung out (or been damped after release)
    return !(s.follow < 0.0003 && s.age > sr * 0.05);
  },
};

/** Loop gain so the note decays 60 dB over `decay` seconds; muting and release shorten it. */
function decayGain(prog, f, mute, released) {
  let t = prog.decay;
  if (mute > 0) t *= 1 - 0.93 * mute;
  if (released) t = Math.min(t, prog.release);
  const g = Math.pow(10, -3 / (Math.max(0.01, t) * f));
  return clamp(g, 0, 0.99999);
}
