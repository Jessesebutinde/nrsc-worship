// Virtual-analogue voice: up to 3 oscillators with unison, noise, SVF filter (12/24 dB), two ADSRs, an LFO.

import { Osc, SUPERSAW_DETUNE, SUPERSAW_GAIN } from './osc.js';
import { Svf } from './filter.js';
import { Pink, velocityCurve, clamp } from './util.js';

const CTRL = 8; // control-rate block: LFO, filter and glide maths every 8 samples

export const synthRenderer = {
  init(v, prog, part, core) {
    const sr = core.sr;
    let s = v.s;
    if (!s || s.kind !== 'synth') {
      s = v.s = {
        kind: 'synth',
        oscs: [],
        phases: new Float64Array(21),
        ratios: new Float64Array(21),
        panL: new Float32Array(21),
        panR: new Float32Array(21),
        gains: new Float32Array(21),
        svfL: new Svf(sr),
        svfL2: new Svf(sr),
        svfR: new Svf(sr),
        svfR2: new Svf(sr),
        pink: null,
      };
      for (let i = 0; i < 21; i++) s.oscs.push(new Osc());
    }
    s.pink = prog.pink ? new Pink(v.rng) : null;
    s.stereo = false;
    // Unison layout: slot = osc*7 + u
    for (let o = 0; o < prog.oscs.length; o++) {
      const po = prog.oscs[o];
      const n = po.unison;
      for (let u = 0; u < n; u++) {
        const k = o * 7 + u;
        s.oscs[k].phase = v.rng.next();
        s.oscs[k].triState = 0;
        let det, gain;
        if (po.wave === 4) {
          det = SUPERSAW_DETUNE[u] * po.detune;
          gain = SUPERSAW_GAIN[u];
        } else if (n === 1) {
          det = 0;
          gain = 1;
        } else {
          det = ((u / (n - 1)) * 2 - 1) * po.detune * 0.03; // +-3% at detune 1
          gain = 1 / Math.sqrt(n);
        }
        s.ratios[k] = po.ratio * (1 + det);
        const pan = n === 1 ? 0 : ((u / (n - 1)) * 2 - 1) * po.spread;
        if (pan !== 0) s.stereo = true;
        s.panL[k] = Math.cos(((pan + 1) * Math.PI) / 4);
        s.panR[k] = Math.sin(((pan + 1) * Math.PI) / 4);
        s.gains[k] = gain * po.level;
      }
    }
    s.svfL.reset();
    s.svfL2.reset();
    s.svfR.reset();
    s.svfR2.reset();
    v.env.set(prog.env.a, prog.env.d, prog.env.s, prog.env.r);
    v.fenv.set(prog.fenv.a, prog.fenv.d, prog.fenv.s, prog.fenv.r);
    v.env.level = 0;
    v.fenv.level = 0;
    v.env.trigger();
    v.fenv.trigger();
    v.lfo.phase = 0;
    s.lfoTime = 0;
    s.ctrl = 0;
    s.drift = v.rng.bipolar() * prog.drift * 0.004; // fixed per note: up to ~0.4% analogue drift
    s.pitchMul = 1;
    s.amp = (1 - prog.velAmp + prog.velAmp * velocityCurve(v.vel * 127, prog.velCurve)) * prog.level;
    s.sr = sr;
  },
  retune(v, prog, part, core, legato) {
    if (!legato) {
      v.env.trigger();
      v.fenv.trigger();
    }
  },
  release(v) {
    v.env.release();
    v.fenv.release();
  },
  kill(v) {
    v.env.kill();
  },
  render(v, L, R, from, to, part, core) {
    const prog = v.prog;
    const s = v.s;
    const sr = s.sr;
    const stereo = s.stereo;
    const oscs = prog.oscs;
    const fmode = prog.filterMode;
    const f24 = prog.filter24;
    const noiseLevel = prog.noiseLevel;
    const gl = v.gainL,
      gr = v.gainR;
    let i = from;
    while (i < to) {
      // ---- control rate
      if (s.ctrl <= 0) {
        s.ctrl = CTRL;
        // glide
        if (v.freq !== v.targetFreq) {
          v.freq += (v.targetFreq - v.freq) * v.glideCoef * CTRL;
          if (Math.abs(v.freq - v.targetFreq) < 0.01) v.freq = v.targetFreq;
        }
        // LFO with delay and fade-in
        const lfoRate = prog.lfoBeats ? core.bpm / 60 / prog.lfoBeats : prog.lfo.rate;
        const lfoRaw = v.lfo.next(prog.lfoShape, (lfoRate * CTRL) / sr);
        s.lfoTime += CTRL / sr;
        let lfoAmt = s.lfoTime < prog.lfo.delay ? 0 : prog.lfo.fade > 0 ? clamp((s.lfoTime - prog.lfo.delay) / prog.lfo.fade, 0, 1) : 1;
        const lfo = lfoRaw * lfoAmt;
        const mod = part.modV;
        const vibSemis = lfo * (prog.lfo.pitch + mod * prog.modWheel.vibrato);
        s.pitchMul = Math.exp((vibSemis + part.bendSemis) * 0.057762265) * (1 + s.drift);
        s.trem = clamp(1 - (prog.lfo.amp + mod * prog.modWheel.amp) * (0.5 - 0.5 * lfo), 0, 1);
        s.pwMod = lfo * prog.lfo.pw * 0.45;
        if (fmode >= 0) {
          const f = prog.filter;
          const oct = f.env * v.fenv.level + f.key * ((v.note - 60) / 12) + lfo * prog.lfo.filter + mod * prog.modWheel.filter + f.vel * v.vel * 2;
          const cutoff = f.cutoff * Math.pow(2, oct);
          s.svfL.set(cutoff, f.res);
          if (stereo) s.svfR.set(cutoff, f.res);
          if (f24) {
            s.svfL2.set(cutoff, f.res * 0.6);
            if (stereo) s.svfR2.set(cutoff, f.res * 0.6);
          }
        }
        for (let k = 0; k < CTRL; k++) v.fenv.next();
        s.dt = (v.freq * s.pitchMul) / sr;
      }
      const n = Math.min(to - i, s.ctrl);
      const dt0 = s.dt;
      for (let k = 0; k < n; k++) {
        let l = 0,
          r = 0;
        for (let o = 0; o < oscs.length; o++) {
          const po = oscs[o];
          const wave = po.wave === 4 ? 0 : po.wave;
          const pw = clamp(po.pw + s.pwMod, 0.05, 0.95);
          for (let u = 0; u < po.unison; u++) {
            const idx = o * 7 + u;
            const dt = dt0 * s.ratios[idx];
            if (dt >= 0.5) continue;
            const x = s.oscs[idx].next(wave, dt, pw) * s.gains[idx];
            l += x * s.panL[idx];
            r += x * s.panR[idx];
          }
        }
        if (noiseLevel > 0) {
          const nz = (s.pink ? s.pink.next() : v.rng.bipolar()) * noiseLevel;
          l += nz;
          r += nz;
        }
        if (fmode >= 0) {
          l = s.svfL.process(l, fmode);
          if (f24) l = s.svfL2.process(l, fmode);
          if (stereo) {
            r = s.svfR.process(r, fmode);
            if (f24) r = s.svfR2.process(r, fmode);
          } else r = l;
        } else if (!stereo) r = l;
        const a = v.env.next() * s.amp * s.trem * part.exprV;
        L[i + k] += l * a * gl;
        R[i + k] += r * a * gr;
      }
      i += n;
      s.ctrl -= n;
    }
    return v.env.active;
  },
};
