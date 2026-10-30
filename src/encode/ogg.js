// Ogg Opus container (RFC 7845) for packets from the browser's encoder.
// Audio pages are built once; the tags page is rebuilt on rename, and the
// pages after it don't depend on its contents.

import { vorbisComment } from './flac.js';

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i << 24;
    for (let k = 0; k < 8; k++) c = c & 0x80000000 ? (c << 1) ^ 0x04c11db7 : c << 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function oggCrc(u8) {
  let c = 0;
  for (let i = 0; i < u8.length; i++) c = ((c << 8) ^ CRC[((c >>> 24) ^ u8[i]) & 0xff]) >>> 0;
  return c;
}

function page({ packets, granule, serial, seq, bos = false, eos = false, continued = false }) {
  const lacing = [];
  for (const p of packets) {
    let n = p.length;
    while (n >= 255) {
      lacing.push(255);
      n -= 255;
    }
    lacing.push(n);
  }
  const body = packets.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(27 + lacing.length + body);
  const dv = new DataView(out.buffer);
  out.set([0x4f, 0x67, 0x67, 0x53], 0);
  out[4] = 0;
  out[5] = (continued ? 1 : 0) | (bos ? 2 : 0) | (eos ? 4 : 0);
  dv.setUint32(6, granule % 2 ** 32, true);
  dv.setUint32(10, Math.floor(granule / 2 ** 32), true);
  dv.setUint32(14, serial, true);
  dv.setUint32(18, seq, true);
  out[26] = lacing.length;
  out.set(lacing, 27);
  let o = 27 + lacing.length;
  for (const p of packets) {
    out.set(p, o);
    o += p.length;
  }
  dv.setUint32(22, oggCrc(out), true);
  return out;
}

export function opusHead(channels, preSkip, inputRate) {
  const h = new Uint8Array(19);
  const dv = new DataView(h.buffer);
  h.set(new TextEncoder().encode('OpusHead'), 0);
  h[8] = 1;
  h[9] = channels;
  dv.setUint16(10, preSkip, true);
  dv.setUint32(12, inputRate, true);
  dv.setInt16(16, 0, true);
  h[18] = 0;
  return h;
}

/** Reads pre-skip from an OpusHead the encoder may hand us. */
export function preSkipFrom(desc, fallback = 312) {
  if (desc && desc.length >= 19 && String.fromCharCode(...desc.subarray(0, 8)) === 'OpusHead') {
    return desc[10] | (desc[11] << 8);
  }
  return fallback;
}

/**
 * packets: [{ data: Uint8Array, samples: number (at 48 kHz) }]
 * totalSamples: real length at 48 kHz (trims the encoder's padding).
 * Returns a payload that oggOpusParts() wraps with tags.
 */
export function buildOpusPayload({ packets, channels, preSkip, inputRate, totalSamples, serial }) {
  serial = serial ?? (Math.random() * 2 ** 31) >>> 0;
  const pages = [];
  let seq = 2;
  let granule = 0;
  let batch = [];
  let segs = 0;
  let bytes = 0;
  const end = preSkip + totalSamples;
  const flush = (last) => {
    if (!batch.length) return;
    pages.push(page({ packets: batch, granule: last ? Math.min(granule, end) : granule, serial, seq: seq++, eos: last }));
    batch = [];
    segs = 0;
    bytes = 0;
  };
  packets.forEach((p, i) => {
    const need = Math.floor(p.data.length / 255) + 1;
    if (segs + need > 255 || bytes > 4000) flush(false);
    batch.push(p.data);
    segs += need;
    bytes += p.data.length;
    granule += p.samples;
    if (i === packets.length - 1) flush(true);
  });
  return { serial, channels, preSkip, inputRate, pages };
}

export function oggOpusParts(payload, meta = {}) {
  const { serial, channels, preSkip, inputRate, pages } = payload;
  const head = page({ packets: [opusHead(channels, preSkip, inputRate)], granule: 0, serial, seq: 0, bos: true });
  const tagsBody = vorbisComment(meta);
  const tags = new Uint8Array(8 + tagsBody.length);
  tags.set(new TextEncoder().encode('OpusTags'), 0);
  tags.set(tagsBody, 8);
  const tagsPage = page({ packets: [tags], granule: 0, serial, seq: 1 });
  return [head, tagsPage, ...pages];
}

/** Splits an Ogg stream into packets (used by tests). */
export function readOggPackets(u8) {
  const packets = [];
  let cur = [];
  let o = 0;
  while (o + 27 <= u8.length) {
    const nseg = u8[o + 26];
    const lacing = u8.subarray(o + 27, o + 27 + nseg);
    let p = o + 27 + nseg;
    for (const l of lacing) {
      cur.push(u8.subarray(p, p + l));
      p += l;
      if (l < 255) {
        const len = cur.reduce((s, c) => s + c.length, 0);
        const pk = new Uint8Array(len);
        let q = 0;
        for (const c of cur) {
          pk.set(c, q);
          q += c.length;
        }
        packets.push(pk);
        cur = [];
      }
    }
    o = p;
  }
  return packets;
}
