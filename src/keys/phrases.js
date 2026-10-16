// Phrase generators for the demos: each playing role turns a chord progression (see music.js timeline)
// into notes, the way a player in that style would play it. Events are { beat, note, dur, vel } in
// keyboard notes. Pure and seeded, so a demo sounds the same every time and the tests can check them.

import { voicing, bassNote, noteAtOrAbove, rng } from './music.js';

const clampNote = (n, lo, hi) => {
  while (n < lo) n += 12;
  while (n > hi) n -= 12;
  return n;
};
const VEL = { X: 112, x: 92, o: 58 };
const CAVACHA = 'XxxXxxXXxxXxXxxx';

/** Calls fn(step, beat, vel) for every hit of a 16th-note pattern string repeated over [from, from+dur). */
function grid(pattern, from, dur, fn, steps = 4) {
  const pat = pattern.replace(/\s/g, '');
  const n = Math.round(dur * steps);
  for (let i = 0; i < n; i++) {
    const v = VEL[pat[i % pat.length]];
    if (v) fn(i, from + i / steps, v);
  }
}

/** Chord tones from low to high inside [low, high] (every octave). */
function tonesIn(chord, low, high, extra = []) {
  const out = [];
  const pcs = [...new Set([...chord.pcs, ...extra.map((i) => (chord.root + i) % 12)])];
  for (let n = low; n <= high; n++) if (pcs.includes(n % 12)) out.push(n);
  return out;
}

/** The chord's own scale-ish colour: minor chords get the 9th and 11th, major the 9th and 6th. */
const colour = (chord) => (chord.intervals.includes(3) ? [14, 17] : [14, 9]);

/** Next segment's bass note, for walk-ups and approach notes. */
const nextSeg = (tl, i) => tl[(i + 1) % tl.length];

// ------------------------------------------------------------------ roles

