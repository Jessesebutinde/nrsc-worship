// The effect chain of one part, built from Web Audio nodes: compressor, drive/amp, EQ, chorus family,
// tremolo/auto-pan, rotary speaker, tempo-synced delay, convolution reverb (with a shimmer loop).
// Each stage is always connected; "off" just ramps its wet gain down, so switching never clicks.

import { NOTE_BEATS, clamp } from './dsp/util.js';

export const FX_ORDER = ['comp', 'drive', 'eq', 'mod', 'trem', 'rotary', 'delay', 'reverb'];

export function defaultFx() {
  return {
    comp: { on: false, thresh: -24, ratio: 4, attack: 0.005, release: 0.2, gain: 0 },
    drive: { on: false, amount: 0.3, tone: 0.5, level: 1, type: 'tube' },
    eq: { on: false, low: 0, mid: 0, midFreq: 900, high: 0, hpf: 0 },
    mod: { on: false, type: 'chorus', rate: 0.8, depth: 0.5, mix: 0.4, feedback: 0, side: 0 },
    trem: { on: false, type: 'tremolo', rate: 5, depth: 0.5, sync: '', shape: 'sine' },
    rotary: { on: false, speed: 'slow', drive: 0.2, balance: 0.5 },
    delay: { on: false, time: 'e', ms: 250, sync: true, feedback: 0.25, mix: 0.2, tone: 4000, pingpong: false, spread: 1 },
    reverb: { on: false, type: 'hall', decay: 3, predelay: 0.02, damp: 0.5, mix: 0.25, shimmer: 0.5, lowcut: 150 },
  };
}

/** A full fx state from a partial one (each stage merged over its defaults). */
export function mergeFx(partial) {
  const d = defaultFx();
  for (const k of FX_ORDER) if (partial && partial[k]) d[k] = { ...d[k], ...partial[k] };
  return d;
}

const RAMP = 0.03;
const ramp = (param, value, ctx, tc = RAMP) => {
  param.cancelScheduledValues(ctx.currentTime);
  param.setTargetAtTime(value, ctx.currentTime, tc);
};

/** A stage with a dry path and a wet path mixed at the output. */
class Stage {
  constructor(ctx) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.dry = ctx.createGain();
    this.wet = ctx.createGain();
    this.wet.gain.value = 0;
    this.input.connect(this.dry).connect(this.output);
    this.wet.connect(this.output);
    this.on = false;
  }
  /** mix 1 = fully wet (insert effects), smaller = parallel blend. */
  setOn(on, mix = 1) {
    this.on = !!on;
    ramp(this.wet.gain, on ? mix : 0, this.ctx);
    ramp(this.dry.gain, on ? 1 - mix : 1, this.ctx);
  }
}

// ------------------------------------------------------------------ compressor

class Comp extends Stage {
  constructor(ctx) {
    super(ctx);
    this.c = ctx.createDynamicsCompressor();
    this.c.knee.value = 6;
    this.make = ctx.createGain();
    this.input.connect(this.c).connect(this.make).connect(this.wet);
  }
  set(p) {
    const c = this.c,
      ctx = this.ctx;
    ramp(c.threshold, clamp(p.thresh, -60, 0), ctx);
    ramp(c.ratio, clamp(p.ratio, 1, 20), ctx);
    ramp(c.attack, clamp(p.attack, 0, 1), ctx);
    ramp(c.release, clamp(p.release, 0.01, 1), ctx);
    ramp(this.make.gain, Math.pow(10, clamp(p.gain, -12, 24) / 20), ctx);
    this.setOn(p.on);
  }
}

// ------------------------------------------------------------------ drive / amp

