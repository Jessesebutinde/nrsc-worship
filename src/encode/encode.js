// Export formats. "Original" copies the audio as-is; everything else is
// decoded and re-encoded here, on the device:
//   MP3, FLAC, WAV   -> in a Web Worker (works in every modern browser)
//   AAC (.m4a), Opus -> the browser's own encoder (WebCodecs) where available
//
// Each result keeps the encoded audio apart from its tags, so renaming a
// song after export only rebuilds the small header.

import { muxMp3 } from '../media/mp3.js';
import { wavParts, pcm16Fmt } from '../media/wav.js';
import { aacM4aParts, aacLcConfig } from '../media/mp4.js';
import { flacParts } from './flac.js';
import { buildOpusPayload, oggOpusParts, preSkipFrom } from './ogg.js';

export const FORMATS = {
  original: { label: 'Original', ext: null, note: 'Exact copy, no quality loss, instant' },
  mp3: { label: 'MP3', ext: 'mp3', mime: 'audio/mpeg', bitrates: [64, 96, 128, 160, 192, 256, 320], bitrate: 192, note: 'Plays everywhere' },
  aac: { label: 'AAC', ext: 'm4a', mime: 'audio/mp4', bitrates: [64, 96, 128, 192, 256], bitrate: 128, note: 'Small, great on iPhone', webcodec: 'mp4a.40.2' },
  opus: { label: 'Opus', ext: 'opus', mime: 'audio/ogg', bitrates: [24, 32, 48, 64, 96, 128, 160], bitrate: 64, note: 'Smallest for the quality (WhatsApp, Android)', webcodec: 'opus' },
  flac: { label: 'FLAC', ext: 'flac', mime: 'audio/flac', note: 'Lossless, about half of WAV' },
  wav: { label: 'WAV', ext: 'wav', mime: 'audio/wav', note: 'Uncompressed, biggest' },
};

export const PRESETS = [
  { id: 'original', label: 'Original', sub: 'best, instant', settings: { format: 'original' } },
  { id: 'share', label: 'For sharing', sub: 'MP3 128k', settings: { format: 'mp3', bitrate: 128, mono: false } },
  { id: 'small', label: 'Smallest', sub: 'Opus 48k', settings: { format: 'opus', bitrate: 48, mono: false }, fallback: { format: 'mp3', bitrate: 64, mono: true, sub: 'MP3 64k mono' } },
  { id: 'lossless', label: 'Lossless', sub: 'FLAC', settings: { format: 'flac', mono: false } },
];

let support = null;
/** Which formats this browser can produce. */
export async function formatSupport() {
  if (support) return support;
  const out = { original: true, mp3: typeof Worker !== 'undefined', flac: typeof Worker !== 'undefined', wav: true, aac: false, opus: false };
  if (typeof AudioEncoder !== 'undefined') {
    for (const [k, rate] of [['aac', 44100], ['opus', 48000]]) {
      try {
        const r = await AudioEncoder.isConfigSupported({ codec: FORMATS[k].webcodec, sampleRate: rate, numberOfChannels: 2, bitrate: 128000 });
        out[k] = !!r.supported;
      } catch {
        out[k] = false;
      }
    }
  }
  support = out;
  return out;
}

export function settingsKey(s) {
  if (s.format === 'original') return 'original';
  return `${s.format}|${s.bitrate || ''}|${s.mono ? 'm' : 's'}`;
}

export function extFor(s, media) {
  return s.format === 'original' ? (media ? media.ext : 'm4a') : FORMATS[s.format].ext;
}

