// A stand-in for Supabase's REST API, backed by PGlite (real Postgres compiled to WASM)
// running the real migration. Only the part the app uses: POST /rest/v1/rpc/<function>.
// Used by the tests and by `npm run demo`.
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';

const MIGRATIONS = new URL('../supabase/migrations/', import.meta.url);

export async function createFakeSupabase({ key = 'test-service-key', migrate = true } = {}) {
  const db = new PGlite({ extensions: { pg_trgm } });
  // The API roles Supabase has, so the grants in the migration run as they would there.
  await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin;`);
  if (migrate) await runMigrations(db);

  async function fetchImpl(url, init = {}) {
    const u = new URL(String(url));
    const headers = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    if (headers.apikey !== key || headers.authorization !== 'Bearer ' + key) {
      return respond(401, { message: 'Invalid API key', hint: 'Double check your Supabase `anon` or `service_role` API key.' });
    }
    const m = u.pathname.match(/^\/rest\/v1\/rpc\/([a-z_]+)$/);
    if (!m || (init.method || 'GET') !== 'POST') return respond(404, { message: 'not found' });
    const fn = m[1];
    const exists = await db.query(`select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                   where n.nspname = 'public' and p.proname = $1`, [fn]);
    if (!exists.rows.length) {
      return respond(404, { code: 'PGRST202', message: `Could not find the function public.${fn} in the schema cache` });
    }
    const args = init.body ? JSON.parse(init.body) : {};
    const names = Object.keys(args);
    const params = names.map((n) => {
      const v = args[n];
      return v !== null && typeof v === 'object' ? JSON.stringify(v) : v;
    });
    const call = `select public.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(', ')}) as r`;
    try {
      const res = await db.query(call, params);
      return respond(200, res.rows[0]?.r ?? null);
    } catch (e) {
      return respond(400, { code: e.code, message: e.message, details: e.detail ?? null, hint: null });
    }
  }

  return { db, fetch: fetchImpl, key, url: 'https://fake-project.supabase.co', close: () => db.close() };
}

export async function runMigrations(db) {
  for (const f of readdirSync(MIGRATIONS).filter((x) => x.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(new URL(f, MIGRATIONS), 'utf8'));
  }
}

function respond(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
