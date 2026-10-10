// What the screen shows. Controllers (the remote, the screen's keyboard) send the whole state;
// the newest one wins everywhere: higher rev, or the same rev from the larger client id.

export const BACKGROUNDS = ['glow', 'bokeh', 'leaks', 'crowd', 'wood', 'arcs', 'beams', 'bluestage', 'forest', 'darkglow', 'mono', 'film', 'video', 'key'];

// Looks for lyrics. The first three are the Namasuba standard; the others bring their own
// environment (`env`, one of the backgrounds) and their own type.
export const PRESETS = ['worship', 'praise', 'classic', 'poster', 'sunshine', 'lines', 'beams', 'banner', 'midnight', 'pixel', 'neon', 'grateful', 'film'];

export const PRESET_INFO = {
  worship: { name: 'Worship', hint: 'Hillsong-style: mixed case, lower third' },
  praise: { name: 'Praise', hint: 'Elevation-style: caps, quick cuts' },
  classic: { name: 'Classic', hint: 'Namasuba: centred, gold song tag' },
  poster: { name: 'Poster', hint: 'Chunky coral caps on a cream band, over a grainy stage', env: 'crowd', subtitle: false },
  sunshine: { name: 'Sunshine', hint: 'White block caps with a long shadow on sunny woodgrain', env: 'wood', subtitle: true },
  lines: { name: 'Lines', hint: 'Light teal caps and line-art on navy', env: 'arcs', subtitle: true },
  beams: { name: 'Beams', hint: 'Glowing cyan caps in light beams', env: 'beams', subtitle: true },
  banner: { name: 'Banner', hint: 'Blue bold caps on a peach band, over a blue-lit stage', env: 'bluestage', subtitle: false },
  midnight: { name: 'Midnight', hint: 'White bold caps straight on the blue-lit stage', env: 'bluestage', subtitle: false },
  pixel: { name: 'Pixel', hint: 'Retro pixel caps in a dark forest with glitches', env: 'forest', subtitle: false },
  neon: { name: 'Neon', hint: 'Huge white caps with a soft glow on black', env: 'darkglow', subtitle: true },
  grateful: { name: 'Grateful', hint: 'Chunky slanted caps, coral and white, over a grainy mono crowd', env: 'mono', subtitle: false },
  film: { name: 'Film', hint: 'Tall white caps with a coral rule, on black-and-white film', env: 'film', subtitle: false },
};

export const BACKGROUND_INFO = {
  glow: 'Glow',
  bokeh: 'Bokeh',
  leaks: 'Light leaks',
  crowd: 'Stage & crowd',
  wood: 'Sunny woodgrain',
  arcs: 'Teal line-art',
  beams: 'Light beams',
  bluestage: 'Blue stage',
  forest: 'Dark forest',
  darkglow: 'Black with glow',
  mono: 'Mono crowd',
  film: 'Film grain',
  video: 'Video loop',
  key: 'Key (ATEM)',
};

/** The look a song shows with: the operator's override for all songs, else the song's own. */
export const lookOf = (state, item) => (state && state.look && PRESET_INFO[state.look] ? state.look : (item && item.preset) || 'worship');

export const STREAM_LAYOUTS = { lowerthird: 'Lower thirds', full: 'Full screen' };

// Looks for scripture: each brings its own environment and layout; the type is a serif.
export const SCRIPTURE_LOOKS = ['ink', 'parchment', 'manuscript', 'linen', 'dawn', 'water', 'chalk', 'kitenge', 'candle', 'blueprint', 'scroll'];

export const SCRIPTURE_INFO = {
  ink: { name: 'Ink & stone', hint: 'Stacked on dark stone, gold bar at the left (the default)', env: 'stone', light: false },
  parchment: { name: 'Parchment', hint: 'Two columns on aged paper, Luganda left and English right', env: 'parchment', light: true },
  manuscript: { name: 'Manuscript', hint: 'An illuminated drop cap, book and chapter above', env: 'vellum', light: false },
  linen: { name: 'Linen card', hint: 'The top language on a cream card, the other on a band below', env: 'linen', light: false },
  dawn: { name: 'Dawn', hint: 'Stacked over a sunrise sky', env: 'dawn', light: false },
  water: { name: 'Watercolour', hint: 'Dark ink on a light wash: mornings, children, weddings', env: 'watercolour', light: true },
  chalk: { name: 'Chalk & slate', hint: 'Centred chalk on a green board, for teaching', env: 'slate', light: false },
  kitenge: { name: 'Kitenge', hint: 'Woven bands in Ugandan colours top and bottom', env: 'kitenge', light: false },
  candle: { name: 'Candlelight', hint: 'One warm pool of light: evening, prayer, communion', env: 'candle', light: false },
  blueprint: { name: 'Blueprint', hint: 'Fine ruling and engraved circles on navy, for youth and conferences', env: 'blueprint', light: false },
  scroll: { name: 'Scroll', hint: 'One verse big on a parchment ribbon, for the memory verse', env: 'night', light: true },
};