const CURVES = {};
function curve(type, amount) {
  const key = type + ':' + Math.round(amount * 20);
  if (CURVES[key]) return CURVES[key];
  const n = 2048;
  const c = new Float32Array(n);
  const k = 1 + amount * (type === 'fuzz' ? 60 : type === 'crunch' ? 25 : type === 'amp' ? 12 : 8);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    let y;
    switch (type) {
      case 'fuzz':
        y = Math.max(-0.8, Math.min(0.8, x * k)); // hard
        break;
      case 'crunch':
        y = Math.tanh(x * k) * 0.9 + 0.05 * x; // a bit of clean through
        break;
      case 'amp':
        y = Math.tanh(x * k * (x > 0 ? 1 : 0.85)); // asymmetric, like a tube stage
        break;
      default:
        y = Math.tanh(x * k) / Math.tanh(k) ** 0.3;
    }
    c[i] = y / Math.sqrt(k) ** 0.5;
  }
  CURVES[key] = c;
  return c;
}

class Drive extends Stage {
  constructor(ctx) {
    super(ctx);
    this.hp = ctx.createBiquadFilter();
    this.hp.type = 'highpass';
    this.hp.frequency.value = 70;
    this.shaper = ctx.createWaveShaper();
    this.shaper.oversample = '4x';
    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.Q.value = 0.6;
    this.presence = ctx.createBiquadFilter();
    this.presence.type = 'peaking';
    this.presence.frequency.value = 2600;
    this.presence.Q.value = 0.9;
    this.level = ctx.createGain();
    this.input.connect(this.hp).connect(this.shaper).connect(this.tone).connect(this.presence).connect(this.level).connect(this.wet);
  }
  set(p) {
    const ctx = this.ctx;
    this.shaper.curve = curve(p.type || 'tube', clamp(p.amount, 0, 1));
    ramp(this.tone.frequency, 1200 + Math.pow(clamp(p.tone, 0, 1), 1.5) * 9000, ctx);
    ramp(this.presence.gain, p.type === 'amp' ? 3 : 0, ctx);
    ramp(this.level.gain, clamp(p.level, 0, 2), ctx);
    this.setOn(p.on);
  }
}

// ------------------------------------------------------------------ EQ

class Eq extends Stage {
  constructor(ctx) {
    super(ctx);
    this.hpf = ctx.createBiquadFilter();
    this.hpf.type = 'highpass';
    this.hpf.frequency.value = 10;
    this.low = ctx.createBiquadFilter();
    this.low.type = 'lowshelf';
    this.low.frequency.value = 120;
    this.mid = ctx.createBiquadFilter();
    this.mid.type = 'peaking';
    this.mid.Q.value = 1;
    this.high = ctx.createBiquadFilter();
    this.high.type = 'highshelf';
    this.high.frequency.value = 5000;
    this.input.connect(this.hpf).connect(this.low).connect(this.mid).connect(this.high).connect(this.wet);
  }
  set(p) {
    const ctx = this.ctx;
    ramp(this.hpf.frequency, p.hpf > 0 ? clamp(p.hpf, 20, 2000) : 10, ctx);
    ramp(this.low.gain, clamp(p.low, -18, 18), ctx);
    ramp(this.mid.gain, clamp(p.mid, -18, 18), ctx);
    ramp(this.mid.frequency, clamp(p.midFreq, 100, 8000), ctx);
    ramp(this.high.gain, clamp(p.high, -18, 18), ctx);
    this.setOn(p.on);
  }
}

// ------------------------------------------------------------------ chorus / flanger / phaser / ensemble

function cosineWave(ctx) {
  if (!ctx._cosWave) ctx._cosWave = ctx.createPeriodicWave(new Float32Array([0, 1]), new Float32Array([0, 0]));
  return ctx._cosWave;
}

