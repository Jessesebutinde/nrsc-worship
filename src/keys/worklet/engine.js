// AudioWorklet shell around EngineCore: one stereo output per part, plus a click/metronome output.
// All sound is made in ../dsp/*.js; this file only moves messages and buffers.

import { EngineCore, MAX_PARTS } from '../dsp/engine-core.js';

class StageEngine extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const nParts = (options.processorOptions && options.processorOptions.parts) || MAX_PARTS;
    this.core = new EngineCore(sampleRate, nParts);
    this.blocks = 0;
    this.port.onmessage = (e) => {
      const m = e.data;
      if (Array.isArray(m)) for (const x of m) this.core.handle(x, currentTime);
      else if (m && m.t === 'ping') this.port.postMessage({ t: 'pong', id: m.id, time: currentTime });
      else this.core.handle(m, currentTime);
    };
  }
  process(inputs, outputs) {
    const frames = outputs[0] && outputs[0][0] ? outputs[0][0].length : 128;
    this.core.render(outputs, currentTime, frames);
    if (++this.blocks % 24 === 0) this.port.postMessage({ t: 'voices', n: this.core.voiceCount });
    return true;
  }
}

registerProcessor('stage-engine', StageEngine);
