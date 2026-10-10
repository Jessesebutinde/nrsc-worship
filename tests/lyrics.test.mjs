import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseRef, findBook, formatRef, bookByCode, BOOKS } from '../src/lyrics/books.js';
import { parseBibleText, splitVerse, paginate, passageItem, wrapCount, CHAR_FIT } from '../src/lyrics/bible.js';
import { parseSlides, formatSlides, splitLyrics, splitShort, lintSlides, wrapLine, splitAtPauses, labelOf } from '../src/lyrics/split.js';
import { Dictionary, checkText, applyFix, wordsOf, distance } from '../src/lyrics/spell.js';
import { emptyState, reduce, newer, songItem, mediaItem, shownOn, lookOf, slideWords, markKey, PRESETS, PRESET_INFO, BACKGROUNDS } from '../src/lyrics/state.js';
import { Link, normalizeCode, newCode, CODE_ALPHABET } from '../src/lyrics/link.js';
import { RealtimeChannel } from '../src/lyrics/realtime.js';
import { MqttClient, connectPacket, subscribePacket, publishPacket, parsePackets, parsePublish } from '../src/lyrics/mqtt.js';
import { makeSong, mergeSongs, searchSongs, removeSong, visibleSongs, loadSongs, importLibrary, exportLibrary } from '../src/lyrics/library.js';
import { SEED_SONGS } from '../src/lyrics/seed.js';

// ------------------------------------------------------------------ references

test('references in Luganda and English', () => {
  const r = (t) => {
    const x = parseRef(t);
    return x && `${x.book.code} ${x.chapter}:${x.from}-${x.to}`;
  };
  assert.equal(r('Zabbuli 23:1-4'), 'PSA 23:1-4');
  assert.equal(r('Psalm 23:1-4'), 'PSA 23:1-4');
  assert.equal(r('zab 23 1'), 'PSA 23:1-1');
  assert.equal(r('Yokaana 3:16'), 'JHN 3:16-16');
  assert.equal(r('1 Yokaana 1:9'), '1JN 1:9-9');
  assert.equal(r('1Yk 1:9'), '1JN 1:9-9');
  assert.equal(r("Ebikolwa by'Abatume 2:38"), 'ACT 2:38-38');
  assert.equal(r('II Kings 2:11'), '2KI 2:11-11');
  assert.equal(r('Abaruumi 8.28'), 'ROM 8:28-28');
  assert.equal(r('Mat 5:3–12'), 'MAT 5:3-12');
  assert.equal(r('Psalm 23'), 'PSA 23:null-null');
  assert.equal(parseRef('Jo 3'), null, 'too vague: Job, Joel, John, Jonah, Joshua');
  assert.equal(parseRef('Nothing 3:1'), null);
  assert.equal(BOOKS.length, 66);
  assert.equal(bookByCode('JOH').code, 'JHN', 'eBible VPL code');
  assert.equal(findBook('Okubikkulirwa').en, 'Revelation');
});

test('reference shown in both languages', () => {
  assert.equal(formatRef(findBook('Psalms'), 23, 1), 'Zabbuli 23 : 1 · Psalm 23 : 1');
  assert.equal(formatRef(findBook('John'), 3, 16, { part: 'a', lg: false }), 'John 3 : 16a');
});

// ------------------------------------------------------------------ bible files

const verse = (books, code, c, v) => books.get(bookByCode(code).n)[c - 1][v - 1];