export const ROLES = {
  // ---- held chords
  pad: { range: [55, 76], hands: 'rh', fn: ({ tl, R, range }) => held(tl, R, range, 4, 80) },
  choir: { range: [57, 77], hands: 'rh', fn: ({ tl, R, range }) => held(tl, R, range, 3, 88) },
  strings: {
    range: [43, 79],
    hands: 'both',
    fn: ({ tl, range }) => {
      const out = [];
      let prev = null;
      for (const s of tl) {
        const v = voicing(s.chord, { low: Math.max(range[0], 55), high: range[1], size: 4, prev });
        prev = v;
        for (const n of v) out.push({ beat: s.beat, note: n, dur: s.dur - 0.08, vel: 84 });
        out.push({ beat: s.beat, note: bassNote(s.chord, { low: range[0], high: range[0] + 11 }), dur: s.dur - 0.08, vel: 80 });
      }
      return out;
    },
  },
  drone: {
    range: [36, 60],
    hands: 'lh',
    fn: ({ tl, range }) => {
      const out = [];
      for (const s of tl) {
        const r = bassNote(s.chord, { low: range[0], high: range[0] + 11 });
        out.push({ beat: s.beat, note: r, dur: s.dur - 0.05, vel: 80 });
        out.push({ beat: s.beat, note: r + 7, dur: s.dur - 0.05, vel: 70 });
        out.push({ beat: s.beat, note: r + 12, dur: s.dur - 0.05, vel: 66 });
      }
      return out;
    },
  },

  // ---- pianos
  'piano-worship': {
    range: [36, 81],
    hands: 'both',
    fn: ({ tl, range }) => {
      // left hand: root and octave held, the fifth on 3; right hand: the chord, then its top notes in 8ths
      const out = [];
      let prev = null;
      for (const s of tl) {
        const r = bassNote(s.chord, { low: range[0], high: range[0] + 11 });
        const rh = voicing(s.chord, { low: 60, high: range[1], size: 3, prev });
        prev = rh;
        for (let b = 0; b < s.dur; b += 4) {
          const len = Math.min(4, s.dur - b);
          out.push({ beat: s.beat + b, note: r, dur: Math.min(2, len) - 0.05, vel: 74 });
          out.push({ beat: s.beat + b, note: r + 12, dur: Math.min(2, len) - 0.05, vel: 64 });
          if (len > 2) out.push({ beat: s.beat + b + 2, note: r + 7, dur: len - 2.05, vel: 60 });
          const order = ['all', 2, 1, 2, 'all', 2, 1, 2];
          for (let e = 0; e < len * 2; e++) {
            const o = order[e % 8];
            const at = s.beat + b + e / 2;
            if (o === 'all') for (const n of rh) out.push({ beat: at, note: n, dur: 0.95, vel: 78 });
            else out.push({ beat: at, note: rh[o], dur: 0.45, vel: 60 });
          }
        }
      }
      return out;
    },
  },
  'piano-ambient': {
    range: [36, 86],
    hands: 'both',
    fn: ({ tl, range }) => {
      const out = [];
      for (const s of tl) {
        const r = bassNote(s.chord, { low: range[0], high: range[0] + 11 });
        out.push({ beat: s.beat, note: r, dur: s.dur - 0.05, vel: 62 });
        out.push({ beat: s.beat, note: r + 12, dur: s.dur - 0.05, vel: 54 });
        // 1-5-9-3 rising: the dotted-eighth delay fills the gaps
        const ivs = [0, 7, 14, s.chord.intervals.includes(3) ? 15 : 16];
        const base = noteAtOrAbove(s.chord.root, 62);
        const times = [0, 1.5, 3];
        for (let b = 0; b < s.dur; b += 4)
          times.forEach((t, k) => b + t < s.dur && out.push({ beat: s.beat + b + t, note: clampNote(base + ivs[k + (b / 4) % 2], 62, range[1]), dur: 1.2, vel: 70 - k * 4 }));
      }
      return out;
    },
  },
  'piano-gospel': {
    range: [31, 82],
    hands: 'both',
    fn: ({ tl, range }) => {
      const out = [];
      let prev = null;
      tl.forEach((s, i) => {
        const r = bassNote(s.chord, { low: range[0], high: range[0] + 11 });
        const next = bassNote(nextSeg(tl, i).chord, { low: range[0], high: range[0] + 11, near: r });
        out.push({ beat: s.beat, note: r, dur: 1.4, vel: 92 });
        out.push({ beat: s.beat, note: r + 12, dur: 1.4, vel: 82 });
        if (s.dur >= 4) {
          out.push({ beat: s.beat + 2.5, note: r + 12, dur: 0.4, vel: 70 });
          out.push({ beat: s.beat + s.dur - 0.5, note: next + (next > r ? -1 : 1), dur: 0.45, vel: 76 }); // chromatic approach
        }
        const rich = { ...s.chord, intervals: [...new Set([...s.chord.intervals, s.chord.intervals.includes(3) ? 10 : 14])] };
        const v = voicing(rich, { low: 58, high: range[1], size: 4, prev, rootless: true });
        prev = v;
        grid('X..x..x...x.x...', s.beat, s.dur, (st, at, vel) => v.forEach((n) => out.push({ beat: at, note: n, dur: st === 0 ? 0.9 : 0.35, vel: vel - 4 })));
      });
      return out;
    },
  },
  'piano-ballad': {
    range: [33, 74],
    hands: 'both',
    fn: ({ tl, range }) => {
      const out = [];
      let prev = null;
      for (const s of tl) {
        out.push({ beat: s.beat, note: bassNote(s.chord, { low: range[0], high: range[0] + 11 }), dur: s.dur - 0.1, vel: 52 });
        const v = voicing(s.chord, { low: 55, high: range[1], size: 3, prev });
        prev = v;
        for (let b = 0; b < s.dur; b += 4) {
          v.forEach((n) => out.push({ beat: s.beat + b, note: n, dur: 2.3, vel: 48 }));
          if (b + 2.5 < s.dur) out.push({ beat: s.beat + b + 2.5, note: v[v.length - 1], dur: 1.4, vel: 42 });
        }
      }
      return out;
    },
  },
  'ep-comp': {
    range: [36, 79],
    hands: 'both',
    fn: ({ tl, range }) => {
      const out = [];
      let prev = null;
      for (const s of tl) {
        out.push({ beat: s.beat, note: bassNote(s.chord, { low: range[0], high: range[0] + 11 }), dur: 1.6, vel: 76 });
        const rich = { ...s.chord, intervals: [...new Set([...s.chord.intervals, s.chord.intervals.includes(3) ? 10 : 11, 14])] };
        const v = voicing(rich, { low: 55, high: range[1], size: 4, prev, rootless: true });
        prev = v;
        grid('x.....x...x.....', s.beat, s.dur, (st, at, vel) => v.forEach((n) => out.push({ beat: at, note: n, dur: st === 0 ? 1.3 : 0.9, vel: vel - 14 })));
      }
      return out;
    },
  },

  // ---- organ
  'organ-gospel': {
    range: [36, 81],
    hands: 'both',
    fn: ({ tl, range }) => {
      const out = [];
      let prev = null;
      for (const s of tl) {
        out.push({ beat: s.beat, note: bassNote(s.chord, { low: range[0], high: range[0] + 11 }), dur: s.dur - 0.05, vel: 90 });
        const v = voicing(s.chord, { low: 60, high: range[1], size: 4, prev });
        prev = v;
        // hold the chord, re-strike it on the "and" of 2 and push into the next bar on the "and" of 4
        grid('X.....x.......x.', s.beat, s.dur, (st, at, vel) => v.forEach((n) => out.push({ beat: at, note: n, dur: st === 0 ? 1.4 : 0.9, vel })));
      }
      return out;
    },
  },
  'organ-hold': { range: [48, 79], hands: 'rh', fn: ({ tl, R, range }) => held(tl, R, range, 4, 90) },

  'piano-sa': {
    range: [31, 82],
    hands: 'both',
    fn: ({ tl, range }) => {
      // SA gospel praise: left hand octaves on the beat, right hand add-9 chords off the beat
      const out = [];
      let prev = null;
      for (const s of tl) {
        const r = bassNote(s.chord, { low: range[0], high: range[0] + 11 });
        for (let b = 0; b < s.dur; b += 2) {
          out.push({ beat: s.beat + b, note: r, dur: 0.9, vel: 90 });
          out.push({ beat: s.beat + b, note: r + 12, dur: 0.9, vel: 80 });
        }
        const add9 = { ...s.chord, intervals: [...new Set([...s.chord.intervals, 14])] };
        const v = voicing(add9, { low: 60, high: range[1], size: 4, prev });
        prev = v;
        grid('..X.x.X...X.x.X.', s.beat, s.dur, (st, at, vel) => v.forEach((n) => out.push({ beat: at, note: n, dur: 0.4, vel: vel - 6 })));
      }
      return out;
    },
  },
  'piano-68': {
    range: [36, 84],
    hands: 'both',
    fn: ({ tl, range }) => {
      // 12/8: left hand root held, right hand rolling triplets 1-5-8-3-8-5 per dotted beat
      const out = [];
      for (const s of tl) {
        const r = bassNote(s.chord, { low: range[0], high: range[0] + 11 });
        out.push({ beat: s.beat, note: r, dur: s.dur - 0.05, vel: 70 });
        out.push({ beat: s.beat, note: r + 12, dur: s.dur - 0.05, vel: 62 });
        const t = tonesIn(s.chord, noteAtOrAbove(s.chord.root, 55), range[1]);
        const order = [0, 1, 2, 3, 2, 1];
        grid('xxxxxx', s.beat, s.dur, (st, at, vel) => out.push({ beat: at, note: t[order[st % 6] % t.length], dur: 0.5, vel: st % 3 === 0 ? 78 : 60 }), 3);
      }
      return out;
    },
  },
  'piano-drive': {
    range: [55, 84],
    hands: 'rh',
    fn: ({ tl, range }) => {
      // Elevation build: the chord and its top note an octave up, in steady 8ths
      const out = [];
      let prev = null;
      for (const s of tl) {
        const v = voicing(s.chord, { low: range[0], high: range[1] - 12, size: 3, prev });
        prev = v;
        grid('X.x.X.x.X.x.X.x.', s.beat, s.dur, (st, at, vel) => {
          v.forEach((n) => out.push({ beat: at, note: n, dur: 0.42, vel: vel - 10 }));
          out.push({ beat: at, note: v[v.length - 1] + 12, dur: 0.42, vel: vel - 4 });
        });
      }
      return out;
    },
  },
  'piano-anthem': {
    range: [36, 84],
    hands: 'both',
    fn: ({ tl, range }) => {
      // Hillsong chorus: root and octave held, open add-9 chords on a pushing rhythm
      const out = [];
      let prev = null;
      for (const s of tl) {
        const r = bassNote(s.chord, { low: range[0], high: range[0] + 11 });
        out.push({ beat: s.beat, note: r, dur: s.dur - 0.05, vel: 74 });
        out.push({ beat: s.beat, note: r + 12, dur: s.dur - 0.05, vel: 66 });
        const add9 = { ...s.chord, intervals: [...new Set([0, 7, 14, s.chord.intervals.includes(3) ? 15 : 16])] };
        const v = voicing(add9, { low: 60, high: range[1], size: 4, prev });
        prev = v;
        grid('x..x..x.x..x..x.', s.beat, s.dur, (st, at, vel) => v.forEach((n) => out.push({ beat: at, note: n, dur: st === 0 ? 0.7 : 0.45, vel: vel - 14 })));
      }
      return out;
    },
  },
  'piano-pump': {
    range: [33, 72],
    hands: 'both',
    fn: ({ tl, range }) => {
      // Billie: a low root and soft close chords on every beat, pumping
      const out = [];
      let prev = null;
      for (const s of tl) {
        out.push({ beat: s.beat, note: bassNote(s.chord, { low: range[0], high: range[0] + 11 }), dur: s.dur - 0.1, vel: 50 });
        const add9 = { ...s.chord, intervals: [...new Set([...s.chord.intervals, 14])] };
        const v = voicing(add9, { low: 53, high: range[1], size: 3, prev });
        prev = v;
        grid('x...x...x...x...', s.beat, s.dur, (st, at, vel) => v.forEach((n) => out.push({ beat: at, note: n, dur: 0.8, vel: st % 8 === 0 ? 52 : 44 })));
      }
      return out;
    },
  },
  'highlife-keys': {
    range: [60, 84],
    hands: 'rh',
    fn: ({ tl, range }) => {
      // highlife guitar on keys: thirds and sixths picked in a lilting 16th pattern
      const out = [];
      for (const s of tl) {
        const t = tonesIn(s.chord, range[0], range[1]);
        if (t.length < 4) continue;
        grid('x.xx.xx.x.xx.xx.', s.beat, s.dur, (st, at, vel) => {
          const k = [0, 1, 2, 1, 2, 3, 2, 1][Math.floor(st / 2) % 8] % (t.length - 1);
          out.push({ beat: at, note: t[k], dur: 0.2, vel: vel - 8 });
          out.push({ beat: at, note: t[k + 1], dur: 0.2, vel: vel - 14 });
        });
      }
      return out;
    },
  },
  'organ-stabs': {
    range: [57, 77],
    hands: 'rh',
    fn: ({ tl, range }) => stabs(tl, range, '..X...x...X..x..', 3, 0.28),
  },

  // ---- rhythm keys
  skank: {
    range: [60, 79],
    hands: 'rh',
    fn: ({ tl, range }) => stabs(tl, range, '..x...x...x...x.', 3, 0.28),
  },
  stabs: {
    range: [57, 77],
    hands: 'rh',
    fn: ({ tl, range }) => stabs(tl, range, 'x..x..x...x.x...', 3, 0.22),
  },
  'afro-keys': {
    range: [60, 81],
    hands: 'rh',
    fn: ({ tl, range }) => stabs(tl, range, 'x..x..x...x..x..', 4, 0.3, true),
  },
  horns: {
    range: [58, 77],
    hands: 'rh',
    fn: ({ tl, range }) => {
      // a two-bar riff on chord tones, punched in unison with the octave
      const out = [];
      tl.forEach((s, i) => {
        const tones = tonesIn(s.chord, range[0], range[1] - 12);
        if (!tones.length) return;
        const riff = i % 2 === 0 ? [[0, 0], [0.75, 1], [1.5, 2], [3, 1]] : [[0.5, 2], [1, 1], [2.5, 0], [3.25, 0]];
        for (let b = 0; b < s.dur; b += 4)
          for (const [t, k] of riff) {
            if (b + t >= s.dur) continue;
            const n = tones[Math.min(k, tones.length - 1)];
            out.push({ beat: s.beat + b + t, note: n, dur: 0.35, vel: 104 });
            out.push({ beat: s.beat + b + t, note: n + 12, dur: 0.35, vel: 96 });
          }
      });
      return out;
    },
  },

  // ---- synths
  'pluck-arp': { range: [60, 86], hands: 'rh', fn: ({ tl, range }) => arp(tl, range, 0.5, [0, 1, 2, 3, 4, 3, 2, 1]) },
  arp16: { range: [64, 88], hands: 'rh', fn: ({ tl, range }) => arp(tl, range, 0.25, [0, 1, 2, 3]) },
  bells: {
    range: [72, 96],
    hands: 'rh',
    fn: ({ tl, range }) => {
      const out = [];
      for (const s of tl) {
        const t = tonesIn(s.chord, range[0], range[1], [14]);
        const m = [t[t.length - 1], t[t.length - 2], t[t.length - 3]].filter(Boolean);
        [[0, 0], [0.75, 1], [1.5, 2], [3, 1]].forEach(([at, k]) => at < s.dur && m[k] && out.push({ beat: s.beat + at, note: m[k], dur: 0.6, vel: 76 }));
      }
      return out;
    },
  },
  lead: {
    range: [64, 84],
    hands: 'rh',
    mono: true,
    fn: ({ tl, R, range }) => melody(tl, R, range),
  },

  // ---- sebene guitars
  'sebene-lead': {
    range: [64, 88],
    hands: 'rh',
    mono: true,
    fn: ({ tl, range }) => {
      // continuous 16ths: four-note cells on the chord's tones in the top register, the cell shape
      // changing beat by beat, the last beat of every other bar answering an octave lower
      const out = [];
      const cells = [
        [3, 2, 1, 2],
        [3, 2, 1, 0],
        [0, 1, 2, 3],
        [2, 1, 0, 1],
      ];
      const bars = ['0012', '0013', '2201', '0033'];
      tl.forEach((s, si) => {
        const t = tonesIn(s.chord, range[0], range[1], [9]).slice(-6);
        if (t.length < 4) return;
        for (let b = 0; b < s.dur; b++) {
          const barIdx = Math.floor((s.beat + b) / 4);
          const cell = cells[Number(bars[(barIdx + si) % bars.length][b % 4])];
          const low = b % 4 === 3 && barIdx % 2 === 1;
          const top = low ? t.slice(0, 4) : t.slice(-4);
          // accents fall where the cavacha snare accents fall
          cell.forEach((k, j) => out.push({ beat: s.beat + b + j / 4, note: top[k], dur: 0.22, vel: CAVACHA[((b % 4) * 4 + j) % 16] === 'X' ? 110 : 82 + ((j * 7) % 9) }));
        }
      });
      return out;
    },
  },
  'mi-solo': {
    range: [52, 72],
    hands: 'rh',
    mono: true,
    fn: ({ tl, range }) => {
      // the middle guitar answers the lead: 16ths in pairs on the off-beat, thirds apart
      const out = [];
      for (const s of tl) {
        const t = tonesIn(s.chord, range[0], range[1]);
        if (t.length < 3) continue;
        grid('.xx..xx..xx..xxx', s.beat, s.dur, (st, at, vel) => out.push({ beat: at, note: t[(st * 3) % t.length], dur: 0.2, vel: vel - 6 }));
      }
      return out;
    },
  },
  'rhythm-chop': {
    range: [52, 70],
    hands: 'rh',
    fn: ({ tl, range }) => {
      const out = [];
      for (const s of tl) {
        const r = noteAtOrAbove(s.chord.root, range[0]);
        grid('.x.x.xox.x.x.xox', s.beat, s.dur, (st, at, vel) => out.push({ beat: at, note: st % 4 === 3 ? r + 7 : r, dur: 0.12, vel }));
      }
      return out;
    },
  },
  likembe: {
    range: [60, 84],
    hands: 'rh',
    fn: ({ tl, range }) => {
      const out = [];
      for (const s of tl) {
        const t = tonesIn(s.chord, range[0], range[1]);
        grid('x.xxx.xxx.xxx.x.', s.beat, s.dur, (st, at, vel) => out.push({ beat: at, note: t[[0, 2, 1, 3, 2, 4][st % 6] % t.length], dur: 0.3, vel: vel - 8 }));
      }
      return out;
    },
  },
  mallet: { range: [55, 84], hands: 'both', fn: ({ tl, range }) => arp(tl, range, 0.5, [0, 2, 1, 3, 2, 4, 3, 5]) },

  // ---- basses (left hand)
  'bass-sebene': bass('X..x..x.X..x..xa', [0, 7, 12, 0, 7, 12, 'a']),
  'bass-rumba': bass('X.....x.X..x..x.', [0, 7, 0, 12, 7]),
  'bass-ballad': bass('X.............x.', [0, 12], { long: true }),
  'bass-8ths': bass('XxxxXxxxXxxxXxxx'.replace(/x/g, 'x'), [0], { len: 0.42 }),
  'bass-gospel': bass('X.....x.x.....xa', [0, 12, 7, 'a']),
  'bass-sa': bass('X.x..xx.x.x..xxa', [0, 12, 7, 9, 0, 9, 0, 2, 'a']),
  'bass-naija': bass('X..x..x.x..x..x.', [0, 0, 4, 7, 7, 9], { minorRiff: true }),
  'bass-highlife': bass('X..x..x...x.x...', [0, 7, 12, 7, 0]),
  'bass-afrobeats': bass('X..x....x.x...x.', [0, 0, 7, 7, 12], { len: 0.6 }),
  'bass-fela': bass('X..x..x...x.x...', [0, 0, 7, 10, 12], { len: 0.3 }),
  'bass-anthem': bass('X.....x.......x.', [0, 0, 12], { long: true }),
  'bass-whole': bass('X...............', [0], { long: true }),
  'bass-808': bass('X.........x.....', [0, 12], { long: true, len808: true }),
  'bass-pop': bass('X.x.x.xxX.x.x.xx', [0, 0, 12, 0, 7, 0, 0, 12, 0, 7]),
  drums: { range: [0, 127], hands: 'none', fn: () => [] },
};

