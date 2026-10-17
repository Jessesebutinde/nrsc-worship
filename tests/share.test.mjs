import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSong, mergeSongs, removeSong, upsertSong, loadSongs, visibleSongs } from '../src/lyrics/library.js';
import { SEED_SONGS } from '../src/lyrics/seed.js';
import {
  pack,
  unpack,
  findGist,
  createGist,
  readGist,
  syncSongs,
  connectShare,
  setupLink,
  readSetupLink,
  shareConfig,
  saveShareConfig,
  isSharing,
  GIST_DESC,
  GIST_FILE,
  TOKEN_URL,
} from '../src/lyrics/share.js';

const TOKEN = 'ghp_' + 'a'.repeat(36);

/** An in-memory GitHub: gists for one account, answering the calls share.js makes. */
function fakeGitHub({ pageSize = 100, truncateOver = Infinity, token = TOKEN, noScope = 'ghp_' + 'n'.repeat(36) } = {}) {
  const gists = [];
  const log = [];
  let n = 0;
  const reply = (status, body = {}, headers = {}) => ({ ok: status < 300, status, headers: { get: (k) => headers[k.toLowerCase()] ?? null }, json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method || 'GET';
    const auth = init.headers && init.headers.Authorization;
    log.push(`${method} ${u.pathname}${u.search.replace(/[?&]_=\d+/, '')}`);
    if (u.hostname === 'gist.githubusercontent.com') {
      const g = gists.find((x) => x.id === u.pathname.split('/')[2]);
      return reply(200, g.files[GIST_FILE].content);
    }
    if (auth !== `Bearer ${token}` && auth !== `Bearer ${noScope}`) return reply(401, { message: 'Bad credentials' });
    const body = init.body ? JSON.parse(init.body) : null;
    if (u.pathname === '/gists' && method === 'GET') {
      const page = Number(u.searchParams.get('page') || 1);
      const per = Math.min(pageSize, Number(u.searchParams.get('per_page') || 30));
      return reply(200, gists.slice((page - 1) * per, page * per).map((g) => ({ id: g.id, description: g.description, created_at: g.created_at, files: Object.fromEntries(Object.entries(g.files).map(([k, v]) => [k, { filename: k, size: (v.content || '').length }])) })));
    }
    if (u.pathname === '/gists' && method === 'POST') {
      if (auth === `Bearer ${noScope}`) return reply(404, { message: 'Not Found' });
      const g = { id: `g${(++n).toString(16).padStart(8, '0')}`, description: body.description, public: body.public, created_at: `2026-01-0${n}T00:00:00Z`, files: body.files };
      gists.push(g);
      return reply(201, { id: g.id, files: g.files });
    }
    const m = u.pathname.match(/^\/gists\/(\w+)$/);
    const g = m && gists.find((x) => x.id === m[1]);
    if (!g) return reply(404, { message: 'Not Found' });
    if (method === 'GET') {
      if (!g.files[GIST_FILE]) return reply(200, { id: g.id, files: g.files });
      const c = g.files[GIST_FILE].content;
      const big = c.length > truncateOver;
      return reply(200, { id: g.id, files: { [GIST_FILE]: big ? { filename: GIST_FILE, truncated: true, content: c.slice(0, 10), raw_url: `https://gist.githubusercontent.com/me/${g.id}/raw/abc/${GIST_FILE}` } : { filename: GIST_FILE, content: c } } });
    }
    if (method === 'PATCH') {
      g.files[GIST_FILE] = { content: body.files[GIST_FILE].content };
      return reply(200, { id: g.id });
    }
    if (method === 'DELETE') {
      gists.splice(gists.indexOf(g), 1);
      return reply(204);
    }
    return reply(405);
  };
  return { fetchImpl, gists, log, writes: () => log.filter((l) => l.startsWith('PATCH') || l.startsWith('POST')).length };
}

const song = (id, title, text, updatedAt, extra = {}) => ({ ...makeSong({ id, title, text }), updatedAt, ...extra });

test('only the lyrics travel; slides are cut again on arrival and a deleted song keeps no text', () => {
  const a = song('a', 'Amazing', '[Verse]\nAmazing grace,\nhow sweet\n\nthe sound', 5, { language: 'mixed', preset: 'poster', tags: ['hymn'] });
  const gone = { ...removeSong([a], 'a')[0], updatedAt: 9 };
  const packed = JSON.parse(pack([a, gone, song('b', 'B', 'one line', 3)]));
  assert.equal(packed.songs[0].slides, undefined, 'no slides in the file');
  assert.equal(packed.songs[1].text, '', 'a deleted song keeps no text');
  const back = unpack(pack([a]));
  assert.deepEqual(back[0], { ...a, deleted: false }, 'the same song comes back, slides and all');
  assert.equal(unpack(pack([gone]))[0].deleted, true);
  assert.deepEqual(unpack(pack([gone]))[0].slides, []);
  assert.throws(() => unpack('not json'), /could not be read/);
  assert.throws(() => unpack('{"songs":5}'), /could not be read/);
  assert.equal(unpack('[{"id":"x","title":"T","text":"hi","updatedAt":"7"},{"title":"no id"},null]').length, 1, 'rows without an id are skipped');
});

test('the first laptop starts the library from its songs; the second finds it and receives them', async () => {
  const gh = fakeGitHub();
  const A = [song('a1', 'Tukutendereza', 'Tukutendereza Yesu', 10), song('a2', 'Grace', 'Amazing grace', 20)];
  const a = await connectShare(TOKEN, A, gh.fetchImpl);
  assert.equal(a.created, true);
  assert.equal(gh.gists.length, 1);
  assert.equal(gh.gists[0].public, false, 'a secret gist');
  assert.equal(gh.gists[0].description, GIST_DESC);
  assert.equal(a.pulled, 0);
  assert.equal(a.pushed, 0, 'it was created with the songs already in it');

  const b = await connectShare(TOKEN, [], gh.fetchImpl);
  assert.equal(b.created, false);
  assert.equal(gh.gists.length, 1, 'no second library');
  assert.equal(b.cfg.gistId, a.cfg.gistId);
  assert.deepEqual(b.songs.map((s) => s.title).sort(), ['Grace', 'Tukutendereza']);
  assert.equal(b.pulled, 2);
  assert.ok(b.songs.every((s) => s.slides.length >= 1), 'slides are cut on this laptop');
});

test('a song saved on one laptop reaches the others; the newest edit wins; a deletion spreads', async () => {
  const gh = fakeGitHub();
  let A = [song('s1', 'One', 'first words', 10)];
  const cfgA = (await connectShare(TOKEN, A, gh.fetchImpl)).cfg;
  let B = (await connectShare(TOKEN, [], gh.fetchImpl)).songs;
  const cfgB = { token: TOKEN, gistId: cfgA.gistId };

  // A enters a new song and edits One.
  A = upsertSong(A, song('s2', 'Two', 'second song', 0));
  A = A.map((s) => (s.id === 's1' ? { ...s, text: 'first words, better', slides: s.slides, updatedAt: Date.now() + 1000 } : s));
  const sa = await syncSongs(A, cfgA, gh.fetchImpl);
  assert.equal(sa.pushed, 2);
  A = sa.songs;

  const sb = await syncSongs(B, cfgB, gh.fetchImpl);
  assert.equal(sb.pulled, 2);
  assert.deepEqual(visibleSongs(sb.songs).map((s) => s.title), ['One', 'Two']);
  assert.equal(sb.songs.find((s) => s.id === 's1').text, 'first words, better');
  B = sb.songs;

  // B deletes Two; A sees it vanish.
  B = removeSong(B, 's2');
  await syncSongs(B, cfgB, gh.fetchImpl);
  const sa2 = await syncSongs(A, cfgA, gh.fetchImpl);
  assert.deepEqual(visibleSongs(sa2.songs).map((s) => s.title), ['One']);

  // Both edit the same song: whoever saved last wins, on both laptops.
  const t = Date.now() + 5000;
  const a3 = sa2.songs.map((s) => (s.id === 's1' ? { ...s, title: 'One (A)', updatedAt: t } : s));
  const b3 = B.map((s) => (s.id === 's1' ? { ...s, title: 'One (B)', updatedAt: t + 10 } : s));
  await syncSongs(a3, cfgA, gh.fetchImpl);
  const fromB = await syncSongs(b3, cfgB, gh.fetchImpl);
  const fromA = await syncSongs(a3, cfgA, gh.fetchImpl);
  assert.equal(fromB.songs.find((s) => s.id === 's1').title, 'One (B)');
  assert.equal(fromA.songs.find((s) => s.id === 's1').title, 'One (B)');
});

test('nothing is written when nothing changed, and nothing is ever lost when both laptops added songs', async () => {
  const gh = fakeGitHub();
  const A = [song('a', 'Alpha', 'aaa', 10)];
  const { cfg } = await connectShare(TOKEN, A, gh.fetchImpl);
  const before = gh.writes();
  const again = await syncSongs(A, cfg, gh.fetchImpl);
  assert.deepEqual([again.pulled, again.pushed], [0, 0]);
  assert.equal(gh.writes(), before, 'no write when in step');
  // Each laptop added a different song while apart.
  const B = [song('b', 'Beta', 'bbb', 11)];
  const sb = await syncSongs(B, cfg, gh.fetchImpl);
  assert.deepEqual(sb.songs.map((s) => s.id).sort(), ['a', 'b']);
  assert.deepEqual([sb.pulled, sb.pushed], [1, 1]);
  const sa = await syncSongs(A, cfg, gh.fetchImpl);
  assert.deepEqual(sa.songs.map((s) => s.id).sort(), ['a', 'b']);
});

test('the starter songs never beat an edit made on another laptop', async () => {
  const mem = new Map();
  const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const fresh = loadSongs(storage);
  assert.ok(fresh.length === SEED_SONGS.length && fresh.every((s) => s.updatedAt === 0), 'seeded as the oldest');
  const edited = { ...fresh.find((s) => s.id === 'seed-amazing-grace'), title: 'Amazing Grace (our words)', updatedAt: Date.now() };
  const gh = fakeGitHub();
  const { cfg } = await connectShare(TOKEN, [edited], gh.fetchImpl);
  const onB = await syncSongs(fresh, cfg, gh.fetchImpl);
  assert.equal(onB.songs.find((s) => s.id === 'seed-amazing-grace').title, 'Amazing Grace (our words)');
  assert.equal(onB.songs.filter((s) => s.id.startsWith('seed-')).length, SEED_SONGS.length, 'the starter songs are not doubled');
});

test('several libraries (laptops that started at the same moment) settle on the oldest', async () => {
  const gh = fakeGitHub();
  const mk = (id, created) => ({ id, description: GIST_DESC, public: false, created_at: created, files: { [GIST_FILE]: { content: pack([song(id, id, 'x', 1)]) } } });
  gh.gists.push(mk('b0000002', '2026-02-02T00:00:00Z'), mk('a0000001', '2026-01-01T00:00:00Z'), { id: 'c0000003', description: 'something else', created_at: '2025-01-01T00:00:00Z', files: { 'x.txt': { content: '' } } });
  assert.equal(await findGist(TOKEN, gh.fetchImpl), 'a0000001');
  // A laptop that made its own while another did the same: it keeps the older and tidies its own away.
  const gh2 = fakeGitHub();
  const orig = gh2.fetchImpl;
  let raced = false;
  gh2.fetchImpl = async (url, init) => {
    const r = await orig(url, init);
    if (!raced && (init.method || 'GET') === 'POST') {
      raced = true;
      gh2.gists.unshift({ id: 'a0000009', description: GIST_DESC, public: false, created_at: '2025-12-31T00:00:00Z', files: { [GIST_FILE]: { content: pack([song('z', 'Z', 'zz', 2)]) } } });
    }
    return r;
  };
  const r = await connectShare(TOKEN, [song('m', 'Mine', 'mm', 3)], gh2.fetchImpl);
  assert.equal(r.cfg.gistId, 'a0000009');
  assert.equal(r.created, false);
  assert.equal(gh2.gists.length, 1, 'its own was deleted');
  assert.deepEqual(r.songs.map((s) => s.id).sort(), ['m', 'z'], 'its songs were not lost');
  assert.equal(JSON.parse(gh2.gists[0].files[GIST_FILE].content).songs.length, 2);
});

test('many gists across pages, and a big file read in full from its raw address', async () => {
  const gh = fakeGitHub({ pageSize: 2, truncateOver: 50 });
  for (let i = 0; i < 5; i++) gh.gists.push({ id: `d000000${i}`, description: 'other', created_at: `2024-0${i + 1}-01T00:00:00Z`, files: { 'n.txt': { content: '' } } });
  const songs = Array.from({ length: 30 }, (_, i) => song(`k${i}`, `Song ${i}`, `line ${i}`, i + 1));
  const { cfg, created } = await connectShare(TOKEN, songs, gh.fetchImpl);
  assert.equal(created, true);
  assert.equal(gh.log.filter((l) => l.startsWith('GET /gists?per_page=100&page=')).length >= 2, true, 'it went through the pages');
  const read = await readGist(TOKEN, cfg.gistId, gh.fetchImpl);
  assert.equal(read.length, 30, 'a truncated file is read in full');
  assert.ok(gh.log.some((l) => l.includes('gist.githubusercontent.com') || l.includes('/raw/')), 'from the raw address');
});

test('problems are said plainly: bad token, no gist permission, offline, rate limit, a gist that is gone', async () => {
  const gh = fakeGitHub();
  await assert.rejects(() => connectShare('ghp_' + 'x'.repeat(36), [], gh.fetchImpl), (e) => e.status === 401 && /did not accept that token/.test(e.message));
  await assert.rejects(() => createGist('ghp_' + 'n'.repeat(36), [], gh.fetchImpl), (e) => e.status === 403 && /"gist" box/.test(e.message));
  await assert.rejects(() => findGist(TOKEN, async () => { throw new TypeError('Failed to fetch'); }), /Could not reach GitHub/);
  const limited = async () => ({ ok: false, status: 403, headers: { get: (k) => (k.toLowerCase() === 'x-ratelimit-remaining' ? '0' : null) }, json: async () => ({}) });
  await assert.rejects(() => findGist(TOKEN, limited), (e) => e.status === 429 && /limiting requests/.test(e.message));
  await assert.rejects(() => syncSongs([], { token: TOKEN, gistId: 'deadbeef' }, gh.fetchImpl), (e) => e.status === 404);
  gh.gists.push({ id: 'e0000001', description: GIST_DESC, created_at: '2026-01-01T00:00:00Z', files: { 'other.txt': { content: '' } } });
  await assert.rejects(() => readGist(TOKEN, 'e0000001', gh.fetchImpl), /missing from that gist/);
});

test('the token travels only in the header, never in the address; GETs carry a changing query', async () => {
  const gh = fakeGitHub();
  const urls = [];
  const spy = async (u, i) => (urls.push([u, i && i.headers && i.headers.Authorization]), gh.fetchImpl(u, i));
  await connectShare(TOKEN, [song('a', 'A', 'a', 1)], spy);
  assert.ok(urls.every(([u]) => !u.includes(TOKEN)), 'not in any address');
  assert.ok(urls.every(([, a]) => a === `Bearer ${TOKEN}`));
  assert.ok(urls.filter(([u]) => /\/gists\?/.test(u)).every(([u]) => /[?&]_=\d+/.test(u)));
});

test('a setup link carries the token and the library to another laptop, and nothing else is accepted', () => {
  const cfg = { token: TOKEN, gistId: 'a1b2c3d4e5f6a7b8c9d0' };
  const link = setupLink(cfg, 'https://jessesebutinde.github.io/nrsc-worship/lyrics/?x=1#old');
  assert.match(link, /^https:\/\/jessesebutinde\.github\.io\/nrsc-worship\/lyrics\/\?x=1#share=[A-Za-z0-9_-]+$/);
  assert.deepEqual(readSetupLink(new URL(link).hash), cfg);
  for (const bad of ['', '#', '#share=', '#share=!!!', '#share=' + btoa('{"t":"short","g":"zz"}'), '#share=' + btoa('nope'), '#access_token=abc']) assert.equal(readSetupLink(bad), null, bad);
  assert.match(TOKEN_URL, /scopes=gist&description=/);
});

test('this laptop remembers its setup, and forgets it', () => {
  const mem = new Map();
  const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  assert.deepEqual(shareConfig(storage), { token: '', gistId: '' });
  assert.equal(isSharing(shareConfig(storage)), false);
  saveShareConfig({ token: TOKEN, gistId: 'abc12345' }, storage);
  assert.deepEqual(shareConfig(storage), { token: TOKEN, gistId: 'abc12345' });
  assert.equal(isSharing(shareConfig(storage)), true);
  saveShareConfig({ token: '', gistId: '' }, storage);
  assert.equal(mem.size, 0);
  mem.set('ls-share', '{broken');
  assert.deepEqual(shareConfig(storage), { token: '', gistId: '' });
});
