// Small DSP helpers shared by the sound engine. Pure functions and classes: no Web Audio here, so the
// same code runs in the AudioWorklet and in Node tests.

export const TWO_PI = Math.PI * 2;

export const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const hzToMidi = (f) => 69 + 12 * Math.log2(f / 440);
export const dbToGain = (db) => Math.pow(10, db / 20);
export const gainToDb = (g) => 20 * Math.log10(Math.max(1e-9, g));
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const semitones = (st) => Math.pow(2, st / 12);
export const cents = (c) => Math.pow(2, c / 1200);

/** Time constant (seconds) to a one-pole coefficient at this sample rate. */
export const tcCoef = (seconds, sr) => (seconds <= 0 ? 1 : 1 - Math.exp(-1 / (seconds * sr)));

/** A gentle, cheap tanh: -1..1 for any input, exact slope 1 around zero. */
export function softClip(x) {
  if (x > 3) return 1;
  if (x < -3) return -1;
  const x2 = x * x;
  return (x * (27 + x2)) / (27 + 9 * x2);
}

/** PolyBLEP correction for a phase t in [0,1) advanced by dt per sample. Subtract it from a saw, add at edges of a square. */
export function polyBlep(t, dt) {
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
}

/** Sine via a shared table: ~5x cheaper than Math.sin, good to about -80 dB. Phase in [0,1). */
const SINE_N = 4096;
const SINE = new Float32Array(SINE_N + 1);
for (let i = 0; i <= SINE_N; i++) SINE[i] = Math.sin((i / SINE_N) * TWO_PI);
export function sine(phase) {
  const p = (phase - Math.floor(phase)) * SINE_N;
  const i = p | 0;
  const f = p - i;
  return SINE[i] + (SINE[i + 1] - SINE[i]) * f;
}

/** A value that glides to its target with a one-pole lowpass: no zipper noise when a slider moves. */
export class Smooth {
  constructor(value = 0, coef = 0.002) {
    this.v = value;
    this.target = value;
    this.coef = coef;
  }
  set(target) {
    this.target = target;
  }
  jump(value) {
    this.v = this.target = value;
  }
  next() {
    this.v += (this.target - this.v) * this.coef;
    return this.v;
  }
  /** Advance by n samples at once (control rate). */
  skip(n) {
    this.v += (this.target - this.v) * (1 - Math.pow(1 - this.coef, n));
    return this.v;
  }
}

/** Deterministic xorshift noise: tests can compare renders, and two voices never share a sequence. */
export class Rng {
  constructor(seed = 0x9e3779b9) {
    this.s = seed >>> 0 || 1;
  }
  next() {
    let x = this.s;
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    this.s = x;
    return x / 4294967296;
  }
  /** -1..1 */
  bipolar() {
    return this.next() * 2 - 1;
  }
}

/** Pink noise from white (Paul Kellet's economy filter). */
export class Pink {
  constructor(rng) {
    this.rng = rng;
    this.b0 = this.b1 = this.b2 = 0;
  }
  next() {
    const w = this.rng.bipolar();
    this.b0 = 0.99765 * this.b0 + w * 0.099046;
    this.b1 = 0.963 * this.b1 + w * 0.2965164;
    this.b2 = 0.57 * this.b2 + w * 1.0526913;
    return (this.b0 + this.b1 + this.b2 + w * 0.1848) * 0.25;
  }
}

/** Velocity (1..127) to 0..1 with a playing-feel curve. */
export function velocityCurve(vel, curve = 'normal') {
  const v = clamp(vel / 127, 0, 1);
  switch (curve) {
    case 'soft':
      return Math.pow(v, 0.6);
    case 'hard':
      return Math.pow(v, 1.6);
    case 'fixed':
      return 0.8;
    default:
      return v;
  }
}

/** Note value names to beats (4/4): 'q' quarter, 'e' eighth, 'de' dotted eighth, 's' sixteenth, 't' eighth triplet... */
export const NOTE_BEATS = { w: 4, h: 2, dq: 3, q: 1, de: 0.75, e: 0.5, te: 1 / 3, ds: 0.375, s: 0.25, ts: 1 / 6 };
export const beatsToSeconds = (beats, bpm) => (beats * 60) / bpm;