test('Bible text: VPL, tab separated, USFM, JSON and XML', () => {
  const vpl = parseBibleText('PSA 23:1 Mukama ye musumba wange;\nPSA 23:2 Angalamiza\nJOH 3:16 Kubanga');
  assert.equal(verse(vpl, 'PSA', 23, 1), 'Mukama ye musumba wange;');
  assert.equal(verse(vpl, 'JHN', 3, 16), 'Kubanga');

  const named = parseBibleText('Zabbuli 23:1 Mukama\nPsalm 23:2 He maketh');
  assert.equal(verse(named, 'PSA', 23, 2), 'He maketh');

  const tsv = parseBibleText('book\tchapter\tverse\ttext\n19\t23\t1\tThe LORD\nJHN\t3\t16\tFor God');
  assert.equal(verse(tsv, 'PSA', 23, 1), 'The LORD');
  assert.equal(verse(tsv, 'JHN', 3, 16), 'For God');

  const usfm = parseBibleText('\\id PSA\n\\h Zabbuli\n\\c 23\n\\s Omusumba\n\\q1 \\v 1 Mukama \\f + note\\f* ye musumba\n\\q2 wange; \\v 2 Angalamiza');
  assert.equal(verse(usfm, 'PSA', 23, 1), 'Mukama ye musumba wange;');
  assert.equal(verse(usfm, 'PSA', 23, 2), 'Angalamiza');

  const json = parseBibleText(JSON.stringify([{ book: 'PSA', chapter: 23, verse: 1, text: 'One' }]));
  assert.equal(verse(json, 'PSA', 23, 1), 'One');
  const nested = parseBibleText(JSON.stringify({ JHN: [[], [], Array.from({ length: 16 }, (_, i) => `v${i + 1}`)] }));
  assert.equal(verse(nested, 'JHN', 3, 16), 'v16');

  const xml = parseBibleText(`<?xml version="1.0"?><bible translation="x"><testament name="Old">
    <book number="19"><chapter number="23"><verse number="1">Mukama ye musumba wange; seetaagenga:</verse>
    <verse number="2">Ag'amazzi &amp; &lt;x&gt;</verse></chapter></book></testament></bible>`);
  assert.equal(verse(xml, 'PSA', 23, 1), 'Mukama ye musumba wange; seetaagenga:');
  assert.equal(verse(xml, 'PSA', 23, 2), "Ag'amazzi & <x>");

  const zefania = parseBibleText('<XMLBIBLE><BIBLEBOOK bnumber="43"><CHAPTER cnumber="3"><VERS vnumber="16">For God</VERS></CHAPTER></BIBLEBOOK></XMLBIBLE>');
  assert.equal(verse(zefania, 'JHN', 3, 16), 'For God');
});

test('bundled Bibles: Luganda 1968 and KJV Psalm 23', () => {
  const lg = JSON.parse(fs.readFileSync(new URL('../lyrics/bibles/lug68/19.json', import.meta.url)));
  const en = JSON.parse(fs.readFileSync(new URL('../lyrics/bibles/kjv/19.json', import.meta.url)));
  assert.equal(lg[22][0], 'Mukama ye musumba wange; seetaagenga:');
  assert.match(en[22][0], /The LORD is my shepherd; I shall not want\.$/);
  for (let n = 1; n <= 66; n++) {
    for (const id of ['lug68', 'kjv']) {
      const book = JSON.parse(fs.readFileSync(new URL(`../lyrics/bibles/${id}/${n}.json`, import.meta.url)));
      assert.ok(book.length > 0, `${id} book ${n}`);
      for (const ch of book) for (const v of ch) assert.ok(!/[<>¶[\]]/.test(v), `${id} ${n}: ${v}`);
    }
  }
});

test('a long verse splits into a / b in both languages; flow packs short verses together', () => {
  const book = findBook('Psalm');
  const lg =
    "Era newakubadde nga ntambulira mu kiwonvu eky'ekisiikirize eky'olumbe, Siritya kabi konna; kubanga ggwe oli nange: Oluga lwo n'omuggo gwo bye binsanyusa.";
  const en =
    'Yea, though I walk through the valley of the shadow of death, I will fear no evil: for thou art with me; thy rod and thy staff they comfort me.';
  const parts = splitVerse(lg, en);
  assert.equal(parts.length, 2);
  assert.deepEqual(parts.map((p) => p.part), ['a', 'b']);
  assert.equal(parts.map((p) => p.primary).join(' '), lg);
  assert.equal(parts.map((p) => p.secondary).join(' '), en);
  for (const p of parts) {
    assert.ok(wrapCount(p.primary, CHAR_FIT.primary.width) <= 3, p.primary);
    assert.ok(wrapCount(p.secondary, CHAR_FIT.secondary.width) <= 3, p.secondary);
  }
  assert.match(parts[0].primary, /[,;:]$/, 'split at a pause');
  assert.deepEqual(splitVerse('Mukama ye musumba wange;', 'The LORD is my shepherd'), [
    { part: '', primary: 'Mukama ye musumba wange;', secondary: 'The LORD is my shepherd' },
  ]);

  const verses = [
    { verse: 1, primary: 'Mukama ye musumba wange;', secondary: 'The LORD is my shepherd;' },
    { verse: 2, primary: 'Angalamiza mu ddundiro.', secondary: 'He maketh me to lie down.' },
    { verse: 3, primary: lg, secondary: en },
    { verse: 4, primary: 'Akomyawo emmeeme yange.', secondary: 'He restoreth my soul.' },
  ];
  const flow = paginate(verses, { book, chapter: 23 });
  assert.deepEqual(flow.map((s) => s.ref), [
    'Zabbuli 23 : 1-2 · Psalm 23 : 1-2',
    'Zabbuli 23 : 3a · Psalm 23 : 3a',
    'Zabbuli 23 : 3b · Psalm 23 : 3b',
    'Zabbuli 23 : 4 · Psalm 23 : 4',
  ]);
  assert.equal(flow[0].primary, 'Mukama ye musumba wange; 2 Angalamiza mu ddundiro.');
  assert.deepEqual(flow[0].verses.map((v) => v.verse), [1, 2]);
  const perVerse = paginate(verses, { book, chapter: 23, flow: false });
  assert.equal(perVerse.length, 5);
  assert.equal(perVerse[0].ref, 'Zabbuli 23 : 1 · Psalm 23 : 1');
  // With a wide screen (a generous fit) everything flows onto one slide.
  const wide = { primary: { width: (t) => t.length / 400, lines: 3 }, secondary: { width: (t) => t.length / 400, lines: 3 } };
  assert.equal(paginate(verses, { book, chapter: 23, fit: wide }).length, 1);
  assert.equal(wrapCount('one two three four', (t) => t.length / 9), 3);
});

