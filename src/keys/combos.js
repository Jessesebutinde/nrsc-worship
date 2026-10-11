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
      { preset: 'sebene-bass', keyHigh: C3 - 1, volume: 0.69 },
      { preset: 'sebene-solo', keyLow: C3, volume: 0.77 },
      { preset: 'sebene-kit', enabled: false, volume: 0.62 },
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
      { preset: 'sebene-bass-hybrid', keyHigh: C3 - 1, volume: 0.68 },
      { preset: 'sebene-solo-hybrid', keyLow: C3, volume: 0.74 },
      { preset: 'mi-solo', keyLow: C3, enabled: false, volume: 0.48, pan: -0.35 },
      { preset: 'sebene-kit', enabled: false, volume: 0.6 },
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
      { preset: 'ndombolo-synth-bass', keyHigh: C3 - 1, volume: 0.77 },
      { preset: 'sebene-octave', keyLow: C3, volume: 0.83 },
      { preset: 'sebene-kit', enabled: false, volume: 0.72 },
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
      { preset: 'soukous-jc', keyLow: C3, volume: 0.89 },
      { preset: 'sebene-kit', enabled: false, volume: 0.9 },
    ],
  },
  {
    id: 'elevation-night',
    name: 'Elevation Night',
    family: 'pads',
    desc: 'Worship grand over the Oceans pad, shimmer on the top octaves. Macro 1 brings the pad up.',
    tempo: 72,
    parts: [
      { preset: 'worship-grand', volume: 0.69 },
      { preset: 'oceans-pad', volume: 0.55 },
      { preset: 'shimmer-pad', keyLow: C5, volume: 0.53 },
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
      { preset: 'trem-rhodes', keyHigh: C5 - 1, volume: 0.86 },
      { preset: 'strings-pad', keyHigh: C5 - 1, volume: 0.5 },
      { preset: 'prophet-lead', keyLow: C5, volume: 0.64 },
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
      { preset: 'ambient-piano', volume: 0.61 },
      { preset: 'shimmer-pad', volume: 0.52 },
      { preset: 'glass-bells', keyLow: C5 + 12, volume: 0.4 },
    ],
  },
  {
    id: 'nord-piano-pad',
    name: 'Nord: Piano + Pad',
    family: 'keys',
    desc: 'The classic Nord layer: grand plus warm pad. Macro 1 morphs the pad in.',
    tempo: 80,
    parts: [
      { preset: 'worship-grand', volume: 0.87 },
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
      { preset: 'finger-bass', keyHigh: 52, volume: 0.93 },
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
      { preset: 'gospel-grand', volume: 0.82 },
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
      { preset: 'brooklyn-choir', volume: 0.57 },
      { preset: 'gospel-strings', volume: 0.5 },
      { preset: 'church-pipe', volume: 0.39 },
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
      { preset: 'bad-guy-bass', keyHigh: 52, volume: 0.83 },
      { preset: 'lofi-keys', keyLow: 53, volume: 0.92 },
      { preset: 'ocean-air-pad', keyLow: 53, volume: 0.65 },
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
      { preset: 'moog-bass', keyHigh: C3 - 1, volume: 0.74 },
      { preset: 'super-saw', keyLow: C3, keyHigh: C5 + 11, volume: 0.76 },
      { preset: 'pulse-pluck', keyLow: C5 + 12, volume: 0.64 },
      { preset: 'worship-kit', enabled: false, volume: 0.66 },
    ],
  },
  {
    id: 'hymn',
    name: 'Hymn: Pipe + Choir',
    family: 'organs',
    desc: 'Church pipe organ with the cathedral choir on top.',
    tempo: 80,
    parts: [
      { preset: 'church-pipe', volume: 0.86 },
      { preset: 'cathedral-choir', keyLow: 55, volume: 0.47 },
    ],
  },
];

// ------------------------------------------------------------------ band rigs, two per style
// Arrangements from the style research: what the left hand, right hand, loops and drums each do is in
// guide.js (RIG_GUIDE), so the demos play exactly these parts.

