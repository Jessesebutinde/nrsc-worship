import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { encodeFlac, flacParts } from '../src/encode/flac.js';
import { buildOpusPayload, oggOpusParts, readOggPackets, preSkipFrom } from '../src/encode/ogg.js';
import { aacM4aParts, aacLcConfig } from '../src/media/mp4.js';
import { muxMp3 } from '../src/media/mp3.js';
import { concatParts } from '../src/media/media.js';
import { estimateBytes, settingsKey } from '../src/encode/encode.js';
import { Mp3Encoder } from '../vendor/lame.js';
import { hasFfmpeg, ffprobeTags } from './helpers.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'enc-'));

function ffRaw(file, args) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, ...args, '-f', 's16le', 'pipe:1'], { maxBuffer: 1 << 28 });
  if (r.status) throw new Error(r.stderr.toString());
  return new Int16Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length / 2);
}

function testSignal(n, rate, stereo = true) {
  const L = new Int16Array(n);
  const R = new Int16Array(n);
  let seed = 1;
  for (let i = 0; i < n; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const noise = ((seed / 0x7fffffff) - 0.5) * 2000;
    L[i] = Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 12000 + noise);
    R[i] = Math.round(Math.sin((2 * Math.PI * 660 * i) / rate) * 9000 - noise * 0.5);
  }
  // Edge cases: full-scale samples and silence.
  L[100] = 32767;
  R[100] = -32768;
  L.fill(0, 5000, 9000);
  R.fill(0, 5000, 9000);
  return stereo ? [L, R] : [L];
}

for (const stereo of [true, false]) {
  test(`FLAC (${stereo ? 'stereo' : 'mono'}) decodes bit-exact and carries tags`, { skip: !hasFfmpeg }, () => {
    const rate = 44100;
    const n = rate * 3 + 1234; // partial last block
    const ch = testSignal(n, rate, stereo);
    const enc = encodeFlac(ch, rate);
    const bytes = concatParts(flacParts(enc, { title: 'Ọlọrun Ọba', track: 3, album: 'Sunday' }));
    const dir = tmp();
    const f = path.join(dir, 'a.flac');
    fs.writeFileSync(f, bytes);
    const pcm = ffRaw(f, []);
    assert.equal(pcm.length, n * ch.length);
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < ch.length; c++) {
        if (pcm[i * ch.length + c] !== ch[c][i]) assert.fail(`sample ${i} ch ${c}: ${pcm[i * ch.length + c]} != ${ch[c][i]}`);
      }
    }
    const fmt = ffprobeTags(bytes);
    assert.equal(fmt.tags.TITLE || fmt.tags.title, 'Ọlọrun Ọba');
    assert.ok(bytes.length < n * ch.length * 2 * 0.95, 'smaller than WAV');
  });
}

test('MP3 via LAME at a chosen bitrate, with ID3 title', { skip: !hasFfmpeg }, () => {
  const rate = 44100;
  const [L, R] = testSignal(rate * 10, rate);
  const enc = new Mp3Encoder(2, rate, 96);
  const out = [];
  for (let i = 0; i < L.length; i += 1152 * 10) out.push(enc.encodeBuffer(L.subarray(i, i + 11520), R.subarray(i, i + 11520)));
  out.push(enc.flush());
  const data = concatParts(out.map((b) => new Uint8Array(b.buffer, b.byteOffset, b.length)));
  const bytes = concatParts(muxMp3(null, { parts: [data] }, { meta: { title: 'Way Maker', track: 1 } }));
  const fmt = ffprobeTags(bytes);
  assert.equal(fmt.tags.title, 'Way Maker');
  assert.ok(Math.abs(Number(fmt.duration) - 10) < 0.1, `duration ${fmt.duration}`);
  // ~96 kbps
  assert.ok(Math.abs(data.length - (96000 / 8) * 10) < 6000, `size ${data.length}`);
});

