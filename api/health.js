import { json, hasSupabase, rpc, ApiError } from './_lib.js';

// Setup check in plain words: GET /api/health → { ok, checks: [{ name, ok, message }] }
export default async function handler(req, res) {
  const checks = [];
  const dbEnv = hasSupabase();
  checks.push({
    name: 'Database settings', ok: dbEnv,
    message: dbEnv ? 'SUPABASE_URL and SUPABASE_SERVICE_KEY are set.'
      : 'Add SUPABASE_URL and SUPABASE_SERVICE_KEY in Vercel → Settings → Environment Variables, then redeploy.',
  });
  if (dbEnv) {
    try {
      const themes = await rpc('list_themes');
      checks.push({ name: 'Database tables', ok: true, message: `Tables are ready (${themes.length} themes).` });
    } catch (e) {
      checks.push({ name: 'Database tables', ok: false, message: e instanceof ApiError ? e.message : 'Could not check the database.' });
    }
  }
  const pin = !!String(process.env.ADMIN_PIN || '').trim();
  checks.push({ name: 'Admin PIN', ok: pin, message: pin ? 'ADMIN_PIN is set.' : 'Add ADMIN_PIN in Vercel (any word or number) so admins can sign in.' });
  return json(res, 200, { ok: checks.every((c) => c.ok), checks });
}
