// Program (sound) parameter schemas: defaults, ranges and a compiler that turns a program into the
// numeric form the voices read. A preset only needs to say what differs from the defaults.

import { semitones, cents, clamp, NOTE_BEATS } from './util.js';
import { waveIndex, lfoShape } from './osc.js';

const OSC = { wave: 'saw', level: 1, octave: 0, semi: 0, fine: 0, pw: 0.5, unison: 1, detune: 0.2, spread: 0.6 };
const FILTER = { type: 'lp', slope: 24, cutoff: 8000, res: 0.1, env: 0, key: 0.3, vel: 0 };
const ENV = { a: 0.005, d: 0.2, s: 1, r: 0.3 };
const FENV = { a: 0.005, d: 0.3, s: 0, r: 0.3 };
const LFO = { shape: 'sine', rate: 5, sync: '', delay: 0, fade: 0.3, pitch: 0, filter: 0, amp: 0, pw: 0 };
const MODWHEEL = { vibrato: 0.25, filter: 0, amp: 0, mute: 0 };

export const DEFAULTS = {
  synth: {
    type: 'synth',
    osc: [OSC, { ...OSC, level: 0 }, { ...OSC, wave: 'sine', level: 0, octave: -1 }],
    noise: { level: 0, color: 'white' },
    filter: FILTER,
    env: ENV,
    fenv: FENV,
    lfo: LFO,
    modWheel: MODWHEEL,
    mode: 'poly',
    glide: 0,
    glideLegato: true,
    voices: 16,
    level: 0.5,
    drift: 0.1,
    velAmp: 0.6,
    velCurve: 'normal',
    bendRange: 2,
    spread: 0.3,
  },
  organ: {
    type: 'organ',
    drawbars: [8, 8, 8, 0, 0, 0, 0, 0, 0],
    perc: { on: false, third: false, fast: true, soft: false },
    vibrato: 'off',
    click: 0.3,
    leakage: 0.03,
    level: 0.45,
    attack: 0.003,
    release: 0.012,
    mode: 'poly',
    voices: 32,
    bendRange: 2,
    velAmp: 0,
    velCurve: 'normal',
  },
  string: {
    type: 'string',
    model: 'guitar',
    pick: 0.18,
    bright: 0.75,
    decay: 2.4,
    damp: 0.45,
    mute: 0,
    release: 0.09,
    legato: true,
    stiff: 0.06,
    body: 0.4,
    tone: 4200,
    unison: 1,
    detune: 0.25,
    level: 0.7,
    velBright: 0.5,
    velAmp: 0.65,
    velCurve: 'normal',
    bendRange: 2,
    mode: 'poly',
    voices: 10,
    glide: 0,
    modWheel: { vibrato: 0, filter: 0, amp: 0, mute: 1 },
    lfo: { ...LFO, rate: 5.5 },
    spread: 0.2,
  },
  sampler: {
    type: 'sampler',
    bank: 'MusyngKite/acoustic_grand_piano',
    loop: 'auto',
    loopFade: 0.06,
    env: { a: 0.002, d: 0, s: 1, r: 0.3 },
    filter: { ...FILTER, type: 'off', cutoff: 20000, res: 0, key: 0 },
    fenv: FENV,
    lfo: LFO,
    modWheel: MODWHEEL,
    mode: 'poly',
    glide: 0,
    glideLegato: true,
    voices: 24,
    level: 0.8,
    velAmp: 0.7,
    velCurve: 'normal',
    bendRange: 2,
    spread: 0.5,
    transpose: 0,
    fine: 0,
    start: 0,
  },
  drums: { type: 'drums', kit: 'sebene', level: 0.8, tune: 0, decay: 1, voices: 16, mode: 'poly', bendRange: 0 },
  // Two or three sources stacked in one part (they share the part's effects): hybrids and choir stacks.
  layer: { type: 'layer', layers: [], mode: 'poly', voices: 12, glide: 0, glideLegato: true, bendRange: 2, level: 1 },
};