test('passage item from the built-in versions', async () => {
  const fetchImpl = async (url) => {
    const m = /bibles\/(\w+)\/(\d+)\.json$/.exec(url);
    const file = new URL(`../lyrics/bibles/${m[1]}/${m[2]}.json`, import.meta.url);
    return fs.existsSync(file) ? new Response(fs.readFileSync(file)) : new Response('', { status: 404 });
  };
  const item = await passageItem({ ref: parseRef('Zabbuli 23:1-3'), primaryId: 'lug68', secondaryId: 'kjv', fetchImpl });
  assert.equal(item.kind, 'scripture');
  assert.equal(item.slides.length, 3);
  assert.equal(item.slides[0].primary, 'Mukama ye musumba wange; seetaagenga:');
  assert.equal(item.secondaryLabel, 'KJV');
  // English alone shows at the large size, so verse 2 (107 characters) splits into 2a / 2b.
  const whole = await passageItem({ ref: parseRef('Psalm 117'), primaryId: 'kjv', secondaryId: '', fetchImpl, flow: false });
  assert.deepEqual(whole.slides.map((s) => s.ref), ['Psalm 117 : 1', 'Psalm 117 : 2a', 'Psalm 117 : 2b']);
});

// ------------------------------------------------------------------ lyrics

test('slide text parses with labels and blank lines', () => {
  const slides = parseSlides('[Verse 1]\nA\nB\n\nC\nD\n\nChorus:\nE\nF\nG\n\n\n[Bridge]\nH');
  assert.deepEqual(slides, [
    { label: 'Verse 1', lines: ['A', 'B'] },
    { label: 'Verse 1', lines: ['C', 'D'] },
    { label: 'Chorus', lines: ['E', 'F', 'G'] },
    { label: 'Bridge', lines: ['H'] },
  ]);
  assert.equal(formatSlides(slides), '[Verse 1]\nA\nB\n\nC\nD\n\n[Chorus]\nE\nF\nG\n\n[Bridge]\nH');
  assert.equal(labelOf('verse 2'), 'Verse 2');
  assert.equal(labelOf('Amazing grace'), null);
});

test('splitter: 2 lines per slide, no line over the limit, words whole, idempotent', () => {
  const raw =
    "Amazing grace how sweet the sound that saved a wretch like me\nI once was lost but now am found, was blind but now I see\n\nChorus:\nTukutendereza Yesu\nYesu Omwana gw'endiga\nOmusaayi gwo gunnaazizza\nNkwebaza Omulokozi\nNkwebaza, nkwebaza Mukama";
  for (const preset of ['classic', 'worship', 'praise']) {
    const out = splitLyrics(raw, preset);
    assert.equal(splitLyrics(out, preset), out, 'running it twice changes nothing');
    const slides = parseSlides(out);
    assert.deepEqual(lintSlides(slides, preset), [], `${preset}: ${out}`);
    const words = (t) => t.replace(/\[[^\]]*\]|Chorus:/g, '').split(/\s+/).filter(Boolean);
    assert.deepEqual(words(out), words(raw), 'same words in the same order');
  }
  // Never more than two lines, a chorus included.
  const chorus = parseSlides(splitLyrics(raw)).filter((s) => s.label === 'Chorus');
  assert.deepEqual(chorus.map((s) => s.lines.length), [2, 2, 1]);
});

