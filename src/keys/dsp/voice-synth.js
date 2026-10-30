// Virtual-analogue voice: up to 3 oscillators with unison, noise, SVF filter (12/24 dB), two ADSRs, an LFO.

import { SUPERSAW_DETUNE, SUPERSAW_GAIN } from './osc.js';
import { Svf } from './filter.js';
import { Pink, velocityCurve, clamp, polyBlep, sine } from './util.js';

const CTRL = 8; // control-rate block: LFO, filter and glide maths every 8 samples

// Oscillator slots (osc * 7 + unison voice) are flattened at note start into the ones that sound, with
// their wave, pan gains and phase in typed arrays, so the per-sample loop is plain arithmetic.
const SLOTS = 21;
// A thinned supersaw keeps its centre saws, louder so the stack sounds as loud as all seven.
const THIN_SUPERSAW = { 1: [3], 2: [2, 4], 3: [1, 3, 5] };
const THIN_GAIN = { 1: 2, 2: 1.67, 3: 1.43 };

export const synthRenderer = {
  init(v, prog, part, core) {
    const sr = core.sr;
    let s = v.s;
    if (!s || s.kind !== 'synth') {
      s = v.s = {
        kind: 'synth',
        n: 0,
        wave: new Int32Array(SLOTS),
        osc: new Int32Array(SLOTS), // which oscillator a slot belongs to (for its pulse width)
        phase: new Float64Array(SLOTS),
        tri: new Float64Array(SLOTS),
        ratio: new Float64Array(SLOTS),
        dt: new Float64Array(SLOTS),
        gL: new Float32Array(SLOTS),
        gR: new Float32Array(SLOTS),
        pw: new Float64Array(3),
        svfL: new Svf(sr),
        svfL2: new Svf(sr),
        svfR: new Svf(sr),
        svfR2: new Svf(sr),
        pink: null,
      };
    }
    s.pink = prog.pink ? new Pink(v.rng) : null;
    s.stereo = false;
    s.f24 = prog.filter24;
    // Light modes thin a unison stack (to three or two voices) at the same width and loudness.
    const maxUni = core.budget.unison;
    let n = 0;
    for (let o = 0; o < prog.oscs.length; o++) {
      const po = prog.oscs[o];
      const count = Math.min(po.unison, maxUni);
      const thin = count < po.unison;
      for (let u = 0; u < count; u++) {
        const phase = v.rng.next();
        if (!(po.level > 0)) continue; // a silent oscillator costs nothing
        let det, gain;
        if (po.wave === 4) {
          const su = thin ? THIN_SUPERSAW[count][u] : u;
          det = SUPERSAW_DETUNE[su] * po.detune;
          gain = SUPERSAW_GAIN[su] * (thin ? THIN_GAIN[count] : 1);
        } else if (count === 1) {
          det = 0;
          gain = 1;
        } else {
          det = ((u / (count - 1)) * 2 - 1) * po.detune * 0.03; // +-3% at detune 1
          gain = 1 / Math.sqrt(count);
        }
        const pan = count === 1 ? 0 : ((u / (count - 1)) * 2 - 1) * po.spread;
        if (pan !== 0) s.stereo = true;
        s.wave[n] = po.wave === 4 ? 0 : po.wave;
        s.osc[n] = o;
        s.phase[n] = phase;
        s.tri[n] = 0;
        s.ratio[n] = po.ratio * (1 + det);
        s.gL[n] = gain * po.level * Math.cos(((pan + 1) * Math.PI) / 4);
        s.gR[n] = gain * po.level * Math.sin(((pan + 1) * Math.PI) / 4);
        n++;
      }
    }
    s.n = n;
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
    const f24 = s.f24;
    const noiseLevel = prog.noiseLevel;
    const ns = s.n,
      wave = s.wave,
      sosc = s.osc,
      ph = s.phase,
      tri = s.tri,
      ratio = s.ratio,
      sdt = s.dt,
      spw = s.pw,
      gL = s.gL,
      gR = s.gR;
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
        const dt0 = (v.freq * s.pitchMul) / sr;
        for (let j = 0; j < ns; j++) sdt[j] = dt0 * ratio[j];
        for (let o = 0; o < oscs.length; o++) spw[o] = clamp(oscs[o].pw + s.pwMod, 0.05, 0.95);
      }
      const n = Math.min(to - i, s.ctrl);
      for (let k = 0; k < n; k++) {
        let l = 0,
          r = 0;
        for (let j = 0; j < ns; j++) {
          const dt = sdt[j];
          if (dt >= 0.5) continue; // above Nyquist: silent rather than aliasing
          const t = ph[j];
          let x;
          switch (wave[j]) {
            case 0: // saw
              x = 2 * t - 1 - polyBlep(t, dt);
              break;
            case 1: // square / pulse
            case 6: {
              const pw = spw[sosc[j]];
              x = (t < pw ? 1 : -1) + polyBlep(t, dt);
              let t2 = t - pw;
              if (t2 < 0) t2 += 1;
              x -= polyBlep(t2, dt);
              break;
            }
            case 2: {
              // triangle: a leaky-integrated band-limited square
              let sq = (t < 0.5 ? 1 : -1) + polyBlep(t, dt);
              let t2 = t - 0.5;
              if (t2 < 0) t2 += 1;
              sq -= polyBlep(t2, dt);
              x = tri[j] = tri[j] * (1 - dt * 0.5) + sq * 4 * dt;
              break;
            }
            case 3:
              x = sine(t);
              break;
            default:
              x = 0;
          }
          const nt = t + dt;
          ph[j] = nt >= 1 ? nt - 1 : nt;
          l += x * gL[j];
          r += x * gR[j];
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