/** Rough size in bytes for `seconds` of audio. */
export function estimateBytes(s, seconds, media) {
  const ch = s.mono ? 1 : Math.min(2, (media && media.channels) || 2);
  const rate = (media && media.sampleRate) || 44100;
  switch (s.format) {
    case 'original':
      if (media && media.lossless && media.info && media.info.sizes) {
        // Average bytes per second of the source.
        return ((media.sourceBytes || 0) / media.duration) * seconds || seconds * 16000;
      }
      return seconds * rate * ch * 2;
    case 'wav':
      return seconds * rate * ch * 2;
    case 'flac':
      return seconds * rate * ch * 2 * 0.6;
    default:
      return (seconds * (s.bitrate || FORMATS[s.format].bitrate) * 1000) / 8;
  }
}

// ------------------------------------------------------------ worker pool

let pool = [];
let nextId = 1;
const pending = new Map();

function poolSize() {
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent || '');
  return mobile ? 1 : Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1));
}

function getWorker(i) {
  if (!pool[i]) {
    const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    w.onmessage = (e) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      if (e.data.progress != null) p.onProgress(e.data.progress);
      else {
        pending.delete(e.data.id);
        if (e.data.error) p.reject(new Error(e.data.error));
        else p.resolve(e.data.result);
      }
    };
    w.onerror = (e) => {
      for (const [id, p] of pending) {
        if (p.worker === i) {
          pending.delete(id);
          p.reject(new Error(e.message || 'The encoder stopped'));
        }
      }
    };
    pool[i] = w;
  }
  return pool[i];
}

let rr = 0;
function runInWorker(msg, transfer, onProgress) {
  const i = rr++ % poolSize();
  const w = getWorker(i);
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress, worker: i });
    w.postMessage({ ...msg, id }, transfer);
  });
}

export function cancelEncoding() {
  for (const w of pool) if (w) w.terminate();
  pool = [];
  for (const [, p] of pending) p.reject(new Error('Cancelled'));
  pending.clear();
}

// ------------------------------------------------------------- WebCodecs

async function encodeWebCodecs(kind, buf, bitrate, onProgress, signal) {
  const { sampleRate, channels } = buf;
  const nc = channels.length;
  const total = channels[0].length;
  const chunks = [];
  let desc = null;
  let failure = null;
  const enc = new AudioEncoder({
    output: (chunk, md) => {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      chunks.push({ data, duration: chunk.duration });
      const d = md && md.decoderConfig && md.decoderConfig.description;
      if (d && !desc) desc = new Uint8Array(d.buffer ? d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) : d);
    },
    error: (e) => {
      failure = e;
    },
  });
  const config = { codec: FORMATS[kind].webcodec, sampleRate, numberOfChannels: nc, bitrate: bitrate * 1000 };
  if (kind === 'aac') config.aac = { format: 'aac' };
  enc.configure(config);
  const step = 4096;
  for (let i = 0; i < total; i += step) {
    if (signal && signal.aborted) {
      enc.close();
      throw new Error('Cancelled');
    }
    if (failure) throw failure;
    const n = Math.min(step, total - i);
    const planar = new Float32Array(n * nc);
    for (let c = 0; c < nc; c++) planar.set(channels[c].subarray(i, i + n), c * n);
    const ad = new AudioData({
      format: 'f32-planar',
      sampleRate,
      numberOfFrames: n,
      numberOfChannels: nc,
      timestamp: Math.round((i / sampleRate) * 1e6),
      data: planar,
    });
    enc.encode(ad);
    ad.close();
    while (enc.encodeQueueSize > 16) await new Promise((r) => setTimeout(r, 1));
    if ((i / step) % 16 === 0) {
      onProgress(i / total);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  await enc.flush();
  enc.close();
  if (failure) throw failure;
  onProgress(1);

  if (kind === 'aac') {
    const sizes = chunks.map((c) => c.data.length);
    const data = new Uint8Array(sizes.reduce((s, n) => s + n, 0));
    let o = 0;
    for (const c of chunks) {
      data.set(c.data, o);
      o += c.data.length;
    }
    return {
      payload: { sampleRate, channels: nc, asc: desc && desc.length >= 2 ? desc : aacLcConfig(sampleRate, nc), bitrate: bitrate * 1000, sizes, data },
      bytes: data.length,
      wrap: (p, meta) => aacM4aParts(p, meta),
    };
  }
  const packets = chunks.map((c) => ({ data: c.data, samples: Math.round((c.duration * 48000) / 1e6) || 960 }));
  const payload = buildOpusPayload({
    packets,
    channels: nc,
    preSkip: preSkipFrom(desc),
    inputRate: sampleRate,
    totalSamples: Math.round((total / sampleRate) * 48000),
  });
  return { payload, bytes: payload.pages.reduce((s, p) => s + p.length, 0), wrap: (p, meta) => oggOpusParts(p, meta) };
}

// ------------------------------------------------------------------ main

function toMono(buf) {
  if (buf.channels.length === 1) return buf;
  const [a, b] = buf.channels;
  const m = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) m[i] = (a[i] + b[i]) * 0.5;
  return { sampleRate: buf.sampleRate, channels: [m] };
}