// ------------------------------------------------------------------ shared builders

function held(tl, R, range, size, vel) {
  const out = [];
  let prev = null;
  for (const s of tl) {
    const v = voicing(s.chord, { low: range[0], high: range[1], size, prev });
    prev = v;
    for (const n of v) out.push({ beat: s.beat, note: n, dur: s.dur - 0.08, vel: vel - Math.round(R() * 8) });
  }
  return out;
}

function stabs(tl, range, pattern, size, len, rich = false) {
  const out = [];
  let prev = null;
  for (const s of tl) {
    const chord = rich ? { ...s.chord, intervals: [...new Set([...s.chord.intervals, s.chord.intervals.includes(3) ? 10 : 11, 14])] } : s.chord;
    const v = voicing(chord, { low: range[0], high: range[1], size, prev, rootless: rich });
    prev = v;
    grid(pattern, s.beat, s.dur, (st, at, vel) => v.forEach((n) => out.push({ beat: at, note: n, dur: len, vel })));
  }
  return out;
}

function arp(tl, range, step, order) {
  const out = [];
  for (const s of tl) {
    const t = tonesIn(s.chord, noteAtOrAbove(s.chord.root, range[0]), range[1]);
    if (!t.length) continue;
    const n = Math.round(s.dur / step);
    for (let i = 0; i < n; i++) out.push({ beat: s.beat + i * step, note: t[order[i % order.length] % t.length], dur: step * 0.9, vel: i % (1 / step) === 0 ? 96 : 76 });
  }
  return out;
}

