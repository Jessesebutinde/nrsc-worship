// Granular pitch shifter (two overlapping Hann grains read from a ring buffer at `ratio` times the
// writing speed). Used by the shimmer reverb; pure so it can be tested in Node.

export class GrainShifter {
  constructor(sr, channels = 2, grainSeconds = 0.09) {
    this.size = 8192;
    this.grain = Math.max(64, Math.round(sr * grainSeconds));
    this.bufs = [];
    for (let c = 0; c < channels; c++) this.bufs.push(new Float32Array(this.size));
    this.w = 0;
    this.phase = 0;
    this.win = new Float32Array(this.grain);
    for (let i = 0; i < this.grain; i++) this.win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / this.grain);
  }
  /**
   * @param {Float32Array[]} ins  one array per channel (missing/short arrays read as silence)
   * @param {Float32Array[]} outs one array per channel
   * @param {number} n frames
   * @param {number} ratio 2 = an octave up, 0.5 = an octave down
   */
  process(ins, outs, n, ratio) {
    const size = this.size,
      grain = this.grain;
    const chans = this.bufs.length;
    // Each head starts far enough behind the writer that, moving `ratio` samples per sample, it is
    // level with the writer at the end of its grain (and never reads ahead of it).
    const base = Math.max(0, grain * (ratio - 1));
    const slope = ratio - 1;
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < chans; c++) this.bufs[c][this.w] = ins[c] && i < ins[c].length ? ins[c][i] : 0;
      const p1 = this.phase;
      let p2 = this.phase + grain / 2;
      if (p2 >= grain) p2 -= grain;
      const d1 = base - p1 * slope;
      const d2 = base - p2 * slope;
      const g1 = this.win[p1 | 0];
      const g2 = this.win[p2 | 0];
      for (let c = 0; c < chans; c++) {
        const b = this.bufs[c];
        if (outs[c]) outs[c][i] = read(b, this.w - d1, size) * g1 + read(b, this.w - d2, size) * g2;
      }
      this.w = this.w + 1 >= size ? 0 : this.w + 1;
      this.phase += 1;
      if (this.phase >= grain) this.phase -= grain;
    }
  }
}

function read(b, pos, size) {
  while (pos < 0) pos += size;
  while (pos >= size) pos -= size;
  const i = pos | 0;
  const f = pos - i;
  const j = i + 1 >= size ? 0 : i + 1;
  return b[i] + (b[j] - b[i]) * f;
}
