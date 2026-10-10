// Song finding from features (runs on this device for local files).
//
// Worship sets are often continuous music, so besides gaps (silence/talk)
// we look for quiet dips that line up with a change of harmony, and flag
// harmony changes without a dip as possible medley split points.

import { CHROMA_HOP } from './features.js';

const MIN_SONG = 90; // seconds
const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

export function detectSongs(f, { windowEnd = f.duration, fileEnd = f.duration } = {}) {
  const n = Math.floor(Math.min(windowEnd, f.duration));
  if (n < 30) return [];

  // Per-second loudness (dB) and "low energy ratio" (high for speech).
  const level = new Float32Array(n);
  const sub = new Float32Array(n * 10);
  for (let s = 0; s < n; s++) {
    let e = 0;
    let c = 0;
    for (let k = Math.floor(s / f.fineHop); k < Math.floor((s + 1) / f.fineHop) && k < f.rms.length; k++) {
      e += f.rms[k] * f.rms[k];
      c++;
      const j = Math.min(9, Math.floor(((k * f.fineHop) - s) * 10));
      sub[s * 10 + j] = Math.max(sub[s * 10 + j], f.rms[k]);
    }
    level[s] = 10 * Math.log10(e / Math.max(1, c) + 1e-10);
  }
  const ler = new Float32Array(n);
  for (let s = 0; s < n; s++) {
    const a = Math.max(0, s - 2);
    const b = Math.min(n, s + 3);
    let mean = 0;
    for (let i = a * 10; i < b * 10; i++) mean += sub[i];
    mean /= (b - a) * 10;
    let low = 0;
    for (let i = a * 10; i < b * 10; i++) if (sub[i] < 0.5 * mean) low++;
    ler[s] = low / ((b - a) * 10);
  }

  const ref = percentile(level, 0.75);
  const lvl3 = smooth(level, 1);
  const lvl5 = smooth(level, 2);
  const chroma = perSecondChroma(f, n);

  // hard: silence or talking. soft: clearly quieter than the music around
  // it (a leader praying over soft keys between songs).
  const hard = new Uint8Array(n);
  const soft = new Uint8Array(n);
  for (let s = 0; s < n; s++) {
    hard[s] = lvl3[s] < ref - 12 || ler[s] >= 0.25 ? 1 : 0;
    soft[s] = hard[s] || lvl5[s] < localRef(level, s, 90) - 6 ? 1 : 0;
  }
  const hardM = medianBin(hard, 3);
  const softM = medianBin(soft, 2);

  // Breaks between songs.
  const breaks = [];
  for (let s = 0; s < n; ) {
    if (!softM[s] && !hardM[s]) {
      s++;
      continue;
    }
    let e = s;
    let hardCount = 0;
    while (e < n && (softM[e] || hardM[e])) hardCount += hardM[e++];
    const len = e - s;
    let nov = 0;
    for (let u = s - 10; u <= e + 10; u += 3) if (u > 0 && u < n) nov = Math.max(nov, novelty(chroma, u, 40));
    const isHard = hardCount * 2 >= len;
    const strong =
      s === 0 ||
      e >= n ||
      (isHard && len >= 4) ||
      len >= 15 ||
      (len >= 3 && nov >= 0.12) ||
      nov >= 0.25;
    let how = isHard ? 'gap' : 'dip';
    if (s === 0 && len < 10) how = 'edge';
    if (strong) breaks.push({ s, e, len, nov, how, score: len / 10 + nov / 0.15 + (isHard ? 1 : 0) });
    s = e;
  }

  // Songs sit between breaks. Drop the weaker break around any piece that
  // is too short to be a song, unless the piece is mostly talk/silence.
  let pieces = [];
  let prevEnd = 0;
  let prevBreak = null;
  for (const b of [...breaks, { s: n, e: n, how: 'edge', score: Infinity }]) {
    if (b.s > prevEnd) pieces.push({ a: prevEnd, b: b.s, before: prevBreak, after: b });
    prevEnd = b.e;
    prevBreak = b;
  }
  for (let changed = true; changed; ) {
    changed = false;
    pieces = pieces.filter((p) => {
      let talk = 0;
      for (let s = p.a; s < p.b; s++) talk += hardM[s];
      return p.b - p.a >= 30 && talk * 2 < p.b - p.a;
    });
    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i];
      if (p.b - p.a >= MIN_SONG) continue;
      const left = i > 0 && pieces[i - 1].after === p.before ? pieces[i - 1] : null;
      const right = i + 1 < pieces.length && pieces[i + 1].before === p.after ? pieces[i + 1] : null;
      const useLeft = left && (!right || (p.before?.score ?? Infinity) <= (p.after?.score ?? Infinity));
      if (useLeft) {
        left.b = p.b;
        left.after = p.after;
      } else if (right) {
        right.a = p.a;
        right.before = p.before;
      } else continue;
      pieces.splice(i, 1);
      changed = true;
      break;
    }
  }

  const songs = [];
  for (const p of pieces) {
    if (p.b - p.a < 60) continue;
    const keys = [];
    const cands = [];
    for (let t = p.a + 60; t < p.b - 60; t += 2) {
      const nov = novelty(chroma, t, 40);
      if (nov >= 0.12 && nov >= novelty(chroma, t - 2, 40) && nov >= novelty(chroma, t + 2, 40)) cands.push({ t, nov });
    }
    cands.sort((x, y) => y.nov - x.nov);
    for (const c of cands) if (keys.every((k) => Math.abs(k.t - c.t) >= 90)) keys.push(c);
    keys.sort((x, y) => x.t - y.t);
    const a = { t: p.a, how: p.a === 0 ? 'edge' : p.before ? p.before.how : 'edge' };
    const b = { t: p.b, how: p.b >= n ? 'edge' : p.after ? p.after.how : 'edge' };
    songs.push(describe(f, chroma, a, b, keys, n, fileEnd));
  }
  return songs.map((s, i) => ({ n: i + 1, ...s }));
}

