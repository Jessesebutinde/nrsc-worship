// Small helpers for reading and writing big-endian binary data.

export const te = new TextEncoder();
const td = new TextDecoder();

export function fourcc(u8, off) {
  return String.fromCharCode(u8[off], u8[off + 1], u8[off + 2], u8[off + 3]);
}

export function u16(u8, off) {
  return (u8[off] << 8) | u8[off + 1];
}

export function u24(u8, off) {
  return (u8[off] << 16) | (u8[off + 1] << 8) | u8[off + 2];
}

export function u32(u8, off) {
  return ((u8[off] << 24) >>> 0) + ((u8[off + 1] << 16) | (u8[off + 2] << 8) | u8[off + 3]);
}

export function u64(u8, off) {
  return u32(u8, off) * 2 ** 32 + u32(u8, off + 4);
}

export function i32(u8, off) {
  return (u8[off] << 24) | (u8[off + 1] << 16) | (u8[off + 2] << 8) | u8[off + 3];
}

export function le16(u8, off) {
  return u8[off] | (u8[off + 1] << 8);
}

export function le32(u8, off) {
  return (u8[off] | (u8[off + 1] << 8) | (u8[off + 2] << 16)) + ((u8[off + 3] << 24) >>> 0);
}

export function utf8(u8) {
  return td.decode(u8);
}

export function concat(parts) {
  let len = 0;
  for (const p of parts) len += p.length;
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Growable big-endian writer. */
export class Writer {
  constructor(cap = 256) {
    this.buf = new Uint8Array(cap);
    this.len = 0;
  }
  ensure(n) {
    if (this.len + n <= this.buf.length) return;
    let cap = this.buf.length * 2;
    while (cap < this.len + n) cap *= 2;
    const b = new Uint8Array(cap);
    b.set(this.buf.subarray(0, this.len));
    this.buf = b;
  }
  u8(v) {
    this.ensure(1);
    this.buf[this.len++] = v & 0xff;
    return this;
  }
  u16(v) {
    this.ensure(2);
    this.buf[this.len++] = (v >>> 8) & 0xff;
    this.buf[this.len++] = v & 0xff;
    return this;
  }
  u32(v) {
    this.ensure(4);
    const b = this.buf;
    b[this.len++] = (v >>> 24) & 0xff;
    b[this.len++] = (v >>> 16) & 0xff;
    b[this.len++] = (v >>> 8) & 0xff;
    b[this.len++] = v & 0xff;
    return this;
  }
  le16(v) {
    this.ensure(2);
    this.buf[this.len++] = v & 0xff;
    this.buf[this.len++] = (v >>> 8) & 0xff;
    return this;
  }
  le32(v) {
    this.ensure(4);
    const b = this.buf;
    b[this.len++] = v & 0xff;
    b[this.len++] = (v >>> 8) & 0xff;
    b[this.len++] = (v >>> 16) & 0xff;
    b[this.len++] = (v >>> 24) & 0xff;
    return this;
  }
  str(s) {
    return this.bytes(te.encode(s));
  }
  bytes(u8) {
    this.ensure(u8.length);
    this.buf.set(u8, this.len);
    this.len += u8.length;
    return this;
  }
  zeros(n) {
    this.ensure(n);
    this.buf.fill(0, this.len, this.len + n);
    this.len += n;
    return this;
  }
  done() {
    return this.buf.slice(0, this.len);
  }
}
