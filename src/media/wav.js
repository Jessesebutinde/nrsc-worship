// WAV: cut PCM directly, or build a WAV from decoded samples.

import { fourcc, le16, le32, Writer } from './bytes.js';

export function isWav(head) {
  return head.length >= 12 && fourcc(head, 0) === 'RIFF' && fourcc(head, 8) === 'WAVE';
}

export async function parseWav(source) {
  const head = await source.read(0, Math.min(source.size, 1 << 20));
  let p = 12;
  let fmt = null;
  while (p + 8 <= head.length) {
    const id = fourcc(head, p);
    const size = le32(head, p + 4);
    if (id === 'fmt ') fmt = head.slice(p + 8, p + 8 + size);
    if (id === 'data') {
      if (!fmt) break;
      const channels = le16(fmt, 2);
      const sampleRate = le32(fmt, 4);
      const blockAlign = le16(fmt, 12);
      const dataSize = Math.min(size || Infinity, source.size - (p + 8));
      return {
        kind: 'wav',
        fmt,
        format: le16(fmt, 0),
        bits: le16(fmt, 14),
        channels,
        sampleRate,
        blockAlign,
        dataOffset: p + 8,
        dataSize,
        duration: dataSize / blockAlign / sampleRate,
      };
    }
    p += 8 + size + (size & 1);
  }
  throw new Error('Could not read this WAV file');
}

export async function extractWav(source, info, t0, t1, opts = {}) {
  t0 = Math.max(0, t0);
  t1 = Math.min(info.duration, t1);
  const a = Math.floor(t0 * info.sampleRate);
  const b = Math.ceil(t1 * info.sampleRate);
  const data = await source.read(info.dataOffset + a * info.blockAlign, (b - a) * info.blockAlign, opts);
  return { kind: 'wav', t0, t1, parts: [data], bytes: data.length, startTime: a / info.sampleRate };
}

function infoChunk({ title, track, album }) {
  const items = [];
  const add = (id, text) => {
    const bytes = new TextEncoder().encode(text + '\0');
    const w = new Writer().str(id).le32(bytes.length).bytes(bytes);
    if (bytes.length & 1) w.u8(0);
    items.push(w.done());
  };
  if (title) add('INAM', title);
  if (album) add('IPRD', album);
  if (track) add('ITRK', String(track));
  if (!items.length) return new Uint8Array(0);
  const len = 4 + items.reduce((s, i) => s + i.length, 0);
  const w = new Writer().str('LIST').le32(len).str('INFO');
  for (const i of items) w.bytes(i);
  return w.done();
}

/** fmt: raw "fmt " chunk body. dataBytes: total PCM byte count. */
export function wavParts(fmt, dataParts, meta = {}) {
  const dataBytes = dataParts.reduce((s, p) => s + p.length, 0);
  const list = infoChunk(meta);
  const pad = dataBytes & 1 ? new Uint8Array(1) : new Uint8Array(0);
  const riffSize = 4 + (8 + fmt.length) + (8 + dataBytes + pad.length) + list.length;
  const head = new Writer()
    .str('RIFF')
    .le32(riffSize)
    .str('WAVE')
    .str('fmt ')
    .le32(fmt.length)
    .bytes(fmt)
    .str('data')
    .le32(dataBytes)
    .done();
  return [head, ...dataParts, pad, list];
}

export function muxWav(info, clip, { meta = {} } = {}) {
  return wavParts(info.fmt, clip.parts, meta);
}

/** 16-bit PCM "fmt " body. */
export function pcm16Fmt(channels, sampleRate) {
  return new Writer(16)
    .le16(1)
    .le16(channels)
    .le32(sampleRate)
    .le32(sampleRate * channels * 2)
    .le16(channels * 2)
    .le16(16)
    .done();
}

/** Interleaves Float32 channel arrays into 16-bit little-endian PCM. */
export function floatTo16(channels, from = 0, to = channels[0].length) {
  const n = to - from;
  const nc = channels.length;
  const out = new Uint8Array(n * nc * 2);
  const dv = new DataView(out.buffer);
  let o = 0;
  for (let i = from; i < to; i++) {
    for (let c = 0; c < nc; c++) {
      let s = channels[c][i];
      s = s < -1 ? -1 : s > 1 ? 1 : s;
      dv.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return out;
}
