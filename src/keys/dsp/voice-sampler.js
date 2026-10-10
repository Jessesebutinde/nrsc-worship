// Sample-playback voice: nearest-note multisample, Hermite interpolation, crossfade looping, ADSR,
// an optional filter, vibrato from the LFO / mod wheel.

import { Svf } from './filter.js';
import { velocityCurve, clamp } from './util.js';

const CTRL = 8;

function hermite(d, pos, len) {
  const i = pos | 0;
  const f = pos - i;
  const x0 = i > 0 ? d[i - 1] : d[0];
  const x1 = d[i];
  const x2 = i + 1 < len ? d[i + 1] : x1;
  const x3 = i + 2 < len ? d[i + 2] : x2;
  const c0 = x1;
  const c1 = 0.5 * (x2 - x0);
  const c2 = x0 - 2.5 * x1 + 2 * x2 - 0.5 * x3;
  const c3 = 0.5 * (x3 - x0) + 1.5 * (x1 - x2);
  return ((c3 * f + c2) * f + c1) * f + c0;
}

export const samplerRenderer = {
  init(v, prog, part, core) {
    const sr = core.sr;
    let s = v.s;
    if (!s || s.kind !== 'sampler') s = v.s = { kind: 'sampler', svfL: new Svf(sr), svfL2: new Svf(sr), svfR: new Svf(sr), svfR2: new Svf(sr) };
    const bank = core.banks.get(prog.bank);
    s.sample = bank ? nearest(bank, v.note) : null;
    s.sr = sr;
    s.pos = 0;
    s.ctrl = 0;
    s.lfoTime = 0;
    s.pitchMul = 1;
    s.trem = 1;
    if (s.sample) {
      const smp = s.sample;
      s.base = (smp.rate / sr) * Math.pow(2, (v.note - smp.root + prog.transpose) / 12 + prog.fine / 1200);
      s.len = smp.L.length;
      s.stereo = !!smp.R;
      const loopOk = smp.loopEnd > smp.loopStart && smp.loopStart > 0;
      s.loop = prog.loop !== 'none' && loopOk && (prog.loop === 'on' || smp.loopAuto !== false);
      if (s.loop) {
        s.loopStart = smp.loopStart;
        s.loopEnd = smp.loopEnd;
        s.loopLen = smp.loopEnd - smp.loopStart;
        s.fade = Math.min(Math.round(prog.loopFade * smp.rate), smp.loopStart, s.loopLen >> 1);
        s.fadeStart = s.loopEnd - s.fade;
      }
      s.pos = Math.min(prog.start * smp.rate, s.len - 2);
    }
    v.env.set(prog.env.a, prog.env.d, prog.env.s, prog.env.r);
    v.fenv.set(prog.fenv.a, prog.fenv.d, prog.fenv.s, prog.fenv.r);
    v.env.level = 0;
    v.fenv.level = 0;
    v.env.trigger();
    v.fenv.trigger();
    v.lfo.phase = 0;
    s.svfL.reset();
    s.svfL2.reset();
    s.svfR.reset();
    s.svfR2.reset();
    s.amp = (1 - prog.velAmp + prog.velAmp * velocityCurve(v.vel * 127, prog.velCurve)) * prog.level;
  },
  retune(v, prog, part, core, legato) {
    const s = v.s;
    if (!s.sample) return;
    // mono/legato: keep the sample running, change its rate (glide is handled through v.freq)
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
    const s = v.s;
    if (!s.sample) return false;
    const prog = v.prog;
    const sr = s.sr;
    const smp = s.sample;
    const dL = smp.L,
      dR = smp.R || smp.L;
    const len = s.len;
    const fmode = prog.filterMode;
    const f24 = prog.filter24;
    const gl = v.gainL,
      gr = v.gainR;
    const loop = s.loop;
    let i = from;
    while (i < to) {
      if (s.ctrl <= 0) {
        s.ctrl = CTRL;
        if (v.freq !== v.targetFreq) {
          v.freq += (v.targetFreq - v.freq) * v.glideCoef * CTRL;
          if (Math.abs(v.freq - v.targetFreq) < 0.01) v.freq = v.targetFreq;
        }
        const lfoRate = prog.lfoBeats ? core.bpm / 60 / prog.lfoBeats : prog.lfo.rate;
        const lfoRaw = v.lfo.next(prog.lfoShape, (lfoRate * CTRL) / sr);
        s.lfoTime += CTRL / sr;
        const lfoAmt = s.lfoTime < prog.lfo.delay ? 0 : prog.lfo.fade > 0 ? clamp((s.lfoTime - prog.lfo.delay) / prog.lfo.fade, 0, 1) : 1;
        const lfo = lfoRaw * lfoAmt;
        const mod = part.modV;
        const vib = lfo * (prog.lfo.pitch + mod * prog.modWheel.vibrato);
        s.rate = s.base * (v.freq / v.baseFreq) * Math.exp((vib + part.bendSemis) * 0.057762265);
        s.trem = clamp(1 - (prog.lfo.amp + mod * prog.modWheel.amp) * (0.5 - 0.5 * lfo), 0, 1);
        if (fmode >= 0) {
          const f = prog.filter;
          const oct = f.env * v.fenv.level + f.key * ((v.note - 60) / 12) + lfo * prog.lfo.filter + mod * prog.modWheel.filter + f.vel * v.vel * 2;
          const cutoff = f.cutoff * Math.pow(2, oct);
          s.svfL.set(cutoff, f.res);
          s.svfR.set(cutoff, f.res);
          if (f24) {
            s.svfL2.set(cutoff, f.res * 0.6);
            s.svfR2.set(cutoff, f.res * 0.6);
          }
        }
        for (let k = 0; k < CTRL; k++) v.fenv.next();
      }
      const n = Math.min(to - i, s.ctrl);
      const rate = s.rate;
      for (let k = 0; k < n; k++) {
        let pos = s.pos;
        if (loop && pos >= s.loopEnd) {
          pos -= s.loopLen;
          s.pos = pos;
        }
        if (pos >= len - 2) return false;
        let l = hermite(dL, pos, len);
        let r = s.stereo ? hermite(dR, pos, len) : l;
        if (loop && pos >= s.fadeStart) {
          const w = (pos - s.fadeStart) / s.fade;
          const p2 = pos - s.loopLen;
          l += (hermite(dL, p2, len) - l) * w;
          r = s.stereo ? r + (hermite(dR, p2, len) - r) * w : l;
        }
        if (fmode >= 0) {
          l = s.svfL.process(l, fmode);
          r = s.svfR.process(r, fmode);
          if (f24) {
            l = s.svfL2.process(l, fmode);
            r = s.svfR2.process(r, fmode);
          }
        }
        const a = v.env.next() * s.amp * s.trem * part.exprV;
        L[i + k] += l * a * gl;
        R[i + k] += r * a * gr;
        s.pos = pos + rate;
      }
      i += n;
      s.ctrl -= n;
    }
    return v.env.active;
  },
};

/** The bank's sample nearest to this note (banks keep `notes` sorted). */
export function nearest(bank, note) {
  const ns = bank.notes;
  if (!ns.length) return null;
  let lo = 0,
    hi = ns.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ns[mid] < note) lo = mid + 1;
    else hi = mid;
  }
  let best = ns[lo];
  if (lo > 0 && Math.abs(ns[lo - 1] - note) < Math.abs(best - note)) best = ns[lo - 1];
  return bank.samples.get(best);
}
