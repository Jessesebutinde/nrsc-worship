// Band-limited oscillators and an LFO.

import { polyBlep, sine, TWO_PI } from './util.js';

export const WAVES = ['saw', 'square', 'tri', 'sine', 'supersaw', 'noise', 'pulse'];

/** One phase accumulator; `wave` picks the shape. Phase is 0..1. */
export class Osc {
  constructor(phase = 0) {
    this.phase = phase;
    this.triState = 0;
  }
  /** Advance one sample. `dt` = freq / sr, `pw` pulse width 0.05..0.95 (square/pulse). */
  next(wave, dt, pw = 0.5) {
    let t = this.phase;
    let v;
    switch (wave) {
      case 0: // saw
        v = 2 * t - 1 - polyBlep(t, dt);
        break;
      case 1: // square / pulse
      case 6: {
        v = t < pw ? 1 : -1;
        v += polyBlep(t, dt);
        let t2 = t - pw;
        if (t2 < 0) t2 += 1;
        v -= polyBlep(t2, dt);
        break;
      }
      case 2: {
        // triangle: integrate a band-limited square (leaky), cleaner than the naive shape
        let sq = t < 0.5 ? 1 : -1;
        sq += polyBlep(t, dt);
        let t2 = t - 0.5;
        if (t2 < 0) t2 += 1;
        sq -= polyBlep(t2, dt);
        this.triState = this.triState * (1 - dt * 0.5) + sq * 4 * dt;
        v = this.triState;
        break;
      }
      case 3: // sine
        v = sine(t);
        break;
      default:
        v = 0;
    }
    t += dt;
    if (t >= 1) t -= 1;
    this.phase = t;
    return v;
  }
}

export const waveIndex = (name) => {
  const i = WAVES.indexOf(name);
  return i < 0 ? 0 : i;
};

/** JP-8000-style stack of 7 detuned saws. */
export const SUPERSAW_DETUNE = [-0.11002313, -0.06288439, -0.01952356, 0, 0.01991221, 0.06216538, 0.10745242];
export const SUPERSAW_GAIN = [0.55, 0.7, 0.85, 1, 0.85, 0.7, 0.55];

/** LFO: 0 sine, 1 tri, 2 square, 3 saw down, 4 sample&hold. Output -1..1. */
export class Lfo {
  constructor(rng) {
    this.phase = 0;
    this.rng = rng;
    this.hold = 0;
  }
  next(shape, dt) {
    const t = this.phase;
    let v;
    switch (shape) {
      case 1:
        v = t < 0.5 ? 4 * t - 1 : 3 - 4 * t;
        break;
      case 2:
        v = t < 0.5 ? 1 : -1;
        break;
      case 3:
        v = 1 - 2 * t;
        break;
      case 4:
        v = this.hold;
        break;
      default:
        v = sine(t);
    }
    this.phase += dt;
    if (this.phase >= 1) {
      this.phase -= 1;
      this.hold = this.rng ? this.rng.bipolar() : 0;
    }
    return v;
  }
}

export const LFO_SHAPES = ['sine', 'tri', 'square', 'saw', 'sh'];
export const lfoShape = (name) => Math.max(0, LFO_SHAPES.indexOf(name));
export { TWO_PI };
