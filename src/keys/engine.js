// The main-thread side of the sound engine: the AudioContext, the worklet node, one effect chain,
// fader, pan and meter per part, a master limiter, the metronome click, and the sample library.

import { MAX_PARTS } from './dsp/engine-core.js';
import { PartChain } from './fx.js';
import { SampleLibrary } from './samples.js';

export { MAX_PARTS };

export const LATENCY_MODES = {
  interactive: { label: 'Normal (safe)', hint: 'interactive' },
  low: { label: 'Low (5 ms buffer)', hint: 0.005 },
  lowest: { label: 'Lowest (may crackle)', hint: 0.002 },
  balanced: { label: 'Relaxed (laptops that crackle)', hint: 'balanced' },
};

const FADER_LAW = (v) => v * v * 1.25; // 0.8 on the fader is unity

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
  }

  async start({ latency = 'interactive', sinkId = '', quality = 'medium' } = {}) {
    if (this.ctx) return;
    const mode = LATENCY_MODES[latency] || LATENCY_MODES.interactive;
    const ctx = new AudioContext({ latencyHint: mode.hint });
    this.ctx = ctx;
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
      numberOfOutputs: MAX_PARTS,
      outputChannelCount: new Array(MAX_PARTS).fill(2),
      processorOptions: { parts: MAX_PARTS },
    });
    this.node.port.onmessage = (e) => {
      if (e.data && e.data.t === 'voices') this.voices = e.data.n;
    };
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
    for (let p = 0; p < MAX_PARTS; p++) {
      const chain = new PartChain(ctx, { shimmer: this.shimmer });
      const gain = ctx.createGain();
      gain.gain.value = FADER_LAW(0.8);
      const pan = ctx.createStereoPanner();
      const an = ctx.createAnalyser();
      an.fftSize = 256;
      this.node.connect(chain.input, p);
      chain.output.connect(gain).connect(pan).connect(an).connect(this.master);
      this.parts.push({ chain, gain, pan, an, data: new Float32Array(256), volume: 0.8, mute: false, peak: 0 });
    }
    this.clickGain = ctx.createGain();
    this.clickGain.gain.value = 0.6;
    this.clickGain.connect(this.master);
    this.samples = new SampleLibrary({ ctx, send: (m, tr) => this.node.port.postMessage(m, tr), quality });
    if (sinkId) await this.setOutput(sinkId).catch(() => {});
    this.ready = true;
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
    this.send({ t: 'program', part, prog, live });
  }
  setDrawbars(part, values) {
    this.send({ t: 'drawbars', part, values });
  }
  setFx(part, fx) {
    const p = this.parts[part];
    if (p) p.chain.set(fx, this.bpm);
  }
  setMix(part, { volume, pan, mute }) {
    const p = this.parts[part];
    if (!p || !this.ctx) return;
    const now = this.ctx.currentTime;
    if (volume != null) p.volume = volume;
    if (mute != null) p.mute = mute;
    p.gain.gain.cancelScheduledValues(now);
    p.gain.gain.setTargetAtTime(p.mute ? 0 : FADER_LAW(Math.max(0, Math.min(1, p.volume))), now, 0.02);
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
    for (const p of this.parts) if (p.chain.state) p.chain.set(p.chain.state, bpm);
  }

  // ---------------------------------------------------------------- notes

  noteOn(part, note, vel, time = 0) {
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
  setClickVolume(v) {
    if (this.clickGain) this.clickGain.gain.value = v;
  }

  // ---------------------------------------------------------------- meters

  /** Peak levels 0..1 for every part and the master; call from requestAnimationFrame. */
  levels() {
    const out = { parts: new Float32Array(MAX_PARTS), master: 0 };
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
