// Whole rigs: splits and layers built from the presets, loaded with one tap. A combo is a performance
// (see state.js) described by preset ids; `groove` adds a drum loop on the drums part.

import { presetById } from './presets.js';
import { partFromPreset, newPerformance, newMacro } from './state.js';

const C3 = 48;
const C5 = 72;

export const COMBOS = [
  {
    id: 'sebene-rig',
    name: 'Sebene Rig',
    family: 'sebene',
    desc: 'Bass on the left hand, solo guitar on the right, a cavacha kit ready to loop.',
    tempo: 132,
    groove: 'sebene',
    parts: [
      { preset: 'sebene-bass', keyHigh: C3 - 1, volume: 0.85 },
      { preset: 'sebene-solo', keyLow: C3, volume: 0.8 },
      { preset: 'sebene-kit', enabled: false, volume: 0.75 },
    ],
    macros: [{ name: 'Echo', targets: [{ part: 1, path: 'fx.delay.mix', min: 0.05, max: 0.5 }] }, { name: 'Mute', targets: [{ part: 1, path: 'prog.mute', min: 0, max: 0.8 }] }],
  },
  {
    id: 'sebene-praise',
    name: 'Sebene Praise',
    family: 'sebene',
    desc: 'Bass left, hybrid solo right, a mi-solo part for your looped counter-line, kit for the groove.',
    tempo: 136,
    groove: 'sebene',
    parts: [
      { preset: 'sebene-bass-hybrid', keyHigh: C3 - 1, volume: 0.85 },
      { preset: 'sebene-solo-hybrid', keyLow: C3, volume: 0.8 },
      { preset: 'mi-solo', keyLow: C3, enabled: false, volume: 0.7, pan: -0.35 },
      { preset: 'sebene-kit', enabled: false, volume: 0.75 },
    ],
    macros: [{ name: 'Echo', targets: [{ part: 1, path: 'fx.delay.mix', min: 0.05, max: 0.5 }] }],
  },
  {
    id: 'ndombolo-praise',
    name: 'Ndombolo Praise',
    family: 'sebene',
    desc: 'Synth bass left, mi-composé octave lead right, ndombolo kit.',
    tempo: 128,
    groove: 'ndombolo',
    parts: [
      { preset: 'ndombolo-synth-bass', keyHigh: C3 - 1, volume: 0.8 },
      { preset: 'sebene-octave', keyLow: C3, volume: 0.8 },
      { preset: 'sebene-kit', enabled: false, volume: 0.75 },
    ],
  },
  {
    id: 'rumba-rig',
    name: 'Rumba Slow',
    family: 'sebene',
    desc: 'Fingered bass, Soukous clean guitar for arpeggios, rumba groove at 100.',
    tempo: 100,
    groove: 'rumba',
    parts: [
      { preset: 'finger-bass', keyHigh: C3 - 1, volume: 0.85 },
      { preset: 'soukous-jc', keyLow: C3, volume: 0.8 },
      { preset: 'sebene-kit', enabled: false, volume: 0.7 },
    ],
  },
  {
    id: 'elevation-night',
    name: 'Elevation Night',
    family: 'pads',
    desc: 'Worship grand over the Oceans pad, shimmer on the top octaves. Macro 1 brings the pad up.',
    tempo: 72,
    parts: [
      { preset: 'worship-grand', volume: 0.85 },
      { preset: 'oceans-pad', volume: 0.55 },
      { preset: 'shimmer-pad', keyLow: C5, volume: 0.4 },
    ],
    macros: [{ name: 'Pad', targets: [{ part: 1, path: 'volume', min: 0.3, max: 0.9 }] }, { name: 'Shimmer', targets: [{ part: 2, path: 'fx.reverb.mix', min: 0.2, max: 0.7 }] }],
  },
  {
    id: 'hillsong-sunday',
    name: 'Hillsong Sunday',
    family: 'pads',
    desc: 'Trem Rhodes with a strings pad, Prophet lead on the top split.',
    tempo: 76,
    parts: [
      { preset: 'trem-rhodes', keyHigh: C5 - 1, volume: 0.85 },
      { preset: 'strings-pad', keyHigh: C5 - 1, volume: 0.5 },
      { preset: 'prophet-lead', keyLow: C5, volume: 0.7 },
    ],
    macros: [{ name: 'Strings', targets: [{ part: 1, path: 'volume', min: 0.2, max: 0.9 }] }],
  },
  {
    id: 'ambient-worship',
    name: 'Ambient Worship',
    family: 'pads',
    desc: 'Ambient piano, shimmer pad, glass bells up top: for the quiet moments.',
    tempo: 66,
    parts: [
      { preset: 'ambient-piano', volume: 0.8 },
      { preset: 'shimmer-pad', volume: 0.5 },
      { preset: 'glass-bells', keyLow: C5 + 12, volume: 0.45 },
    ],
  },
  {
    id: 'nord-piano-pad',
    name: 'Nord: Piano + Pad',
    family: 'keys',
    desc: 'The classic Nord layer: grand plus warm pad. Macro 1 morphs the pad in.',
    tempo: 80,
    parts: [
      { preset: 'worship-grand', volume: 0.85 },
      { preset: 'warm-analog-pad', volume: 0.45 },
    ],
    macros: [{ name: 'Morph', targets: [{ part: 1, path: 'volume', min: 0.2, max: 0.9 }, { part: 0, path: 'volume', min: 0.85, max: 0.6 }] }],
  },
  {
    id: 'nord-split',
    name: 'Nord: Bass + EP',
    family: 'keys',
    desc: 'Fingered bass on the left, chorus Rhodes on the right.',
    tempo: 92,
    parts: [
      { preset: 'finger-bass', keyHigh: 52, volume: 0.85 },
      { preset: 'chorus-rhodes', keyLow: 53, volume: 0.85 },
    ],
  },
  {
    id: 'gospel-b3-piano',
    name: 'Gospel B3 + Piano',
    family: 'organs',
    desc: 'Bright gospel grand with the shout organ layered. Macro 1 fades the organ.',
    tempo: 110,
    parts: [
      { preset: 'gospel-grand', volume: 0.85 },
      { preset: 'gospel-shout', volume: 0.55 },
    ],
    macros: [{ name: 'Organ', targets: [{ part: 1, path: 'volume', min: 0.2, max: 0.9 }] }],
  },
  {
    id: 'brooklyn-stack',
    name: 'Brooklyn Choir Stack',
    family: 'choirs',
    desc: 'The choir with gospel strings and a whisper of pipe organ.',
    tempo: 70,
    parts: [
      { preset: 'brooklyn-choir', volume: 0.85 },
      { preset: 'gospel-strings', volume: 0.5 },
      { preset: 'church-pipe', volume: 0.25 },
    ],
    macros: [{ name: 'Strings', targets: [{ part: 1, path: 'volume', min: 0.2, max: 0.9 }] }],
  },
  {
    id: 'billie-dark',
    name: 'Billie Dark',
    family: 'billie',
    desc: 'Bad Guy bass left, lo-fi keys right with the ocean air pad above.',
    tempo: 135,
    parts: [
      { preset: 'bad-guy-bass', keyHigh: 52, volume: 0.8 },
      { preset: 'lofi-keys', keyLow: 53, volume: 0.85 },
      { preset: 'ocean-air-pad', keyLow: 53, volume: 0.4 },
    ],
  },
  {
    id: 'synth-pop',
    name: 'Synth Pop',
    family: 'leads',
    desc: 'Moog bass left, super saw chords right, pulse pluck on the top split.',
    tempo: 118,
    groove: 'pop',
    parts: [
      { preset: 'moog-bass', keyHigh: C3 - 1, volume: 0.8 },
      { preset: 'super-saw', keyLow: C3, keyHigh: C5 + 11, volume: 0.75 },
      { preset: 'pulse-pluck', keyLow: C5 + 12, volume: 0.7 },
      { preset: 'worship-kit', enabled: false, volume: 0.7 },
    ],
  },
  {
    id: 'hymn',
    name: 'Hymn: Pipe + Choir',
    family: 'organs',
    desc: 'Church pipe organ with the cathedral choir on top.',
    tempo: 80,
    parts: [
      { preset: 'church-pipe', volume: 0.8 },
      { preset: 'cathedral-choir', keyLow: 55, volume: 0.5 },
    ],
  },
];

const BY_ID = new Map(COMBOS.map((c) => [c.id, c]));
export const comboById = (id) => BY_ID.get(id) || null;

/** The performance a combo describes. */
export function buildPerformance(combo) {
  const parts = combo.parts
    .map((spec) => {
      const preset = presetById(spec.preset);
      if (!preset) return null;
      const { preset: _, ...over } = spec;
      return partFromPreset(preset, over);
    })
    .filter(Boolean);
  const macros = [0, 1, 2, 3].map((i) => ({ ...newMacro(i), ...((combo.macros && combo.macros[i]) || {}) }));
  return newPerformance({ name: combo.name, tempo: combo.tempo || 120, parts, macros, notes: combo.desc, comboId: combo.id, groove: combo.groove || null });
}
