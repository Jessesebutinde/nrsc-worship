// A small FLAC encoder (16-bit): fixed predictors (order 0-4), mid/side
// stereo and partitioned Rice coding. Typically ~55-65% of WAV size.

const BLOCK = 4096;

class BitWriter {
  constructor(cap = 1 << 16) {
    this.buf = new Uint8Array(cap);
    this.pos = 0; // bytes written
    this.acc = 0; // pending bits (as an unsigned int of up to 32 bits)
    this.n = 0; // number of pending bits
  }
  ensure(extra) {
    if (this.pos + extra <= this.buf.length) return;
    let cap = this.buf.length * 2;
    while (cap < this.pos + extra) cap *= 2;
    const b = new Uint8Array(cap);
    b.set(this.buf.subarray(0, this.pos));
    this.buf = b;
  }
  /** Writes the low `bits` bits of v (bits <= 24). */
  write(v, bits) {
    if (bits === 0) return;
    this.acc = (this.acc << bits) | (v & ((1 << bits) - 1));
    this.n += bits;
    if (this.n >= 8) {
      this.ensure(4);
      while (this.n >= 8) {
        this.n -= 8;
        this.buf[this.pos++] = (this.acc >>> this.n) & 0xff;
      }
      this.acc &= (1 << this.n) - 1;
    }
  }
  writeBig(v, bits) {
    // For values wider than 24 bits (up to 36).
    if (bits > 24) {
      this.write(Math.floor(v / 2 ** 24), bits - 24);
      this.write(v % 2 ** 24, 24);
    } else this.write(v, bits);
  }
  unary(q) {
    // q zeros then a one.
    while (q >= 24) {
      this.write(0, 24);
      q -= 24;
    }
    this.write(1, q + 1);
  }
  align() {
    if (this.n) this.write(0, 8 - this.n);
  }
  bytes() {
    return this.buf.subarray(0, this.pos);
  }
}

const CRC8 = (() => {
  const t = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 0x80 ? ((c << 1) ^ 0x07) & 0xff : (c << 1) & 0xff;
    t[i] = c;
  }
  return t;
})();
const CRC16 = (() => {
  const t = new Uint16Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i << 8;
    for (let k = 0; k < 8; k++) c = c & 0x8000 ? ((c << 1) ^ 0x8005) & 0xffff : (c << 1) & 0xffff;
    t[i] = c;
  }
  return t;
})();

function crc8(u8, a, b) {
  let c = 0;
  for (let i = a; i < b; i++) c = CRC8[c ^ u8[i]];
  return c;
}
function crc16(u8, a, b) {
  let c = 0;
  for (let i = a; i < b; i++) c = ((c << 8) & 0xffff) ^ CRC16[(c >> 8) ^ u8[i]];
  return c;
}

function utf8Num(w, v) {
  if (v < 0x80) return w.write(v, 8);
  let n = 2;
  while (v >= 2 ** (5 * n + 1)) n++;
  const lead = (0xff00 >> n) & 0xff;
  w.write(lead | Math.floor(v / 2 ** (6 * (n - 1))), 8);
  for (let i = n - 2; i >= 0; i--) w.write(0x80 | (Math.floor(v / 2 ** (6 * i)) & 0x3f), 8);
}

const zig = (v) => (v >= 0 ? 2 * v : -2 * v - 1);

function residuals(x, n, order, out) {
  for (let i = order; i < n; i++) {
    let r;
    switch (order) {
      case 0: r = x[i]; break;
      case 1: r = x[i] - x[i - 1]; break;
      case 2: r = x[i] - 2 * x[i - 1] + x[i - 2]; break;
      case 3: r = x[i] - 3 * x[i - 1] + 3 * x[i - 2] - x[i - 3]; break;
      default: r = x[i] - 4 * x[i - 1] + 6 * x[i - 2] - 4 * x[i - 3] + x[i - 4];
    }
    out[i - order] = r;
  }
  return n - order;
}

function riceParam(sum, count) {
  if (!count) return 0;
  const mean = sum / count;
  let k = 0;
  while (k < 14 && 2 ** (k + 1) <= mean) k++;
  return k;
}

function riceBits(res, a, b, k) {
  let bits = 0;
  for (let i = a; i < b; i++) bits += (zig(res[i]) >>> k) + 1 + k;
  return bits;
}

/** Picks partition order and parameters; returns {order, params, bits}. */
function planRice(res, count, blockSize, predOrder) {
  let best = null;
  for (let po = 0; po <= 6; po++) {
    const parts = 1 << po;
    if (blockSize % parts || blockSize / parts <= predOrder) break;
    const per = blockSize / parts;
    const params = [];
    let bits = 6; // method + partition order
    let idx = 0;
    for (let p = 0; p < parts; p++) {
      const len = p === 0 ? per - predOrder : per;
      let sum = 0;
      for (let i = idx; i < idx + len; i++) sum += zig(res[i]);
      let k = riceParam(sum, len);
      // Check neighbours: the mean estimate is close but not exact.
      let kb = riceBits(res, idx, idx + len, k);
      for (const k2 of [k - 1, k + 1]) {
        if (k2 < 0 || k2 > 14) continue;
        const b2 = riceBits(res, idx, idx + len, k2);
        if (b2 < kb) {
          kb = b2;
          k = k2;
        }
      }
      params.push(k);
      bits += 4 + kb;
      idx += len;
    }
    if (!best || bits < best.bits) best = { order: po, params, bits };
  }
  return best;
}