function localRef(level, s, r) {
  const v = Array.from(level.subarray(Math.max(0, s - r), Math.min(level.length, s + r))).sort((x, y) => x - y);
  return v[Math.floor(v.length * 0.75)];
}

function describe(f, chroma, a, b, keys, n, fileEnd) {
  const notes = [];
  const strength = { edge: 0.35, dip: 0.6, gap: 0.95 };
  if (a.how === 'edge') notes.push('music is already playing when the file starts');
  if (a.how === 'dip') notes.push(`start: music gets quiet near ${clock(a.t)}`);
  if (b.how === 'dip') notes.push(`end: music gets quiet near ${clock(b.t)}`);
  if (b.how === 'edge') {
    notes.push(n < fileEnd - 1 ? 'still playing at the end of the scan window; try a longer scan' : 'still playing at the end of the file');
  }
  const len = b.t - a.t;
  const medley = keys.length > 0 || len > 9 * 60;
  for (const k of keys) notes.push(`harmony changes near ${clock(k.t)} (medley or new song?)`);
  if (len > 9 * 60) notes.push(`long (${clock(len)}): may hold more than one song`);
  const confidence = Math.round(((strength[a.how] + strength[b.how]) / 2) * (medley ? 0.8 : 1) * 100);

  const mean = new Float32Array(12);
  for (let s = a.t; s < b.t; s++) for (let i = 0; i < 12; i++) mean[i] += chroma[s * 12 + i];
  return {
    start_s: a.t,
    end_s: b.t,
    confidence,
    label: null,
    medley,
    medley_at: keys.map((k) => k.t),
    check: confidence < 70 || medley,
    bpm: tempo(f, a.t, b.t),
    key: estimateKey(mean),
    note: notes.join('; '),
    sections: [],
    estimated: true,
  };
}

export function perSecondChroma(f, n) {
  const out = new Float32Array(n * 12);
  const per = 1 / CHROMA_HOP;
  for (let s = 0; s < n; s++) {
    for (let c = Math.floor(s * per); c < Math.floor((s + 1) * per); c++) {
      if ((c + 1) * 12 > f.chroma.length) break;
      for (let i = 0; i < 12; i++) out[s * 12 + i] += f.chroma[c * 12 + i];
    }
    let norm = 0;
    for (let i = 0; i < 12; i++) norm += out[s * 12 + i] ** 2;
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < 12; i++) out[s * 12 + i] /= norm;
  }
  return out;
}