test('splitter prefers breaking at commas and never on little words', () => {
  assert.deepEqual(wrapLine('Great is thy faithfulness, morning by morning', { target: 22, max: 26 }), [
    'Great is thy faithfulness,',
    'morning by morning',
  ]);
  for (const piece of wrapLine("'Twas grace that taught my heart to fear, and grace my fears relieved")) {
    assert.ok(!/\b(and|the|my|to)$/.test(piece), piece);
  }
  assert.deepEqual(splitAtPauses('one two, three four', 2), ['one two,', 'three four']);
  assert.deepEqual(wrapLine('Supercalifragilisticexpialidocious'), ['Supercalifragilisticexpialidocious']);
});

test('lint flags long lines and too many lines', () => {
  const lint = lintSlides(parseSlides('A\nB\nC\n\n[Chorus]\nA\nB\nC\n\nThis line is far too long for the screen'), 'classic');
  assert.deepEqual(lint.map((l) => l.index), [0, 1, 2]);
});

test('seed songs fit the screen rules', () => {
  for (const s of SEED_SONGS) assert.deepEqual(lintSlides(parseSlides(s.text), s.preset), [], s.title);
});

// ------------------------------------------------------------------ spelling

test('spelling suggestions from word lists', () => {
  const d = new Dictionary(['mukama', 'musumba', 'wange', 'the', 'lord', 'shepherd', 'omwana', 'endiga']);
  assert.equal(distance('mukaama', 'mukama'), 1);
  assert.deepEqual(wordsOf("Omwana gw'endiga"), ['omwana', 'gw', 'endiga']);
  const text = '[Chorus]\nMukaama ye musumba wange\nThe Lord is my shepard';
  const flags = checkText(text, d);
  assert.deepEqual(flags.map((f) => f.word), ['Mukaama', 'shepard']);
  assert.deepEqual(flags[0].suggestions, ['mukama']);
  assert.equal(applyFix(text, flags[0], 'mukama'), '[Chorus]\nMukama ye musumba wange\nThe Lord is my shepard');
  d.addText('Tukutendereza');
  assert.ok(d.has('TUKUTENDEREZA'));
});

// ------------------------------------------------------------------ state

test('state: next / prev / modes / newest wins', () => {
  const song = makeSong({ title: 'X', text: 'a\nb\n\nc\nd\n\ne' });
  let s = reduce(emptyState(), { type: 'item', item: songItem(song) }, 'r1');
  assert.equal(s.mode, 'show');
  assert.equal(s.rev, 1);
  s = reduce(s, { type: 'next' }, 'r1');
  s = reduce(s, { type: 'next' }, 'r1');
  s = reduce(s, { type: 'next' }, 'r1');
  assert.equal(s.index, 2, 'stops at the last slide');
  s = reduce(s, { type: 'mode', mode: 'black' }, 'r1');
  assert.equal(s.mode, 'black');
  s = reduce(s, { type: 'mode', mode: 'black' }, 'r1');
  assert.equal(s.mode, 'show', 'pressing Black again goes back');
  s = reduce(s, { type: 'mode', mode: 'clear' }, 'r1');
  s = reduce(s, { type: 'next' }, 'r1');
  assert.deepEqual([s.mode, s.index], ['show', 2], 'next after Clear brings the slide back first');
  assert.ok(newer(s, reduce(emptyState(), { type: 'next' }, 'zz')));
  assert.ok(newer({ rev: 3, by: 'b' }, { rev: 3, by: 'a' }));
  assert.ok(!newer({ rev: 2, by: 'z' }, { rev: 3, by: 'a' }));
  assert.equal(reduce(emptyState(), { type: 'mode', mode: 'show' }, 'x').mode, 'logo', 'nothing to show');
});

// ------------------------------------------------------------------ link (BroadcastChannel)

class FakeBC {
  static channels = new Map();
  constructor(name) {
    this.name = name;
    if (!FakeBC.channels.has(name)) FakeBC.channels.set(name, new Set());
    FakeBC.channels.get(name).add(this);
  }
  postMessage(m) {
    const data = structuredClone(m);
    for (const c of FakeBC.channels.get(this.name)) if (c !== this) queueMicrotask(() => c.onmessage && c.onmessage({ data }));
  }
  close() {
    FakeBC.channels.get(this.name).delete(this);
  }
}

