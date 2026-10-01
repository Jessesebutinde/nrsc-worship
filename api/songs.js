import { json, query, route, rpc, positiveId, ApiError, PUBLIC_CACHE } from './_lib.js';

// Public song library.
//   GET /api/songs          → { songs: [card fields, no lyrics] }
//   GET /api/songs?q=text   → { matches: [{ id, match: title|luganda|english, snippet }] }  (title + lyrics search)
//   GET /api/songs?id=12    → { song: { ...everything, themes: [{id, name}] } }
export default route(['GET'], async (req, res) => {
  const q = query(req);
  if (q.has('id')) {
    const id = positiveId(q.get('id'));
    if (!id) throw new ApiError(400, 'bad_request', 'Song id is missing or wrong.');
    const song = await rpc('get_song', { p_id: id });
    if (!song) throw new ApiError(404, 'not_found', "That song isn't in the library (it may have been deleted).");
    return json(res, 200, { song }, PUBLIC_CACHE);
  }
  if (q.has('q')) {
    const text = String(q.get('q') || '').trim().slice(0, 100);
    if (text.length < 2) return json(res, 200, { matches: [] }, PUBLIC_CACHE);
    return json(res, 200, { matches: await rpc('search_songs', { p_q: text, p_limit: 80 }) }, PUBLIC_CACHE);
  }
  return json(res, 200, { songs: await rpc('list_songs') }, PUBLIC_CACHE);
});
