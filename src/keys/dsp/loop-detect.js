// Finds a seamless loop inside a sustained sample (choir, strings, organ, pad), so a 3-second clip can be
// held for as long as a key is down. Pure function: runs in Node tests and in the browser.

/**
 * @param {Float32Array} x mono audio
 * @param {number} sr sample rate
 * @param {number} f0 the note's fundamental in Hz
 * @returns {{start:number,end:number}|null} loop points in samples, or null for a decaying (non-loopable) sound
 */
export function findLoop(x, sr, f0, opts = {}) {
  const hop = Math.max(1, Math.round(sr * 0.01));
  const win = Math.round(sr * 0.04);
  const nFrames = Math.floor((x.length - win) / hop);
  if (nFrames < 10) return null;
  const raw = new Float32Array(nFrames);
  for (let f = 0; f < nFrames; f++) {
    let s = 0;
    const o = f * hop;
    for (let i = 0; i < win; i++) s += x[o + i] * x[o + i];
    raw[f] = Math.sqrt(s / win);
  }
  // A smoothed envelope: vibrato and consonant-like bumps must not look like the end of the sound.
  const rms = new Float32Array(nFrames);
  for (let f = 0; f < nFrames; f++) {
    let s = 0,
      n = 0;
    for (let k = -4; k <= 4; k++) {
      const j = f + k;
      if (j >= 0 && j < nFrames) {
        s += raw[j];
        n++;
      }
    }
    rms[f] = s / n;
  }
  let peak = 0,
    peakAt = 0;
  for (let f = 0; f < nFrames; f++) {
    if (rms[f] > peak) {
      peak = rms[f];
      peakAt = f;
    }
  }
  if (peak < 1e-4) return null;
  // Sustain region: after the attack has settled, before the level has fallen well below the body of the
  // sound (-12 dB), or the clip ends.
  const minLevel = peak * (opts.minLevel || 0.25);
  const t1 = Math.min(peakAt + Math.round((opts.settle || 0.25) / 0.01), nFrames - 1);
  let t2 = nFrames - 1;
  for (let f = t1; f < nFrames; f++) {
    if (rms[f] < minLevel) {
      t2 = f - 1;
      break;
    }
  }
  t2 -= Math.round(0.08 / 0.01); // keep clear of the tail and the cut at the end of the clip
  const minRegion = (opts.minRegion || 0.4) / 0.01;
  if (t2 - t1 < minRegion) return null;
  // A decaying sound (piano, pluck) is not looped: the region must be fairly flat.
  const early = avg(rms, t1, t1 + Math.floor((t2 - t1) / 3));
  const late = avg(rms, t2 - Math.floor((t2 - t1) / 3), t2);
  if (late < early * (opts.flatness || 0.7)) return null;

  const period = sr / f0;
  const regionStart = t1 * hop;
  const regionEnd = t2 * hop + win;
  const maxLen = Math.min((opts.maxLoop || 1.2) * sr, (regionEnd - regionStart) * 0.85);
  let periods = Math.max(2, Math.floor(maxLen / period));
  let len = Math.round(periods * period);
  if (len < sr * 0.05) return null;

  // Place the loop end near the end of the region and slide it over two periods to the best waveform match.
  const w = Math.max(8, Math.min(Math.round(period), 4096));
  const half = w >> 1;
  let bestEnd = regionEnd - half - 1,
    bestCost = Infinity;
  const scan = Math.min(Math.round(period * 2), regionEnd - regionStart - len - w);
  for (let e = regionEnd - half - 1; e > regionEnd - half - 1 - scan; e--) {
    const st = e - len;
    if (st - half < 0) break;
    let c = 0;
    for (let i = -half; i < half; i++) {
      const d = x[st + i] - x[e + i];
      c += d * d;
    }
    if (c < bestCost) {
      bestCost = c;
      bestEnd = e;
    }
  }
  // Refine the length by up to half a period for a loop that lands exactly on the waveform.
  let bestLen = len;
  const r = Math.min(Math.round(period / 2), 2048);
  for (let dl = -r; dl <= r; dl++) {
    const st = bestEnd - (len + dl);
    if (st - half < 0) continue;
    let c = 0;
    for (let i = -half; i < half; i++) {
      const d = x[st + i] - x[bestEnd + i];
      c += d * d;
    }
    if (c < bestCost) {
      bestCost = c;
      bestLen = len + dl;
    }
  }
  const start = bestEnd - bestLen;
  if (start < 0 || bestLen < 32) return null;
  return { start, end: bestEnd };
}

function avg(a, from, to) {
  let s = 0,
    n = 0;
  for (let i = Math.max(0, from); i < Math.min(a.length, to); i++) {
    s += a[i];
    n++;
  }
  return n ? s / n : 0;
}