/**
 * A bass pattern: hits from a 16th grid, notes as semitones above the chord's bass note ('a' = a chromatic
 * approach to the next chord). Options: long notes, 808 slides, a minor riff that keeps to the minor scale.
 */
function bass(pattern, degrees, opt = {}) {
  return {
    range: [28, 52],
    hands: 'lh',
    mono: true,
    fn: ({ tl, range }) => {
      const out = [];
      const pat = pattern.replace(/\s/g, '');
      tl.forEach((s, i) => {
        const r = bassNote(s.chord, { low: range[0], high: range[0] + 11 });
        const next = bassNote(nextSeg(tl, i).chord, { low: range[0], high: range[0] + 11, near: r });
        const hits = [];
        const n = Math.round(s.dur * 4);
        let k = 0;
        for (let st = 0; st < n; st++) {
          const ch = pat[(st + Math.round(s.beat * 4)) % pat.length];
          if (VEL[ch] || ch === 'a') hits.push({ st, ch });
        }
        hits.forEach((h, j) => {
          let deg = degrees[k++ % degrees.length];
          if (h.ch === 'a') deg = 'a';
          let note;
          if (deg === 'a') note = next + (next > r ? -1 : next < r ? 1 : -1);
          else note = r + deg;
          if (opt.minorRiff && deg === 4 && s.chord.intervals.includes(3)) note = r + 3; // minor chord: minor third
          if (opt.minorRiff && deg === 9 && s.chord.intervals.includes(3)) note = r + 10; // and the minor 7th, not the 6th
          if (note > range[1]) note -= 12;
          const end = j + 1 < hits.length ? hits[j + 1].st : n;
          const room = (end - h.st) / 4;
          const dur = opt.long ? Math.max(0.3, room - 0.05) : opt.len ? Math.min(opt.len, room - 0.02) : Math.min(0.55, room - 0.03);
          out.push({ beat: s.beat + h.st / 4, note, dur, vel: VEL[h.ch] || 80 });
        });
      });
      return out;
    },
  };
}

