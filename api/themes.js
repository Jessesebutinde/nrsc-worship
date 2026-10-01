import { json, route, rpc, PUBLIC_CACHE } from './_lib.js';

// Public: GET /api/themes → { themes: [{ id, name, description, song_count }] }
export default route(['GET'], async (req, res) => {
  return json(res, 200, { themes: await rpc('list_themes') }, PUBLIC_CACHE);
});
