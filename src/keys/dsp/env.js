// ADSR envelope with analogue-style curved segments. Levels are 0..1.

import { tcCoef } from './util.js';

export const IDLE = 0,
  ATTACK = 1,
  DECAY = 2,
  SUSTAIN = 3,
  RELEASE = 4;

export class Adsr {
  constructor(sr) {
    this.sr = sr;
    this.level = 0;
    this.stage = IDLE;
    this.set(0.005, 0.1, 1, 0.2);
  }
  /** Times in seconds, sustain 0..1. */
  set(a, d, s, r) {
    // Attack aims above 1 so it has an analogue bite and reaches 1 in `a` seconds exactly.
    this.aCoef = tcCoef(Math.max(0.0005, a) / 1.466, this.sr);
    this.dCoef = tcCoef(Math.max(0.001, d) / 3, this.sr);
    this.rCoef = tcCoef(Math.max(0.002, r) / 4, this.sr);
    this.sustain = s;
  }
  trigger() {
    this.stage = ATTACK;
  }
  release() {
    if (this.stage !== IDLE) this.stage = RELEASE;
  }
  /** Choke quickly (voice stealing): a 3 ms fade. */
  kill() {
    this.stage = RELEASE;
    this.rCoef = tcCoef(0.003, this.sr);
  }
  get active() {
    return this.stage !== IDLE;
  }
  next() {
    switch (this.stage) {
      case ATTACK:
        this.level += (1.3 - this.level) * this.aCoef;
        if (this.level >= 1) {
          this.level = 1;
          this.stage = DECAY;
        }
        break;
      case DECAY:
        this.level += (this.sustain - this.level) * this.dCoef;
        if (Math.abs(this.level - this.sustain) < 0.0005) {
          this.level = this.sustain;
          this.stage = SUSTAIN;
        }
        break;
      case SUSTAIN:
        this.level = this.sustain;
        break;
      case RELEASE:
        this.level -= this.level * this.rCoef;
        if (this.level < 0.0001) {
          this.level = 0;
          this.stage = IDLE;
        }
        break;
      default:
        break;
    }
    return this.level;
  }
}