/** A simple, singable line on chord tones and the steps between them; never a known tune. */
function melody(tl, R, range) {
  const out = [];
  const rhythms = [
    [[0, 1.5], [1.5, 0.5], [2, 1], [3, 1]],
    [[0, 0.5], [0.5, 0.5], [1, 1.5], [2.5, 1.5]],
    [[0, 2], [2, 0.5], [2.5, 0.5], [3, 1]],
    [[0.5, 1], [1.5, 1], [2.5, 1.5]],
  ];
  let last = Math.round((range[0] + range[1]) / 2);
  tl.forEach((s, si) => {
    const tones = tonesIn(s.chord, range[0], range[1], colour(s.chord).slice(0, 1));
    for (let b = 0; b < s.dur; b += 4) {
      const r = rhythms[(si + b / 4) % rhythms.length];
      for (const [t, d] of r) {
        if (b + t >= s.dur) continue;
        const near = tones.filter((n) => Math.abs(n - last) <= 5);
        const pool = near.length ? near : tones;
        const pick = pool[Math.floor(R() * pool.length)] || last;
        last = pick;
        out.push({ beat: s.beat + b + t, note: pick, dur: Math.min(d, s.dur - b - t) - 0.04, vel: t === 0 ? 96 : 84 });
      }
    }
  });
  return out;
}

// ------------------------------------------------------------------ entry point

/**
 * Notes for a role over a timeline. `range` overrides the role's own; `humanize` 0..1 nudges timing and
 * velocity a little, like hands do.
 */
export function phrase(role, { tl, range, seed = 7, humanize = 0.5 } = {}) {
  const r = ROLES[role];
  if (!r) throw new Error(`Unknown demo role "${role}"`);
  const R = rng(seed);
  const rg = range || r.range;
  const events = r.fn({ tl, R, range: rg });
  return events
    .filter((e) => e.note >= 0 && e.note <= 127 && e.dur > 0)
    .map((e) => ({
      ...e,
      beat: e.beat === 0 ? 0 : Math.max(0, e.beat + (R() - 0.5) * 0.03 * humanize),
      vel: Math.max(1, Math.min(127, Math.round(e.vel * (1 - 0.06 * humanize + R() * 0.12 * humanize)))),
    }))
    .sort((a, b) => a.beat - b.beat || a.note - b.note);
}
