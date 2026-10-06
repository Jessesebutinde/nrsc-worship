// One interface over every audio format we can cut:
//   M4A/MP4 (AAC), MP3, WAV  -> cut losslessly, no decoding needed
//   anything else             -> decoded once in the browser, exported as WAV
//
// media.extract(t0, t1) does the (possibly slow) cutting and returns a clip.
// media.mux(clip, meta) wraps a clip into a file with a title tag; it is
// cheap, so renaming after export never needs a re-cut.
// media.readPcm(t0, t1, rate) returns mono samples for waveforms/analysis.

import { isMp4, parseMp4, extractMp4, muxMp4 } from './mp4.js';
import { isMp3, parseMp3, extractMp3, muxMp3 } from './mp3.js';
import { isWav, parseWav, extractWav, muxWav, wavParts, pcm16Fmt, floatTo16 } from './wav.js';
import { BytesSource } from './source.js';

/**
 * @param source  BytesSource | BlobSource | HttpSource
 * @param decode  async (Uint8Array, sampleRate|undefined) => {sampleRate, channels: Float32Array[]}
 */
export async function openMedia(source, { decode, onProgress } = {}) {
  const head = await source.read(0, Math.min(source.size, 64 * 1024));

  if (await isMp4(source)) {
    const info = await parseMp4(source);
    if (info.codec === 'mp4a') {
      return containerMedia(source, info, {
        ext: 'm4a',
        mime: 'audio/mp4',
        extract: (t0, t1, o) => extractMp4(source, info, t0, t1, o),
        mux: (clip, meta) => muxMp4(info, clip, { meta }),
        raw: (clip) => muxMp4(info, clip, { trim: false }),
        decode,
      });
    }
  }
  if (isWav(head)) {
    const info = await parseWav(source);
    if (info.format === 1 || info.format === 3 || info.format === 0xfffe) {
      return containerMedia(source, info, {
        ext: 'wav',
        mime: 'audio/wav',
        extract: (t0, t1, o) => extractWav(source, info, t0, t1, o),
        mux: (clip, meta) => muxWav(info, clip, { meta }),
        raw: (clip) => muxWav(info, clip),
        decode,
      });
    }
  }
  if (isMp3(head)) {
    const all = await readAll(source, onProgress);
    const info = parseMp3(all);
    const mem = new BytesSource(all);
    return containerMedia(mem, info, {
      ext: 'mp3',
      mime: 'audio/mpeg',
      extract: (t0, t1) => extractMp3(mem, info, t0, t1),
      mux: (clip, meta) => muxMp3(info, clip, { meta }),
      raw: (clip) => muxMp3(info, clip),
      decode,
    });
  }

  // Fallback: decode the whole file once (needs memory; fine on a computer).
  if (!decode) throw new Error('This audio format is not supported here');
  const all = await readAll(source, onProgress);
  const buf = await decode(all);
  return pcmMedia(buf);
}

async function readAll(source, onProgress) {
  if (source.u8) return source.u8;
  return source.read(0, source.size, { onProgress });
}

function containerMedia(source, info, { ext, mime, extract, mux, raw, decode }) {
  return {
    kind: info.kind,
    ext,
    mime,
    lossless: true,
    duration: info.duration,
    sampleRate: info.sampleRate,
    channels: info.channels,
    info,
    extract,
    mux,
    async readPcm(t0, t1, rate) {
      if (!decode) throw new Error('No decoder available');
      const clip = await extract(t0, t1);
      const buf = await decode(concatParts(raw(clip)), rate);
      return { data: mono(buf.channels), sampleRate: buf.sampleRate, startTime: clip.startTime };
    },
  };
}

/** Media backed by fully decoded samples. Exports are 16-bit WAV. */
export function pcmMedia(buf) {
  const { sampleRate, channels } = buf;
  const duration = channels[0].length / sampleRate;
  const fmt = pcm16Fmt(channels.length, sampleRate);
  return {
    kind: 'pcm',
    ext: 'wav',
    mime: 'audio/wav',
    lossless: false,
    duration,
    sampleRate,
    channels: channels.length,
    async extract(t0, t1) {
      const a = Math.max(0, Math.floor(t0 * sampleRate));
      const b = Math.min(channels[0].length, Math.ceil(t1 * sampleRate));
      const data = floatTo16(channels, a, b);
      return { kind: 'pcm', t0, t1, parts: [data], bytes: data.length, startTime: a / sampleRate };
    },
    mux(clip, meta) {
      return wavParts(fmt, clip.parts, meta);
    },
    async readPcm(t0, t1, rate) {
      const a = Math.max(0, Math.floor(t0 * sampleRate));
      const b = Math.min(channels[0].length, Math.ceil(t1 * sampleRate));
      const step = Math.max(1, Math.round(sampleRate / (rate || sampleRate)));
      const n = Math.floor((b - a) / step);
      const out = new Float32Array(n);
      const nc = channels.length;
      for (let i = 0; i < n; i++) {
        let s = 0;
        const base = a + i * step;
        for (let k = 0; k < step; k++) for (let c = 0; c < nc; c++) s += channels[c][base + k];
        out[i] = s / (step * nc);
      }
      return { data: out, sampleRate: sampleRate / step, startTime: a / sampleRate };
    },
  };
}

export function concatParts(parts) {
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

function mono(chs) {
  if (chs.length === 1) return chs[0];
  const n = chs[0].length;
  const out = new Float32Array(n);
  for (const c of chs) for (let i = 0; i < n; i++) out[i] += c[i];
  const k = 1 / chs.length;
  for (let i = 0; i < n; i++) out[i] *= k;
  return out;
}