COMBOS.push(
  // ---- Spirit of Praise (South African gospel)
  {
    id: 'sop-praise',
    name: 'Spirit of Praise: Praise Break',
    family: 'sagospel',
    desc: 'Singing lead bass left; bright gospel piano right with Hammond and a mass choir inside it; SA praise groove.',
    tempo: 124,
    groove: 'sa-praise',
    parts: [
      { preset: 'sa-lead-bass', keyHigh: C3 - 1, volume: 0.76 },
      { preset: 'sa-gospel-piano', keyLow: C3, volume: 0.79 },
      { preset: 'sa-praise-organ', keyLow: C3, volume: 0.35 },
      { preset: 'sa-mass-choir', keyLow: C3, volume: 0.2 },
      { preset: 'afro-kit', enabled: false, volume: 0.78 },
    ],
    macros: [
      { name: 'Organ', targets: [{ part: 2, path: 'volume', min: 0.1, max: 0.75 }] },
      { name: 'Choir', targets: [{ part: 3, path: 'volume', min: 0, max: 0.8 }] },
    ],
  },
  {
    id: 'sop-worship',
    name: 'Spirit of Praise: Worship',
    family: 'sagospel',
    desc: 'Slow 12/8 SA worship: long sliding bass, rolling piano, swelling organ bed and the choir.',
    tempo: 66,
    groove: 'sa-worship',
    parts: [
      { preset: 'sa-lead-bass', keyHigh: C3 - 1, volume: 0.8 },
      { preset: 'sa-gospel-piano', keyLow: C3, volume: 0.9 },
      { preset: 'sa-worship-organ', keyLow: C3, volume: 0.45 },
      { preset: 'sa-mass-choir', keyLow: 60, volume: 0.3 },
      { preset: 'worship-kit', enabled: false, volume: 0.79 },
    ],
    macros: [
      { name: 'Choir', targets: [{ part: 3, path: 'volume', min: 0, max: 0.85 }] },
      { name: 'Organ', targets: [{ part: 2, path: 'volume', min: 0.15, max: 0.8 }] },
    ],
  },
  // ---- Nigerian praise
  {
    id: 'naija-praise-band',
    name: 'Naija Praise: Lagos',
    family: 'naija',
    desc: 'Bouncing bass left; bright keys with strings right, organ stabs to bring in; trumpet loop; talking drum and agogo groove.',
    tempo: 128,
    groove: 'naija-praise',
    parts: [
      { preset: 'finger-bass', keyHigh: C3 - 1, volume: 0.86 },
      { preset: 'naija-praise-keys', keyLow: C3, volume: 0.85 },
      { preset: 'naija-organ-stabs', keyLow: C3, volume: 0.15 },
      { preset: 'naija-trumpet', enabled: false, volume: 0.64 },
      { preset: 'afro-kit', enabled: false, volume: 0.74 },
    ],
    macros: [
      { name: 'Organ', targets: [{ part: 2, path: 'volume', min: 0, max: 0.7 }] },
      { name: 'Trumpets', targets: [{ part: 3, path: 'volume', min: 0, max: 0.8 }] },
    ],
  },
  {
    id: 'naija-highlife',
    name: 'Naija Praise: Highlife',
    family: 'naija',
    desc: 'Highlife walking bass left; picked highlife guitar right; the praise synth lead from C6; highlife bell groove.',
    tempo: 118,
    groove: 'highlife',
    parts: [
      { preset: 'finger-bass', keyHigh: C3 - 1, volume: 0.84 },
      { preset: 'highlife-guitar', keyLow: C3, keyHigh: 83, volume: 0.81 },
      { preset: 'naija-synth-lead', keyLow: 84, volume: 0.63 },
      { preset: 'afro-kit', enabled: false, volume: 0.76 },
    ],
  },
  // ---- Afrobeats and Afrobeat
  {
    id: 'afrobeats-lagos',
    name: 'Afrobeats: Lagos',
    family: 'afro',
    desc: 'Sub bass left; chopped EP chords in the middle; marimba pluck hook from C6; a sax loop; skipping-rim groove.',
    tempo: 104,
    groove: 'afrobeats',
    parts: [
      { preset: 'afro-sub', keyHigh: C3 - 1, volume: 0.7 },
      { preset: 'afro-ep', keyLow: C3, keyHigh: 83, volume: 0.73 },
      { preset: 'afro-marimba', keyLow: 84, volume: 0.79 },
      { preset: 'afro-sax', enabled: false, volume: 0.64 },
      { preset: 'afro-kit', enabled: false, volume: 0.78 },
    ],
    macros: [{ name: 'Sax', targets: [{ part: 3, path: 'volume', min: 0, max: 0.75 }] }],
  },
  {
    id: 'afrobeat-fela',
    name: 'Afrobeat: Fela',
    family: 'afro',
    desc: 'The two-bar vamp: muted bass left, combo-organ stabs right, horn riff and tenor guitar loops, Tony Allen groove.',
    tempo: 112,
    groove: 'afrobeat',
    parts: [
      { preset: 'fela-bass', keyHigh: C3 - 1, volume: 0.77 },
      { preset: 'fela-organ', keyLow: C3, volume: 0.73 },
      { preset: 'fela-horns', enabled: false, volume: 0.63 },
      { preset: 'tenor-guitar', enabled: false, volume: 0.56 },
      { preset: 'afro-kit', enabled: false, volume: 0.79 },
    ],
    macros: [{ name: 'Horns', targets: [{ part: 2, path: 'volume', min: 0, max: 0.8 }] }],
  },
  // ---- Elevation Worship
  {
    id: 'elevation-anthem',
    name: 'Elevation: Anthem Drive',
    family: 'pads',
    desc: 'Sub bass pulsing 8ths left; the big piano-and-pad patch in driving 8ths right; 16th arp loop; Elevation drive kit.',
    tempo: 130,
    groove: 'elevation',
    parts: [
      { preset: 'anthem-sub', keyHigh: C3 - 1, volume: 0.7 },
      { preset: 'elevation-keys', keyLow: C3, volume: 0.73 },
      { preset: 'elevation-arp', enabled: false, volume: 0.64 },
      { preset: 'worship-kit', enabled: false, volume: 0.51 },
    ],
    macros: [{ name: 'Arp', targets: [{ part: 2, path: 'volume', min: 0, max: 0.7 }] }],
  },
  {
    id: 'elevation-68',
    name: 'Elevation: 6/8 Anthem',
    family: 'pads',
    desc: 'Whole-note sub left; rolling 6/8 piano with the pad inside right; the swell guitar from C6; 6/8 anthem kit.',
    tempo: 70,
    groove: 'elevation68',
    parts: [
      { preset: 'anthem-sub', keyHigh: C3 - 1, volume: 0.86 },
      { preset: 'elevation-keys', keyLow: C3, keyHigh: 83, volume: 0.92 },
      { preset: 'swell-guitar', keyLow: 84, volume: 0.82 },
      { preset: 'shimmer-pad', keyLow: C3, volume: 0.25 },
      { preset: 'worship-kit', enabled: false, volume: 0.85 },
    ],
    macros: [{ name: 'Shimmer', targets: [{ part: 3, path: 'volume', min: 0, max: 0.7 }] }],
  },
  // ---- Hillsong
  {
    id: 'hillsong-anthem',
    name: 'Hillsong: Anthem',
    family: 'pads',
    desc: 'Long bass with anticipations left; open add-9 piano right with a pad and octave strings inside; Hillsong chorus kit.',
    tempo: 72,
    groove: 'hillsong',
    parts: [
      { preset: 'finger-bass', keyHigh: C3 - 1, volume: 0.84 },
      { preset: 'hillsong-piano', keyLow: C3, volume: 0.8 },
      { preset: 'oceans-pad', keyLow: C3, volume: 0.4 },
      { preset: 'octave-strings', keyLow: 60, volume: 0.25 },
      { preset: 'worship-kit', enabled: false, volume: 0.7 },
    ],
    macros: [
      { name: 'Pad', targets: [{ part: 2, path: 'volume', min: 0.15, max: 0.8 }] },
      { name: 'Strings', targets: [{ part: 3, path: 'volume', min: 0, max: 0.7 }] },
    ],
  },
  {
    id: 'hillsong-drive',
    name: 'Hillsong: Up-tempo',
    family: 'pads',
    desc: 'Picked 8th-note bass left; driving piano with an air pad right; 16th arp loop; driving kit.',
    tempo: 138,
    groove: 'elevation',
    parts: [
      { preset: 'pick-bass', keyHigh: C3 - 1, volume: 0.58 },
      { preset: 'hillsong-piano', keyLow: C3, volume: 0.46 },
      { preset: 'air-pad', keyLow: C3, volume: 0.45 },
      { preset: 'elevation-arp', enabled: false, volume: 0.62 },
      { preset: 'worship-kit', enabled: false, volume: 0.42 },
    ],
    macros: [{ name: 'Arp', targets: [{ part: 3, path: 'volume', min: 0, max: 0.7 }] }],
  },
  // ---- Billie Eilish / FINNEAS
  {
    id: 'billie-birds',
    name: 'Billie: Soft Pop',
    family: 'billie',
    desc: 'Round melodic bass left; warm lo-fi keys comping right; whistle synth from C6; dry pop kit with snaps.',
    tempo: 105,
    groove: 'billie-pop',
    parts: [
      { preset: 'birds-bass', keyHigh: 52, volume: 0.85 },
      { preset: 'lofi-keys', keyLow: 53, keyHigh: 83, volume: 0.84 },
      { preset: 'whistle-synth', keyLow: 84, volume: 0.67 },
      { preset: 'pop-kit', enabled: false, volume: 0.75 },
    ],
  },
  {
    id: 'billie-whisper',
    name: 'Billie: Whisper Ballad',
    family: 'billie',
    desc: 'Long 808 left; pumping dark piano right with a folk acoustic and air pad inside; half-time kit with a snap.',
    tempo: 74,
    groove: 'billie-half',
    parts: [
      { preset: 'sub-808', keyHigh: C3 - 1, volume: 0.84 },
      { preset: 'pumping-piano', keyLow: C3, volume: 0.88 },
      { preset: 'folk-acoustic', keyLow: C3, volume: 0.3 },
      { preset: 'ocean-air-pad', keyLow: 60, volume: 0.25 },
      { preset: 'pop-kit', enabled: false, volume: 0.8 },
    ],
    macros: [
      { name: 'Guitar', targets: [{ part: 2, path: 'volume', min: 0, max: 0.8 }] },
      { name: 'Air', targets: [{ part: 3, path: 'volume', min: 0, max: 0.6 }] },
    ],
  },
);

/** Style groups for the rig browser, in the order they are listed. */
export const COMBO_GROUPS = [
  { id: 'sebene', label: 'Sebene & rumba' },
  { id: 'sagospel', label: 'Spirit of Praise' },
  { id: 'naija', label: 'Nigerian praise' },
  { id: 'afro', label: 'Afrobeats & Afrobeat' },
  { id: 'elevation', label: 'Elevation Worship', ids: ['elevation-anthem', 'elevation-68', 'elevation-night', 'ambient-worship'] },
  { id: 'hillsong', label: 'Hillsong', ids: ['hillsong-anthem', 'hillsong-drive', 'hillsong-sunday'] },
  { id: 'billie', label: 'Billie Eilish', ids: ['billie-birds', 'billie-whisper', 'billie-dark'] },
  { id: 'gospel', label: 'Gospel, Nord & choir', ids: ['gospel-b3-piano', 'brooklyn-stack', 'nord-piano-pad', 'nord-split', 'hymn', 'synth-pop'] },
];

/** The combos of a group: by explicit list, else by family. */
export function combosIn(group) {
  if (group.ids) return group.ids.map((id) => COMBOS.find((c) => c.id === id)).filter(Boolean);
  return COMBOS.filter((c) => c.family === group.id);
}

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
