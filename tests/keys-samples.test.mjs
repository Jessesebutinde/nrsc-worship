import test from 'node:test';
import assert from 'node:assert/strict';
import { SETS, GM_NAMES, FEATURED, bankInfo, noteNameToMidi, midiToNoteName } from '../src/keys/banks.js';
import { SampleLibrary, parseSoundfontJs, chooseNotes, base64ToBytes } from '../src/keys/samples.js';

// Three notes of MusyngKite/electric_bass_finger-mp3.js, each MP3 cut to its first 180 bytes.
const B64 = {
  E1: '//uQZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAB5AAA8owAHCg4RGBwfIyYtMTQ4O0BCRUdKT1FTVlpdX2FkZ2lrbW9zdXZ4en5/gYOGiIqMjZGTlZeYnJ6foaOmqKqsr7Gztba6vL2/wcTGyMrMz9HT1Nja293f4uTm6Oru8PHz9fj6/P4AAAA8TEFNRTMuMTAwBK8AAAAALIMAADUgJANA',
  A2: '//uQZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAB5AABFrQAGCQwPFRgbHiEnKi0wMzo9QENGSk1QUldZW11gZGdpa21xc3V3eX2AgYOHiYuMjpOVmJmcoKKkpqirra6xtLa4ury/wcLExcnLzc/R1NXX2Nvd3uDi5ebo6evu7/Hz9Pf5+/wAAAA8TEFNRTMuMTAwBK8AAAAALFEAADUgJANA',
  C4: '//uQZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAB5AABRWwAFBwoNEhQXGhwhJCcpLDE0Njk8QUNGSU5QU1ZYXF5gYmRpa21vcXV4eXyAgoSGiIyOkJKUmJqcnqCkpqiqrrCytLW5u72/wcTGyMrM0NHT1dna3N7g4+Xn6Oru7/Hy9Pj5+/0AAAA8TEFNRTMuMTAwBK8AAAAALC8AADUgJANA',
};
const FIXTURE = `
if (typeof(MIDI) === 'undefined') var MIDI = {};
if (typeof(MIDI.Soundfont) === 'undefined') MIDI.Soundfont = {};
MIDI.Soundfont.electric_bass_finger = {
"E1": "data:audio/mp3;base64,${B64.E1}",
"A2": "data:audio/mp3;base64,${B64.A2}",
"C4": "data:audio/mp3;base64,${B64.C4}",

}
`;
const BASS = 'MusyngKite/electric_bass_finger';
const CHOIR = 'MusyngKite/choir_aahs';
const ALL = Array.from({ length: 88 }, (_, i) => 21 + i);

test('parseSoundfontJs picks the notes out of the file without running it', () => {
  const notes = parseSoundfontJs(FIXTURE);
  assert.deepEqual([...notes.keys()], ['E1', 'A2', 'C4']);
  assert.equal(notes.get('A2'), B64.A2);
  assert.equal(parseSoundfontJs('var MIDI = {};').size, 0);
});

test('note names round-trip over the 88 keys', () => {
  for (const m of ALL) assert.equal(noteNameToMidi(midiToNoteName(m)), m);
  assert.equal(noteNameToMidi('A0'), 21);
  assert.equal(noteNameToMidi('Db4'), 61);
  assert.equal(noteNameToMidi('C#4'), 61);
  assert.equal(noteNameToMidi('C8'), 108);
  assert.equal(noteNameToMidi('H2'), null);
  assert.equal(midiToNoteName(61), 'Db4');
  assert.equal(midiToNoteName(21), 'A0');
  assert.equal(midiToNoteName(108), 'C8');
});

/** The farthest any note in low..high is from its nearest chosen sample. */
function maxGap(chosen, low, high) {
  let worst = 0;
  for (let n = low; n <= high; n++) worst = Math.max(worst, Math.min(...chosen.map((c) => Math.abs(c - n))));
  return worst;
}

test('chooseNotes thins the samples but keeps both ends', () => {
  const med = chooseNotes(ALL, 28, 67, 'medium');
  assert.equal(med[0], 28);
  assert.equal(med[med.length - 1], 67);
  assert.equal(med.length, 21);
  assert.equal(maxGap(med, 28, 67), 1);
  const low = chooseNotes(ALL, 28, 67, 'low');
  assert.equal(low[0], 28);
  assert.equal(low[low.length - 1], 67);
  assert.equal(low.length, 14);
  assert.equal(maxGap(low, 28, 67), 1);
  assert.deepEqual(chooseNotes(ALL, 28, 67, 'high'), ALL.filter((n) => n >= 28 && n <= 67));
  assert.deepEqual(chooseNotes(ALL, 200, 300, 'high'), []);
  assert.deepEqual(chooseNotes([60, 28, 45], 24, 67, 'medium'), [28, 60]);
});

test('base64ToBytes', () => {
  assert.deepEqual([...base64ToBytes('SGVsbG8=')], [72, 101, 108, 108, 111]);
  const mp3 = base64ToBytes(B64.E1);
  assert.equal(mp3.length, 180);
  assert.deepEqual([mp3[0], mp3[1]], [0xff, 0xfb]); // MP3 frame sync
});

