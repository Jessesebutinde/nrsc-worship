// AudioWorklet shell around EngineCore: one stereo output per part, plus a click/metronome output.
// All sound is made in ../dsp/*.js; this file only moves messages and buffers.

import { EngineCore, MAX_PARTS } from '../dsp/engine-core.js';

class StageEngine extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const nParts = (options.processorOptions && options.processorOptions.parts) || MAX_PARTS;
    this.core = new EngineCore(sampleRate, nParts);
    this.blocks = 0;
    // load meter: time spent in process() over wall time, and audio time over wall time (below 1 =
    // the device cannot render fast enough). Date.now() is coarse, but over hundreds of blocks it averages.
    this.busy = 0;
    this.since = Date.now();
    this.sinceAudio = currentTime;
    this.port.onmessage = (e) => {
      const m = e.data;
      if (Array.isArray(m)) for (const x of m) this.core.handle(x, currentTime);
      else if (m && m.t === 'ping') this.port.postMessage({ t: 'pong', id: m.id, time: currentTime });
      else this.core.handle(m, currentTime);
    };
  }
  process(inputs, outputs) {
    const t0 = Date.now();
    const frames = outputs[0] && outputs[0][0] ? outputs[0][0].length : 128;
    this.core.render(outputs, currentTime, frames);
    const t1 = Date.now();
    this.busy += t1 - t0;
    if (++this.blocks % 32 === 0) {
      const m = { t: 'voices', n: this.core.voiceCount };
      // load and pace over about a second: shorter windows only measure the device's buffer bursts
      if (this.blocks % 256 === 0) {
        const wall = (t1 - this.since) / 1000;
        m.load = wall > 0 ? this.busy / 1000 / wall : 0;
        m.pace = wall > 0 ? (currentTime - this.sinceAudio) / wall : 1;
        this.busy = 0;
        this.since = t1;
        this.sinceAudio = currentTime;
      }
      this.port.postMessage(m);
    }
    return true;
  }
}

registerProcessor('stage-engine', StageEngine);
