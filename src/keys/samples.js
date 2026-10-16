// Loads a sampled instrument for the engine: fetch the MIDI.js soundfont through Cache Storage (downloaded once,
// then it works offline), pull the base64 MP3s out of the JS text without running it, decode them, find loop
// points for sustained sounds, and post the Float32 channels to the worklet as transferred buffers.

import { bankInfo, noteNameToMidi } from './banks.js';
import { findLoop } from './dsp/loop-detect.js';
import { midiToHz } from './dsp/util.js';

const CACHE = 'stage-keys-samples';
// The soundfont files are untrusted JavaScript: this regex is the only parsing they get.
const NOTE_RE = /"([A-G]b?\d)":\s*"data:audio\/mp3;base64,([^"]+)"/g;
const STEP = { low: 3, medium: 2, high: 1 };
const YIELD_EVERY = 3;
const SILENCE = 1e-4; // -80 dB

/** The note name → base64 pairs in a `<name>-mp3.js` soundfont file. */
export function parseSoundfontJs(text) {
  const notes = new Map();
  for (const m of text.matchAll(NOTE_RE)) notes.set(m[1], m[2]);
  return notes;
}

/**
 * The subset of `allNotes` (MIDI numbers) within low..high to decode: every semitone for 'high', every 2nd for
 * 'medium', every 3rd for 'low'. The lowest and highest are always kept, so with the files' full chromatic set
 * no note in the range is more than one semitone from a sample.
 */
export function chooseNotes(allNotes, low, high, quality = 'medium') {
  const step = STEP[quality] || STEP.medium;
  const inRange = [...new Set(allNotes)].filter((n) => n >= low && n <= high).sort((a, b) => a - b);
  const out = inRange.filter((n, i) => i % step === 0);
  const top = inRange[inRange.length - 1];
  if (inRange.length && out[out.length - 1] !== top) out.push(top);
  return out;
}

