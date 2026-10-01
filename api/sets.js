import { json, query, route, rpc, positiveId, ApiError, PUBLIC_CACHE } from './_lib.js';

// Public set lists for the team.
//   GET /api/sets        → { sets: [{ id, service_date, title, leader_name, theme, praise_count, worship_count }] }
//   GET /api/sets?id=5   → { set: { ..., theme, items: [{ section, position, song: {id, title, song_key, ...} }] } }
export default route(['GET'], async (req, res) => {
  const q = query(req);
  if (q.has('id')) {
    const id = positiveId(q.get('id'));
    if (!id) throw new ApiError(400, 'bad_request', 'Set list id is missing or wrong.');
    const set = await rpc('get_set_list', { p_id: id });
    if (!set) throw new ApiError(404, 'not_found', "That set list doesn't exist (it may have been deleted).");
    return json(res, 200, { set }, PUBLIC_CACHE);
  }
  return json(res, 200, { sets: await rpc('list_set_lists', { p_limit: 40 }) }, PUBLIC_CACHE);
});