test('bankInfo', () => {
  const bass = bankInfo(BASS);
  assert.equal(bass.family, 'bass');
  assert.equal(bass.sustain, false);
  assert.equal(bass.program, 33);
  assert.equal(bass.label, 'Electric Bass (finger)');
  assert.equal(bass.set, 'MusyngKite');
  assert.equal(bass.name, 'electric_bass_finger');
  assert.deepEqual([bass.low, bass.high], [24, 67]);
  assert.ok(bass.url.endsWith('electric_bass_finger-mp3.js'));
  assert.ok(bass.url.startsWith('https://gleitz.github.io/midi-js-soundfonts/MusyngKite/'));
  const choir = bankInfo('FluidR3_GM/choir_aahs');
  assert.equal(choir.family, 'choir');
  assert.equal(choir.sustain, true);
  assert.equal(choir.label, 'Choir Aahs');
  assert.ok(choir.url.includes('/FluidR3_GM/'));
  const grand = bankInfo('FatBoy/acoustic_grand_piano');
  assert.deepEqual([grand.low, grand.high], [21, 108]);
  const fam = (name) => bankInfo(`MusyngKite/${name}`).family;
  const sus = (name) => bankInfo(`MusyngKite/${name}`).sustain;
  assert.equal(fam('electric_piano_1'), 'ep');
  assert.equal(fam('clavinet'), 'ep');
  assert.equal(fam('harpsichord'), 'piano');
  assert.equal(fam('vibraphone'), 'chromatic');
  assert.equal(fam('orchestra_hit'), 'ensemble');
  assert.equal(fam('kalimba'), 'ethnic');
  assert.equal(fam('taiko_drum'), 'percussive');
  assert.equal(fam('gunshot'), 'sfx');
  const held = ['church_organ', 'violin', 'string_ensemble_1', 'synth_choir', 'trumpet', 'flute', 'lead_1_square'];
  const decaying = ['pizzicato_strings', 'orchestral_harp', 'timpani', 'orchestra_hit', 'vibraphone', 'sitar'];
  for (const n of [...held, 'pad_2_warm', 'fx_1_rain']) assert.ok(sus(n), n);
  for (const n of [...decaying, 'acoustic_grand_piano']) assert.ok(!sus(n), n);
  assert.equal(bankInfo('MusyngKite/lead_8_bass__lead').label, 'Lead 8 (bass + lead)');
  assert.equal(bankInfo('MusyngKite/pad_1_new_age').label, 'Pad 1 (new age)');
  assert.equal(bankInfo('MusyngKite/fx_3_crystal').label, 'FX 3 (crystal)');
  assert.equal(bankInfo('MusyngKite/honkytonk_piano').label, 'Honky-tonk Piano');
  assert.throws(() => bankInfo('Nope/acoustic_grand_piano'), /Unknown sample set/);
  assert.throws(() => bankInfo('MusyngKite/theremin'), /Unknown instrument/);
  assert.throws(() => bankInfo('constructor/acoustic_grand_piano'), /Unknown sample set/);
});

test('catalogue: 128 GM names, three sets, featured ids all resolve', () => {
  assert.equal(GM_NAMES.length, 128);
  assert.equal(GM_NAMES[0], 'acoustic_grand_piano');
  assert.equal(GM_NAMES[52], 'choir_aahs');
  assert.equal(GM_NAMES[127], 'gunshot');
  assert.deepEqual(Object.keys(SETS), ['MusyngKite', 'FluidR3_GM', 'FatBoy']);
  assert.equal(new Set(FEATURED).size, FEATURED.length);
  for (const id of FEATURED) bankInfo(id);
});

/** A decoder whose every note is a 1-second 440 Hz sine with a short attack and a slow decay (so it loops). */
function fakeCtx(decoded) {
  const sr = 44100;
  const sine = new Float32Array(sr);
  for (let i = 0; i < sr; i++) {
    const t = i / sr;
    sine[i] = 0.5 * Math.min(1, t / 0.02) * (1 - 0.1 * t) * Math.sin(2 * Math.PI * 440 * t);
  }
  const ctx = {
    async decodeAudioData(buf) {
      assert.ok(buf instanceof ArrayBuffer);
      decoded.push(buf.byteLength);
      return { numberOfChannels: 2, sampleRate: sr, length: sr, getChannelData: () => sine };
    },
  };
  return { ctx, sine };
}

async function withFetch(fetch, fn) {
  const saved = globalThis.fetch;
  globalThis.fetch = fetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = saved;
  }
}