class Mod extends Stage {
  constructor(ctx) {
    super(ctx);
    this.type = null;
    this.lfoRate = 0.8;
    this.lfoA = ctx.createOscillator(); // sine
    this.lfoB = ctx.createOscillator(); // cosine: 90 degrees apart for stereo movement
    this.lfoB.setPeriodicWave(cosineWave(ctx));
    this.lfoA.start();
    this.lfoB.start();
    this.depthA = ctx.createGain();
    this.depthB = ctx.createGain();
    this.lfoA.connect(this.depthA);
    this.lfoB.connect(this.depthB);
    this.split = ctx.createChannelSplitter(2);
    this.merge = ctx.createChannelMerger(2);
    this.input.connect(this.split);
    this.wetL = ctx.createGain();
    this.wetR = ctx.createGain();
    this.wetL.connect(this.merge, 0, 0);
    this.wetR.connect(this.merge, 0, 1);
    this.merge.connect(this.wet);
    this.build('chorus');
  }
  build(type) {
    if (this.type === type) return;
    const ctx = this.ctx;
    // tear down the old voices
    for (const n of this.nodes || []) n.disconnect();
    this.nodes = [];
    this.type = type;
    this.depthA.disconnect();
    this.depthB.disconnect();
    const mono = ctx.createGain();
    this.split.connect(mono, 0);
    this.split.connect(mono, 1);
    mono.gain.value = 0.5;
    this.nodes.push(mono);
    if (type === 'phaser') {
      const bases = [300, 600, 1200, 2400];
      let node = mono;
      this.allpass = [];
      for (const f of bases) {
        const ap = ctx.createBiquadFilter();
        ap.type = 'allpass';
        ap.Q.value = 0.7;
        ap.frequency.value = f;
        node.connect(ap);
        node = ap;
        this.nodes.push(ap);
        this.allpass.push(ap);
        this.depthA.connect(ap.frequency);
      }
      this.fb = ctx.createGain();
      node.connect(this.fb).connect(this.allpass[0]);
      this.nodes.push(this.fb);
      node.connect(this.wetL);
      node.connect(this.wetR);
      return;
    }
    const voices = type === 'ensemble' ? 3 : type === 'flanger' ? 1 : 2;
    this.delays = [];
    this.fb = ctx.createGain();
    this.nodes.push(this.fb);
    for (let v = 0; v < voices; v++) {
      const d = ctx.createDelay(0.1);
      mono.connect(d);
      if (v === 0) {
        d.connect(this.fb).connect(d);
      }
      // alternate sine/cosine LFOs and left/right outputs for width
      (v % 2 === 0 ? this.depthA : this.depthB).connect(d.delayTime);
      if (type === 'flanger') {
        d.connect(this.wetL);
        d.connect(this.wetR);
      } else {
        d.connect(v % 2 === 0 ? this.wetL : this.wetR);
        if (voices === 3) d.connect(v % 2 === 0 ? this.wetR : this.wetL);
      }
      this.delays.push(d);
      this.nodes.push(d);
    }
  }
  set(p) {
    const ctx = this.ctx;
    this.build(p.type || 'chorus');
    const rate = clamp(p.rate, 0.02, 12);
    const depth = clamp(p.depth, 0, 1);
    ramp(this.lfoA.frequency, rate, ctx);
    ramp(this.lfoB.frequency, rate * (this.type === 'ensemble' ? 0.73 : 1), ctx);
    if (this.type === 'phaser') {
      ramp(this.depthA.gain, 200 + depth * 1400, ctx);
      ramp(this.fb.gain, clamp(p.feedback, 0, 0.9), ctx);
    } else if (this.type === 'flanger') {
      this.delays[0].delayTime.value = 0.0045;
      ramp(this.depthA.gain, 0.0005 + depth * 0.0035, ctx);
      ramp(this.fb.gain, clamp(p.feedback, -0.9, 0.9), ctx);
    } else {
      this.delays.forEach((d, i) => {
        d.delayTime.value = [0.012, 0.019, 0.026][i];
      });
      const amt = 0.0008 + depth * 0.004;
      ramp(this.depthA.gain, amt, ctx);
      ramp(this.depthB.gain, amt * 0.8, ctx);
      ramp(this.fb.gain, clamp(p.feedback, 0, 0.6), ctx);
    }
    // "side": 1 = wet only on the right, dry on the left (the Roland JC stereo-chorus trick soukous players love)
    const side = clamp(p.side || 0, 0, 1);
    const mix = clamp(p.mix, 0, 1);
    ramp(this.wetL.gain, 1 - side, ctx);
    ramp(this.wetR.gain, 1, ctx);
    this.setOn(p.on, this.type === 'phaser' || this.type === 'flanger' ? mix : mix);
  }
}