/** Deep-merge a preset's program over the defaults of its type. */
export function fillProgram(prog) {
  const type = prog && DEFAULTS[prog.type] ? prog.type : 'synth';
  const out = merge(DEFAULTS[type], prog || {});
  if (type === 'layer') out.layers = (prog.layers || []).map((l) => ({ transpose: 0, detune: 0, ...fillProgram(l), transposeOverride: undefined }));
  return out;
}

function merge(base, over) {
  if (Array.isArray(base)) {
    if (!Array.isArray(over)) return base.slice();
    return base.map((b, i) => (over[i] === undefined ? (typeof b === 'object' ? merge(b, {}) : b) : typeof b === 'object' && b !== null ? merge(b, over[i]) : over[i]));
  }
  if (base && typeof base === 'object') {
    const out = {};
    for (const k of Object.keys(base)) {
      const b = base[k];
      const o = over ? over[k] : undefined;
      out[k] = b && typeof b === 'object' ? merge(b, o) : o === undefined ? b : o;
    }
    for (const k of Object.keys(over || {})) if (!(k in out)) out[k] = over[k];
    return out;
  }
  return over === undefined ? base : over;
}

const VIBRATO_MODES = { off: null, V1: [0.00015, 1], V2: [0.0003, 1], V3: [0.00055, 1], C1: [0.00015, 0.5], C2: [0.0003, 0.5], C3: [0.00055, 0.5] };

/** Turn a filled program into numbers. The result is immutable from the voices' point of view. */
export function compileProgram(p) {
  const c = { ...p, _c: true };
  if (p.type === 'layer') {
    c.layers = p.layers.map((l) => {
      const lc = compileProgram(l);
      lc.mode = p.mode; // the stack moves as one voice group
      lc.voices = p.voices;
      lc.glide = p.glide;
      lc.glideLegato = p.glideLegato;
      lc.bendRange = p.bendRange;
      lc.layerTranspose = l.transpose || 0;
      lc.layerDetune = l.detune || 0;
      return lc;
    });
    return c;
  }
  if (p.type === 'synth' || p.type === 'sampler' || p.type === 'string') {
    c.lfoShape = lfoShape(p.lfo.shape);
    c.lfoBeats = p.lfo.sync && NOTE_BEATS[p.lfo.sync] ? NOTE_BEATS[p.lfo.sync] : 0;
    c.filterMode = p.filter ? (p.filter.type === 'hp' ? 1 : p.filter.type === 'bp' ? 2 : p.filter.type === 'off' ? -1 : 0) : -1;
    c.filter24 = p.filter && p.filter.slope >= 24;
    c.glideCoef = 0; // set by the engine (needs the sample rate)
  }
  if (p.type === 'synth') {
    c.oscs = p.osc
      .map((o) => ({
        wave: waveIndex(o.wave),
        level: o.level,
        ratio: semitones(o.octave * 12 + o.semi) * cents(o.fine),
        pw: clamp(o.pw, 0.05, 0.95),
        unison: o.wave === 'supersaw' ? 7 : clamp(Math.round(o.unison), 1, 7),
        detune: o.detune,
        spread: o.spread,
      }))
      .filter((o) => o.level > 0);
    c.noiseLevel = p.noise.level;
    c.pink = p.noise.color === 'pink';
  }
  if (p.type === 'organ') {
    c.vib = VIBRATO_MODES[p.vibrato] || null;
    c.drawbarGains = p.drawbars.map((v) => (v <= 0 ? 0 : Math.pow(10, ((clamp(v, 0, 8) - 8) * 3) / 20)));
  }
  if (p.type === 'string') {
    c.pick = clamp(p.pick, 0.03, 0.5);
    c.unisonN = p.unison >= 2 ? 2 : 1;
  }
  return c;
}

/** Drawbar footage labels, low to high. */
export const DRAWBAR_NAMES = ["16'", "5⅓'", "8'", "4'", "2⅔'", "2'", "1⅗'", "1⅓'", "1'"];
export const DRAWBAR_RATIOS = [0.5, 1.5, 1, 2, 3, 4, 5, 6, 8];