/** The look scripture shows with. */
export const scriptureLookOf = (state) => (state && SCRIPTURE_INFO[state.sLook] ? state.sLook : 'ink');

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
    // Text grows to use the screen (down to the standard size, never smaller); lyrics in capitals.
    fill: true,
    caps: true,
    // A picture or video beside the words on the TV only: { src, type, title, size: 'small' | 'half' | 'large' }.
    illustration: null,
    // '' = each song's own look; a look name forces it for every song. Looks bring their own
    // environment unless lookBg is 'mine' (keep the TV background).
    look: '',
    lookBg: 'look',
    // How much the words play: 'low' (gentle), 'mid' (lively), 'high' (playful: further, bouncier, wobbling).
    play: 'mid',
    // Word play: mixed fonts per word, and a "hero" word or line that swells (both can be on).
    mixFonts: false,
    hero: false,
    // Where the words sit: 'center', 'alternate' (left / right / centre, slide by slide),
    // 'lines' (first line left, second right), 'random'.
    place: 'center',
    // Words the operator tapped for emphasis: { "<item id>:<slide index>": { "<field>:<word>": { c: 'gold', b: true } } }.
    marks: {},
    // Scripture: its look, serif or sans type, verse-by-verse reveal (Next brings the next verse on
    // the slide; verses already read dim) and the thin progress bar through the passage.
    sLook: 'ink',
    sFont: 'serif',
    reveal: true,
    progress: true,
    // With reveal: which verse of the slide is being read (0-based).
    sub: 0,
  };
}

// Emphasis colours (c) for a tapped word; b = "bend" (slanted).
export const MARK_COLORS = { gold: '#e3b75a', coral: '#ff6b5e', teal: '#35e0d0', white: '#ffffff' };

export const markKey = (item, index) => `${item.id}:${index}`;

const wordsOf = (t) => String(t || '').split(/\s+/).filter(Boolean);

/**
 * The words of a slide that can be tapped for emphasis, by field: a song slide is one field 'l'
 * (all its words in order, however the screen breaks the lines); a scripture slide has 'p'
 * (the language on top) and 's' (the one below). The screen numbers words the same way.
 */
export function slideWords(item, slide) {
  if (!item || !slide) return [];
  if (item.kind === 'song') return [{ field: 'l', label: '', words: wordsOf(slide.lines.join(' ')) }];
  if (item.kind === 'scripture') {
    const segs = slide.verses || [{ primary: slide.primary, secondary: slide.secondary }];
    const p = segs.flatMap((g) => wordsOf(g.primary));
    const sec = segs.flatMap((g) => wordsOf(g.secondary));
    const out = [];
    if (p.length) out.push({ field: 'p', label: item.versions && item.versions[0] ? item.versions[0] : '', words: p });
    if (sec.length) out.push({ field: 's', label: item.secondaryLabel || '', words: sec });
    return out;
  }
  return [];
}

export const PLAY_LEVELS = { low: 'Gentle', mid: 'Lively', high: 'Playful', wild: 'Wild' };
export const PLACES = { center: 'Centre', alternate: 'Alternate', lines: 'Left / right', random: 'Random' };

export const ILLUSTRATION_SIZES = { small: 'Small', half: 'Half', large: 'Large' };

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

/** How many steps the slide takes: its verses one by one when reveal is on (scripture), else one. */
export function stepsOf(state, index = state.index) {
  const it = state.item;
  if (!it || it.kind !== 'scripture' || state.reveal === false) return 1;
  const slide = it.slides && it.slides[index];
  return Math.max(1, slide && slide.verses ? slide.verses.length : 1);
}

/** Applies a command; returns the next state (stamped with rev + 1 and the sender's id). */
export function reduce(state, cmd, by) {
  const s = { ...state };
  switch (cmd.type) {
    case 'next':
      if (s.mode !== 'show') s.mode = 'show';
      else if ((s.sub || 0) + 1 < stepsOf(s)) s.sub = (s.sub || 0) + 1;
      else if (s.index < count(s) - 1) {
        s.index += 1;
        s.sub = 0;
      }
      break;
    case 'prev':
      if (s.mode !== 'show') s.mode = 'show';
      else if ((s.sub || 0) > 0) s.sub -= 1;
      else if (s.index > 0) {
        // Back to the previous slide with all its verses up.
        s.index -= 1;
        s.sub = stepsOf(s) - 1;
      }
      break;
    case 'goto':
      s.index = Math.max(0, Math.min(count(s) - 1, cmd.index));
      s.sub = 0;
      s.mode = 'show';
      break;
    case 'item':
      s.item = cmd.item;
      s.index = Math.max(0, Math.min(count(s) - 1, cmd.index || 0));
      s.sub = 0;
      s.mode = 'show';
      s.marks = {};
      break;
    case 'mark': {
      // Tapping a word with the same pen again takes the mark off.
      const all = { ...(s.marks || {}) };
      const m = { ...(all[cmd.slide] || {}) };
      const cur = m[cmd.word];
      if (cur && cur.c === cmd.mark.c && Boolean(cur.b) === Boolean(cmd.mark.b)) delete m[cmd.word];
      else m[cmd.word] = { c: cmd.mark.c, b: Boolean(cmd.mark.b) };
      all[cmd.slide] = m;
      s.marks = all;
      break;
    }
    case 'unmark': {
      if (!cmd.slide) s.marks = {};
      else {
        const all = { ...(s.marks || {}) };
        delete all[cmd.slide];
        s.marks = all;
      }
      break;
    }
    case 'mode':
      // Pressing the active mode again goes back to the slide.
      s.mode = s.mode === cmd.mode && cmd.mode !== 'show' ? 'show' : cmd.mode;
      if (s.mode === 'show' && !s.item) s.mode = 'logo';
      break;
    case 'set':
      Object.assign(s, cmd.patch);
      if (s.sub >= stepsOf(s)) s.sub = 0;
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