const MP3_RATES = [48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000];

/**
 * Produces one export file's audio. onProgress(fraction, stage) where
 * stage is 'download' | 'decode' | 'encode'.
 * Returns { ext, mime, bytes, parts(meta) }.
 */
export async function encodeItem({ media, start, end, settings, getCut, onProgress, signal }) {
  const report = (f, stage) => onProgress && onProgress(Math.max(0, Math.min(1, f)), stage);
  if (settings.format === 'original') {
    const clip = await getCut((g, t) => report(g / t, 'download'));
    report(1, 'done');
    return { ext: media.ext, mime: media.mime, bytes: clip.bytes, parts: (meta) => media.mux(clip, meta) };
  }
  const fmt = FORMATS[settings.format];
  const clip = media.kind === 'pcm' ? { t0: start, t1: end } : await getCut((g, t) => report((g / t) * 0.2, 'download'));
  if (signal && signal.aborted) throw new Error('Cancelled');
  report(0.2, 'decode');
  let rate = media.sampleRate;
  if (settings.format === 'opus') rate = 48000;
  else if (settings.format === 'mp3' && !MP3_RATES.includes(rate)) rate = 44100;
  else if (settings.format === 'aac' && ![44100, 48000].includes(rate)) rate = 44100;
  let buf = await media.decodeClip(clip, media.kind === 'pcm' ? undefined : rate);
  if (settings.mono) buf = toMono(buf);
  if (signal && signal.aborted) throw new Error('Cancelled');
  report(0.3, 'encode');
  const enc = (f) => report(0.3 + f * 0.7, 'encode');

  let out;
  if (settings.format === 'aac' || settings.format === 'opus') {
    out = await encodeWebCodecs(settings.format, buf, settings.bitrate || fmt.bitrate, enc, signal);
  } else {
    const channels = buf.channels.map((c) => (c.byteOffset === 0 && c.length === c.buffer.byteLength / 4 ? c : c.slice()));
    const result = await runInWorker(
      { format: settings.format, channels, sampleRate: buf.sampleRate, bitrate: settings.bitrate || fmt.bitrate },
      channels.map((c) => c.buffer),
      enc,
    );
    if (settings.format === 'mp3') out = { payload: result.data, bytes: result.data.length, wrap: (d, meta) => muxMp3(null, { parts: [d] }, { meta }) };
    else if (settings.format === 'flac') out = { payload: result, bytes: result.frames.length, wrap: (r, meta) => flacParts(r, meta) };
    else {
      const f = pcm16Fmt(buf.channels.length, buf.sampleRate);
      out = { payload: result.data, bytes: result.data.length, wrap: (d, meta) => wavParts(f, [d], meta) };
    }
  }
  report(1, 'done');
  const { payload, wrap } = out;
  return { ext: fmt.ext, mime: fmt.mime, bytes: out.bytes, parts: (meta) => wrap(payload, meta) };
}
