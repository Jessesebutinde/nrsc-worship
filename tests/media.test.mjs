import test from 'node:test';
import assert from 'node:assert/strict';
import { BytesSource, BlobSource, HttpSource } from '../src/media/source.js';
import { openMedia, concatParts, pcmMedia } from '../src/media/media.js';
import { zipParts, crc32 } from '../src/media/zip.js';
import { fixture, hasFfmpeg, ffDecode, ffprobeTags, firstClick, fakeFetch, decodeForMedia } from './helpers.mjs';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Every fixture is 8 s of a 440 Hz tone with a click near 3 s.
// early/late: how far the click in a 2.5 s..5 s cut may sit from where it
// is in the original file. MP3 cuts land on frame boundaries and keep up to
// ~2 frames of extra lead-in (never less than asked for).
const CASES = [
  { file: 'tone.m4a', kind: 'mp4', ext: 'm4a', early: 0.002, late: 0.002 },
  { file: 'tone_frag.m4a', kind: 'mp4', ext: 'm4a', early: 0.002, late: 0.002 },
  { file: 'tone.mp3', kind: 'mp3', ext: 'mp3', early: 0.001, late: 0.08 },
  { file: 'tone.wav', kind: 'wav', ext: 'wav', early: 0.001, late: 0.001 },
];

for (const c of CASES) {
  test(`${c.file}: parses and reports duration`, async () => {
    const media = await openMedia(new BytesSource(fixture(c.file)));
    assert.equal(media.kind, c.kind);
    assert.equal(media.ext, c.ext);
    assert.ok(Math.abs(media.duration - 8) < 0.1, `duration ${media.duration}`);
  });

  test(`${c.file}: lossless cut starts at the right moment and carries the title`, { skip: !hasFfmpeg }, async () => {
    const media = await openMedia(new BlobSource(new Blob([fixture(c.file)])));
    const clip = await media.extract(2.5, 5.0);
    const bytes = concatParts(media.mux(clip, { title: 'Way Maker – Live', track: 2, total: 5 }));
    const rate = c.kind === 'wav' ? 8000 : 44100;
    const expected = firstClick(ffDecode(fixture(c.file), rate), rate) - 2.5;
    const click = firstClick(ffDecode(bytes, rate), rate);
    assert.ok(click != null, 'click found');
    assert.ok(click - expected >= -c.early && click - expected <= c.late, `click at ${click}, expected ${expected}`);
    const fmt = ffprobeTags(bytes);
    assert.ok(Math.abs(Number(fmt.duration) - 2.5) < (c.kind === 'mp3' ? 0.11 : 0.03), `duration ${fmt.duration}`);
    assert.equal(fmt.tags.title, 'Way Maker – Live');
  });
}

test('HttpSource reads ranges instead of the whole file', async () => {
  const bytes = fixture('tone.m4a');
  const log = [];
  const src = await new HttpSource('https://x/a.m4a', { fetchImpl: fakeFetch(bytes, { log }) }).open();
  assert.equal(src.size, bytes.length);
  const media = await openMedia(src);
  const clip = await media.extract(1, 2);
  assert.ok(clip.bytes < bytes.length / 4);
  assert.ok(log.every((r) => r !== 'full'));
  // Same bytes as reading from memory.
  const mem = await openMedia(new BytesSource(bytes));
  const clip2 = await mem.extract(1, 2);
  assert.deepEqual(concatParts(clip.parts), concatParts(clip2.parts));
});

test('HttpSource learns the size from Content-Range when exposed, else HEAD', async () => {
  const bytes = fixture('tone.m4a');
  const log1 = [];
  const a = await new HttpSource('https://x/a', { fetchImpl: fakeFetch(bytes, { log: log1, exposeRange: true }) }).open();
  assert.equal(a.size, bytes.length);
  assert.ok(!log1.includes('head'));
  const log2 = [];
  const b = await new HttpSource('https://x/a', { fetchImpl: fakeFetch(bytes, { log: log2 }) }).open();
  assert.equal(b.size, bytes.length);
  assert.ok(log2.includes('head'));
});

test('HttpSource copes with a server that ignores Range', async () => {
  const bytes = fixture('tone.wav');
  const log = [];
  const src = await new HttpSource('https://x/a.wav', { fetchImpl: fakeFetch(bytes, { ranges: false, log }) }).open();
  const media = await openMedia(src);
  await media.extract(1, 2);
  await media.extract(3, 4);
  assert.equal(log.length, 1, 'downloaded once');
});

test('readPcm returns audio aligned to the timeline', { skip: !hasFfmpeg }, async () => {
  const media = await openMedia(new BytesSource(fixture('tone.m4a')), { decode: decodeForMedia });
  const pcm = await media.readPcm(2, 4, 11025);
  const click = firstClick(pcm.data, pcm.sampleRate);
  assert.ok(Math.abs(pcm.startTime + click - 3) < 0.01, `click at ${pcm.startTime + click}`);
});

test('pcmMedia exports WAV', async () => {
  const rate = 8000;
  const ch = new Float32Array(rate * 4);
  ch[rate * 3] = 0.9;
  const media = pcmMedia({ sampleRate: rate, channels: [ch, ch] });
  const clip = await media.extract(2.5, 3.5);
  const bytes = concatParts(media.mux(clip, { title: 'Test' }));
  assert.equal(String.fromCharCode(...bytes.subarray(0, 4)), 'RIFF');
  assert.equal(new DataView(bytes.buffer).getUint32(4, true), bytes.length - 8);
  if (hasFfmpeg) {
    const pcm = ffDecode(bytes, rate);
    assert.ok(Math.abs(firstClick(pcm, rate) - 0.5) < 0.001);
  }
});

test('zip: valid archive with UTF-8 names', () => {
  const a = new TextEncoder().encode('hello');
  assert.equal(crc32([a]), 0x3610a686);
  const parts = zipParts([
    { name: '01 - Way Maker.m4a', parts: [a] },
    { name: '02 - Ọlọrun.m4a', parts: [a, a] },
  ]);
  const zip = concatParts(parts);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-'));
  const f = path.join(dir, 't.zip');
  fs.writeFileSync(f, zip);
  const r = spawnSync('unzip', ['-t', f]);
  if (r.status !== null && !r.error) {
    assert.equal(r.status, 0, r.stdout.toString());
    assert.match(r.stdout.toString(), /No errors/);
  }
});