// ------------------------------------------------------------------ tremolo / auto-pan

class Trem extends Stage {
  constructor(ctx) {
    super(ctx);
    this.lfo = ctx.createOscillator();
    this.lfo.start();
    this.lfoInv = ctx.createGain();
    this.lfoInv.gain.value = -1;
    this.lfo.connect(this.lfoInv);
    this.depthL = ctx.createGain();
    this.depthR = ctx.createGain();
    this.lfo.connect(this.depthL);
    this.lfoInv.connect(this.depthR);
    this.split = ctx.createChannelSplitter(2);
    this.merge = ctx.createChannelMerger(2);
    this.gL = ctx.createGain();
    this.gR = ctx.createGain();
    this.input.connect(this.split);
    this.split.connect(this.gL, 0);
    this.split.connect(this.gR, 1);
    this.depthL.connect(this.gL.gain);
    this.depthR.connect(this.gR.gain);
    this.gL.connect(this.merge, 0, 0);
    this.gR.connect(this.merge, 0, 1);
    this.merge.connect(this.wet);
  }
  set(p, bpm) {
    const ctx = this.ctx;
    const rate = p.sync && NOTE_BEATS[p.sync] ? bpm / 60 / NOTE_BEATS[p.sync] : clamp(p.rate, 0.1, 20);
    this.lfo.type = p.shape === 'square' ? 'square' : p.shape === 'tri' ? 'triangle' : 'sine';
    ramp(this.lfo.frequency, rate, ctx);
    const depth = clamp(p.depth, 0, 1) * 0.5;
    ramp(this.gL.gain, 1 - depth, ctx);
    ramp(this.gR.gain, 1 - depth, ctx);
    ramp(this.depthL.gain, depth, ctx);
    ramp(this.depthR.gain, p.type === 'autopan' ? depth : -depth, ctx);
    this.setOn(p.on);
  }
}

// ------------------------------------------------------------------ rotary (Leslie)

