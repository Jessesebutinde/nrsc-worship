// Filters: a trapezoidal state-variable filter (Simper) for the synth, one-poles, and an RBJ biquad.

import { clamp } from './util.js';

export class Svf {
  constructor(sr) {
    this.sr = sr;
    this.ic1 = this.ic2 = 0;
    this.k = 1;
    this.a1 = this.a2 = this.a3 = 0;
    this.set(1000, 0);
  }
  /** cutoff in Hz, res 0..1 (0.5 is a flat Butterworth-like response, 1 is nearly self-oscillating). */
  set(cutoff, res) {
    const fc = clamp(cutoff, 10, this.sr * 0.45);
    const g = Math.tan((Math.PI * fc) / this.sr);
    const k = 2 - 1.98 * clamp(res, 0, 1);
    this.k = k;
    this.a1 = 1 / (1 + g * (g + k));
    this.a2 = g * this.a1;
    this.a3 = g * this.a2;
  }
  reset() {
    this.ic1 = this.ic2 = 0;
  }
  /** Returns the lowpass; this.bp and this.hp hold the other outputs for the same input. */
  lp(v0) {
    const v3 = v0 - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3;
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    this.bp = v1;
    this.hp = v0 - this.k * v1 - v2;
    return v2;
  }
  process(v0, mode) {
    const lp = this.lp(v0);
    return mode === 1 ? this.hp : mode === 2 ? this.bp : lp;
  }
}

export const LP = 0,
  HP = 1,
  BP = 2;

/** y += c * (x - y) */
export class OnePole {
  constructor() {
    this.y = 0;
    this.c = 1;
  }
  setCutoff(hz, sr) {
    const x = Math.exp((-2 * Math.PI * clamp(hz, 1, sr * 0.49)) / sr);
    this.c = 1 - x;
  }
  lp(x) {
    this.y += this.c * (x - this.y);
    return this.y;
  }
  hp(x) {
    this.y += this.c * (x - this.y);
    return x - this.y;
  }
}

/** Removes DC: y = x - x1 + R y1 */
export class DcBlock {
  constructor(r = 0.995) {
    this.r = r;
    this.x1 = this.y1 = 0;
  }
  process(x) {
    const y = x - this.x1 + this.r * this.y1;
    this.x1 = x;
    this.y1 = y;
    return y;
  }
}

/** RBJ biquad (direct form I). */
export class Biquad {
  constructor() {
    this.b0 = 1;
    this.b1 = this.b2 = this.a1 = this.a2 = 0;
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
  }
  reset() {
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
  }
  _norm(b0, b1, b2, a0, a1, a2) {
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = a1 / a0;
    this.a2 = a2 / a0;
    return this;
  }
  lowpass(f, q, sr) {
    const w = (2 * Math.PI * clamp(f, 10, sr * 0.49)) / sr;
    const c = Math.cos(w),
      a = Math.sin(w) / (2 * q);
    return this._norm((1 - c) / 2, 1 - c, (1 - c) / 2, 1 + a, -2 * c, 1 - a);
  }
  highpass(f, q, sr) {
    const w = (2 * Math.PI * clamp(f, 10, sr * 0.49)) / sr;
    const c = Math.cos(w),
      a = Math.sin(w) / (2 * q);
    return this._norm((1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + a, -2 * c, 1 - a);
  }
  bandpass(f, q, sr) {
    const w = (2 * Math.PI * clamp(f, 10, sr * 0.49)) / sr;
    const c = Math.cos(w),
      a = Math.sin(w) / (2 * q);
    return this._norm(a, 0, -a, 1 + a, -2 * c, 1 - a);
  }
  peaking(f, q, dB, sr) {
    const A = Math.pow(10, dB / 40);
    const w = (2 * Math.PI * clamp(f, 10, sr * 0.49)) / sr;
    const c = Math.cos(w),
      a = Math.sin(w) / (2 * q);
    return this._norm(1 + a * A, -2 * c, 1 - a * A, 1 + a / A, -2 * c, 1 - a / A);
  }
  lowshelf(f, dB, sr) {
    const A = Math.pow(10, dB / 40);
    const w = (2 * Math.PI * clamp(f, 10, sr * 0.49)) / sr;
    const c = Math.cos(w),
      s = Math.sin(w);
    const beta = Math.sqrt(A) * s; // S = 1
    return this._norm(
      A * (A + 1 - (A - 1) * c + beta * 1),
      2 * A * (A - 1 - (A + 1) * c),
      A * (A + 1 - (A - 1) * c - beta),
      A + 1 + (A - 1) * c + beta,
      -2 * (A - 1 + (A + 1) * c),
      A + 1 + (A - 1) * c - beta,
    );
  }
  highshelf(f, dB, sr) {
    const A = Math.pow(10, dB / 40);
    const w = (2 * Math.PI * clamp(f, 10, sr * 0.49)) / sr;
    const c = Math.cos(w),
      s = Math.sin(w);
    const beta = Math.sqrt(A) * s;
    return this._norm(
      A * (A + 1 + (A - 1) * c + beta),
      -2 * A * (A - 1 + (A + 1) * c),
      A * (A + 1 + (A - 1) * c - beta),
      A + 1 - (A - 1) * c + beta,
      2 * (A - 1 - (A + 1) * c),
      A + 1 - (A - 1) * c - beta,
    );
  }
  process(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

/** First-order allpass: a touch of dispersion (string stiffness) or a fractional-delay tuning stage. */
export class Allpass1 {
  constructor() {
    this.a = 0;
    this.x1 = this.y1 = 0;
  }
  process(x) {
    const y = this.a * x + this.x1 - this.a * this.y1;
    this.x1 = x;
    this.y1 = y;
    return y;
  }
}
