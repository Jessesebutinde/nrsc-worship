// Turns mono audio (fed in chunks) into compact time series used to find
// songs: loudness, onset strength (for tempo) and chroma (for key/tonality).

import { FFT } from './fft.js';

export const FINE_HOP = 256 / 11025; // ~23 ms: loudness + onsets
export const CHROMA_HOP = 0.25; // seconds

export class FeatureExtractor {
  constructor({ sampleRate, duration }) {
    this.sr = sampleRate;
    this.duration = duration;
    this.fineHop = FINE_HOP;
    this.nFine = Math.ceil(duration / this.fineHop);
    this.nChroma = Math.ceil(duration / CHROMA_HOP);
    this.rms = new Float32Array(this.nFine);
    this.flux = new Float32Array(this.nFine);
    this.fineDone = new Uint8Array(this.nFine);
    this.chroma = new Float32Array(this.nChroma * 12);
    this.chromaDone = new Uint8Array(this.nChroma);

    // Small FFT for onsets, large FFT for pitch.
    this.fftS = new FFT(pow2(sampleRate * 0.046));
    this.fftL = new FFT(pow2(sampleRate * 0.37));
    this.magS = new Float32Array(this.fftS.n / 2);
    this.prevS = new Float32Array(this.fftS.n / 2);
    this.magL = new Float32Array(this.fftL.n / 2);

    // Map large-FFT bins (80 Hz .. 2 kHz) to pitch classes.
    this.binPc = new Int8Array(this.fftL.n / 2).fill(-1);
    for (let k = 1; k < this.fftL.n / 2; k++) {
      const f = (k * sampleRate) / this.fftL.n;
      if (f < 80 || f > 2000) continue;
      const midi = 69 + 12 * Math.log2(f / 440);
      this.binPc[k] = ((Math.round(midi) % 12) + 12) % 12;
    }
    // Bins per semitone grow with frequency; weight each bin by 1/count.
    this.binW = new Float32Array(this.fftL.n / 2);
    for (let k = 1; k < this.fftL.n / 2; k++) {
      const f = (k * sampleRate) / this.fftL.n;
      this.binW[k] = Math.min(1, (f * 0.0595) / (sampleRate / this.fftL.n)) ** -1;
    }
    this.fluxHi = Math.min(this.fftS.n / 2, Math.round((5000 * this.fftS.n) / sampleRate));
  }

  /** data: Float32Array mono at this.sr whose first sample is at startTime. */
  push(data, startTime) {
    const sr = this.sr;
    // Skip the first 0.1 s: the decoder output there can be distorted.
    const lo = startTime + 0.1;
    const hi = startTime + data.length / sr;

    const nS = this.fftS.n;
    const hop = this.fineHop;
    let k0 = Math.max(0, Math.ceil(lo / hop));
    const k1 = Math.min(this.nFine - 1, Math.floor((hi - (nS / sr)) / hop));
    let havePrev = false;
    for (let k = k0; k <= k1; k++) {
      const t = k * hop;
      const off = Math.round((t - startTime) * sr);
      if (off < 0 || off + nS > data.length) continue;
      if (this.fineDone[k]) {
        havePrev = false;
        continue;
      }
      // Loudness over one hop.
      const hopN = Math.round(hop * sr);
      let e = 0;
      for (let i = 0; i < hopN; i++) {
        const v = data[off + i];
        e += v * v;
      }
      this.rms[k] = Math.sqrt(e / hopN);

      if (!havePrev) {
        const poff = Math.round((t - hop - startTime) * sr);
        if (poff >= 0) {
          this.fftS.magnitudes(data, poff, this.prevS);
          logify(this.prevS);
          havePrev = true;
        }
      }
      this.fftS.magnitudes(data, off, this.magS);
      logify(this.magS);
      let f = 0;
      if (havePrev) {
        for (let i = 1; i < this.fluxHi; i++) {
          const d = this.magS[i] - this.prevS[i];
          if (d > 0) f += d;
        }
      }
      this.flux[k] = f;
      this.fineDone[k] = 1;
      this.prevS.set(this.magS);
      havePrev = true;
    }

    const nL = this.fftL.n;
    const c0 = Math.max(0, Math.ceil((lo + nL / sr / 2) / CHROMA_HOP));
    const c1 = Math.min(this.nChroma - 1, Math.floor((hi - nL / sr / 2) / CHROMA_HOP));
    for (let c = c0; c <= c1; c++) {
      if (this.chromaDone[c]) continue;
      const off = Math.round((c * CHROMA_HOP - startTime) * sr - nL / 2);
      if (off < 0 || off + nL > data.length) continue;
      const m = this.fftL.magnitudes(data, off, this.magL);
      logify(m);
      // Keep spectral peaks above the local average (whitening), and give
      // every semitone the same weight however many bins it spans.
      const base = c * 12;
      for (let k = 3; k < nL / 2 - 3; k++) {
        const pc = this.binPc[k];
        if (pc < 0) continue;
        const v = m[k] - (m[k - 3] + m[k - 2] + m[k - 1] + m[k + 1] + m[k + 2] + m[k + 3]) / 6;
        if (v > 0 && m[k] >= m[k - 1] && m[k] >= m[k + 1]) this.chroma[base + pc] += v * this.binW[k];
      }
      this.chromaDone[c] = 1;
    }
  }

  finish() {
    return {
      duration: this.duration,
      fineHop: this.fineHop,
      rms: this.rms,
      flux: this.flux,
      chromaHop: CHROMA_HOP,
      chroma: this.chroma,
    };
  }
}

function logify(m) {
  for (let i = 0; i < m.length; i++) m[i] = Math.log1p(100 * m[i]);
}

function pow2(n) {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}
