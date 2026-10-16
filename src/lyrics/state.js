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

// Looks for scripture: each brings its own environment (`env`) and layout; the type is a serif.
// `group`: 'page' (the text on the environment) or 'card' (the text on a card or object);
// `sw`: two swatch colours for the picker.
export const SCRIPTURE_INFO = {
  ink: { name: 'Ink & stone', hint: 'Stacked on dark stone, gold bar at the left (the default)', env: 'stone', group: 'page', sw: ['#24242e', '#e3b75a'] },
  parchment: { name: 'Parchment', hint: 'Two columns on aged paper, Luganda left and English right', env: 'parchment', group: 'page', sw: ['#e9dcbd', '#8a6a1e'] },
  manuscript: { name: 'Manuscript', hint: 'An illuminated drop cap, book and chapter above', env: 'vellum', group: 'page', sw: ['#0d0b10', '#e3b75a'] },
  dawn: { name: 'Dawn', hint: 'Stacked over a sunrise sky', env: 'dawn', group: 'page', sw: ['#a9633a', '#f0c070'] },
  water: { name: 'Watercolour', hint: 'Dark ink on a light wash: mornings, children, weddings', env: 'watercolour', group: 'page', sw: ['#f4efe6', '#8a3b2a'] },
  chalk: { name: 'Chalk & slate', hint: 'Centred chalk on a green board, for teaching', env: 'slate', group: 'page', sw: ['#2c3a33', '#f0e6b0'] },
  kitenge: { name: 'Kitenge', hint: 'Woven bands in Ugandan colours top and bottom', env: 'kitenge', group: 'page', sw: ['#c8102e', '#d4a017'] },
  candle: { name: 'Candlelight', hint: 'One warm pool of light: evening, prayer, communion', env: 'candle', group: 'page', sw: ['#2a1606', '#f0b860'] },
  blueprint: { name: 'Blueprint', hint: 'Fine ruling and engraved circles on navy, for youth and conferences', env: 'blueprint', group: 'page', sw: ['#0f2238', '#9cd0f2'] },
  // Cards: the text sits on a card, a page or an object.
  linen: { name: 'Linen card', hint: 'The top language on a cream card, the other on a band below', env: 'linen', group: 'card', sw: ['#1d2440', '#f3ecdc'] },
  scroll: { name: 'Scroll', hint: 'One verse big on a parchment ribbon, for the memory verse', env: 'night', group: 'card', sw: ['#141324', '#efe4c8'] },
  twin: { name: 'Twin cards', hint: 'Two cards side by side: Luganda on a cream card, English on a dark one', env: 'plum', group: 'card', sw: ['#f3ecdc', '#2a1d33'] },
  stack: { name: 'Card stack', hint: 'Luganda on a large card, English on a second card tucked below it', env: 'deepteal', group: 'card', sw: ['#ffffff', '#c9a14a'] },
  bible: { name: 'Open Bible', hint: 'An open book: Luganda on the left page, English on the right', env: 'desk', group: 'card', sw: ['#f1e6cc', '#5a3a22'] },
  glass: { name: 'Frosted glass', hint: 'A glass card over soft aurora colours', env: 'auroraglow', group: 'card', sw: ['#4b3a8f', '#7fd6ff'] },
  royal: { name: 'Royal', hint: 'Black card in a double gold frame on deep velvet', env: 'velvet', group: 'card', sw: ['#4a0e1c', '#d8b25a'] },
  marble: { name: 'Marble', hint: 'White marble with a gold edge under a spotlight', env: 'charcoal', group: 'card', sw: ['#ece9e4', '#c9a14a'] },
  cathedral: { name: 'Cathedral', hint: 'An arched window card with stained-glass light behind', env: 'nave', group: 'card', sw: ['#122046', '#ffb84d'] },
  starlight: { name: 'Starlight', hint: 'A night sky of stars, a midnight card with a gold hairline', env: 'stars', group: 'card', sw: ['#0a1030', '#e9c46a'] },
  glory: { name: 'Glory', hint: 'Rays of light behind a white card', env: 'glory', group: 'card', sw: ['#f5c66b', '#ffffff'] },
  limestone: { name: 'Jerusalem stone', hint: 'A chiselled limestone block on warm sand', env: 'sand', group: 'card', sw: ['#e3d3b0', '#7a5a2e'] },
  waters: { name: 'Still waters', hint: 'Deep teal with moving light, a calm card above it', env: 'waters', group: 'card', sw: ['#0b3b45', '#7fe0d8'] },
  mountain: { name: 'Mountain', hint: 'Misty mountains at first light, a pale card', env: 'mountains', group: 'card', sw: ['#c9d6e3', '#2f4a68'] },
  fire: { name: "Refiner's fire", hint: 'A charcoal card glowing at the edges, embers below', env: 'embers', group: 'card', sw: ['#1a1412', '#ff7a2f'] },
  bold: { name: 'Bold', hint: 'A modern white card with a hard black shadow on sunny yellow', env: 'pop', group: 'card', sw: ['#f6c945', '#111111'] },
  split: { name: 'Split', hint: 'An emerald panel with the chapter number, the text beside it', env: 'forestdark', group: 'card', sw: ['#0f5c4a', '#f3ecdc'] },
  bookmark: { name: 'Bookmark', hint: 'A page with a crimson ribbon holding the verse number', env: 'leather', group: 'card', sw: ['#3a2418', '#a3162b'] },
  tablet: { name: 'Tablet', hint: 'Words carved in a stone tablet at dusk', env: 'dusk', group: 'card', sw: ['#8d8a86', '#3b2d4f'] },
  epistle: { name: 'Epistle', hint: 'A letter sealed in red wax, for the letters of the apostles', env: 'desk', group: 'card', sw: ['#f2e7cf', '#9b1c1c'] },
  gallery: { name: 'Gallery', hint: 'A small museum card under a spotlight, the reference as its caption', env: 'wall', group: 'card', sw: ['#3a3631', '#ffffff'] },
  aurora: { name: 'Aurora edge', hint: 'A black card with a glowing colour edge', env: 'void', group: 'card', sw: ['#050507', '#b26bff'] },
  papercut: { name: 'Papercut', hint: 'A paper card over layered paper hills', env: 'paperhills', group: 'card', sw: ['#e7f1ec', '#1f5f5b'] },
  lubugo: { name: 'Lubugo', hint: 'Ugandan barkcloth: cream words on a woven bark panel', env: 'barkcloth', group: 'card', sw: ['#7a3e1d', '#f2d7a6'] },
};
export const SCRIPTURE_LOOKS = Object.keys(SCRIPTURE_INFO);
export const SCRIPTURE_GROUPS = { page: 'Pages', card: 'Cards' };

