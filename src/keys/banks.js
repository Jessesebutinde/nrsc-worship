// The catalogue of sampled instruments: the free MIDI.js soundfonts (General MIDI, three sample sets) that
// samples.js downloads and ships to the engine. Pure data and lookups, so Node tests can use it too.

export const SETS = {
  MusyngKite: { label: 'MusyngKite (best all-round)', base: 'https://gleitz.github.io/midi-js-soundfonts/MusyngKite/' },
  FluidR3_GM: { label: 'FluidR3', base: 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/' },
  FatBoy: { label: 'FatBoy', base: 'https://gleitz.github.io/midi-js-soundfonts/FatBoy/' },
};

/** The 128 General MIDI instrument names in program order; every set has a `<name>-mp3.js` for each. */
export const GM_NAMES = [
  // 0 pianos
  'acoustic_grand_piano', 'bright_acoustic_piano', 'electric_grand_piano', 'honkytonk_piano',
  'electric_piano_1', 'electric_piano_2', 'harpsichord', 'clavinet',
  // 8 chromatic percussion
  'celesta', 'glockenspiel', 'music_box', 'vibraphone', 'marimba', 'xylophone', 'tubular_bells', 'dulcimer',
  // 16 organs
  'drawbar_organ', 'percussive_organ', 'rock_organ', 'church_organ',
  'reed_organ', 'accordion', 'harmonica', 'tango_accordion',
  // 24 guitars
  'acoustic_guitar_nylon', 'acoustic_guitar_steel', 'electric_guitar_jazz', 'electric_guitar_clean',
  'electric_guitar_muted', 'overdriven_guitar', 'distortion_guitar', 'guitar_harmonics',
  // 32 basses
  'acoustic_bass', 'electric_bass_finger', 'electric_bass_pick', 'fretless_bass',
  'slap_bass_1', 'slap_bass_2', 'synth_bass_1', 'synth_bass_2',
  // 40 strings
  'violin', 'viola', 'cello', 'contrabass', 'tremolo_strings', 'pizzicato_strings', 'orchestral_harp', 'timpani',
  // 48 ensembles and voices
  'string_ensemble_1', 'string_ensemble_2', 'synth_strings_1', 'synth_strings_2',
  'choir_aahs', 'voice_oohs', 'synth_choir', 'orchestra_hit',
  // 56 brass
  'trumpet', 'trombone', 'tuba', 'muted_trumpet', 'french_horn', 'brass_section', 'synth_brass_1', 'synth_brass_2',
  // 64 reeds
  'soprano_sax', 'alto_sax', 'tenor_sax', 'baritone_sax', 'oboe', 'english_horn', 'bassoon', 'clarinet',
  // 72 pipes
  'piccolo', 'flute', 'recorder', 'pan_flute', 'blown_bottle', 'shakuhachi', 'whistle', 'ocarina',
  // 80 synth leads
  'lead_1_square', 'lead_2_sawtooth', 'lead_3_calliope', 'lead_4_chiff',
  'lead_5_charang', 'lead_6_voice', 'lead_7_fifths', 'lead_8_bass__lead',
  // 88 synth pads
  'pad_1_new_age', 'pad_2_warm', 'pad_3_polysynth', 'pad_4_choir',
  'pad_5_bowed', 'pad_6_metallic', 'pad_7_halo', 'pad_8_sweep',
  // 96 synth effects
  'fx_1_rain', 'fx_2_soundtrack', 'fx_3_crystal', 'fx_4_atmosphere',
  'fx_5_brightness', 'fx_6_goblins', 'fx_7_echoes', 'fx_8_scifi',
  // 104 ethnic
  'sitar', 'banjo', 'shamisen', 'koto', 'kalimba', 'bagpipe', 'fiddle', 'shanai',
  // 112 percussive
  'tinkle_bell', 'agogo', 'steel_drums', 'woodblock', 'taiko_drum', 'melodic_tom', 'synth_drum', 'reverse_cymbal',
  // 120 sound effects
  'guitar_fret_noise', 'breath_noise', 'seashore', 'bird_tweet', 'telephone_ring', 'helicopter', 'applause', 'gunshot',
];

const PROGRAM = new Map(GM_NAMES.map((name, i) => [name, i]));

// GM program ranges to families. Electric pianos and the clavinet get their own family, the voices 52..54 are
// 'choir', and the orchestra hit (55) stays with the ensembles.
const FAMILY_FROM = [
  [0, 'piano'], [8, 'chromatic'], [16, 'organ'], [24, 'guitar'], [32, 'bass'], [40, 'strings'], [48, 'ensemble'],
  [52, 'choir'], [55, 'ensemble'], [56, 'brass'], [64, 'reed'], [72, 'pipe'], [80, 'lead'], [88, 'pad'], [96, 'fx'],
  [104, 'ethnic'], [112, 'percussive'], [120, 'sfx'],
];
const EP = new Set([4, 5, 7]);

function familyOf(program) {
  if (EP.has(program)) return 'ep';
  let fam = 'piano';
  for (const [from, name] of FAMILY_FROM) if (program >= from) fam = name;
  return fam;
}

// Families whose sound is held as long as the key is down, so the sampler must loop the 3-second clip.
// Bowed strings (40..44) sustain; pizzicato, harp, timpani (45..47) and the orchestra hit (55) decay.
const SUSTAIN = new Set(['organ', 'ensemble', 'choir', 'brass', 'reed', 'pipe', 'lead', 'pad', 'fx']);
const sustains = (program, fam) => (fam === 'strings' ? program <= 44 : SUSTAIN.has(fam) && program !== 55);

// The MIDI range worth downloading per family: a note is ~20 KB to fetch and ~1 MB once decoded.
const RANGE = {
  piano: [21, 108], chromatic: [48, 108], organ: [24, 103], guitar: [36, 91], bass: [24, 67], choir: [36, 96],
  brass: [36, 96], reed: [36, 96], pipe: [36, 96], lead: [36, 96], ethnic: [36, 96], percussive: [36, 84],
  sfx: [36, 84],
};
const DEFAULT_RANGE = [24, 100];

const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);
const words = (s) => s.split('_').map(cap).join(' ');

