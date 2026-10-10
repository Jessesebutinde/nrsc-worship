// MP3: index frames and cut on frame boundaries (about 26 ms) without
// re-encoding. Cut files get a small ID3v2.3 tag with title and track.

import { Writer } from './bytes.js';

const BR = {
  1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const SR = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

function header(u8, p) {
  if (u8[p] !== 0xff || (u8[p + 1] & 0xe0) !== 0xe0) return null;
  const ver = (u8[p + 1] >> 3) & 3; // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5
  const layer = (u8[p + 1] >> 1) & 3; // 1 = Layer III
  const bri = u8[p + 2] >> 4;
  const sri = (u8[p + 2] >> 2) & 3;
  const pad = (u8[p + 2] >> 1) & 1;
  if (ver === 1 || layer !== 1 || bri === 0 || bri === 15 || sri === 3) return null;
  const sampleRate = SR[ver][sri];
  const kbps = BR[ver === 3 ? 1 : 2][bri];
  const samples = ver === 3 ? 1152 : 576;
  const size = Math.floor(((samples / 8) * kbps * 1000) / sampleRate) + pad;
  const channels = (u8[p + 3] >> 6) === 3 ? 1 : 2;
  return { size, samples, sampleRate, channels, ver };
}

function id3Size(u8) {
  if (u8.length < 10 || u8[0] !== 0x49 || u8[1] !== 0x44 || u8[2] !== 0x33) return 0;
  const sz = (u8[6] << 21) | (u8[7] << 14) | (u8[8] << 7) | u8[9];
  return 10 + sz + (u8[5] & 0x10 ? 10 : 0);
}

export function isMp3(head) {
  if (id3Size(head) > 0) return true;
  for (let p = 0; p < Math.min(head.length - 4, 4096); p++) {
    const h = header(head, p);
    if (h && header(head, p + h.size)) return true;
  }
  return false;
}

/** Builds the frame index from the whole file. */
export function parseMp3(u8) {
  let p = id3Size(u8);
  const offsets = [];
  const sizes = [];
  let first = null;
  while (p + 4 <= u8.length) {
    const h = header(u8, p);
    if (!h || p + h.size > u8.length) {
      p++;
      continue;
    }
    if (!first) {
      first = h;
      // A Xing/Info/VBRI frame holds no audio; skip it.
      const tag = String.fromCharCode(...u8.subarray(p + 4, Math.min(u8.length, p + 60)));
      if (/Xing|Info|VBRI/.test(tag)) {
        p += h.size;
        continue;
      }
    }
    offsets.push(p);
    sizes.push(h.size);
    p += h.size;
  }
  if (!first || !offsets.length) throw new Error('No MP3 audio frames found');
  const frameDur = first.samples / first.sampleRate;
  return {
    kind: 'mp3',
    sampleRate: first.sampleRate,
    channels: first.channels,
    frameDur,
    offsets: Float64Array.from(offsets),
    sizes: Uint32Array.from(sizes),
    count: offsets.length,
    duration: offsets.length * frameDur,
  };
}

export async function extractMp3(source, info, t0, t1) {
  t0 = Math.max(0, t0);
  t1 = Math.min(info.duration, t1);
  // Start one frame early: MP3 frames can borrow bits from the previous one.
  const a = Math.max(0, Math.floor(t0 / info.frameDur) - 1);
  const b = Math.min(info.count - 1, Math.ceil(t1 / info.frameDur) - 1);
  const start = info.offsets[a];
  const end = info.offsets[b] + info.sizes[b];
  const data = await source.read(start, end - start);
  return { kind: 'mp3', t0, t1, first: a, last: b, parts: [data], bytes: data.length, startTime: a * info.frameDur };
}

function textFrame(id, text) {
  // Encoding 1 = UTF-16 with BOM, which every ID3v2.3 reader understands.
  const w = new Writer().u8(1).u8(0xff).u8(0xfe);
  for (const ch of text) {
    const c = ch.codePointAt(0);
    if (c > 0xffff) {
      const v = c - 0x10000;
      w.le16(0xd800 + (v >> 10)).le16(0xdc00 + (v & 0x3ff));
    } else w.le16(c);
  }
  w.le16(0);
  const body = w.done();
  return new Writer().str(id).u32(body.length).u16(0).bytes(body).done();
}

function id3({ title, track, total, album }) {
  const frames = [];
  if (title) frames.push(textFrame('TIT2', title));
  if (album) frames.push(textFrame('TALB', album));
  if (track) frames.push(textFrame('TRCK', total ? `${track}/${total}` : `${track}`));
  if (!frames.length) return new Uint8Array(0);
  const len = frames.reduce((s, f) => s + f.length, 0);
  const w = new Writer().str('ID3').u8(3).u8(0).u8(0);
  w.u8((len >> 21) & 0x7f).u8((len >> 14) & 0x7f).u8((len >> 7) & 0x7f).u8(len & 0x7f);
  for (const f of frames) w.bytes(f);
  return w.done();
}

export function muxMp3(info, clip, { meta = {} } = {}) {
  return [id3(meta), ...clip.parts];
}