// How scripture comes on and goes off (crossfades only in calm mode and the previews).
export const SCRIPTURE_MOTIONS = { gentle: 'Gentle', page: 'Page turn', type: 'Typing', reveal: 'Reveal', slide: 'Slide' };

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
    // How scripture comes on and goes off; quotation marks around each slide's text.
    sMotion: 'reveal',
    quotes: true,
    reveal: true,
    progress: true,
    // With reveal: which verse of the slide is being read (0-based).
    sub: 0,
    // Following the singer (songs): the words being sung now on this slide, [first, last] (one word,
    // or a whole line), or null. Words before it have been sung; the ones after it may wait dimmer.
    wc: null,
    // Text size, as a multiple of the standard: lyrics and scripture separately.
    lSize: 1,
    sSize: 1,
    // Scripture: how big the language below is next to the one on top (1 = the look's own), and
    // whether the words run edge to edge (a slim margin) instead of inside the safe area.
    sBalance: 1,
    sWide: false,
    followDim: true,
    followStream: true,
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

// Text size steps (the operator's "Larger" / "Smaller").
export const TEXT_SIZES = [0.85, 1, 1.2, 1.4, 1.7];
export const TEXT_SIZE_NAMES = { 0.85: 'Smaller', 1: 'Standard', 1.2: 'Large', 1.4: 'Larger', 1.7: 'Huge' };
/** The next size step up (dir 1) or down (dir -1) from `v`. */
export function stepSize(v, dir) {
  const cur = TEXT_SIZES.reduce((best, x) => (Math.abs(x - (Number(v) || 1)) < Math.abs(best - (Number(v) || 1)) ? x : best), 1);
  const i = TEXT_SIZES.indexOf(cur);
  return TEXT_SIZES[Math.max(0, Math.min(TEXT_SIZES.length - 1, i + (dir > 0 ? 1 : -1)))];
}