class Rotary extends Stage {
  constructor(ctx) {
    super(ctx);
    this.pre = ctx.createWaveShaper();
    this.pre.oversample = '2x';
    this.pre.curve = curve('amp', 0.15);
    this.preGain = ctx.createGain();
    this.lo = ctx.createBiquadFilter();
    this.lo.type = 'lowpass';
    this.lo.frequency.value = 800;
    this.hi = ctx.createBiquadFilter();
    this.hi.type = 'highpass';
    this.hi.frequency.value = 800;
    this.input.connect(this.preGain).connect(this.pre);
    this.pre.connect(this.lo);
    this.pre.connect(this.hi);
    this.horn = this.rotor(this.hi, 0.0009, 0.45, 0.9);
    this.drum = this.rotor(this.lo, 0.0003, 0.3, 0.45);
    this.hornOut = ctx.createGain();
    this.drumOut = ctx.createGain();
    this.horn.out.connect(this.hornOut).connect(this.wet);
    this.drum.out.connect(this.drumOut).connect(this.wet);
  }
  rotor(src, doppler, am, pan) {
    const ctx = this.ctx;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.8;
    lfo.start();
    const d = ctx.createDelay(0.01);
    d.delayTime.value = doppler + 0.001;
    const dop = ctx.createGain();
    dop.gain.value = doppler;
    lfo.connect(dop).connect(d.delayTime);
    const g = ctx.createGain();
    g.gain.value = 1 - am;
    const amG = ctx.createGain();
    amG.gain.value = am;
    lfo.connect(amG).connect(g.gain);
    const panner = ctx.createStereoPanner();
    const panG = ctx.createGain();
    panG.gain.value = pan;
    lfo.connect(panG).connect(panner.pan);
    src.connect(d).connect(g).connect(panner);
    return { lfo, out: panner };
  }
  set(p) {
    const ctx = this.ctx;
    const speed = p.speed || 'slow';
    const hornHz = speed === 'fast' ? 6.7 : speed === 'stop' ? 0.001 : 0.75;
    const drumHz = speed === 'fast' ? 5.9 : speed === 'stop' ? 0.001 : 0.66;
    const now = ctx.currentTime;
    // the horn spins up faster than the heavy drum
    this.horn.lfo.frequency.cancelScheduledValues(now);
    this.horn.lfo.frequency.setTargetAtTime(hornHz, now, speed === 'fast' ? 0.6 : 1.2);
    this.drum.lfo.frequency.cancelScheduledValues(now);
    this.drum.lfo.frequency.setTargetAtTime(drumHz, now, speed === 'fast' ? 1.8 : 2.6);
    ramp(this.preGain.gain, 0.8 + clamp(p.drive, 0, 1) * 2.2, ctx);
    const bal = clamp(p.balance == null ? 0.5 : p.balance, 0, 1);
    ramp(this.hornOut.gain, 0.45 + bal * 0.5, ctx);
    ramp(this.drumOut.gain, 0.95 - bal * 0.5, ctx);
    this.setOn(p.on);
  }
}

// ------------------------------------------------------------------ delay

class Delay extends Stage {
  constructor(ctx) {
    super(ctx);
    this.dL = ctx.createDelay(3);
    this.dR = ctx.createDelay(3);
    this.fbL = ctx.createGain();
    this.fbR = ctx.createGain();
    this.toneL = ctx.createBiquadFilter();
    this.toneR = ctx.createBiquadFilter();
    this.toneL.type = this.toneR.type = 'lowpass';
    this.hp = ctx.createBiquadFilter();
    this.hp.type = 'highpass';
    this.hp.frequency.value = 120;
    this.split = ctx.createChannelSplitter(2);
    this.merge = ctx.createChannelMerger(2);
    this.input.connect(this.hp).connect(this.split);
    this.inL = ctx.createGain();
    this.inR = ctx.createGain();
    this.split.connect(this.inL, 0);
    this.split.connect(this.inR, 1);
    this.inL.connect(this.dL);
    this.inR.connect(this.dR);
    this.dL.connect(this.toneL).connect(this.fbL);
    this.dR.connect(this.toneR).connect(this.fbR);
    // feedback routing: straight or crossed (ping-pong); both pairs exist, gains decide
    this.straightL = ctx.createGain();
    this.straightR = ctx.createGain();
    this.crossL = ctx.createGain();
    this.crossR = ctx.createGain();
    this.fbL.connect(this.straightL).connect(this.dL);
    this.fbR.connect(this.straightR).connect(this.dR);
    this.fbL.connect(this.crossL).connect(this.dR);
    this.fbR.connect(this.crossR).connect(this.dL);
    this.dL.connect(this.merge, 0, 0);
    this.dR.connect(this.merge, 0, 1);
    this.merge.connect(this.wet);
  }
  set(p, bpm) {
    const ctx = this.ctx;
    let secs = p.sync && NOTE_BEATS[p.time] ? (NOTE_BEATS[p.time] * 60) / bpm : clamp(p.ms, 10, 2500) / 1000;
    secs = clamp(secs, 0.01, 2.9);
    const spread = clamp(p.spread == null ? 1 : p.spread, 0.25, 2);
    ramp(this.dL.delayTime, secs, ctx, 0.05);
    ramp(this.dR.delayTime, clamp(secs * spread, 0.01, 2.9), ctx, 0.05);
    const fb = clamp(p.feedback, 0, 0.95);
    ramp(this.fbL.gain, fb, ctx);
    ramp(this.fbR.gain, fb, ctx);
    const pp = !!p.pingpong;
    ramp(this.straightL.gain, pp ? 0 : 1, ctx);
    ramp(this.straightR.gain, pp ? 0 : 1, ctx);
    ramp(this.crossL.gain, pp ? 1 : 0, ctx);
    ramp(this.crossR.gain, pp ? 1 : 0, ctx);
    // ping-pong: feed only the left delay so the echo bounces
    ramp(this.inR.gain, pp ? 0 : 1, ctx);
    ramp(this.inL.gain, 1, ctx);
    const tone = clamp(p.tone, 300, 18000);
    ramp(this.toneL.frequency, tone, ctx);
    ramp(this.toneR.frequency, tone, ctx);
    this.setOn(p.on, clamp(p.mix, 0, 1));
  }
}

