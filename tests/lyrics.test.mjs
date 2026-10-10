import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseRef, findBook, formatRef, bookByCode, BOOKS } from '../src/lyrics/books.js';
import { parseBibleText, verseSlides, passageItem, LIMITS } from '../src/lyrics/bible.js';
import { parseSlides, formatSlides, splitLyrics, lintSlides, wrapLine, splitAtPauses, labelOf } from '../src/lyrics/split.js';
import { Dictionary, checkText, applyFix, wordsOf, distance } from '../src/lyrics/spell.js';
import { emptyState, reduce, newer, songItem } from '../src/lyrics/state.js';
import { Link, normalizeCode, newCode, CODE_ALPHABET } from '../src/lyrics/link.js';
import { RealtimeChannel } from '../src/lyrics/realtime.js';
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

test('a long verse splits into a / b in both languages', () => {
  const book = findBook('Psalm');
  const lg =
    "Era newakubadde nga ntambulira mu kiwonvu eky'ekisiikirize eky'olumbe, Siritya kabi konna; kubanga ggwe oli nange: Oluga lwo n'omuggo gwo bye binsanyusa.";
  const en =
    'Yea, though I walk through the valley of the shadow of death, I will fear no evil: for thou art with me; thy rod and thy staff they comfort me.';
  const slides = verseSlides({ book, chapter: 23, verse: 4, primary: lg, secondary: en });
  assert.equal(slides.length, 2);
  assert.deepEqual(slides.map((s) => s.ref), ['Zabbuli 23 : 4a · Psalm 23 : 4a', 'Zabbuli 23 : 4b · Psalm 23 : 4b']);
  assert.equal(slides.map((s) => s.primary).join(' '), lg);
  assert.equal(slides.map((s) => s.secondary).join(' '), en);
  for (const s of slides) {
    assert.ok(s.primary.length <= LIMITS.primary, s.primary);
    assert.ok(s.secondary.length <= LIMITS.secondary, s.secondary);
  }
  assert.match(slides[0].primary, /[,;:]$/, 'split at a pause');

  const short = verseSlides({ book, chapter: 23, verse: 1, primary: 'Mukama ye musumba wange; seetaagenga:', secondary: 'The LORD is my shepherd' });
  assert.equal(short.length, 1);
  assert.equal(short[0].ref, 'Zabbuli 23 : 1 · Psalm 23 : 1');
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
  const whole = await passageItem({ ref: parseRef('Psalm 117'), primaryId: 'kjv', secondaryId: '', fetchImpl });
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
  // A chorus keeps a lone last line on the slide before.
  const chorus = parseSlides(splitLyrics(raw)).filter((s) => s.label === 'Chorus');
  assert.deepEqual(chorus.map((s) => s.lines.length), [2, 3]);
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
  assert.deepEqual(lint.map((l) => l.index), [0, 2]);
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
