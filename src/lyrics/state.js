// What the screen shows. Controllers (the remote, the screen's keyboard) send the whole state;
// the newest one wins everywhere: higher rev, or the same rev from the larger client id.

export const BACKGROUNDS = ['glow', 'bokeh', 'leaks', 'video', 'key'];
export const PRESETS = ['worship', 'praise', 'classic'];

export const PRESET_INFO = {
  worship: { name: 'Worship', hint: 'Hillsong-style: mixed case, lower third' },
  praise: { name: 'Praise', hint: 'Elevation-style: caps, quick cuts' },
  classic: { name: 'Classic', hint: 'Namasuba: centred, gold song tag' },
};

export const BACKGROUND_INFO = {
  glow: 'Glow',
  bokeh: 'Bokeh',
  leaks: 'Light leaks',
  video: 'Video loop',
  key: 'Key (ATEM)',
};

export const STREAM_LAYOUTS = { lowerthird: 'Lower thirds', full: 'Full screen' };

export function emptyState() {
  return {
    rev: 0,
    by: '',
    item: null,
    index: 0,
    mode: 'logo',
    bg: 'glow',
    bgVideo: '',
    calm: false,
    // The stream (ATEM) output: its layout, and whether it shows the TV background or keys over the camera.
    streamLayout: 'lowerthird',
    streamBg: 'key',
  };
}

/** Does this output show the item? Media can be sent to the TV only, the stream only, or both. */
export function shownOn(item, out) {
  if (!item || !out || out === 'preview') return true;
  return !item.to || item.to === 'both' || item.to === out;
}

/** Is `b` newer than `a`? */
export function newer(b, a) {
  if (!b) return false;
  if (!a) return true;
  return b.rev > a.rev || (b.rev === a.rev && String(b.by) > String(a.by));
}

const count = (s) => (s.item && s.item.slides ? s.item.slides.length : 0);

/** Applies a command; returns the next state (stamped with rev + 1 and the sender's id). */
export function reduce(state, cmd, by) {
  const s = { ...state };
  switch (cmd.type) {
    case 'next':
      if (s.mode !== 'show') s.mode = 'show';
      else s.index = Math.min(count(s) - 1, s.index + 1);
      break;
    case 'prev':
      if (s.mode !== 'show') s.mode = 'show';
      else s.index = Math.max(0, s.index - 1);
      break;
    case 'goto':
      s.index = Math.max(0, Math.min(count(s) - 1, cmd.index));
      s.mode = 'show';
      break;
    case 'item':
      s.item = cmd.item;
      s.index = Math.max(0, Math.min(count(s) - 1, cmd.index || 0));
      s.mode = 'show';
      break;
    case 'mode':
      // Pressing the active mode again goes back to the slide.
      s.mode = s.mode === cmd.mode && cmd.mode !== 'show' ? 'show' : cmd.mode;
      if (s.mode === 'show' && !s.item) s.mode = 'logo';
      break;
    case 'set':
      Object.assign(s, cmd.patch);
      break;
    default:
      return state;
  }
  if (s.index < 0) s.index = 0;
  s.rev = (state.rev || 0) + 1;
  s.by = by;
  return s;
}

/** Item for pictures or videos: one slide per file. `to` = 'both' | 'tv' | 'stream'. */
export function mediaItem(files, { to = 'both', loop = false, sound = true } = {}) {
  const list = Array.isArray(files) ? files : [files];
  return {
    kind: 'media',
    id: `m-${list.map((f) => f.id || f.src).join('+')}`,
    title: list.length === 1 ? list[0].title : `${list.length} pictures`,
    to,
    loop,
    sound,
    slides: list.map((f) => ({ type: f.type, src: f.src, title: f.title })),
  };
}

/** Item for a song from the library. */
export function songItem(song) {
  return {
    kind: 'song',
    id: song.id,
    title: song.title,
    preset: song.preset || 'worship',
    slides: song.slides.map((s) => ({ label: s.label || '', lines: s.lines })),
  };
}