function writeSubframe(w, x, n, bps, res) {
  // Constant?
  let constant = true;
  for (let i = 1; i < n; i++) {
    if (x[i] !== x[0]) {
      constant = false;
      break;
    }
  }
  if (constant) {
    w.write(0, 1);
    w.write(0, 6);
    w.write(0, 1);
    w.write(x[0] & ((1 << bps) - 1), bps);
    return;
  }
  let bestOrder = 0;
  let bestSum = Infinity;
  for (let o = 0; o <= Math.min(4, n - 1); o++) {
    const m = residuals(x, n, o, res);
    let s = 0;
    for (let i = 0; i < m; i++) s += Math.abs(res[i]);
    if (s < bestSum) {
      bestSum = s;
      bestOrder = o;
    }
  }
  const m = residuals(x, n, bestOrder, res);
  const plan = planRice(res, m, n, bestOrder);
  const fixedBits = 8 + bestOrder * bps + plan.bits;
  if (fixedBits >= 8 + n * bps) {
    // Verbatim is smaller (noise).
    w.write(0, 1);
    w.write(1, 6);
    w.write(0, 1);
    for (let i = 0; i < n; i++) w.write(x[i] & ((1 << bps) - 1), bps);
    return;
  }
  w.write(0, 1);
  w.write(8 | bestOrder, 6);
  w.write(0, 1);
  for (let i = 0; i < bestOrder; i++) w.write(x[i] & ((1 << bps) - 1), bps);
  w.write(0, 2); // Rice, 4-bit parameters
  w.write(plan.order, 4);
  const parts = 1 << plan.order;
  const per = n / parts;
  let idx = 0;
  for (let p = 0; p < parts; p++) {
    const len = p === 0 ? per - bestOrder : per;
    const k = plan.params[p];
    w.write(k, 4);
    for (let i = idx; i < idx + len; i++) {
      const u = zig(res[i]);
      w.unary(u >>> k);
      if (k) w.write(u & ((1 << k) - 1), k);
    }
    idx += len;
  }
}

/**
 * channels: Int16Array[] (1 or 2). Returns { streaminfo, frames } where
 * streaminfo is the 34-byte STREAMINFO body and frames the audio frames.
 */
export function encodeFlac(channels, sampleRate, { onProgress } = {}) {
  const nc = channels.length;
  const total = channels[0].length;
  const w = new BitWriter(Math.max(1 << 16, total * nc));
  const a = new Int32Array(BLOCK);
  const b = new Int32Array(BLOCK);
  const res = new Int32Array(BLOCK);
  let minFrame = Infinity;
  let maxFrame = 0;
  let frameNo = 0;
  for (let off = 0; off < total; off += BLOCK, frameNo++) {
    const n = Math.min(BLOCK, total - off);
    const start = w.pos;
    w.write(0xfff8, 16);
    const sizeCode = n === BLOCK ? 12 : 7;
    w.write(sizeCode, 4);
    w.write(0, 4); // sample rate from STREAMINFO
    w.write(nc === 2 ? 10 : 0, 4); // mid/side or mono
    w.write(4, 3); // 16 bits per sample
    w.write(0, 1);
    utf8Num(w, frameNo);
    if (sizeCode === 7) w.write(n - 1, 16);
    w.write(crc8(w.buf, start, w.pos), 8);

    if (nc === 2) {
      const L = channels[0];
      const R = channels[1];
      for (let i = 0; i < n; i++) {
        const l = L[off + i];
        const r = R[off + i];
        a[i] = (l + r) >> 1; // mid
        b[i] = l - r; // side
      }
      writeSubframe(w, a, n, 16, res);
      writeSubframe(w, b, n, 17, res);
    } else {
      const C = channels[0];
      for (let i = 0; i < n; i++) a[i] = C[off + i];
      writeSubframe(w, a, n, 16, res);
    }
    w.align();
    const c = crc16(w.buf, start, w.pos);
    w.write(c, 16);
    const size = w.pos - start;
    minFrame = Math.min(minFrame, size);
    maxFrame = Math.max(maxFrame, size);
    if (onProgress && frameNo % 32 === 0) onProgress(Math.min(1, (off + n) / total));
  }
  const si = new BitWriter(34);
  si.write(BLOCK, 16);
  si.write(BLOCK, 16);
  si.write(minFrame === Infinity ? 0 : minFrame, 24);
  si.write(maxFrame, 24);
  si.write(sampleRate, 20);
  si.write(nc - 1, 3);
  si.write(15, 5);
  si.writeBig(total, 36);
  for (let i = 0; i < 16; i++) si.write(0, 8); // MD5 unknown (allowed)
  return { streaminfo: si.bytes().slice(), frames: w.bytes().slice() };
}

function block(type, body, last) {
  const h = new Uint8Array(4);
  h[0] = (last ? 0x80 : 0) | type;
  h[1] = (body.length >> 16) & 0xff;
  h[2] = (body.length >> 8) & 0xff;
  h[3] = body.length & 0xff;
  return [h, body];
}

/** Vorbis comment body (shared by FLAC and Opus tags). */
export function vorbisComment({ title, album, track, total }, vendor = 'SongCut') {
  const enc = new TextEncoder();
  const items = [];
  if (title) items.push(`TITLE=${title}`);
  if (album) items.push(`ALBUM=${album}`);
  if (track) items.push(`TRACKNUMBER=${track}`);
  if (total) items.push(`TRACKTOTAL=${total}`);
  const parts = [];
  const le = (n) => new Uint8Array([n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff]);
  const v = enc.encode(vendor);
  parts.push(le(v.length), v, le(items.length));
  for (const it of items) {
    const b = enc.encode(it);
    parts.push(le(b.length), b);
  }
  const len = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function flacParts({ streaminfo, frames }, meta = {}) {
  return [
    new TextEncoder().encode('fLaC'),
    ...block(0, streaminfo, false),
    ...block(4, vorbisComment(meta), true),
    frames,
  ];
}