const tick = () => new Promise((r) => setTimeout(r, 5));

test('link: remote drives the screen; a refreshed screen catches up', async () => {
  const seen = [];
  const screen = new Link({ room: 'ABC234', role: 'screen', onState: (s) => seen.push(s), BroadcastChannelImpl: FakeBC });
  let info = null;
  const remote = new Link({ room: 'ABC234', role: 'remote', onState: () => {}, onInfo: (i) => (info = i), BroadcastChannelImpl: FakeBC });
  const other = new Link({ room: 'OTHER9', role: 'screen', onState: () => assert.fail('wrong room'), BroadcastChannelImpl: FakeBC });
  await tick();
  assert.equal(info.peers.screen, 1);
  const s1 = reduce(emptyState(), { type: 'item', item: songItem(makeSong({ title: 'T', text: 'a\n\nb' })) }, remote.id);
  remote.publish(s1);
  await tick();
  assert.equal(seen.at(-1).rev, 1);
  // An older state never overwrites a newer one.
  screen.receive({ t: 'state', id: 'old', role: 'remote', state: { ...emptyState(), rev: 0 } });
  assert.equal(seen.length, 1);
  screen.close();
  // The screen reloads with nothing cached: the remote answers its hello.
  const got = [];
  const screen2 = new Link({ room: 'ABC234', role: 'screen', onState: (s) => got.push(s), BroadcastChannelImpl: FakeBC });
  await tick();
  assert.equal(got.at(-1).item.title, 'T');
  for (const l of [remote, other, screen2]) l.close();
});

test('pairing codes', () => {
  const c = newCode(6, () => 0.5);
  assert.equal(c.length, 6);
  assert.ok([...c].every((ch) => CODE_ALPHABET.includes(ch)));
  assert.equal(normalizeCode(' abc-234 '), 'ABC234');
});

// ------------------------------------------------------------------ Supabase Realtime protocol

class FakeWS {
  static last = null;
  constructor(url) {
    this.url = url;
    this.sent = [];
    this.readyState = 0;
    FakeWS.last = this;
    queueMicrotask(() => {
      this.readyState = 1;
      this.onopen();
    });
  }
  send(t) {
    this.sent.push(JSON.parse(t));
  }
  close() {
    this.readyState = 3;
    this.onclose && this.onclose();
  }
  serverSays(m) {
    this.onmessage({ data: JSON.stringify(m) });
  }
}

test('realtime: joins the channel, sends and receives broadcasts, rejoins after a drop', async () => {
  const got = [];
  const statuses = [];
  const ch = new RealtimeChannel({
    url: 'https://proj.supabase.co',
    key: 'anon',
    topic: 'lyric-slides-ABC234',
    WebSocketImpl: FakeWS,
    onMessage: (m) => got.push(m),
    onStatus: (s) => statuses.push(s),
  });
  await tick();
  const ws = FakeWS.last;
  assert.equal(ws.url, 'wss://proj.supabase.co/realtime/v1/websocket?apikey=anon&vsn=1.0.0');
  const join = ws.sent[0];
  assert.equal(join.event, 'phx_join');
  assert.equal(join.topic, 'realtime:lyric-slides-ABC234');
  assert.equal(ch.send({ t: 'x' }), false, 'not joined yet');
  ws.serverSays({ topic: join.topic, event: 'phx_reply', ref: join.ref, payload: { status: 'ok', response: {} } });
  assert.equal(statuses.at(-1), 'joined');
  assert.equal(ch.send({ t: 'here' }), true);
  assert.deepEqual(ws.sent.at(-1).payload, { type: 'broadcast', event: 'msg', payload: { t: 'here' } });
  ws.serverSays({ topic: join.topic, event: 'broadcast', payload: { type: 'broadcast', event: 'msg', payload: { t: 'state' } } });
  assert.deepEqual(got, [{ t: 'state' }]);
  ws.close();
  assert.equal(statuses.at(-1), 'closed');
  await new Promise((r) => setTimeout(r, 600));
  assert.notEqual(FakeWS.last, ws, 'reconnected');
  assert.equal(FakeWS.last.sent[0].event, 'phx_join');
  ch.close();
});

// ------------------------------------------------------------------ library