// ------------------------------------------------------------------ reverb

const IRS = new Map();

/** Builds a stereo impulse response: early reflections plus a decaying, progressively darker noise tail. */
export function generateImpulse({ type = 'hall', decay = 3, damp = 0.5, sr = 48000 }) {
  const key = `${type}:${decay.toFixed(2)}:${damp.toFixed(2)}:${sr}`;
  if (IRS.has(key)) return IRS.get(key);
  const t60 = clamp(decay, 0.1, 15);
  const len = Math.max(Math.round(sr * Math.min(t60 * 1.1 + 0.1, 16)), sr * 0.2);
  const L = new Float32Array(len);
  const R = new Float32Array(len);
  let seed = 12345;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296 - 0.5;
  };
  // tail: exponential decay; darker over time as 'damp' rises
  const k = Math.log(1000) / (t60 * sr);
  const bright = type === 'plate' ? 1 : type === 'cathedral' ? 0.4 : 0.75;
  let lpL = 0,
    lpR = 0;
  const start = type === 'room' ? 0.004 : type === 'plate' ? 0.001 : 0.012;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const env = Math.exp(-k * i);
    // lowpass coefficient falls with time: the air and walls eat the highs first
    const c = clamp(bright * (1 - damp * 0.85 * Math.min(1, t / Math.max(0.3, t60 * 0.6))), 0.03, 1);
    lpL += c * (rnd() * 2 - lpL);
    lpR += c * (rnd() * 2 - lpR);
    const build = t < start ? 0 : Math.min(1, (t - start) / (type === 'plate' ? 0.005 : 0.03));
    L[i] = lpL * env * build;
    R[i] = lpR * env * build;
  }
  // early reflections
  const taps = type === 'room' ? [[0.007, 0.5], [0.013, 0.4], [0.019, 0.3], [0.027, 0.25]] : type === 'plate' ? [] : [[0.015, 0.4], [0.023, 0.3], [0.031, 0.25], [0.047, 0.2], [0.061, 0.15]];
  for (const [tt, g] of taps) {
    const i = Math.round(tt * sr);
    if (i < len) {
      L[i] += g * (rnd() > 0 ? 1 : -1) * 0.5;
      R[Math.min(len - 1, i + 7)] += g * (rnd() > 0 ? 1 : -1) * 0.5;
    }
  }
  if (type === 'spring') {
    // the "drip": a short repeating echo inside the tail
    const per = Math.round(sr * 0.021);
    for (let i = per; i < len; i++) {
      L[i] += L[i - per] * 0.35;
      R[i] += R[i - per] * 0.35;
    }
  }
  // normalise energy
  let e = 0;
  for (let i = 0; i < len; i++) e += L[i] * L[i] + R[i] * R[i];
  const g = 1 / Math.sqrt(Math.max(1e-9, e)) * 2.2;
  for (let i = 0; i < len; i++) {
    L[i] *= g;
    R[i] *= g;
  }
  const ir = { L, R, key };
  if (IRS.size > 24) IRS.delete(IRS.keys().next().value);
  IRS.set(key, ir);
  return ir;
}

