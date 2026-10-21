// AudioWorklet shell for the granular pitch shifter in ../dsp/pitch-shift.js (the shimmer reverb).

import { GrainShifter } from '../dsp/pitch-shift.js';

class PitchShift extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'ratio', defaultValue: 2, minValue: 0.25, maxValue: 4, automationRate: 'k-rate' }];
  }
  constructor() {
    super();
    this.shifter = new GrainShifter(sampleRate, 2);
  }
  process(inputs, outputs, params) {
    const out = outputs[0];
    if (!out || !out.length) return true;
    this.shifter.process(inputs[0] || [], out, out[0].length, params.ratio[0]);
    return true;
  }
}

registerProcessor('pitch-shift', PitchShift);