test('library: seeds once, search, delete as tombstone, merge newest wins, import/export', () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const songs = loadSongs(storage);
  assert.equal(songs.length, SEED_SONGS.length);
  assert.equal(searchSongs(songs, 'tukut')[0].title, 'Tukutendereza Yesu');
  assert.equal(searchSongs(songs, 'wretch')[0].title, 'Amazing Grace', 'finds lyrics');
  const after = removeSong(songs, 'seed-amazing-grace');
  assert.equal(visibleSongs(after).length, SEED_SONGS.length - 1);
  storage.setItem('ls-songs', '[]');
  assert.equal(loadSongs(storage).length, 0, 'deleting every song does not bring the seeds back');

  const a = { ...makeSong({ id: 'x', title: 'Old', text: 'a' }), updatedAt: 1 };
  const b = { ...makeSong({ id: 'x', title: 'New', text: 'a' }), updatedAt: 2 };
  const m = mergeSongs([a], [b]);
  assert.equal(m.songs[0].title, 'New');
  assert.deepEqual(m.push, []);
  assert.deepEqual(mergeSongs([b], [a]).push.map((s) => s.title), ['New']);

  const json = exportLibrary(songs);
  const imp = importLibrary([], json);
  assert.equal(imp.count, SEED_SONGS.length);
  assert.throws(() => importLibrary([], '{"songs":[]}'), /No songs/);
});

test('splitter: measured sizes, and no lone line when a sung line breaks three ways', () => {
  const out = splitLyrics("[Verse 1]\nMukama wange nkutendereza olw'ekisa kyo ekingi ennyo", 'worship', (s) => s.length / 21);
  assert.deepEqual(parseSlides(out).map((s) => s.lines), [
    ['Mukama wange', 'nkutendereza'],
    ["olw'ekisa kyo", 'ekingi ennyo'],
  ]);
  assert.deepEqual(lintSlides(parseSlides('Mukama wange nkutendereza'), 'worship', (s) => s.length / 21), [
    { index: 0, message: '“Mukama wange nkutendereza” is too wide and will wrap on the TV' },
  ]);
});

// ------------------------------------------------------------------ MQTT relay protocol

test('mqtt packets', () => {
  const c = connectPacket('abc', 30);
  assert.deepEqual([...c.slice(0, 2)], [0x10, 15]);
  assert.deepEqual([...c.slice(2, 8)], [0, 4, 77, 81, 84, 84]);
  assert.deepEqual([...c.slice(8, 12)], [4, 2, 0, 30]);
  const sub = subscribePacket(1, ['a/b']);
  assert.deepEqual([...sub], [0x82, 8, 0, 1, 0, 3, 97, 47, 98, 0]);
  const pub = publishPacket('t', 'hi', true);
  assert.deepEqual([...pub], [0x31, 5, 0, 1, 116, 104, 105]);
  const { packets, rest } = parsePackets(new Uint8Array([...pub, 0xd0, 0, 0x30, 9]));
  assert.equal(packets.length, 2);
  assert.deepEqual(parsePublish(packets[0].type, packets[0].body), { topic: 't', payload: 'hi', retain: true });
  assert.deepEqual([...rest], [0x30, 9], 'an unfinished packet waits for more bytes');
  // Long payloads use the multi-byte remaining length.
  const big = publishPacket('t', 'x'.repeat(300));
  assert.deepEqual([...big.slice(1, 3)], [((303 % 128) | 128), Math.floor(303 / 128)]);
  assert.equal(parsePackets(big).packets[0].body.length, 303);
});

class FakeMqttWS {
  static last = null;
  constructor(url, protocols) {
    this.url = url;
    this.protocols = protocols;
    this.sent = [];
    this.readyState = 0;
    FakeMqttWS.last = this;
    queueMicrotask(() => {
      this.readyState = 1;
      this.onopen();
    });
  }
  send(b) {
    this.sent.push(new Uint8Array(b));
  }
  close() {
    this.readyState = 3;
    this.onclose && this.onclose();
  }
  serverSends(bytes) {
    this.onmessage({ data: new Uint8Array(bytes).buffer });
  }
}