/** 'electric_bass_finger' → 'Electric Bass (finger)', 'lead_8_bass__lead' → 'Lead 8 (bass + lead)'. */
function bankLabel(name) {
  let m = /^(lead|pad|fx)_(\d)_(.+)$/.exec(name);
  if (m) return `${m[1] === 'fx' ? 'FX' : cap(m[1])} ${m[2]} (${m[3].replace('__', ' + ').replace(/_/g, ' ')})`;
  m = /^(acoustic_guitar|electric_guitar|electric_bass)_([a-z]+)$/.exec(name);
  if (m) return `${words(m[1])} (${m[2]})`;
  if (name === 'honkytonk_piano') return 'Honky-tonk Piano';
  return words(name);
}

/**
 * Everything the loader and the UI need to know about a bank.
 * @param {string} id '<set>/<name>', e.g. 'MusyngKite/electric_bass_finger'
 * @returns {{id:string, set:string, name:string, program:number, label:string, family:string, sustain:boolean,
 *   low:number, high:number, url:string}}
 */
export function bankInfo(id) {
  const [set, name] = String(id).split('/');
  if (!Object.hasOwn(SETS, set)) throw new Error(`Unknown sample set in bank "${id}"`);
  const program = PROGRAM.get(name);
  if (program === undefined) throw new Error(`Unknown instrument in bank "${id}"`);
  const family = familyOf(program);
  const [low, high] = RANGE[family] || DEFAULT_RANGE;
  const url = `${SETS[set].base}${name}-mp3.js`;
  return { id, set, name, program, label: bankLabel(name), family, sustain: sustains(program, family), low, high, url };
}

/** Shown first in the instrument picker, each from the set with the best samples for that sound. */
export const FEATURED = [
  // pianos
  'MusyngKite/acoustic_grand_piano', 'FluidR3_GM/acoustic_grand_piano', 'MusyngKite/bright_acoustic_piano',
  'MusyngKite/electric_piano_1', 'MusyngKite/electric_piano_2', 'FluidR3_GM/electric_piano_1',
  // pads
  'MusyngKite/pad_2_warm', 'MusyngKite/pad_1_new_age', 'MusyngKite/pad_4_choir', 'MusyngKite/pad_7_halo',
  'MusyngKite/pad_8_sweep', 'MusyngKite/pad_3_polysynth',
  // strings
  'MusyngKite/string_ensemble_1', 'MusyngKite/string_ensemble_2', 'MusyngKite/synth_strings_1',
  'FluidR3_GM/string_ensemble_1', 'MusyngKite/orchestral_harp', 'MusyngKite/pizzicato_strings',
  // choir
  'MusyngKite/choir_aahs', 'FluidR3_GM/choir_aahs', 'MusyngKite/voice_oohs', 'MusyngKite/synth_choir',
  // organs
  'MusyngKite/church_organ', 'MusyngKite/drawbar_organ', 'MusyngKite/rock_organ', 'MusyngKite/percussive_organ',
  // guitars
  'MusyngKite/electric_guitar_clean', 'MusyngKite/electric_guitar_jazz', 'MusyngKite/electric_guitar_muted',
  'MusyngKite/acoustic_guitar_nylon', 'MusyngKite/acoustic_guitar_steel',
  // basses
  'MusyngKite/electric_bass_finger', 'MusyngKite/electric_bass_pick', 'MusyngKite/fretless_bass',
  'MusyngKite/slap_bass_1', 'MusyngKite/synth_bass_1', 'MusyngKite/synth_bass_2',
  // mallets and bells
  'MusyngKite/vibraphone', 'MusyngKite/marimba', 'MusyngKite/music_box', 'MusyngKite/celesta',
  'MusyngKite/glockenspiel', 'MusyngKite/kalimba', 'MusyngKite/tubular_bells',
  // brass and winds
  'MusyngKite/brass_section', 'MusyngKite/flute', 'MusyngKite/alto_sax', 'MusyngKite/trumpet',
  // leads and other keys
  'MusyngKite/lead_2_sawtooth', 'MusyngKite/lead_1_square', 'MusyngKite/lead_8_bass__lead',
  'MusyngKite/accordion', 'MusyngKite/clavinet', 'MusyngKite/harpsichord',
];

const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const LETTER_SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** 'Db4' → 61, 'A0' → 21 (C4 = 60; flats as in the soundfont files, sharps accepted). null when unparseable. */
export function noteNameToMidi(name) {
  const m = /^([A-G])([b#]?)(-?\d+)$/.exec(name);
  if (!m) return null;
  const acc = m[2] === 'b' ? -1 : m[2] === '#' ? 1 : 0;
  return (Number(m[3]) + 1) * 12 + LETTER_SEMI[m[1]] + acc;
}

/** 61 → 'Db4': the spelling the soundfont files use. */
export function midiToNoteName(m) {
  return FLAT_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
}
