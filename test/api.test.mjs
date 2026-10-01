import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeSupabase } from './fake-supabase.mjs';
import songs from '../api/songs.js';
import themes from '../api/themes.js';
import sets from '../api/sets.js';
import admin from '../api/admin.js';
import health from '../api/health.js';

// Calls a handler the way Vercel does (Node req/res) and returns { status, body, headers }.
async function call(handler, { method = 'GET', url = '/', headers = {}, body } = {}) {
  const req = { method, url, headers: Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])), body };
  const out = { headers: {} };
  const res = {
    statusCode: 200,
    setHeader(k, v) { out.headers[k.toLowerCase()] = v; },
    end(text) { out.text = text; },
  };
  await handler(req, res);
  return { status: res.statusCode, body: out.text ? JSON.parse(out.text) : null, headers: out.headers };
}

const PIN = 'Mukama';
const asAdmin = (body) => ({ method: 'POST', headers: { 'x-admin-pin': PIN }, body });

let fake;
const realFetch = globalThis.fetch;

function useEnv(env) {
  for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'ADMIN_PIN']) delete process.env[k];
  Object.assign(process.env, env);
}

before(async () => {
  fake = await createFakeSupabase();
  globalThis.fetch = fake.fetch;
});
after(async () => {
  globalThis.fetch = realFetch;
  await fake.close();
});
beforeEach(async () => {
  useEnv({ SUPABASE_URL: fake.url, SUPABASE_SERVICE_KEY: fake.key, ADMIN_PIN: PIN });
  await fake.db.exec('truncate public.set_list_songs, public.set_lists, public.song_themes, public.songs restart identity cascade');
});

async function themeId(name) {
  const r = await call(themes);
  return r.body.themes.find((t) => t.name === name).id;
}

// ---------------------------------------------------------------- setup errors in plain language

test('missing Supabase settings → 503 no_db with what to do', async () => {
  useEnv({ ADMIN_PIN: PIN });
  const r = await call(songs);
  assert.equal(r.status, 503);
  assert.equal(r.body.error, 'no_db');
  assert.match(r.body.message, /SUPABASE_URL and SUPABASE_SERVICE_KEY/);
});

test('tables not created yet → 503 no_tables pointing at the migration', async () => {
  const empty = await createFakeSupabase({ migrate: false });
  globalThis.fetch = empty.fetch;
  try {
    const r = await call(themes);
    assert.equal(r.status, 503);
    assert.equal(r.body.error, 'no_tables');
    assert.match(r.body.message, /0001_init\.sql/);
  } finally {
    globalThis.fetch = fake.fetch;
    await empty.close();
  }
});

test('wrong service key → 503 bad_key', async () => {
  useEnv({ SUPABASE_URL: fake.url, SUPABASE_SERVICE_KEY: 'wrong', ADMIN_PIN: PIN });
  const r = await call(songs);
  assert.equal(r.body.error, 'bad_key');
  assert.match(r.body.message, /service_role/);
});

test('health lists each check', async () => {
  const ok = await call(health);
  assert.equal(ok.body.ok, true);
  useEnv({ SUPABASE_URL: fake.url, SUPABASE_SERVICE_KEY: fake.key });
  const noPin = await call(health);
  assert.equal(noPin.body.ok, false);
  assert.match(noPin.body.checks.find((c) => !c.ok).message, /ADMIN_PIN/);
});

// ---------------------------------------------------------------- admin PIN

test('admin needs ADMIN_PIN set, and the right PIN (letters allowed, spaces trimmed)', async () => {
  useEnv({ SUPABASE_URL: fake.url, SUPABASE_SERVICE_KEY: fake.key });
  assert.equal((await call(admin)).body.error, 'no_pin');
  useEnv({ SUPABASE_URL: fake.url, SUPABASE_SERVICE_KEY: fake.key, ADMIN_PIN: ' Mukama\n' });
  assert.equal((await call(admin, { headers: { 'x-admin-pin': 'wrong' } })).status, 401);
  assert.equal((await call(admin)).status, 401);
  const ok = await call(admin, { headers: { 'x-admin-pin': 'Mukama' } });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body.usage, {});
});

// ---------------------------------------------------------------- songs