test('mqtt client: connects, subscribes, publishes retained state, receives, falls over to the next broker', async () => {
  const got = [];
  const statuses = [];
  const client = new MqttClient({
    urls: ['wss://one/mqtt', 'wss://two/mqtt'],
    topics: ['nrsc/lyric-slides/ABC234/msg', 'nrsc/lyric-slides/ABC234/state'],
    WebSocketImpl: FakeMqttWS,
    onMessage: (t, p, r) => got.push([t, p, r]),
    onStatus: (s) => statuses.push(s),
  });
  await tick();
  const ws = FakeMqttWS.last;
  assert.deepEqual(ws.protocols, ['mqtt']);
  assert.equal(ws.sent[0][0], 0x10, 'CONNECT first');
  ws.serverSends([0x20, 2, 0, 0]);
  assert.equal(ws.sent[1][0], 0x82, 'SUBSCRIBE after CONNACK');
  assert.equal(client.publish('x', 'y'), false, 'not before SUBACK');
  ws.serverSends([0x90, 3, 0, 1, 0]);
  assert.equal(statuses.at(-1), 'joined');
  assert.equal(client.publish('nrsc/lyric-slides/ABC234/state', '{"t":"state"}', true), true);
  assert.equal(ws.sent.at(-1)[0], 0x31, 'retained');
  ws.serverSends([...publishPacket('nrsc/lyric-slides/ABC234/msg', '{"t":"hello"}')]);
  assert.deepEqual(got, [['nrsc/lyric-slides/ABC234/msg', '{"t":"hello"}', false]]);
  // The broker refuses: the client tries again, and after two failures moves to the next broker.
  ws.close();
  await new Promise((r) => setTimeout(r, 600));
  assert.equal(FakeMqttWS.last.url, 'wss://one/mqtt');
  FakeMqttWS.last.close();
  await new Promise((r) => setTimeout(r, 1300));
  assert.equal(FakeMqttWS.last.url, 'wss://two/mqtt');
  client.close();
});

test('link over the MQTT relay: state is retained for a screen that opens later', async () => {
  // The fake broker keeps the retained message and hands it to the next subscriber.
  let retained = null;
  const sockets = [];
  class BrokerWS extends FakeMqttWS {
    constructor(url, protocols) {
      super(url, protocols);
      sockets.push(this);
    }
    send(b) {
      super.send(b);
      const bytes = new Uint8Array(b);
      if (bytes[0] === 0x10) queueMicrotask(() => this.serverSends([0x20, 2, 0, 0]));
      else if (bytes[0] === 0x82) {
        queueMicrotask(() => {
          this.serverSends([0x90, 3, 0, 1, 0]);
          if (retained) this.serverSends([...retained]);
        });
      } else if ((bytes[0] & 0xf0) === 0x30) {
        if (bytes[0] & 1) retained = bytes;
        for (const s of sockets) if (s !== this && s.readyState === 1) queueMicrotask(() => s.serverSends([...bytes]));
      }
    }
  }
  const relay = { kind: 'mqtt', urls: ['wss://fake/mqtt'] };
  const remote = new Link({ room: 'ABC234', role: 'remote', onState: () => {}, relay, BroadcastChannelImpl: null, WebSocketImpl: BrokerWS });
  await tick();
  await tick();
  const s1 = reduce(emptyState(), { type: 'item', item: songItem(makeSong({ title: 'T', text: 'a' })) }, remote.id);
  remote.publish(s1);
  await tick();
  const got = [];
  const screen = new Link({ room: 'ABC234', role: 'screen', onState: (s) => got.push(s), relay, BroadcastChannelImpl: null, WebSocketImpl: BrokerWS });
  await tick();
  await tick();
  assert.equal(got.at(-1).item.title, 'T', 'the screen got the retained state');
  remote.close();
  screen.close();
});

// ------------------------------------------------------------------ media and outputs

test('media items go to the TV, the stream, or both', () => {
  const pic = { id: 'f:a.jpg', title: 'a', type: 'image', src: 'media/a.jpg' };
  const vid = { id: 'u:x', title: 'x', type: 'video', src: 'https://x/v.mp4' };
  const both = mediaItem(pic);
  assert.equal(both.slides.length, 1);
  assert.ok(shownOn(both, 'tv') && shownOn(both, 'stream'));
  const tvOnly = mediaItem([pic, vid], { to: 'tv', loop: true });
  assert.equal(tvOnly.title, '2 pictures');
  assert.ok(shownOn(tvOnly, 'tv'));
  assert.ok(!shownOn(tvOnly, 'stream'));
  assert.ok(shownOn(tvOnly, 'preview'));
  assert.ok(shownOn(songItem(makeSong({ title: 's', text: 'a' })), 'stream'));
});

test('media folder index', () => {
  const index = JSON.parse(fs.readFileSync(new URL('../lyrics/media/index.json', import.meta.url)));
  assert.ok(index.some((f) => f.file === 'welcome.svg' && f.type === 'image'));
});

