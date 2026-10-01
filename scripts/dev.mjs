// Local server: static pages + the /api functions, like Vercel.
//   npm run dev    → uses SUPABASE_URL / SUPABASE_SERVICE_KEY / ADMIN_PIN from .env (or the environment)
//   npm run demo   → no accounts needed: an in-memory database with a few example songs, PIN "demo"
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const PORT = Number(process.env.PORT || 3000);
const demo = process.argv.includes('--demo');

if (existsSync(join(ROOT, '.env'))) {
  for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

if (demo) {
  const { createFakeSupabase } = await import('../test/fake-supabase.mjs');
  const fake = await createFakeSupabase();
  const realFetch = globalThis.fetch;
  globalThis.fetch = (url, init) => (String(url).startsWith(fake.url) ? fake.fetch(url, init) : realFetch(url, init));
  Object.assign(process.env, { SUPABASE_URL: fake.url, SUPABASE_SERVICE_KEY: fake.key, ADMIN_PIN: process.env.ADMIN_PIN || 'demo' });
  await seedDemo(fake.db);
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    const api = url.pathname.match(/^\/api\/([a-z]+)$/);
    if (api) {
      const file = join(ROOT, 'api', api[1] + '.js');
      if (!existsSync(file)) { res.statusCode = 404; return res.end('{"error":"not_found"}'); }
      const mod = await import(file);
      return await mod.default(req, res);
    }
    let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    if (path === '/') path = '/index.html';
    const file = join(ROOT, path);
    if (!file.startsWith(ROOT) || /\/(api|test|scripts|node_modules|\.)/.test(path) && !path.startsWith('/api/')) throw Object.assign(new Error(), { code: 'ENOENT' });
    const body = await readFile(file);
    res.setHeader('content-type', TYPES[extname(file)] || 'application/octet-stream');
    res.end(body);
  } catch (e) {
    res.statusCode = e.code === 'ENOENT' ? 404 : 500;
    res.end(e.code === 'ENOENT' ? 'Not found' : String(e.stack || e));
  }
}).listen(PORT, () => {
  console.log(`NRSC Worship on http://localhost:${PORT}` + (demo ? `  (demo data, admin PIN "${process.env.ADMIN_PIN}")` : ''));
});

async function seedDemo(db) {
  const songs = [
    ['Tukutendereza Yesu', 'We praise you Jesus', 'both', 'praise', 'G', ['Glory of God', 'Salvation', 'Revival'],
      'Tukutendereza Yesu,\nYesu Omwana gw\'endiga,\nOmusaayi gwo gunaazizza,\nNkwebaza Omulokozi.',
      'We praise you Jesus,\nJesus the Lamb of God,\nYour blood has cleansed me,\nI thank you, Saviour.'],
    ['Amazing Grace', null, 'english', 'worship', 'G', ['Love of God', 'Salvation'], null,
      'Amazing grace! How sweet the sound\nThat saved a wretch like me!\nI once was lost, but now am found;\nWas blind, but now I see.'],
    ['To God Be the Glory', null, 'english', 'praise', 'Ab', ['Glory of God', 'Praise & Victory'], null,
      'To God be the glory, great things He hath done,\nSo loved He the world that He gave us His Son,\nWho yielded His life an atonement for sin,\nAnd opened the life gate that all may go in.'],
    ['What a Friend We Have in Jesus', null, 'english', 'worship', 'F', ['Prayer', 'Love of God'], null,
      'What a friend we have in Jesus,\nAll our sins and griefs to bear!\nWhat a privilege to carry\nEverything to God in prayer!'],
    ['Blessed Assurance', null, 'english', 'praise', 'D', ['Faith', 'Thanksgiving'], null,
      'Blessed assurance, Jesus is mine!\nO what a foretaste of glory divine!\nHeir of salvation, purchase of God,\nBorn of His Spirit, washed in His blood.'],
    ['Holy, Holy, Holy', null, 'english', 'worship', 'D', ['Glory of God'], null,
      'Holy, holy, holy! Lord God Almighty!\nEarly in the morning our song shall rise to Thee;\nHoly, holy, holy! Merciful and mighty!\nGod in three Persons, blessed Trinity!'],
  ];
  for (const [title, alt, language, session, key, themes, lg, en] of songs) {
    await db.query(`select public.save_song($1)`, [JSON.stringify({
      title, title_alt: alt, language, session, song_key: key, lyrics_luganda: lg, lyrics_english: en,
      theme_ids: (await db.query(`select id from public.themes where name = any($1)`, [themes])).rows.map((r) => r.id),
    })]);
  }
}