/** 1 - cosine similarity between the mean chroma before and after t. */
export function novelty(chroma, t, w) {
  const n = chroma.length / 12;
  const a = new Float32Array(12);
  const b = new Float32Array(12);
  for (let s = Math.max(0, t - w); s < t; s++) for (let i = 0; i < 12; i++) a[i] += chroma[s * 12 + i];
  for (let s = t; s < Math.min(n, t + w); s++) for (let i = 0; i < 12; i++) b[i] += chroma[s * 12 + i];
  // Centre both profiles: chroma is all-positive, so plain cosine
  // similarity is always close to 1.
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < 12; i++) {
    ma += a[i] / 12;
    mb += b[i] / 12;
  }
  for (let i = 0; i < 12; i++) {
    a[i] -= ma;
    b[i] -= mb;
  }
  let ab = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < 12; i++) {
    ab += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  return 1 - ab / (Math.sqrt(aa * bb) || 1);
}

export function estimateKey(mean) {
  let best = -2;
  let name = null;
  for (let r = 0; r < 12; r++) {
    for (const [prof, kind] of [
      [MAJOR, 'major'],
      [MINOR, 'minor'],
    ]) {
      const c = corr(mean, (i) => prof[(i - r + 12) % 12]);
      if (c > best) {
        best = c;
        name = `${NAMES[r]} ${kind}`;
      }
    }
  }
  return best > 0.3 ? name : null;
}

function corr(x, py) {
  let mx = 0;
  let my = 0;
  for (let i = 0; i < 12; i++) {
    mx += x[i];
    my += py(i);
  }
  mx /= 12;
  my /= 12;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < 12; i++) {
    const dx = x[i] - mx;
    const dy = py(i) - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  return sxy / (Math.sqrt(sxx * syy) || 1);
}

/** Tempo from the onset envelope's autocorrelation (60..180 BPM). */
export function tempo(f, t0, t1) {
  const hop = f.fineHop;
  const a = Math.floor(t0 / hop);
  const b = Math.min(f.flux.length, Math.floor(t1 / hop));
  if (b - a < 10 / hop) return null;
  const x = new Float32Array(b - a);
  let mean = 0;
  for (let i = a; i < b; i++) mean += f.flux[i];
  mean /= b - a;
  for (let i = a; i < b; i++) x[i - a] = Math.max(0, f.flux[i] - mean);
  const lo = Math.floor(60 / 180 / hop);
  const hi = Math.ceil(60 / 60 / hop);
  let best = 0;
  let bestLag = 0;
  const ac = new Float32Array(hi + 2);
  for (let lag = lo - 1; lag <= hi + 1; lag++) {
    let s = 0;
    for (let i = 0; i + lag < x.length; i++) s += x[i] * x[i + lag];
    ac[lag] = s / (x.length - lag);
  }
  for (let lag = lo; lag <= hi; lag++) {
    const bpm = 60 / (lag * hop);
    // Prefer common worship tempos around 110 BPM.
    const w = Math.exp(-0.5 * (Math.log2(bpm / 110) / 0.9) ** 2);
    const v = ac[lag] * w;
    if (v > best && ac[lag] >= ac[lag - 1] && ac[lag] >= ac[lag + 1]) {
      best = v;
      bestLag = lag;
    }
  }
  if (!bestLag) return null;
  // Parabolic refinement for sub-hop accuracy.
  const y0 = ac[bestLag - 1];
  const y1 = ac[bestLag];
  const y2 = ac[bestLag + 1];
  const d = y0 - 2 * y1 + y2;
  const off = d ? (0.5 * (y0 - y2)) / d : 0;
  return Math.round((60 / ((bestLag + off) * hop)) * 10) / 10;
}

function smooth(x, r) {
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) {
    let s = 0;
    let c = 0;
    for (let k = Math.max(0, i - r); k <= Math.min(x.length - 1, i + r); k++) {
      s += x[k];
      c++;
    }
    out[i] = s / c;
  }
  return out;
}

function medianBin(x, r) {
  const out = new Uint8Array(x.length);
  for (let i = 0; i < x.length; i++) {
    let on = 0;
    let c = 0;
    for (let k = Math.max(0, i - r); k <= Math.min(x.length - 1, i + r); k++) {
      on += x[k];
      c++;
    }
    out[i] = on * 2 > c ? 1 : 0;
  }
  return out;
}

function percentile(x, p) {
  const v = Array.from(x).sort((a, b) => a - b);
  return v[Math.min(v.length - 1, Math.floor(p * v.length))];
}

function clock(s) {
  s = Math.round(s);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