test('save a song with themes, list it, open it, search its lyrics', async () => {
  const glory = await themeId('Glory of God');
  const prayer = await themeId('Prayer');
  const saved = await call(admin, asAdmin({
    action: 'song.save',
    song: { title: 'Tukutendereza Yesu', session: 'praise', language: 'both', song_key: 'g',
      lyrics_luganda: 'Tukutendereza Yesu\nYesu Omwana gw\'endiga', lyrics_english: 'We praise you Jesus', youtube_url: 'youtu.be/xyz' },
    theme_ids: [glory, prayer, 9999],
  }));
  assert.equal(saved.status, 200);
  const id = saved.body.song.id;
  assert.deepEqual(saved.body.song.themes.map((t) => t.name), ['Glory of God', 'Prayer']);
  assert.equal(saved.body.song.song_key, 'G');
  assert.equal(saved.body.song.youtube_url, 'https://youtu.be/xyz');

  const list = await call(songs);
  assert.equal(list.status, 200);
  assert.match(list.headers['cache-control'], /s-maxage/);
  assert.equal(list.body.songs.length, 1);
  assert.equal(list.body.songs[0].lyrics_luganda, undefined); // the list stays small
  assert.equal(list.body.songs[0].has_english, true);
  assert.deepEqual(list.body.songs[0].theme_ids.sort(), [glory, prayer].sort());

  const one = await call(songs, { url: `/api/songs?id=${id}` });
  assert.equal(one.body.song.lyrics_english, 'We praise you Jesus');

  const hit = await call(songs, { url: '/api/songs?q=omwana' });
  assert.deepEqual(hit.body.matches.map((m) => [m.id, m.match]), [[id, 'luganda']]);
  assert.match(hit.body.matches[0].snippet, /Omwana/);

  assert.equal((await call(songs, { url: '/api/songs?id=999' })).status, 404);
});

test('song form errors come back per field; edit and delete work', async () => {
  const bad = await call(admin, asAdmin({ action: 'song.save', song: { title: '', session: 'medium', tempo_bpm: 'fast' } }));
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error, 'invalid');
  assert.ok(bad.body.fields.title && bad.body.fields.session && bad.body.fields.tempo_bpm);

  const a = await call(admin, asAdmin({ action: 'song.save', song: { title: 'Nkwagala', session: 'worship' }, theme_ids: [] }));
  const id = a.body.song.id;
  const edited = await call(admin, asAdmin({ action: 'song.save', song: { id, title: 'Nkwagala Nnyo', session: 'worship' }, theme_ids: [] }));
  assert.equal(edited.body.song.title, 'Nkwagala Nnyo');
  const missing = await call(admin, asAdmin({ action: 'song.save', song: { id: 4242, title: 'Ghost', session: 'praise' } }));
  assert.equal(missing.status, 404);
  assert.deepEqual((await call(admin, asAdmin({ action: 'song.delete', id }))).body, { deleted: true });
  assert.equal((await call(songs)).body.songs.length, 0);
});

// ---------------------------------------------------------------- themes

test('themes: add, refuse duplicates, rename, delete', async () => {
  const t = await call(admin, asAdmin({ action: 'theme.save', theme: { name: 'Joy', description: 'Rejoicing songs' } }));
  assert.equal(t.status, 200);
  const dup = await call(admin, asAdmin({ action: 'theme.save', theme: { name: 'joy' } }));
  assert.equal(dup.status, 409);
  assert.match(dup.body.message, /already exists/);
  const renamed = await call(admin, asAdmin({ action: 'theme.save', theme: { id: t.body.theme.id, name: 'Joy of the Lord' } }));
  assert.equal(renamed.body.theme.name, 'Joy of the Lord');
  await call(admin, asAdmin({ action: 'theme.delete', id: t.body.theme.id }));
  const names = (await call(themes)).body.themes.map((x) => x.name);
  assert.equal(names.length, 9);
  assert.ok(names.includes('Praise & Victory'));
});

// ---------------------------------------------------------------- set lists