// The language below, as a share of the look's own size for it.
export const BALANCE_STEPS = [0.6, 0.8, 1, 1.15, 1.3];
export const BALANCE_NAMES = { 0.6: 'Smallest', 0.8: 'Smaller', 1: 'Normal', 1.15: 'Bigger', 1.3: 'Same size' };

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

const songWords = (slide) => (slide && slide.lines ? slide.lines.join(' ').split(/\s+/).filter(Boolean) : []);

/** Each line of a song slide as [first word, last word] in the slide's word numbering. */
export function lineRanges(slide) {
  const out = [];
  let at = 0;
  for (const l of (slide && slide.lines) || []) {
    const n = String(l).split(/\s+/).filter(Boolean).length;
    if (n) out.push([at, at + n - 1]);
    at += n;
  }
  return out;
}

/**
 * Moves the word cursor of a song: by one word (dir ±1) or to the next / previous line. Past the
 * last word it goes on to the next slide's first word; before the first word, back to the previous
 * slide's last. Changes s in place.
 */
function follow(s, dir, unit) {
  const it = s.item;
  if (!it || it.kind !== 'song' || !it.slides.length) return;
  if (s.mode !== 'show') s.mode = 'show';
  const slide = it.slides[s.index];
  const n = songWords(slide).length;
  const wc = Array.isArray(s.wc) ? s.wc : null;
  if (unit === 'line') {
    const lines = lineRanges(slide);
    if (dir > 0) {
      const nextLine = lines.find(([a]) => a > (wc ? wc[1] : -1));
      if (nextLine) s.wc = nextLine;
      else if (s.index < it.slides.length - 1) {
        s.index += 1;
        s.wc = lineRanges(it.slides[s.index])[0] || null;
      }
    } else {
      const prevLine = [...lines].reverse().find(([a]) => wc && a < wc[0]);
      if (prevLine) s.wc = prevLine;
      else if (s.index > 0) {
        s.index -= 1;
        const ls = lineRanges(it.slides[s.index]);
        s.wc = ls[ls.length - 1] || null;
      } else s.wc = null;
    }
    return;
  }
  if (dir > 0) {
    if (!wc) s.wc = n ? [0, 0] : null;
    else if (wc[1] + 1 < n) s.wc = [wc[1] + 1, wc[1] + 1];
    else if (s.index < it.slides.length - 1) {
      s.index += 1;
      s.wc = songWords(it.slides[s.index]).length ? [0, 0] : null;
    }
  } else if (wc && wc[0] > 0) s.wc = [wc[0] - 1, wc[0] - 1];
  else if (s.index > 0) {
    s.index -= 1;
    const m = songWords(it.slides[s.index]).length;
    s.wc = m ? [m - 1, m - 1] : null;
  } else s.wc = null;
}

/** How many steps the slide takes: its verses one by one when reveal is on (scripture), else one. */
export function stepsOf(state, index = state.index) {
  const it = state.item;
  // A scrolling passage always steps verse by verse (that is what moves it).
  if (!it || it.kind !== 'scripture' || (state.reveal === false && !it.scroll)) return 1;
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
      s.wc = null;
      s.mode = 'show';
      break;
    case 'word':
      // Following the singer: { dir: 1 | -1, unit: 'word' | 'line' }, or { at: n } to jump, { off: true } to stop.
      if (cmd.off) s.wc = null;
      else if (cmd.at != null) {
        const n = songWords(s.item && s.item.slides[s.index]).length;
        s.wc = s.item && s.item.kind === 'song' && cmd.at >= 0 && cmd.at < n ? [cmd.at, cmd.at] : s.wc;
        if (s.wc && s.mode !== 'show') s.mode = 'show';
      } else follow(s, cmd.dir < 0 ? -1 : 1, cmd.unit === 'line' ? 'line' : 'word');
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
      if (('item' in cmd.patch || 'index' in cmd.patch) && !('wc' in cmd.patch)) s.wc = null;
      break;
    default:
      return state;
  }
  if (s.index < 0) s.index = 0;
  if (cmd.type !== 'word' && s.index !== state.index) s.wc = null;
  if (cmd.type === 'item') s.wc = null;
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