test('big slides: two words per slide, a pause ends a slide early', () => {
  const out = splitShort('[Chorus]\nAlle alle alleluia, alle alleluia\nSing to the Lord', 2);
  assert.deepEqual(parseSlides(out).map((s) => s.lines[0]), ['Alle alle', 'alleluia,', 'alle alleluia', 'Sing to', 'the Lord']);
  assert.equal(parseSlides(out)[0].label, 'Chorus');
  assert.deepEqual(parseSlides(splitShort('one two three', 1)).map((s) => s.lines[0]), ['one', 'two', 'three']);
});

test('looks: every look has sizes, a known environment, and the override wins', () => {
  for (const p of PRESETS) assert.ok(PRESET_INFO[p].name, p);
  for (const p of PRESETS) if (PRESET_INFO[p].env) assert.ok(BACKGROUNDS.includes(PRESET_INFO[p].env), p);
  const song = { preset: 'sunshine' };
  assert.equal(lookOf(emptyState(), song), 'sunshine');
  assert.equal(lookOf({ ...emptyState(), look: 'poster' }, song), 'poster');
  assert.equal(lookOf({ ...emptyState(), look: 'nonsense' }, song), 'sunshine');
  assert.equal(lookOf(emptyState(), null), 'worship');
});

test('emphasis: tap a word to mark it, tap again to clear, new item clears all', () => {
  const song = makeSong({ title: 'X', text: 'Amazing grace\nhow sweet' });
  let s = reduce(emptyState(), { type: 'item', item: songItem(song) }, 'r');
  const slide = s.item.slides[0];
  assert.deepEqual(slideWords(s.item, slide), [{ field: 'l', label: '', words: ['Amazing', 'grace', 'how', 'sweet'] }]);
  const key = markKey(s.item, 0);
  s = reduce(s, { type: 'mark', slide: key, word: 'l:1', mark: { c: 'gold', b: false } }, 'r');
  assert.deepEqual(s.marks[key], { 'l:1': { c: 'gold', b: false } });
  s = reduce(s, { type: 'mark', slide: key, word: 'l:1', mark: { c: 'gold', b: true } }, 'r');
  assert.deepEqual(s.marks[key]['l:1'], { c: 'gold', b: true }, 'a different pen replaces the mark');
  s = reduce(s, { type: 'mark', slide: key, word: 'l:1', mark: { c: 'gold', b: true } }, 'r');
  assert.deepEqual(s.marks[key], {}, 'the same pen again clears it');
  s = reduce(s, { type: 'mark', slide: key, word: 'l:0', mark: { c: 'teal' } }, 'r');
  s = reduce(s, { type: 'unmark', slide: key }, 'r');
  assert.deepEqual(s.marks, { });
  s = reduce(s, { type: 'mark', slide: key, word: 'l:0', mark: { c: 'teal' } }, 'r');
  s = reduce(s, { type: 'item', item: songItem(song) }, 'r');
  assert.deepEqual(s.marks, {});
  const scrip = { kind: 'scripture', id: 'x', versions: ['Luganda 1968', 'KJV'], secondaryLabel: 'KJV', slides: [{ verses: [{ verse: 1, primary: 'Mukama ye', secondary: 'The LORD is' }, { verse: 2, primary: 'musumba', secondary: 'my shepherd' }] }] };
  assert.deepEqual(slideWords(scrip, scrip.slides[0]).map((g) => [g.field, g.words.length]), [['p', 3], ['s', 5]]);
});

test('cutting wisely: joiners stay with the next word, repeats and closing words stay together', () => {
  const two = (t) => splitAtPauses(t, 2);
  assert.deepEqual(two('Holy holy holy is the Lord God Almighty'), ['Holy holy holy', 'is the Lord God Almighty']);
  for (const piece of two('I will sing of the goodness of God forever')) assert.ok(!/\b(of|the)$/.test(piece), piece);
  assert.deepEqual(wrapLine('Great is thy faithfulness, O God my Father', { target: 22, max: 26 }), ['Great is thy faithfulness,', 'O God my Father']);
  for (const piece of wrapLine('Mukama wange nkutendereza mu bulamu bwange bwonna', { target: 22, max: 26 })) {
    assert.ok(!/\b(mu|nga|ne|ku)$/.test(piece), piece);
  }
  const out = splitLyrics('[Chorus]\nAlleluia alleluia alleluia alleluia alleluia alleluia alleluia alleluia');
  for (const s of parseSlides(out)) assert.ok(s.lines.length <= 2, out);
});
