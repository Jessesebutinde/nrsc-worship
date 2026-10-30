// The main-thread side of the sound engine: the AudioContext, the worklet node, one effect chain,
// fader, pan and meter per part, a master limiter, the metronome click, and the sample library.

import { MAX_PARTS } from './dsp/engine-core.js';
import { PartChain, ReverbPool } from './fx.js';
import { SampleLibrary } from './samples.js';

export { MAX_PARTS };
/** Parts after the rig's eight: a sound being auditioned in the browser, the drums under it, a backing part. */
export const AUDITION = MAX_PARTS;
export const AUDITION_DRUMS = MAX_PARTS + 1;
export const AUDITION_BED = MAX_PARTS + 2; // a quiet backing part under a lead or bass demo
const ALL_PARTS = MAX_PARTS + 3;

export const LATENCY_MODES = {
  interactive: { label: 'Normal (safe)', hint: 'interactive' },
  low: { label: 'Low (5 ms buffer)', hint: 0.005 },
  lowest: { label: 'Lowest (may crackle)', hint: 0.002 },
  balanced: { label: 'Relaxed (laptops that crackle)', hint: 'balanced' },
};

const FADER_LAW = (v) => v * v * 1.25; // 0.8 on the fader is unity

/** Light mode runs the whole graph at this rate: a third less work, and phone speakers stop near 16 kHz anyway. */
export const LIGHT_RATE = 32000;

