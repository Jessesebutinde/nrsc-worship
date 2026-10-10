// Tonewheel organ voice: nine drawbars of sines with Hammond foldback, percussion, key click.
// Drawbars are read live from the part, so moving them changes notes that are already sounding.

import { DRAWBAR_RATIOS } from './programs.js';
import { sine } from './util.js';
import { OnePole } from './filter.js';

const TOP = 5924; // highest tonewheel
const BOTTOM = 32.7;

export const organRenderer = {
  init(v, prog, part, core) {
    let s = v.s;
    if (!s || s.kind !== 'organ') {
      s = v.s = { kind: 'organ', phases: new Float64Array(9), freqs: new Float64Array(9), clickLp: new OnePole() };
    }
    const sr = core.sr;
    for (let i = 0; i < 9; i++) {
      let f = v.freq * DRAWBAR_RATIOS[i];
      while (f > TOP) f *= 0.5;
      while (f < BOTTOM) f *= 2;
      s.freqs[i] = f;
      s.phases[i] = v.rng.next();
    }
    // Percussion only on the first key of a phrase (single trigger), like the real thing.
    s.percLevel = prog.perc.on && part.heldBefore === 0 ? (prog.perc.soft ? 0.5 : 1) : 0;
    s.percIdx = prog.perc.third ? 4 : 3; // 2 2/3' (3rd harmonic) or 4' (2nd)
    s.percDecay = Math.exp(-1 / ((prog.perc.fast ? 0.22 : 0.8) * sr));
    s.perc = s.percLevel;
    s.click = prog.click * 0.5;
    s.clickN = Math.round(sr * 0.004);
    s.clickLp.setCutoff(5000, sr);
    s.amp = 0;
    s.aCoef = 1 - Math.exp(-1 / (Math.max(0.001, prog.attack) * sr));
    s.rCoef = 1 - Math.exp(-1 / (Math.max(0.003, prog.release) * sr));
    s.target = 1;
    s.sr = sr;
    s.leak = prog.leakage * 0.02;
  },
  retune(v, prog, part, core, legato) {
    const s = v.s;
    for (let i = 0; i < 9; i++) {
      let f = v.targetFreq * DRAWBAR_RATIOS[i];
      while (f > TOP) f *= 0.5;
      while (f < BOTTOM) f *= 2;
      s.freqs[i] = f;
    }
    v.freq = v.targetFreq;
  },
  release(v) {
    v.s.target = 0;
  },
  kill(v) {
    v.s.target = 0;
    v.s.rCoef = 0.3;
  },
  render(v, L, R, from, to, part, core) {
    const s = v.s;
    const sr = s.sr;
    const g = part.drawbarsNow; // smoothed, live
    const bend = part.bendMul;
    const level = v.prog.level * 0.14;
    const gl = v.gainL,
      gr = v.gainR;
    for (let i = from; i < to; i++) {
      let x = 0;
      for (let h = 0; h < 9; h++) {
        const gain = g[h];
        if (gain > 0.0005) x += sine(s.phases[h]) * gain;
        s.phases[h] += (s.freqs[h] * bend) / sr;
      }
      if (s.perc > 0.0005) {
        x += sine(s.phases[s.percIdx]) * s.perc * 0.9;
        s.perc *= s.percDecay;
      }
      if (s.clickN > 0) {
        x += s.clickLp.lp(v.rng.bipolar()) * s.click;
        s.clickN--;
      }
      if (s.leak > 0) x += v.rng.bipolar() * s.leak;
      s.amp += (s.target - s.amp) * (s.target ? s.aCoef : s.rCoef);
      const a = s.amp * level * part.exprV;
      L[i] += x * a * gl;
      R[i] += x * a * gr;
    }
    for (let h = 0; h < 9; h++) s.phases[h] -= Math.floor(s.phases[h]);
    return !(s.target === 0 && s.amp < 0.0003);
  },
};
