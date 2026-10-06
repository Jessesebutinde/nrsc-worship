import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

export const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
export const fixture = (name) => new Uint8Array(fs.readFileSync(path.join(FIX, name)));

export const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

/** Decodes any audio bytes to mono float32 with ffmpeg. */
export function ffDecode(bytes, rate = 44100) {
  // From a file: MP4s with the header at the end can't be read from a pipe.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dec-'));
  const f = path.join(dir, 'a');
  fs.writeFileSync(f, bytes);
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', f, '-ac', '1', '-ar', String(rate), '-f', 'f32le', 'pipe:1'], {
    maxBuffer: 1 << 28,
  });
  fs.rmSync(dir, { recursive: true });
  if (r.status) throw new Error(r.stderr.toString());
  return new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length / 4).slice();
}

/** Same interface as the browser decoder (src/media/decode.js). */
export async function decodeForMedia(bytes, rate = 44100) {
  return { sampleRate: rate, channels: [ffDecode(bytes, rate)] };
}

export function ffprobeTags(bytes) {
  // A real file, not a pipe: ffprobe can't size a piped WAV.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-'));
  const f = path.join(dir, 'a');
  fs.writeFileSync(f, bytes);
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:format_tags', '-of', 'json', f]);
  fs.rmSync(dir, { recursive: true });
  return JSON.parse(r.stdout.toString()).format;
}

export function firstClick(pcm, rate, from = 0.2) {
  // Skip the start: codecs can ring there.
  for (let i = Math.floor(from * rate); i < pcm.length; i++) if (Math.abs(pcm[i]) > 0.6) return i / rate;
  return null;
}

/** fetch() stand-in that serves bytes and honours Range headers. */
export function fakeFetch(bytes, { ranges = true, log = [], exposeRange = false } = {}) {
  return async (url, init = {}) => {
    if (init.method === 'HEAD') {
      log.push('head');
      return new Response(null, { status: 200, headers: { 'Content-Length': String(bytes.length) } });
    }
    const range = init.headers && init.headers.Range;
    log.push(range || 'full');
    if (ranges && range) {
      const [, a, b] = /bytes=(\d+)-(\d+)/.exec(range);
      const end = Math.min(bytes.length - 1, Number(b));
      const body = bytes.slice(Number(a), end + 1);
      // Like a cross-origin response without Access-Control-Expose-Headers.
      const headers = exposeRange ? { 'Content-Range': `bytes ${a}-${end}/${bytes.length}` } : {};
      return new Response(body, { status: 206, headers });
    }
    return new Response(bytes, { status: 200 });
  };
}