test('set list: saved in the given order per section, public page and usage', async () => {
  const mk = async (title, session) => (await call(admin, asAdmin({ action: 'song.save', song: { title, session }, theme_ids: [] }))).body.song.id;
  const p1 = await mk('Praise One', 'praise');
  const p2 = await mk('Praise Two', 'praise');
  const w1 = await mk('Worship One', 'worship');
  const prayer = await themeId('Prayer');

  const bad = await call(admin, asAdmin({ action: 'set.save', set: { service_date: 'Sunday' }, items: [] }));
  assert.equal(bad.status, 400);
  assert.ok(bad.body.fields.service_date);

  const saved = await call(admin, asAdmin({
    action: 'set.save',
    set: { service_date: '2026-10-04', theme_id: prayer, leader_name: 'Ruth' },
    items: [
      { song_id: w1, section: 'worship' }, { song_id: p2, section: 'praise' },
      { song_id: p1, section: 'praise' }, { song_id: 77, section: 'praise' }, { song_id: p1, section: 'bogus' },
    ],
  }));
  assert.equal(saved.status, 200);
  const id = saved.body.set.id;
  const pub = await call(sets, { url: `/api/sets?id=${id}` });
  assert.equal(pub.body.set.theme.name, 'Prayer');
  assert.deepEqual(pub.body.set.items.map((i) => [i.section, i.position, i.song.title]), [
    ['praise', 1, 'Praise Two'], ['praise', 2, 'Praise One'], ['worship', 1, 'Worship One'],
  ]);

  // Reorder and save again: replaces the songs atomically.
  await call(admin, asAdmin({ action: 'set.save', set: { id, service_date: '2026-10-04', theme_id: prayer },
    items: [{ song_id: p1, section: 'praise' }, { song_id: p2, section: 'praise' }] }));
  const again = await call(sets, { url: `/api/sets?id=${id}` });
  assert.deepEqual(again.body.set.items.map((i) => i.song.title), ['Praise One', 'Praise Two']);

  const list = await call(sets);
  assert.equal(list.body.sets[0].praise_count, 2);

  const usage = await call(admin, { headers: { 'x-admin-pin': PIN } });
  assert.equal(usage.body.usage[p1], '2026-10-04');

  await call(admin, asAdmin({ action: 'set.delete', id }));
  assert.equal((await call(sets, { url: `/api/sets?id=${id}` })).status, 404);
});

// ---------------------------------------------------------------- bulk import

test('bulk import: preview flags problems and existing songs; commit skips or updates', async () => {
  await call(admin, asAdmin({ action: 'song.save', song: { title: 'Existing Song', session: 'praise' }, theme_ids: [] }));
  const csv = [
    'title,session,key,themes,luganda',
    'Existing Song,praise,A,Prayer,Ebigambo ebipya',
    'Brand New,worship,D,"Prayer; Holy Spirit",Mwoyo',
    ',praise,,,',
    'Bad Tempo,praise,,,x',
  ].join('\n') + '\n"Bad Tempo 2",fast,,,y';
  const preview = await call(admin, asAdmin({ action: 'import.preview', text: csv }));
  assert.equal(preview.status, 200);
  assert.equal(preview.body.format, 'csv');
  assert.deepEqual(preview.body.summary, { total: 5, ready: 3, existing: 1, with_errors: 1 });
  assert.equal(preview.body.rows[0].exists, true);
  assert.match(preview.body.rows[2].errors[0], /title/);

  const skip = await call(admin, asAdmin({ action: 'import.commit', text: csv, mode: 'skip' }));
  assert.deepEqual(skip.body, { created: 3, updated: 0, skipped: ['Existing Song'], not_imported: 1 });

  const upd = await call(admin, asAdmin({ action: 'import.commit', text: csv, mode: 'update' }));
  assert.equal(upd.body.updated, 4);
  const all = (await call(songs)).body.songs;
  const existing = all.find((s) => s.title === 'Existing Song');
  assert.equal(existing.song_key, 'A');
  assert.equal(existing.has_luganda, true);
  assert.equal(existing.theme_ids.length, 1);

  const empty = await call(admin, asAdmin({ action: 'import.preview', text: '   ' }));
  assert.equal(empty.status, 400);
});

test('unknown admin action and wrong methods are refused politely', async () => {
  assert.equal((await call(admin, asAdmin({ action: 'drop.tables' }))).body.error, 'bad_action');
  assert.equal((await call(songs, { method: 'DELETE' })).status, 405);
});