test('SampleLibrary.load fetches, decodes and ships the bank to the engine in order', async () => {
  const sent = [];
  const decoded = [];
  const prog = [];
  const { ctx, sine } = fakeCtx(decoded);
  const lib = new SampleLibrary({ ctx, send: (m, transfer) => sent.push({ m, transfer }), quality: 'high' });
  assert.equal(lib.progress(BASS), 0);
  assert.equal(lib.isLoaded(BASS), false);
  const urls = [];
  const result = await withFetch(
    async (url) => {
      urls.push(url);
      return new Response(FIXTURE);
    },
    () => {
      const p = lib.load(BASS, { onProgress: (x) => prog.push(x) });
      assert.equal(lib.load(BASS), p); // idempotent while running
      return p;
    },
  );
  assert.deepEqual(urls, [bankInfo(BASS).url]);
  assert.deepEqual(result, { id: BASS, notes: [28, 45, 60], bytes: FIXTURE.length });
  assert.deepEqual(decoded, [180, 180, 180]);
  assert.deepEqual(
    sent.map((s) => s.m.t),
    ['bankStart', 'bankNote', 'bankNote', 'bankNote', 'bankDone'],
  );
  assert.equal(sent[0].m.id, BASS);
  const notes = sent.filter((s) => s.m.t === 'bankNote');
  assert.deepEqual(
    notes.map((s) => s.m.note),
    [28, 45, 60],
  );
  for (const { m, transfer } of notes) {
    assert.equal(m.id, BASS);
    assert.equal(m.rate, 44100);
    assert.ok(m.L instanceof Float32Array && m.R instanceof Float32Array);
    assert.equal(m.L.length, 44100);
    assert.notEqual(m.L, sine); // our own copies, since they get transferred
    assert.notEqual(m.L.buffer, m.R.buffer);
    assert.deepEqual(transfer, [m.L.buffer, m.R.buffer]);
    assert.equal(m.L[1000], sine[1000]);
    assert.deepEqual([m.loopStart, m.loopEnd, m.loopAuto], [0, 0, false]); // a bass decays: no loop
  }
  assert.deepEqual(prog, [1 / 3, 2 / 3, 1]);
  assert.equal(lib.progress(BASS), 1);
  assert.ok(lib.isLoaded(BASS));
  assert.equal(await lib.isCached(BASS), false); // no Cache Storage in Node
  const late = [];
  await lib.load(BASS, { onProgress: (x) => late.push(x) }); // already loaded: nothing is sent again
  assert.deepEqual(late, [1]);
  assert.equal(sent.length, 5);

  lib.unload(BASS);
  assert.deepEqual(sent[5].m, { t: 'bankFree', id: BASS });
  assert.ok(!lib.isLoaded(BASS));
  assert.equal(lib.progress(BASS), 0);

  // Medium quality keeps the lowest and highest of the three fixture notes.
  lib.setQuality('medium');
  const again = await withFetch(async () => new Response(FIXTURE), () => lib.load(BASS));
  assert.deepEqual(again.notes, [28, 60]);
});

test('SampleLibrary.load finds loop points for a sustained bank', async () => {
  const sent = [];
  const { ctx } = fakeCtx([]);
  const lib = new SampleLibrary({ ctx, send: (m) => sent.push(m), quality: 'high' });
  const r = await withFetch(async () => new Response(FIXTURE), () => lib.load(CHOIR));
  assert.deepEqual(r.notes, [45, 60]); // E1 is below the choir's range
  for (const m of sent.filter((x) => x.t === 'bankNote')) {
    assert.equal(m.loopAuto, true);
    assert.ok(m.loopStart > 0 && m.loopEnd > m.loopStart && m.loopEnd <= 44100, `${m.loopStart}..${m.loopEnd}`);
  }
});

test('SampleLibrary.load: a failed download is reported and can be retried', async () => {
  const sent = [];
  const { ctx } = fakeCtx([]);
  const lib = new SampleLibrary({ ctx, send: (m) => sent.push(m) });
  await withFetch(
    async () => {
      throw new TypeError('Failed to fetch');
    },
    () => assert.rejects(lib.load(BASS), /could not be downloaded.*internet/),
  );
  assert.equal(lib.progress(BASS), 0);
  assert.equal(sent.length, 0); // nothing reached the engine
  await withFetch(
    async () => new Response('nope', { status: 404 }),
    () => assert.rejects(lib.load(BASS), /needs internet \(HTTP 404\)/),
  );
  const r = await withFetch(async () => new Response(FIXTURE), () => lib.load(BASS));
  assert.deepEqual(r.notes, [28, 60]);
  assert.ok(lib.isLoaded(BASS));
  await assert.rejects(lib.load('MusyngKite/theremin'), /Unknown instrument/);
});

test('SampleLibrary.unload during a load stops it', async () => {
  const sent = [];
  const { ctx } = fakeCtx([]);
  const lib = new SampleLibrary({ ctx, send: (m) => sent.push(m), quality: 'high' });
  await withFetch(
    async () => new Response(FIXTURE),
    async () => {
      const p = lib.load(BASS, { onProgress: () => lib.unload(BASS) });
      await assert.rejects(p, (e) => e.cancelled === true);
    },
  );
  assert.deepEqual(
    sent.map((m) => m.t),
    ['bankStart', 'bankNote', 'bankFree'],
  );
  assert.ok(!lib.isLoaded(BASS));
  assert.equal(lib.progress(BASS), 0);
});
