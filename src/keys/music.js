// Small music helpers for the demos and the song book: chord symbols to notes, voice-led voicings,
// progressions laid out in beats, transposition. Pure functions.

const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** 'F#' -> 6, 'Bb' -> 10 */
export function pitchClass(name) {
  const m = /^([A-Ga-g])(#|b|♯|♭)?$/.exec(String(name).trim());
  if (!m) return null;
  let pc = PC[m[1].toUpperCase()];
  if (m[2] === '#' || m[2] === '♯') pc += 1;
  if (m[2] === 'b' || m[2] === '♭') pc -= 1;
  return (pc + 12) % 12;
}

// Intervals from the root. Longest suffixes first so 'm7b5' wins over 'm7' and 'maj7' over 'm'.
const QUALITIES = [
  ['maj13', [0, 4, 7, 11, 14, 21]],
  ['maj9', [0, 4, 7, 11, 14]],
  ['maj7', [0, 4, 7, 11]],
  ['M7', [0, 4, 7, 11]],
  ['Δ7', [0, 4, 7, 11]],
  ['m7b5', [0, 3, 6, 10]],
  ['ø', [0, 3, 6, 10]],
  ['m11', [0, 3, 7, 10, 14, 17]],
  ['m9', [0, 3, 7, 10, 14]],
  ['m7', [0, 3, 7, 10]],
  ['m6', [0, 3, 7, 9]],
  ['madd9', [0, 3, 7, 14]],
  ['min', [0, 3, 7]],
  ['m', [0, 3, 7]],
  ['dim7', [0, 3, 6, 9]],
  ['dim', [0, 3, 6]],
  ['°', [0, 3, 6]],
  ['aug', [0, 4, 8]],
  ['+', [0, 4, 8]],
  ['7sus4', [0, 5, 7, 10]],
  ['7sus', [0, 5, 7, 10]],
  ['sus2', [0, 2, 7]],
  ['sus4', [0, 5, 7]],
  ['sus', [0, 5, 7]],
  ['add9', [0, 4, 7, 14]],
  ['add2', [0, 2, 4, 7]],
  ['2', [0, 2, 4, 7]],
  ['13', [0, 4, 7, 10, 14, 21]],
  ['11', [0, 7, 10, 14, 17]],
  ['9', [0, 4, 7, 10, 14]],
  ['7', [0, 4, 7, 10]],
  ['6', [0, 4, 7, 9]],
  ['5', [0, 7]],
  ['', [0, 4, 7]],
];

/**
 * 'F#m7/C#' -> { name, root: 6, intervals: [0,3,7,10], pcs: [6,9,1,4], bass: 1 }
 * Returns null for something that is not a chord ('N.C.', '%').
 */
export function parseChord(name) {
  const m = /^\s*([A-G](?:#|b)?)([^/\s]*)(?:\/([A-G](?:#|b)?))?\s*$/.exec(String(name));
  if (!m) return null;
  const root = pitchClass(m[1]);
  const q = m[2];
  let entry = QUALITIES.find(([s]) => s === q);
  if (!entry) {
    // Unknown extension: keep the third (minor if it starts with m but not maj) and any 7th it names.
    const minor = /^m(?!aj)/.test(q);
    const iv = [0, minor ? 3 : 4, 7];
    if (/maj7|M7/.test(q)) iv.push(11);
    else if (/7|9|11|13/.test(q)) iv.push(10);
    if (/9/.test(q)) iv.push(14);
    entry = [q, iv];
  }
  const intervals = entry[1];
  const bass = m[3] ? pitchClass(m[3]) : root;
  return { name: String(name).trim(), root, intervals, pcs: [...new Set(intervals.map((i) => (root + i) % 12))], bass };
}

/** The lowest MIDI note >= low with this pitch class. */
export const noteAtOrAbove = (pc, low) => low + ((((pc - low) % 12) + 12) % 12);

/**
 * Close voicing of a chord in [low, high], led smoothly from the previous voicing (or centred on `center`).
 * `size` notes; drops the fifth first when the chord has more tones than `size`, keeps 3rd and 7th.
 */
export function voicing(chord, { low = 55, high = 79, size = 4, prev = null, center = 64, rootless = false } = {}) {
  let ivs = chord.intervals.slice();
  if (rootless && ivs.length >= 4) ivs = ivs.filter((i) => i !== 0);
  // reduce to `size` tones: drop 5th, then upper extensions beyond the 9th, then the root
  const order = [7, 21, 17, 0, 14, 9];
  for (const drop of order) {
    if (ivs.length <= size) break;
    if (ivs.includes(drop)) ivs = ivs.filter((i) => i !== drop);
  }
  const pcs = [...new Set(ivs.map((i) => (chord.root + i) % 12))];
  const extra = Math.max(0, size - pcs.length); // a triad in four notes: the bottom note again an octave up
  const target = prev && prev.length ? prev.reduce((a, b) => a + b, 0) / prev.length : center;
  let best = null,
    bestCost = Infinity;
  for (let inv = 0; inv < pcs.length; inv++) {
    for (let base = low; base < low + 12; base++) {
      for (let oct = 0; base + oct <= high; oct += 12) {
        const notes = [noteAtOrAbove(pcs[inv], base + oct)];
        if (notes[0] !== base + oct) continue;
        for (let k = 1; k < pcs.length; k++) notes.push(noteAtOrAbove(pcs[(inv + k) % pcs.length], notes[k - 1] + 1));
        for (let k = 0; k < extra; k++) notes.push(notes[k] + 12);
        notes.sort((a, b) => a - b);
        if (notes[0] < low || notes[notes.length - 1] > high) continue;
        const mean = notes.reduce((a, b) => a + b, 0) / notes.length;
        let cost = Math.abs(mean - target);
        if (prev && prev.length === notes.length) cost = notes.reduce((sum, x, i) => sum + Math.abs(x - prev[i]), 0) / notes.length + 0.25 * cost;
        if (cost < bestCost) {
          bestCost = cost;
          best = notes;
        }
      }
    }
  }
  return best || pcs.map((pc) => noteAtOrAbove(pc, low)).sort((a, b) => a - b);
}

/** The chord's bass note (its slash bass, else root) within [low, high], nearest `near` if given. */
export function bassNote(chord, { low = 33, high = 52, near = null } = {}) {
  const first = noteAtOrAbove(chord.bass, low);
  const options = [];
  for (let n = first; n <= high; n += 12) options.push(n);
  if (!options.length) return first;
  if (near == null) return options[0];
  return options.reduce((a, b) => (Math.abs(b - near) < Math.abs(a - near) ? b : a));
}

/**
 * A progression written as bars ('C', ['C','G'] for two chords in a bar, '%' to repeat, 'N.C.') laid out in
 * beats: [{ beat, dur, chord }], chords parsed. Two chords in a bar split it evenly.
 */
export function timeline(bars, beatsPerBar = 4) {
  const out = [];
  let beat = 0;
  let last = null;
  for (const bar of bars) {
    const cells = Array.isArray(bar) ? bar : [bar];
    const dur = beatsPerBar / cells.length;
    for (const cell of cells) {
      const chord = cell === '%' ? last : parseChord(cell);
      if (chord) {
        const prev = out[out.length - 1];
        if (prev && cell === '%' && prev.chord === chord) prev.dur += dur;
        else out.push({ beat, dur, chord });
        last = chord;
      }
      beat += dur;
    }
  }
  return out;
}

/** Transpose a chord symbol by semitones, spelling with flats for flat keys. */
export function transposeChord(name, semis, preferFlats = true) {
  const c = String(name);
  return c.replace(/([A-G](?:#|b)?)/g, (n) => {
    const pc = pitchClass(n);
    if (pc == null) return n;
    const t = (pc + semis + 120) % 12;
    return (preferFlats ? NAMES : SHARPS)[t];
  });
}

export const keyName = (pc, flats = true) => (flats ? NAMES : SHARPS)[((pc % 12) + 12) % 12];

/** Seeded random numbers, so a demo plays the same way every time. */
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}