test('Ogg Opus muxer: packets from libopus re-wrapped play with the right length and tags', { skip: !hasFfmpeg }, () => {
  const dir = tmp();
  const src = path.join(dir, 'src.opus');
  const E = '0.3*sin(2*PI*440*t)';
  const r = spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', `aevalsrc=${E}|${E}:s=48000:d=5.5`, '-c:a', 'libopus', '-b:a', '64k', '-y', src]);
  if (r.status) throw new Error(r.stderr.toString());
  const pk = readOggPackets(new Uint8Array(fs.readFileSync(src)));
  const head = pk[0];
  const preSkip = preSkipFrom(head);
  const packets = pk.slice(2).map((data) => ({ data, samples: 960 }));
  const payload = buildOpusPayload({ packets, channels: 2, preSkip, inputRate: 48000, totalSamples: 5.5 * 48000 });
  const bytes = concatParts(oggOpusParts(payload, { title: 'Holy Forever', album: 'Sunday', track: 2 }));
  const fmt = ffprobeTags(bytes);
  assert.ok(Math.abs(Number(fmt.duration) - 5.5) < 0.03, `duration ${fmt.duration}`);
  const out = path.join(dir, 'out.opus');
  fs.writeFileSync(out, bytes);
  const tags = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream_tags', '-of', 'json', out]).stdout.toString();
  assert.match(tags, /Holy Forever/);
  const pcm = ffRaw(out, ['-ac', '1']);
  assert.ok(Math.abs(pcm.length - 5.5 * 48000) < 960, `samples ${pcm.length}`);
  // Renaming keeps the audio pages byte-identical.
  const again = oggOpusParts(payload, { title: 'Another' });
  assert.deepEqual(again.slice(2), oggOpusParts(payload, {}).slice(2));
});

test('AAC frames are wrapped into a playable .m4a with tags', { skip: !hasFfmpeg }, () => {
  const dir = tmp();
  const adts = path.join(dir, 'a.aac');
  const E = '0.3*sin(2*PI*440*t)';
  const r = spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', `aevalsrc=${E}|${E}:s=44100:d=4`, '-c:a', 'aac', '-b:a', '96k', '-f', 'adts', '-y', adts]);
  if (r.status) throw new Error(r.stderr.toString());
  const u8 = new Uint8Array(fs.readFileSync(adts));
  const sizes = [];
  const frames = [];
  for (let o = 0; o + 7 <= u8.length; ) {
    const len = ((u8[o + 3] & 3) << 11) | (u8[o + 4] << 3) | (u8[o + 5] >> 5);
    const hdr = u8[o + 1] & 1 ? 7 : 9;
    frames.push(u8.subarray(o + hdr, o + len));
    sizes.push(len - hdr);
    o += len;
  }
  const payload = { sampleRate: 44100, channels: 2, asc: aacLcConfig(44100, 2), bitrate: 96000, sizes, data: concatParts(frames) };
  const bytes = concatParts(aacM4aParts(payload, { title: 'Goodness of God', track: 4, total: 7 }));
  const fmt = ffprobeTags(bytes);
  assert.equal(fmt.tags.title, 'Goodness of God');
  assert.equal(fmt.tags.track, '4/7');
  assert.ok(Math.abs(Number(fmt.duration) - 4) < 0.1, `duration ${fmt.duration}`);
  const out = path.join(dir, 'o.m4a');
  fs.writeFileSync(out, bytes);
  const pcm = ffRaw(out, ['-ac', '1']);
  assert.ok(pcm.length > 44100 * 3.9);
});

test('size estimates scale with bitrate and format', () => {
  const media = { sampleRate: 44100, channels: 2, duration: 100, lossless: true, info: { sizes: [] }, sourceBytes: 1_600_000 };
  assert.equal(Math.round(estimateBytes({ format: 'mp3', bitrate: 128 }, 60, media)), 960000);
  assert.equal(Math.round(estimateBytes({ format: 'original' }, 50, media)), 800000);
  assert.ok(estimateBytes({ format: 'flac' }, 60, media) < estimateBytes({ format: 'wav' }, 60, media));
  assert.ok(estimateBytes({ format: 'wav', mono: true }, 60, media) < estimateBytes({ format: 'wav' }, 60, media));
  assert.notEqual(settingsKey({ format: 'mp3', bitrate: 128 }), settingsKey({ format: 'mp3', bitrate: 192 }));
  assert.equal(settingsKey({ format: 'original', bitrate: 128 }), 'original');
});
