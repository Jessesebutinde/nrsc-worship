// A small synthesized kit for grooves and the metronome: kick, snare, rim, hats, clap, congas, cowbell (cloche),
// shaker, crash, ride, claves, bongos. GM note numbers.

import { Biquad } from './filter.js';
import { sine, clamp } from './util.js';

const KIT = {
  35: 'kick808', 36: 'kick', 31: 'snap', 65: 'talkHi', 66: 'talkLo', 67: 'agogoHi', 68: 'agogoLo', 38: 'snare', 40: 'snare', 37: 'rim', 42: 'chh', 44: 'phh', 46: 'ohh', 39: 'clap',
  49: 'crash', 57: 'crash', 51: 'ride', 59: 'ride', 56: 'cowbell', 70: 'shaker', 69: 'shaker', 54: 'tamb',
  75: 'claves', 62: 'congaMute', 63: 'congaHi', 64: 'congaLo', 60: 'bongoHi', 61: 'bongoLo', 33: 'click', 34: 'clickHi',
  45: 'tom', 47: 'tom', 48: 'tomHi', 50: 'tomHi', 43: 'tomLo', 41: 'tomLo',
};
export const DRUM_NAMES = KIT;

export const drumsRenderer = {
  init(v, prog, part, core) {
    const sr = core.sr;
    let s = v.s;
    if (!s || s.kind !== 'drums') s = v.s = { kind: 'drums', f1: new Biquad(), f2: new Biquad() };
    const kind = KIT[v.note] || 'rim';
    s.kind = 'drums';
    s.what = kind;
    s.t = 0;
    s.sr = sr;
    s.ph = 0;
    s.ph2 = 0;
    s.amp = 1;
    s.vel = clamp(v.vel, 0.1, 1);
    const tune = Math.pow(2, prog.tune / 12);
    const dec = prog.decay;
    s.tune = tune;
    s.f1.reset();
    s.f2.reset();
    switch (kind) {
      case 'kick':
        s.len = 0.5 * dec; s.decay = 0.12 * dec; s.f0 = 48 * tune; s.sweep = 140 * tune; s.sweepT = 0.035; break;
      case 'kick808':
        s.len = 1.4 * dec; s.decay = 0.45 * dec; s.f0 = 46 * tune; s.sweep = 70 * tune; s.sweepT = 0.05; break;
      case 'snap':
        s.len = 0.12; s.decay = 0.022; s.f1.bandpass(2300, 1.4, sr); s.f2.highpass(1200, 0.7, sr); break;
      case 'talkHi':
        s.len = 0.45 * dec; s.decay = 0.12 * dec; s.f0 = 190 * tune; s.sweep = 1.3; s.sweepT = 0.09; break;
      case 'talkLo':
        s.len = 0.5 * dec; s.decay = 0.14 * dec; s.f0 = 130 * tune; s.sweep = 1.35; s.sweepT = 0.11; break;
      case 'agogoHi':
        s.len = 0.4 * dec; s.decay = 0.09 * dec; s.f0 = 920 * tune; break;
      case 'agogoLo':
        s.len = 0.45 * dec; s.decay = 0.1 * dec; s.f0 = 690 * tune; break;
      case 'snare':
        s.len = 0.35 * dec; s.decay = 0.07 * dec; s.f0 = 185 * tune; s.f1.highpass(1200, 0.7, sr); s.f2.peaking(3200, 1, 6, sr); break;
      case 'rim':
        s.len = 0.06; s.decay = 0.012; s.f0 = 440 * tune; s.f1.bandpass(1800, 2, sr); break;
      case 'chh':
        s.len = 0.07 * dec; s.decay = 0.018 * dec; s.f1.highpass(7000, 0.7, sr); break;
      case 'phh':
        s.len = 0.12 * dec; s.decay = 0.03 * dec; s.f1.highpass(6500, 0.7, sr); break;
      case 'ohh':
        s.len = 0.45 * dec; s.decay = 0.11 * dec; s.f1.highpass(6000, 0.7, sr); break;
      case 'clap':
        s.len = 0.25 * dec; s.decay = 0.045 * dec; s.f1.bandpass(1300, 1.2, sr); break;
      case 'crash':
        s.len = 1.6 * dec; s.decay = 0.4 * dec; s.f1.highpass(4500, 0.5, sr); break;
      case 'ride':
        s.len = 1.0 * dec; s.decay = 0.3 * dec; s.f1.highpass(5000, 0.5, sr); break;
      case 'cowbell':
        s.len = 0.35 * dec; s.decay = 0.07 * dec; s.f0 = 562 * tune; s.f1.bandpass(2200, 1.5, sr); break;
      case 'shaker':
        s.len = 0.09 * dec; s.decay = 0.02 * dec; s.f1.bandpass(6500, 1.5, sr); break;
      case 'tamb':
        s.len = 0.18 * dec; s.decay = 0.04 * dec; s.f1.highpass(6000, 0.7, sr); break;
      case 'claves':
        s.len = 0.05; s.decay = 0.01; s.f0 = 2500 * tune; break;
      case 'congaMute':
        s.len = 0.09; s.decay = 0.02; s.f0 = 420 * tune; break;
      case 'congaHi':
        s.len = 0.3 * dec; s.decay = 0.07 * dec; s.f0 = 380 * tune; break;
      case 'congaLo':
        s.len = 0.4 * dec; s.decay = 0.09 * dec; s.f0 = 240 * tune; break;
      case 'bongoHi':
        s.len = 0.15; s.decay = 0.035; s.f0 = 620 * tune; break;
      case 'bongoLo':
        s.len = 0.18; s.decay = 0.04; s.f0 = 420 * tune; break;
      case 'tomHi':
        s.len = 0.4 * dec; s.decay = 0.1 * dec; s.f0 = 200 * tune; s.sweep = 60; s.sweepT = 0.05; break;
      case 'tom':
        s.len = 0.45 * dec; s.decay = 0.11 * dec; s.f0 = 140 * tune; s.sweep = 50; s.sweepT = 0.06; break;
      case 'tomLo':
        s.len = 0.5 * dec; s.decay = 0.13 * dec; s.f0 = 95 * tune; s.sweep = 40; s.sweepT = 0.07; break;
      case 'clickHi':
        s.len = 0.03; s.decay = 0.006; s.f0 = 1800; break;
      default: // click
        s.len = 0.03; s.decay = 0.006; s.f0 = 1200; break;
    }
    s.amp = v.prog.level * s.vel * 0.55;
  },
  retune() {},
  release() {},
  kill(v) {
    v.s.len = 0;
  },
  render(v, L, R, from, to, part, core) {
    const s = v.s;
    const sr = s.sr;
    const gl = v.gainL,
      gr = v.gainR;
    const what = s.what;
    for (let i = from; i < to; i++) {
      const t = s.t;
      if (t >= s.len) return false;
      const env = Math.exp(-t / s.decay);
      let x = 0;
      switch (what) {
        case 'kick': {
          const f = s.f0 + s.sweep * Math.exp(-t / s.sweepT);
          s.ph += f / sr;
          x = sine(s.ph) * env * 1.6 + (t < 0.002 ? v.rng.bipolar() * 0.5 : 0);
          x = Math.tanh(x);
          break;
        }
        case 'kick808': {
          // a long sub boom that drops in pitch and saturates a little: the trap and afrobeats low end
          const f = s.f0 + s.sweep * Math.exp(-t / s.sweepT);
          s.ph += f / sr;
          x = Math.tanh(sine(s.ph) * env * 1.8) * 0.95;
          break;
        }
        case 'snap': {
          // finger snap: a hard click and a short bright burst
          const click = t < 0.0015 ? 1 - t / 0.0015 : 0;
          x = s.f1.process(v.rng.bipolar()) * env * 2.2 + s.f2.process(click) * 0.8;
          break;
        }
        case 'talkHi':
        case 'talkLo': {
          // talking drum: a skin whose pitch is squeezed up after the hit
          const bend = 1 + (s.sweep - 1) * (1 - Math.exp(-t / s.sweepT));
          s.ph += (s.f0 * bend) / sr;
          s.ph2 += (s.f0 * bend * 1.58) / sr;
          x = (sine(s.ph) + 0.3 * sine(s.ph2)) * env * 0.95 + v.rng.bipolar() * Math.exp(-t / 0.006) * 0.3;
          break;
        }
        case 'agogoHi':
        case 'agogoLo': {
          // a cast bell: two inharmonic partials
          s.ph += s.f0 / sr;
          s.ph2 += (s.f0 * 2.76) / sr;
          x = (sine(s.ph) * 0.8 + sine(s.ph2) * 0.35 * Math.exp(-t / 0.03)) * env * 0.9;
          break;
        }
        case 'snare': {
          s.ph += s.f0 / sr;
          const tone = sine(s.ph) * Math.exp(-t / 0.045) * 0.6;
          const nz = s.f2.process(s.f1.process(v.rng.bipolar())) * env * 0.9;
          x = tone + nz;
          break;
        }
        case 'rim': {
          s.ph += s.f0 / sr;
          x = (sine(s.ph) > 0 ? 1 : -1) * Math.exp(-t / 0.004) * 0.7 + s.f1.process(v.rng.bipolar()) * env * 1.2;
          break;
        }
        case 'chh':
        case 'phh':
        case 'ohh':
        case 'crash':
        case 'tamb':
          x = s.f1.process(v.rng.bipolar()) * env * (what === 'crash' ? 0.8 : 0.9);
          if (what === 'tamb') x *= 0.6 + 0.4 * sine(t * 90);
          break;
        case 'ride': {
          s.ph += 870 / sr;
          s.ph2 += 1340 / sr;
          x = (sine(s.ph) * 0.3 + sine(s.ph2) * 0.25 + s.f1.process(v.rng.bipolar()) * 0.5) * env * 0.8;
          break;
        }
        case 'clap': {
          // three quick bursts then a tail
          const burst = t < 0.03 ? Math.exp(-((t * 1000) % 10) / 3) : env;
          x = s.f1.process(v.rng.bipolar()) * burst * 1.3;
          break;
        }
        case 'cowbell': {
          s.ph += s.f0 / sr;
          s.ph2 += (s.f0 * 1.5) / sr;
          const sq = (sine(s.ph) > 0 ? 1 : -1) * 0.5 + (sine(s.ph2) > 0 ? 1 : -1) * 0.5;
          x = s.f1.process(sq) * env * 1.4;
          break;
        }
        case 'shaker':
          x = s.f1.process(v.rng.bipolar()) * env * (t < 0.006 ? t / 0.006 : 1) * 1.2;
          break;
        case 'claves':
          s.ph += s.f0 / sr;
          x = sine(s.ph) * env * 0.9;
          break;
        case 'tom':
        case 'tomHi':
        case 'tomLo': {
          const f = s.f0 + s.sweep * Math.exp(-t / s.sweepT);
          s.ph += f / sr;
          x = sine(s.ph) * env * 1.1 + v.rng.bipolar() * Math.exp(-t / 0.01) * 0.2;
          break;
        }
        case 'congaMute':
        case 'congaHi':
        case 'congaLo':
        case 'bongoHi':
        case 'bongoLo': {
          const f = s.f0 * (1 + 0.12 * Math.exp(-t / 0.02));
          s.ph += f / sr;
          x = sine(s.ph) * env * 1.0 + v.rng.bipolar() * Math.exp(-t / 0.004) * 0.25;
          break;
        }
        default: {
          s.ph += s.f0 / sr;
          x = sine(s.ph) * env;
        }
      }
      const a = x * s.amp * part.exprV;
      L[i] += a * gl;
      R[i] += a * gr;
      s.t += 1 / sr;
    }
    return s.t < s.len;
  },
};
