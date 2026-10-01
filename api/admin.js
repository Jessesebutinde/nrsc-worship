import { timingSafeEqual, createHash } from 'node:crypto';
import { json, readBody, route, rpc, positiveId, ApiError, W } from './_lib.js';

// Admin actions. Protected by ADMIN_PIN (header x-admin-pin; letters allowed).
//   GET                                                   → { ok, usage: { "<song_id>": "YYYY-MM-DD" } }  (also the PIN check)
//   POST { action: 'song.save', song: {...}, theme_ids }  → { song }      400 { error:'invalid', fields }
//   POST { action: 'song.delete', id }                    → { deleted }
//   POST { action: 'import.preview', text }               → { format, rows, summary }
//   POST { action: 'import.commit', text, mode }          → { created, updated, skipped, not_imported }
//   POST { action: 'theme.save', theme: {id?, name, description} } → { theme }
//   POST { action: 'theme.delete', id }                   → { deleted }
//   POST { action: 'set.save', set: {...}, items: [{ song_id, section }] } → { set }
//   POST { action: 'set.delete', id }                     → { deleted }

const MAX_IMPORT_CHARS = 1_000_000;
const MAX_IMPORT_ROWS = 1000;
const MAX_SET_ITEMS = 40;

function pin() { return String(process.env.ADMIN_PIN || '').trim(); }
function sameText(a, b) {
  const h = (s) => createHash('sha256').update(String(s)).digest();
  return timingSafeEqual(h(a), h(b));
}

export default route(['GET', 'POST'], async (req, res) => {
  if (!pin()) throw new ApiError(503, 'no_pin', 'No admin PIN is set. In Vercel → Settings → Environment Variables, add ADMIN_PIN, then redeploy.');
  const given = String(req.headers['x-admin-pin'] || '').trim();
  if (!given || !sameText(given, pin())) {
    await new Promise((r) => setTimeout(r, 400)); // slow down guessing
    throw new ApiError(401, 'unauthorized', 'Wrong PIN. Check with the worship leader.');
  }

  if (req.method === 'GET') {
    const since = new Date(Date.now() - 84 * 86400000).toISOString().slice(0, 10);
    return json(res, 200, { ok: true, usage: await rpc('song_usage', { p_since: since }) });
  }

  const b = await readBody(req);
  const action = String(b.action || '');
  const handler = ACTIONS[action];
  if (!handler) throw new ApiError(400, 'bad_action', 'Unknown action.');
  return json(res, 200, await handler(b));
});

const ACTIONS = {
  async 'song.save'(b) {
    const v = W.validateSong(b.song || {});
    if (Object.keys(v.errors).length) throw invalid(v.errors);
    const id = b.song && b.song.id != null ? positiveId(b.song.id) : null;
    if (b.song && b.song.id != null && !id) throw new ApiError(400, 'bad_request', 'Song id is wrong.');
    const theme_ids = ids(b.theme_ids);
    const song = await rpc('save_song', { p: { ...v.song, id, theme_ids } });
    return { song, warnings: v.warnings };
  },

  async 'song.delete'(b) {
    return rpc('delete_song', { p_id: requireId(b.id) });
  },

  async 'import.preview'(b) {
    const { parsed, existing } = await parseForImport(b.text);
    const rows = parsed.rows.map((r) => ({
      n: r.n,
      title: r.song.title,
      title_alt: r.song.title_alt,
      session: r.song.session,
      language: r.song.language,
      song_key: r.song.song_key,
      theme_ids: r.theme_ids,
      has_luganda: !!r.song.lyrics_luganda,
      has_english: !!r.song.lyrics_english,
      exists: existing.has(r.song.title.toLowerCase()),
      errors: r.errors,
      warnings: r.warnings,
    }));
    return {
      format: parsed.format,
      rows,
      summary: {
        total: rows.length,
        ready: rows.filter((r) => !r.errors.length && !r.exists).length,
        existing: rows.filter((r) => !r.errors.length && r.exists).length,
        with_errors: rows.filter((r) => r.errors.length).length,
      },
    };
  },

  async 'import.commit'(b) {
    const mode = b.mode === 'update' ? 'update' : 'skip';
    const { parsed } = await parseForImport(b.text);
    const good = parsed.rows.filter((r) => !r.errors.length);
    if (!good.length) throw new ApiError(400, 'nothing_to_import', 'There are no songs without errors to import.');
    const result = await rpc('import_songs', { p_rows: good.map((r) => ({ ...r.song, theme_ids: r.theme_ids })), p_mode: mode });
    return { ...result, not_imported: parsed.rows.length - good.length };
  },

  async 'theme.save'(b) {
    const v = W.validateTheme(b.theme || {});
    if (Object.keys(v.errors).length) throw invalid(v.errors);
    const id = b.theme && b.theme.id != null ? positiveId(b.theme.id) : null;
    return { theme: await rpc('save_theme', { p: { ...v.theme, id } }) };
  },

  async 'theme.delete'(b) {
    return rpc('delete_theme', { p_id: requireId(b.id) });
  },

  async 'set.save'(b) {
    const s = b.set || {};
    const fields = {};
    const date = String(s.service_date || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !W.formatDate(date)) fields.service_date = 'Pick the date of the service.';
    const items = Array.isArray(b.items) ? b.items : [];
    if (items.length > MAX_SET_ITEMS) fields.items = `A set list can have at most ${MAX_SET_ITEMS} songs.`;
    const clean = items
      .map((i) => ({ song_id: positiveId(i && i.song_id), section: i && i.section }))
      .filter((i) => i.song_id && (i.section === 'praise' || i.section === 'worship'));
    const text = (v, max) => String(v || '').trim().slice(0, max) || null;
    if (Object.keys(fields).length) throw invalid(fields);
    const set = await rpc('save_set_list', {
      p: {
        id: s.id != null ? positiveId(s.id) : null,
        service_date: date,
        theme_id: positiveId(s.theme_id),
        title: text(s.title, W.LIMITS.set_title),
        leader_name: text(s.leader_name, W.LIMITS.leader),
        notes: text(s.notes, W.LIMITS.notes),
        items: clean,
      },
    });
    return { set };
  },

  async 'set.delete'(b) {
    return rpc('delete_set_list', { p_id: requireId(b.id) });
  },
};

async function parseForImport(text) {
  text = String(text || '');
  if (!text.trim()) throw new ApiError(400, 'empty', 'Paste some songs or choose a CSV file first.');
  if (text.length > MAX_IMPORT_CHARS) throw new ApiError(400, 'too_big', 'That is too much at once — import at most about 1,000 songs per go.');
  const [themes, songs] = await Promise.all([rpc('list_themes'), rpc('list_songs')]);
  const parsed = W.parseImport(text, themes);
  if (!parsed.rows.length) throw new ApiError(400, 'empty', 'No songs found. Check the format (see the example).');
  if (parsed.rows.length > MAX_IMPORT_ROWS) throw new ApiError(400, 'too_big', `Import at most ${MAX_IMPORT_ROWS} songs at a time.`);
  return { parsed, existing: new Set(songs.map((s) => s.title.toLowerCase())) };
}

function invalid(fields) {
  const e = new ApiError(400, 'invalid', Object.values(fields)[0]);
  e.fields = fields;
  return e;
}

function requireId(v) {
  const id = positiveId(v);
  if (!id) throw new ApiError(400, 'bad_request', 'Id is missing or wrong.');
  return id;
}

function ids(list) {
  return [...new Set((Array.isArray(list) ? list : []).map(positiveId).filter(Boolean))];
}