/** Phones and tablets: start in light mode unless the player chose otherwise. */
export function isPhone() {
  if (typeof navigator === 'undefined') return false;
  if (navigator.userAgentData && navigator.userAgentData.mobile) return true;
  const ua = navigator.userAgent || '';
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/**
 * The light level the settings ask for: 0 full, 1 light, 2 lighter. Auto is light on phones, and steps
 * down on any device where sound was seen falling behind (`autoLight` remembers the step).
 */
export function wantLight(s) {
  const seen = Math.max(0, Math.min(2, +s.autoLight || 0));
  if (s.engineMode === 'full') return 0;
  if (s.engineMode === 'light') return Math.max(1, seen);
  return Math.max(isPhone() ? 1 : 0, seen);
}

export class Engine {
  constructor() {
    this.ctx = null;
    this.node = null;
    this.parts = [];
    this.ready = false;
    this.voices = 0;
    this.bpm = 120;
    this.samples = null;
    this.shimmer = false;
    this.light = 0; // 0 full, 1 light, 2 lighter
    this.load = 0; // share of real time the worklet spends rendering (0..1)
    this.pace = 1; // audio time over wall time: below 1 the device is falling behind
    this.onStruggle = null;
    this.struggle = 0;
    this.calmUntil = 0;
  }

  async start({ latency = 'interactive', sinkId = '', quality = 'medium', light = 0 } = {}) {
    if (this.ctx) return;
    const mode = LATENCY_MODES[latency] || LATENCY_MODES.interactive;
    // iPhone: play through the ringer/silent switch, like a music app does.
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch {
      /* older Safari */
    }
    let ctx = null;
    if (light) {
      try {
        ctx = new AudioContext({ latencyHint: mode.hint, sampleRate: LIGHT_RATE });
      } catch {
        ctx = null; // this browser only runs at the device rate
      }
    }
    if (!ctx) ctx = new AudioContext({ latencyHint: mode.hint });
    this.ctx = ctx;
    // Phones only let sound start inside the tap itself: resume and play a silent sample right now,
    // before anything is awaited.
    ctx.resume().catch(() => {});
    try {
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      src.connect(ctx.destination);
      src.start(0);
    } catch {
      /* nothing to unlock */
    }
    const base = new URL('./worklet/', import.meta.url);
    await ctx.audioWorklet.addModule(new URL('engine.js', base));
    try {
      await ctx.audioWorklet.addModule(new URL('pitch-shift.js', base));
      this.shimmer = true;
    } catch {
      this.shimmer = false;
    }
    this.node = new AudioWorkletNode(ctx, 'stage-engine', {
      numberOfInputs: 0,
      numberOfOutputs: ALL_PARTS,
      outputChannelCount: new Array(ALL_PARTS).fill(2),
      processorOptions: { parts: ALL_PARTS },
    });
    this.node.port.onmessage = (e) => {
      const m = e.data;
      if (m && m.t === 'voices') {
        this.voices = m.n;
        if (m.load != null) this.meter(m.load, m.pace);
      }
    };
    this.calmUntil = performance.now() + 4000; // start-up (decoding, compiling) is not a verdict
    // master: a safety limiter so a big layered chord never clips the output
    this.master = ctx.createGain();
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -2;
    this.limiter.knee.value = 2;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.12;
    this.masterAnalyser = ctx.createAnalyser();
    this.masterAnalyser.fftSize = 512;
    this.masterData = new Float32Array(512);
    this.master.connect(this.limiter).connect(this.masterAnalyser).connect(ctx.destination);
    // shared reverbs: every part sends into a few rooms, like a workstation's system reverb
    this.reverbReturn = ctx.createGain();
    this.reverbReturn.connect(this.master);
    this.reverbs = new ReverbPool(ctx, this.reverbReturn, { shimmer: this.shimmer, max: 3 });
    for (let p = 0; p < ALL_PARTS; p++) {
      const chain = new PartChain(ctx, { reverbs: this.reverbs });
      chain.setPost(FADER_LAW(0.8));
      const gain = ctx.createGain();
      gain.gain.value = FADER_LAW(0.8);
      const pan = ctx.createStereoPanner();
      const an = ctx.createAnalyser();
      an.fftSize = 256;
      // A part is wired to the engine only while it has a sound (see attach): an empty part costs nothing.
      gain.connect(pan).connect(an).connect(this.master);
      this.parts.push({ chain, gain, pan, an, data: new Float32Array(256), volume: 0.8, mute: false, peak: 0, attached: false, timer: 0 });
    }
    this.clickGain = ctx.createGain();
    this.clickGain.gain.value = 0.6;
    this.clickGain.connect(this.master);
    this.samples = new SampleLibrary({ ctx, send: (m, tr) => this.node.port.postMessage(m, tr), quality });
    if (sinkId) await this.setOutput(sinkId).catch(() => {});
    this.setLight(light);
    this.ready = true;
  }

  /** Light level 0/1/2: voice budgets, synth stacks, reverb rooms (the sample rate is set at start). */
  setLight(level) {
    this.light = level === true ? 1 : Math.max(0, Math.min(2, level | 0));
    this.send({ t: 'light', level: this.light });
    if (this.reverbs) this.reverbs.max = [3, 2, 1][this.light];
  }

  /** Worklet load reports, about one a second: three bad ones in a row and the app is told the device struggles. */
  meter(load, pace) {
    this.load = this.load * 0.5 + load * 0.5;
    this.pace = this.pace * 0.5 + Math.min(1, pace) * 0.5;
    if (typeof document !== 'undefined' && document.hidden) this.calmUntil = performance.now() + 3000;
    if (performance.now() < this.calmUntil || !this.ctx || this.ctx.state !== 'running') {
      this.struggle = 0;
      return;
    }
    if (this.load > 0.75 || this.pace < 0.92) this.struggle++;
    else this.struggle = 0;
    if (this.struggle >= 3) {
      this.struggle = 0;
      this.calmUntil = performance.now() + 8000; // give the lighter settings time to tell
      if (this.onStruggle) this.onStruggle({ load: this.load, pace: this.pace });
    }
  }

  /** Wire a part's chain between the engine and its fader. */
  attach(i) {
    const p = this.parts[i];
    if (!p) return;
    if (p.timer) clearTimeout(p.timer);
    p.timer = 0;
    if (p.attached) return;
    this.node.connect(p.chain.input, i);
    p.chain.output.connect(p.gain);
    p.attached = true;
    if (p.fx && !p.chain.state) p.chain.set(p.fx, p.fxBpm || this.bpm); // effects back as they were
  }
  /** Unwire a part once its notes have died away. */
  park(i, ms = 4000) {
    const p = this.parts[i];
    if (!p || !p.attached || p.timer) return;
    p.timer = setTimeout(() => {
      p.timer = 0;
      if (!p.attached) return;
      this.node.disconnect(p.chain.input, i);
      p.chain.output.disconnect(p.gain);
      p.attached = false;
      // its effects off too, so its reverb send lets go of the shared room
      p.chain.set(null, p.chain.bpm);
      p.chain.state = null;
    }, ms);
  }

  send(m, transfer) {
    if (this.node) this.node.port.postMessage(m, transfer);
  }
  resume() {
    return this.ctx && this.ctx.state !== 'running' ? this.ctx.resume() : Promise.resolve();
  }
  get time() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  // ---------------------------------------------------------------- parts

  /** `live` = keep notes that are sounding on the new settings (editing); otherwise they ring out on the old ones. */
  setProgram(part, prog, live = false) {
    if (prog) this.attach(part);
    else this.park(part);
    this.send({ t: 'program', part, prog, live });
  }
  setDrawbars(part, values) {
    this.send({ t: 'drawbars', part, values });
  }
  /** `bpm` overrides the tempo for this chain's synced delay and tremolo (a demo at its own tempo). */
  setFx(part, fx, bpm = this.bpm) {
    const p = this.parts[part];
    if (!p) return;
    p.fx = fx;
    p.fxBpm = bpm;
    if (p.attached || p.timer) p.chain.set(fx, bpm);
    else p.chain.state = null; // applied when the part is wired in
  }
  setMix(part, { volume, pan, mute }) {
    const p = this.parts[part];
    if (!p || !this.ctx) return;
    const now = this.ctx.currentTime;
    if (volume != null) p.volume = volume;
    if (mute != null) p.mute = mute;
    const g = p.mute ? 0 : FADER_LAW(Math.max(0, Math.min(1, p.volume)));
    p.gain.gain.cancelScheduledValues(now);
    p.gain.gain.setTargetAtTime(g, now, 0.02);
    p.chain.setPost(g);
    if (pan != null) {
      p.pan.pan.cancelScheduledValues(now);
      p.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), now, 0.02);
    }
  }
  setMasterVolume(v) {
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(FADER_LAW(Math.max(0, Math.min(1, v))), this.ctx.currentTime, 0.02);
  }
  setTempo(bpm) {
    this.bpm = bpm;
    this.send({ t: 'tempo', bpm });
    for (let i = 0; i < MAX_PARTS; i++) {
      const p = this.parts[i];
      p.fxBpm = bpm;
      if (p.chain.state) p.chain.set(p.chain.state, bpm);
    }
  }

  // ---------------------------------------------------------------- notes

  noteOn(part, note, vel, time = 0) {
    this.attach(part);
    this.send({ t: 'note', part, note, vel, on: true, time });
  }
  noteOff(part, note, time = 0) {
    this.send({ t: 'note', part, note, vel: 0, on: false, time });
  }
  cc(part, cc, value, time = 0) {
    this.send({ t: 'cc', part, cc, value, time });
  }
  bend(part, value, time = 0) {
    this.send({ t: 'bend', part, value, time });
  }
  allOff(hard = false, part = -1) {
    this.send({ t: 'allOff', part, hard });
  }

  /** Metronome blip at an exact time. */
  click(accent, time) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = Math.max(time, ctx.currentTime);
    const osc = ctx.createOscillator();
    osc.frequency.value = accent ? 1760 : 1175;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(accent ? 0.9 : 0.6, t + 0.001);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
    osc.connect(g).connect(this.clickGain);
    osc.start(t);
    osc.stop(t + 0.05);
  }
  /** A soft two-note chime: proof that sound reaches the speakers. */
  chime() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + 0.05;
    [
      [659.25, 0],
      [987.77, 0.14],
    ].forEach(([f, d]) => {
      const osc = ctx.createOscillator();
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t + d);
      g.gain.linearRampToValueAtTime(0.35, t + d + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + d + 0.9);
      osc.connect(g).connect(this.master);
      osc.start(t + d);
      osc.stop(t + d + 1);
    });
  }
  setClickVolume(v) {
    if (this.clickGain) this.clickGain.gain.value = v;
  }

  // ---------------------------------------------------------------- meters

  /** Peak levels 0..1 for every part and the master; call from requestAnimationFrame. */
  levels() {
    const out = { parts: new Float32Array(ALL_PARTS), master: 0 };
    if (!this.ctx) return out;
    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i];
      p.an.getFloatTimeDomainData(p.data);
      let peak = 0;
      for (let k = 0; k < p.data.length; k++) {
        const a = Math.abs(p.data[k]);
        if (a > peak) peak = a;
      }
      p.peak = Math.max(peak, p.peak * 0.85); // fall slowly
      out.parts[i] = p.peak;
    }
    this.masterAnalyser.getFloatTimeDomainData(this.masterData);
    let peak = 0;
    for (let k = 0; k < this.masterData.length; k++) {
      const a = Math.abs(this.masterData[k]);
      if (a > peak) peak = a;
    }
    this.masterPeak = Math.max(peak, (this.masterPeak || 0) * 0.85);
    out.master = this.masterPeak;
    return out;
  }

  // ---------------------------------------------------------------- devices

  latency() {
    const c = this.ctx;
    return c ? { base: c.baseLatency || 0, output: c.outputLatency || 0, sampleRate: c.sampleRate, state: c.state } : null;
  }
  static get canPickOutput() {
    return typeof AudioContext !== 'undefined' && 'setSinkId' in AudioContext.prototype;
  }
  /** Audio outputs. Names need the browser's device permission, which `askNames` requests (it prompts). */
  async listOutputs(askNames = false) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return [];
    let devs = await navigator.mediaDevices.enumerateDevices();
    if (askNames && devs.some((d) => d.kind === 'audiooutput' && !d.label)) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
        s.getTracks().forEach((t) => t.stop());
        devs = await navigator.mediaDevices.enumerateDevices();
      } catch {
        /* no permission: unnamed devices */
      }
    }
    return devs.filter((d) => d.kind === 'audiooutput').map((d, i) => ({ id: d.deviceId, label: d.label || `Output ${i + 1}` }));
  }
  async setOutput(sinkId) {
    if (!this.ctx || !('setSinkId' in this.ctx)) return false;
    await this.ctx.setSinkId(!sinkId || sinkId === 'default' ? '' : sinkId);
    return true;
  }
}
