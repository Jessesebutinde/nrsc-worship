// Shared helpers for the serverless functions (files starting with _ are not deployed as routes).
import '../shared.js'; // sets globalThis.NRSCWorship (shared with the browser)

export const W = globalThis.NRSCWorship;

export function json(res, status, body, cache) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  // Public reads may be cached briefly at Vercel's edge (fast on slow connections);
  // anything personal or admin is never cached.
  res.setHeader('cache-control', status === 200 && cache ? cache : 'no-store');
  res.end(JSON.stringify(body));
}

export const PUBLIC_CACHE = 'public, max-age=0, s-maxage=15, stale-while-revalidate=300';

export async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = '';
  for await (const chunk of req) raw += chunk;
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

export function query(req) {
  return new URL(req.url, 'http://x').searchParams;
}

export function hasSupabase() {
  return !!(clean(process.env.SUPABASE_URL) && clean(process.env.SUPABASE_SERVICE_KEY));
}

function clean(v) { return String(v || '').trim(); }

// Error carrying a stable code and a message people can act on.
export class ApiError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

// Call one of the database functions in supabase/migrations/0001_init.sql (service key, server-side only).
export async function rpc(fn, args = {}) {
  const base = clean(process.env.SUPABASE_URL).replace(/\/+$/, '');
  const key = clean(process.env.SUPABASE_SERVICE_KEY);
  let r;
  try {
    r = await fetch(`${base}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: key, authorization: 'Bearer ' + key, 'content-type': 'application/json' },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(12000),
    });
  } catch (e) {
    if (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) throw new ApiError(504, 'db_timeout', 'The database took too long to answer. Try again.');
    throw new ApiError(503, 'db_unreachable', `Couldn't reach Supabase. Check SUPABASE_URL in Vercel (it looks like https://xxxx.supabase.co).`);
  }
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (r.ok) return data;
  throw dbError(r.status, data);
}

// Turn a Supabase error into a plain-language one.
export function dbError(status, body) {
  const b = body && typeof body === 'object' ? body : { message: String(body || '') };
  const msg = String(b.message || '');
  if (status === 401 || status === 403 || /invalid api key|jwt/i.test(msg)) {
    return new ApiError(503, 'bad_key', 'SUPABASE_SERVICE_KEY is not accepted. In Supabase open Project Settings → API, copy the service_role key again and paste it into Vercel.');
  }
  if (b.code === 'PGRST202' || b.code === 'PGRST205' || b.code === '42883' || b.code === '42P01' || /could not find the (function|table)|does not exist/i.test(msg)) {
    return new ApiError(503, 'no_tables', "The database isn't set up yet. In Supabase open SQL Editor, paste the file supabase/migrations/0001_init.sql, and click Run.");
  }
  // Codes raised on purpose inside the database functions.
  const known = {
    title_required: [400, 'Give the song a title.'],
    name_required: [400, 'Give the theme a name.'],
    date_required: [400, 'Pick a date for the service.'],
    theme_exists: [409, 'A theme with that name already exists.'],
    not_found: [404, "That item doesn't exist any more — it may have been deleted."],
  };
  if (known[msg]) return new ApiError(known[msg][0], msg, known[msg][1]);
  if (b.code === '23514' || b.code === '22P02' || b.code === '22023') return new ApiError(400, 'invalid', 'Some of the details are not valid: ' + msg);
  console.error('supabase_error', status, JSON.stringify(b).slice(0, 500));
  return new ApiError(502, 'db_error', 'The database had a problem. Please try again.');
}

export const NO_DB = new ApiError(503, 'no_db', 'The app is not connected to its database yet. In Vercel → Settings → Environment Variables, add SUPABASE_URL and SUPABASE_SERVICE_KEY, then redeploy.');

// Wraps a handler: setup checks, method check, and turning any error into a JSON answer.
export function route(methods, fn) {
  return async function handler(req, res) {
    if (!methods.includes(req.method)) return json(res, 405, { error: 'method', message: 'Method not allowed.' });
    try {
      if (!hasSupabase()) throw NO_DB;
      return await fn(req, res);
    } catch (e) {
      if (e instanceof ApiError) return json(res, e.status, { error: e.code, message: e.message, ...(e.fields ? { fields: e.fields } : {}) });
      console.error('api_error', e && e.stack || e);
      return json(res, 500, { error: 'server', message: 'Something went wrong on the server. Please try again.' });
    }
  };
}

export function positiveId(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}