/** Base64 to bytes: atob in browsers and Node 22, Buffer where there is no atob. */
export function base64ToBytes(b64) {
  if (typeof atob !== 'function') return new Uint8Array(Buffer.from(b64, 'base64'));
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export class SampleLibrary {
  /**
   * @param {object} o
   * @param {BaseAudioContext} o.ctx decodeAudioData lives here
   * @param {(msg: object, transfer?: ArrayBuffer[]) => void} o.send posts a message to the engine worklet
   * @param {'low'|'medium'|'high'} [o.quality='medium'] every 3rd / every 2nd / every semitone
   */
  constructor({ ctx, send, quality = 'medium' }) {
    this.ctx = ctx;
    this.send = send;
    this.quality = STEP[quality] ? quality : 'medium';
    this.jobs = new Map(); // id → { promise, progress, listeners, cancelled }
    this.loaded = new Set();
  }

  /** Affects future loads only. */
  setQuality(q) {
    if (STEP[q]) this.quality = q;
  }

  /**
   * Loads a bank into the engine. Idempotent: while a load runs (and once it is done) the same promise comes
   * back; a failed load is forgotten so it can be retried.
   * @returns {Promise<{id: string, notes: number[], bytes: number}>} the notes sent and the file's size in chars
   */
  load(id, { onProgress } = {}) {
    let job = this.jobs.get(id);
    if (!job) {
      job = { progress: 0, listeners: [], cancelled: false };
      job.promise = this.run(id, job).catch((e) => {
        if (this.jobs.get(id) === job) this.jobs.delete(id);
        throw e;
      });
      this.jobs.set(id, job);
    }
    if (onProgress) {
      if (this.loaded.has(id)) onProgress(1);
      else job.listeners.push(onProgress);
    }
    return job.promise;
  }

  /** 0..1 while loading, 1 when loaded, 0 when not started (or failed). */
  progress(id) {
    if (this.loaded.has(id)) return 1;
    const job = this.jobs.get(id);
    return job ? job.progress : 0;
  }

  isLoaded(id) {
    return this.loaded.has(id);
  }

  /** true when the file is in Cache Storage, so loading it works offline. */
  async isCached(id) {
    try {
      const cache = await openCache();
      return !!(cache && (await cache.match(bankInfo(id).url)));
    } catch {
      return false;
    }
  }

  /** Drops the bank from the engine; a load still in flight stops and its promise rejects (error.cancelled). */
  unload(id) {
    const job = this.jobs.get(id);
    if (job) job.cancelled = true;
    this.jobs.delete(id);
    this.loaded.delete(id);
    this.send({ t: 'bankFree', id });
  }

  async run(id, job) {
    const info = bankInfo(id);
    const text = await fetchText(info);
    const byMidi = new Map();
    for (const [name, b64] of parseSoundfontJs(text)) {
      const m = noteNameToMidi(name);
      if (m !== null) byMidi.set(m, b64);
    }
    const notes = chooseNotes([...byMidi.keys()], info.low, info.high, this.quality);
    if (!notes.length) throw new Error(`${info.label}: the downloaded file holds no samples`);
    if (job.cancelled) throw cancelled(info);
    this.send({ t: 'bankStart', id });
    const sent = [];
    for (let i = 0; i < notes.length; i++) {
      const msg = await this.decodeNote(info, notes[i], byMidi.get(notes[i]));
      if (job.cancelled) throw cancelled(info);
      if (msg) {
        this.send(msg, msg.R ? [msg.L.buffer, msg.R.buffer] : [msg.L.buffer]);
        sent.push(msg.note);
      }
      job.progress = (i + 1) / notes.length;
      for (const fn of job.listeners) fn(job.progress);
      // Let the page paint: the base64, copying and loop search above all run on the main thread.
      if (i % YIELD_EVERY === YIELD_EVERY - 1) await new Promise((r) => setTimeout(r, 0));
    }
    if (!sent.length) throw new Error(`${info.label}: none of the samples could be decoded`);
    this.send({ t: 'bankDone', id });
    this.loaded.add(id);
    job.listeners = [];
    return { id, notes: sent, bytes: text.length };
  }

  /** One note as a bankNote message whose channels we own, or null when the MP3 will not decode. */
  async decodeNote(info, note, b64) {
    const bytes = base64ToBytes(b64);
    let buf;
    try {
      // A fresh copy: decodeAudioData detaches the buffer it is given.
      buf = await decode(this.ctx, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    } catch (e) {
      console.warn(`${info.label}: note ${note} could not be decoded`, e);
      return null;
    }
    const l = buf.getChannelData(0);
    const r = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null;
    // Copies, cut after the sound has died away: the worklet takes them over, and the AudioBuffer may share
    // its memory with the views getChannelData hands out.
    const end = soundEnd(l, r, buf.sampleRate);
    const L = l.slice(0, end);
    const R = r ? r.slice(0, end) : null;
    normalise(L, R);
    const loop = info.sustain ? findLoop(R ? mix(L, R) : L, buf.sampleRate, midiToHz(note)) : null;
    return {
      t: 'bankNote',
      id: info.id,
      note,
      L,
      R,
      rate: buf.sampleRate,
      loopStart: loop ? loop.start : 0,
      loopEnd: loop ? loop.end : 0,
      loopAuto: !!loop,
    };
  }
}

/** decodeAudioData with either API shape: a promise (modern browsers, the tests' fake) or callbacks (old Safari). */
function decode(ctx, buf) {
  return new Promise((resolve, reject) => {
    const p = ctx.decodeAudioData(buf, resolve, reject);
    if (p && typeof p.then === 'function') p.then(resolve, reject);
  });
}

/** Where the near-silent tail starts, plus 10 ms: a decayed note need not keep a second of zeros in the worklet. */
/**
 * The soundfont renders are quiet and uneven (a choir at a tenth of full scale, a bass at a fifth). Each note
 * is brought up towards a 0.4 peak, mostly: a little of the natural variation between notes is kept.
 */
export function normalise(L, R, target = 0.4) {
  let peak = 0;
  for (let i = 0; i < L.length; i++) {
    const a = Math.abs(L[i]);
    if (a > peak) peak = a;
    if (R) {
      const b = Math.abs(R[i]);
      if (b > peak) peak = b;
    }
  }
  if (peak < 1e-6) return 1;
  const gain = Math.min(8, Math.max(1, Math.pow(target / peak, 0.85)));
  if (gain === 1) return 1;
  for (let i = 0; i < L.length; i++) L[i] *= gain;
  if (R) for (let i = 0; i < R.length; i++) R[i] *= gain;
  return gain;
}

function soundEnd(l, r, rate) {
  let end = l.length;
  while (end > 0 && Math.abs(l[end - 1]) < SILENCE && (!r || Math.abs(r[end - 1]) < SILENCE)) end--;
  return Math.min(l.length, end + Math.round(rate * 0.01));
}

function mix(L, R) {
  const m = new Float32Array(L.length);
  for (let i = 0; i < m.length; i++) m[i] = (L[i] + R[i]) * 0.5;
  return m;
}

function cancelled(info) {
  const e = new Error(`${info.label} was unloaded before it finished loading`);
  e.cancelled = true;
  return e;
}

async function openCache() {
  // No Cache Storage in Node; insecure contexts and some private windows expose `caches` but refuse to open.
  if (typeof caches === 'undefined') return null;
  try {
    return await caches.open(CACHE);
  } catch {
    return null;
  }
}

const downloadError = (info) => `${info.label} could not be downloaded: the first load of an instrument needs internet`;

/** The soundfont text, from Cache Storage when it was downloaded before. */
async function fetchText(info) {
  const cache = await openCache();
  let res = cache ? await cache.match(info.url).catch(() => null) : null;
  if (!res) {
    try {
      res = await fetch(info.url);
    } catch (e) {
      throw new Error(`${downloadError(info)} (${e.message})`);
    }
    if (!res.ok) throw new Error(`${downloadError(info)} (HTTP ${res.status})`);
    // A failed put (quota, private window) only costs the next load another download.
    if (cache) cache.put(info.url, res.clone()).catch(() => {});
  }
  return res.text();
}