class Reverb extends Stage {
  constructor(ctx, shimmerReady) {
    super(ctx);
    this.key = null;
    this.pre = ctx.createDelay(0.25);
    this.lowcut = ctx.createBiquadFilter();
    this.lowcut.type = 'highpass';
    this.lowcut.frequency.value = 150;
    this.conv = ctx.createConvolver();
    this.input.connect(this.lowcut).connect(this.pre).connect(this.conv).connect(this.wet);
    // shimmer: the tail, an octave up, back into the reverb
    this.shimGain = ctx.createGain();
    this.shimGain.gain.value = 0;
    this.shimLp = ctx.createBiquadFilter();
    this.shimLp.type = 'lowpass';
    this.shimLp.frequency.value = 6000;
    this.shimDelay = ctx.createDelay(0.1);
    this.shimDelay.delayTime.value = 0.03;
    if (shimmerReady) {
      this.shifter = new AudioWorkletNode(ctx, 'pitch-shift', { outputChannelCount: [2] });
      this.conv.connect(this.shifter).connect(this.shimLp).connect(this.shimGain).connect(this.shimDelay).connect(this.conv);
    }
  }
  set(p) {
    const ctx = this.ctx;
    const type = p.type || 'hall';
    const irType = type === 'shimmer' ? 'hall' : type;
    const ir = generateImpulse({ type: irType, decay: clamp(p.decay, 0.1, 15), damp: clamp(p.damp, 0, 1), sr: ctx.sampleRate });
    if (ir.key !== this.key) {
      const buf = ctx.createBuffer(2, ir.L.length, ctx.sampleRate);
      buf.copyToChannel(ir.L, 0);
      buf.copyToChannel(ir.R, 1);
      this.conv.buffer = buf;
      this.key = ir.key;
    }
    ramp(this.pre.delayTime, clamp(p.predelay, 0, 0.25), ctx);
    ramp(this.lowcut.frequency, clamp(p.lowcut || 20, 20, 1000), ctx);
    ramp(this.shimGain.gain, type === 'shimmer' && this.shifter ? clamp(p.shimmer, 0, 0.7) : 0, ctx);
    this.setOn(p.on, clamp(p.mix, 0, 1));
  }
}

// ------------------------------------------------------------------ the chain

export class PartChain {
  constructor(ctx, { shimmer = false } = {}) {
    this.ctx = ctx;
    this.stages = {
      comp: new Comp(ctx),
      drive: new Drive(ctx),
      eq: new Eq(ctx),
      mod: new Mod(ctx),
      trem: new Trem(ctx),
      rotary: new Rotary(ctx),
      delay: new Delay(ctx),
      reverb: new Reverb(ctx, shimmer),
    };
    this.input = ctx.createGain();
    let node = this.input;
    for (const k of FX_ORDER) {
      node.connect(this.stages[k].input);
      node = this.stages[k].output;
    }
    this.output = node;
    this.state = null;
    this.bpm = 120;
  }
  /** Apply a full fx state (see defaultFx). Only stages whose settings changed are touched. */
  set(fx, bpm = this.bpm) {
    const tempoChanged = bpm !== this.bpm;
    this.bpm = bpm;
    const d = defaultFx();
    for (const k of FX_ORDER) {
      const next = { ...d[k], ...(fx && fx[k]) };
      const prev = this.state && this.state[k];
      const synced = k === 'delay' || k === 'trem';
      if (prev && !(synced && tempoChanged) && shallowEqual(prev, next)) continue;
      this.stages[k].set(next, bpm);
    }
    this.state = Object.fromEntries(FX_ORDER.map((k) => [k, { ...d[k], ...(fx && fx[k]) }]));
  }
}

function shallowEqual(a, b) {
  const ka = Object.keys(a),
    kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (a[k] !== b[k]) return false;
  return true;
}
