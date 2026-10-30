// Encodes PCM off the main thread so the page stays smooth.
// In:  { id, format: 'mp3'|'flac'|'wav', channels: Float32Array[], sampleRate, bitrate }
// Out: { id, progress } ... then { id, result } or { id, error }

import { Mp3Encoder } from '../../vendor/lame.js';
import { encodeFlac } from './flac.js';

function toInt16(f) {
  const out = new Int16Array(f.length);
  for (let i = 0; i < f.length; i++) {
    const s = f[i] < -1 ? -1 : f[i] > 1 ? 1 : f[i];
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function concat(chunks) {
  let len = 0;
  for (const c of chunks) len += c.length;
  const out = new Uint8Array(len);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

self.onmessage = (e) => {
  const { id, format, channels, sampleRate, bitrate } = e.data;
  let last = 0;
  const progress = (p) => {
    if (p - last >= 0.02 || p >= 1) {
      last = p;
      self.postMessage({ id, progress: p });
    }
  };
  try {
    const pcm = channels.map(toInt16);
    const n = pcm[0].length;
    if (format === 'mp3') {
      const enc = new Mp3Encoder(pcm.length, sampleRate, bitrate);
      const out = [];
      const step = 1152 * 32;
      for (let i = 0; i < n; i += step) {
        const l = pcm[0].subarray(i, i + step);
        const buf = pcm.length > 1 ? enc.encodeBuffer(l, pcm[1].subarray(i, i + step)) : enc.encodeBuffer(l);
        if (buf.length) out.push(new Uint8Array(buf.buffer, buf.byteOffset, buf.length).slice());
        progress(Math.min(1, (i + step) / n));
      }
      const tail = enc.flush();
      if (tail.length) out.push(new Uint8Array(tail.buffer, tail.byteOffset, tail.length).slice());
      const data = concat(out);
      self.postMessage({ id, result: { data } }, [data.buffer]);
    } else if (format === 'flac') {
      const r = encodeFlac(pcm, sampleRate, { onProgress: progress });
      self.postMessage({ id, result: r }, [r.frames.buffer]);
    } else if (format === 'wav') {
      const nc = pcm.length;
      const data = new Uint8Array(n * nc * 2);
      const dv = new DataView(data.buffer);
      for (let i = 0, o = 0; i < n; i++) for (let c = 0; c < nc; c++, o += 2) dv.setInt16(o, pcm[c][i], true);
      progress(1);
      self.postMessage({ id, result: { data } }, [data.buffer]);
    } else {
      throw new Error(`Unknown format ${format}`);
    }
  } catch (err) {
    self.postMessage({ id, error: String((err && err.message) || err) });
  }
};
