// The screen picture: a fixed 1920x1080 canvas scaled to fit its box. Used by the TV and stream
// outputs and by every preview in the remote, so what the operator sees is what the hall sees.

import { html, useState, useEffect, useRef, useLayoutEffect } from '../ui/h.js';
import { CHURCH_NAME } from './config.js';
import { shownOn, lookOf, PRESET_INFO, SCRIPTURE_INFO, SCRIPTURE_MOTIONS, scriptureLookOf, stepsOf } from './state.js';
import { idbGet } from './idb.js';
import { splitAtPauses } from './split.js';
import { lineWidth, fontsReady as loadFonts } from './measure.js';

const W = 1920;
const H = 1080;
// Inside the 5% safe area.
const SAFE_W = W - 2 * 96;
const SAFE_H = H - 2 * 54;
// The illustration panel's width on the TV, by size.
const ILLUS_W = { small: 560, half: 760, large: 960 };

// How long a frame takes to fade out, by what it shows.
const OUT_MS = {
  worship: 400, praise: 200, classic: 250, poster: 200, sunshine: 300, lines: 400, beams: 500,
  banner: 200, midnight: 300, pixel: 150, neon: 350, grateful: 200, film: 300,
  scripture: 250, title: 300, logo: 400, media: 600, none: 400,
};

/** Keeps the outgoing frame mounted (with .out) while it fades, so changes cross over smoothly. */
function useSwap(key, data, outMs, toNone) {
  const [frames, setFrames] = useState(() => [{ key, data, leaving: false }]);
  const timers = useRef(new Set());
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => {
    setFrames((fs) => {
      const cur = fs[fs.length - 1];
      if (cur && cur.key === key && !cur.leaving) return fs;
      const old = fs.filter((f) => f.key !== key).map((f) => (f.leaving ? f : { ...f, leaving: true, outMs: toNone ? OUT_MS.none : f.outMs }));
      return [...old, { key, data, leaving: false, outMs }];
    });
    const t = setTimeout(() => {
      timers.current.delete(t);
      setFrames((fs) => fs.filter((f) => !f.leaving));
    }, 850);
    timers.current.add(t);
  }, [key]);
  // The current frame always renders the latest data (e.g. a song edited while it is up).
  return frames.map((f) => (f.key === key && !f.leaving ? { ...f, data, outMs } : f));
}

/** Scale-to-fit wrapper: children are laid out at 1920x1080. */
export function Fit({ children, class: cls = '', fill = false }) {
  const box = useRef(null);
  const [s, setS] = useState(null);
  useLayoutEffect(() => {
    const el = box.current;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width && r.height) setS(Math.min(r.width / W, r.height / H));
      else if (r.width) setS(r.width / W);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return html`<div class=${`fit ${fill ? 'fit-fill' : ''} ${cls}`} ref=${box}>
    ${s != null &&
    html`<div class="fit-inner" style=${`width:${W}px;height:${H}px;transform:translate(-50%,-50%) scale(${s})`}>${children}</div>`}
  </div>`;
}

// Every face the looks use is loaded up front (a face loads only when first used, so a look switched
// to later would otherwise be measured in the fallback font); text is measured once they are in.
let fontsDone = typeof document === 'undefined' || !document.fonts;
function useFontsReady() {
  const [ready, setReady] = useState(fontsDone);
  useEffect(() => {
    if (ready) return;
    loadFonts().then(() => {
      fontsDone = true;
      setReady(true);
    });
  }, []);
  return ready;
}

// The widest line in `el` compared with `el` itself (both as drawn, so the stage's scale cancels out).
function widestLine(el) {
  // The content box only: a look with padding (the Poster band) keeps its text inside the band.
  const cs = getComputedStyle(el);
  const inner = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const box = el.offsetWidth ? (el.getBoundingClientRect().width * inner) / el.offsetWidth : 0;
  let widest = 0;
  for (const ln of el.children) {
    const r = document.createRange();
    r.selectNodeContents(ln);
    widest = Math.max(widest, r.getBoundingClientRect().width);
  }
  return box ? widest / box : 0;
}

/**
 * Sizes the text in `ref` (through its --fs scale) so it just fills `availH` (and the width, when
 * `lines` do not wrap): as large as `max`, and no smaller than `min` even when a line is too wide.
 * Off: the standard size.
 */
function useFill(ref, { on, max, min = 1, availH, lines = false, noOverflowX = false }, deps) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = (s) => el.style.setProperty('--fs', String(s));
    el.classList.remove('squeeze');
    if (!on) {
      set(1);
      return;
    }
    // Measured with the entrance animations suspended: a word mid-flight would inflate its line.
    el.classList.add('measuring');
    try {
      const fits = (s) => {
        set(s);
        return el.scrollHeight <= availH && (!lines || widestLine(el) <= 1) && (!noOverflowX || [...el.querySelectorAll('.pri, .sec')].every((t) => t.scrollWidth <= t.clientWidth + 1));
      };
      if (!fits(min)) {
        // Even the smallest size is too wide: let the lines wrap rather than cut them off.
        set(min);
        el.classList.add('squeeze');
        return;
      }
      let lo = min;
      let hi = max;
      for (let i = 0; i < 8; i++) {
        const mid = (lo + hi) / 2;
        if (fits(mid)) lo = mid;
        else hi = mid;
      }
      set(Math.floor(lo * 100) / 100);
    } finally {
      el.classList.remove('measuring');
    }
  }, deps);
}

// ------------------------------------------------------------------ backgrounds

function Background({ bg, video }) {
  const kind = bg === 'video' && !video ? 'glow' : bg;
  const frames = useSwap(kind, { kind, video }, 800);
  return frames.map(
    (f) => html`<div key=${f.key} class=${`bg ${f.leaving ? 'bg-out' : 'bg-in'}`}><${BgLayer} ...${f.data} /></div>`,
  );
}

// Every environment except the plain ones gets film grain and a slow light sweep on top.
const Texture = () => html`<i class="grain"></i><i class="sweep"></i>`;
const Grain = () => html`<i class="grain"></i>`;
const CARD_ENVS = new Set(
  ['plum', 'deepteal', 'desk', 'auroraglow', 'velvet', 'charcoal', 'nave', 'stars', 'glory', 'sand', 'waters', 'mountains', 'embers', 'pop', 'forestdark', 'leather', 'dusk', 'wall', 'void', 'paperhills', 'barkcloth'],
);

function BgLayer({ kind, video }) {
  if (kind === 'none') return null;
  if (kind === 'black') return html`<div class="bg-fill bg-black"></div>`;
  if (kind === 'video')
    return html`<div class="bg-fill bg-video">
      <video src=${video} autoplay muted loop playsinline></video><div class="bg-dim"></div><div class="vig"></div>
    </div>`;
  if (kind === 'key') return html`<div class="bg-fill bg-key"><div class="bg-keyband"></div></div>`;
  if (kind === 'crowd')
    return html`<div class="bg-fill bg-crowd"><i class="lights"></i><i class="haze"></i><${Texture} /><div class="vig"></div></div>`;
  if (kind === 'wood') return html`<div class="bg-fill bg-wood"><i class="grainlines"></i><i class="corner"></i><${Texture} /></div>`;
  if (kind === 'arcs') return html`<div class="bg-fill bg-arcs"><i class="art"></i><i class="marks"></i><${Texture} /></div>`;
  if (kind === 'beams')
    return html`<div class="bg-fill bg-beams"><i class="beam"></i><i class="scan"></i><i class="floor"></i><${Texture} /><div class="vig"></div></div>`;
  if (kind === 'bluestage')
    return html`<div class="bg-fill bg-bluestage"><i class="glows"></i><i class="truss"></i><i class="haze"></i><${Texture} /><div class="vig"></div></div>`;
  if (kind === 'forest')
    return html`<div class="bg-fill bg-forest"><i class="trees"></i><i class="g1"></i><i class="g2"></i><i class="g3"></i><${Texture} /></div>`;
  if (kind === 'darkglow') return html`<div class="bg-fill bg-darkglow"><i class="glow"></i><${Texture} /></div>`;
  if (kind === 'mono')
    return html`<div class="bg-fill bg-mono"><i class="light"></i><i class="crowd"></i><${Texture} /><i class="tint"></i></div>`;
  if (kind === 'film')
    return html`<div class="bg-fill bg-film"><i class="leak"></i><${Texture} /><div class="vig"></div></div>`;
  if (kind === 'bokeh')
    return html`<div class="bg-fill bg-bokeh">
      ${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => html`<i class=${`b${i}`}></i>`)}<${Texture} /><div class="vig"></div>
    </div>`;
  if (kind === 'leaks')
    return html`<div class="bg-fill bg-leaks"><i class="l0"></i><i class="l1"></i><i class="l2"></i><${Texture} /><div class="vig"></div></div>`;
  // Scripture environments (still: light sweeps would distract from reading).
  if (kind === 'stone') return html`<div class="bg-fill bg-stone"><${Grain} /><div class="vig"></div></div>`;
  if (kind === 'parchment') return html`<div class="bg-fill bg-parchment"><i class="paper"></i><i class="edge"></i></div>`;
  if (kind === 'vellum') return html`<div class="bg-fill bg-vellum"><i class="glow"></i><${Grain} /><div class="vig"></div></div>`;
  if (kind === 'linen') return html`<div class="bg-fill bg-linen"><i class="weave"></i><i class="light"></i><${Grain} /></div>`;
  if (kind === 'dawn') return html`<div class="bg-fill bg-dawn"><i class="horizon"></i><${Grain} /></div>`;
  if (kind === 'watercolour') return html`<div class="bg-fill bg-watercolour"><i class="wash"></i><i class="paper"></i></div>`;
  if (kind === 'slate') return html`<div class="bg-fill bg-slate"><i class="smear"></i><${Grain} /><i class="frameln"></i></div>`;
  if (kind === 'kitenge') return html`<div class="bg-fill bg-kitenge"><i class="band top"></i><i class="band bot"></i><${Grain} /></div>`;
  if (kind === 'candle') return html`<div class="bg-fill bg-candle"><i class="light"></i><${Grain} /><div class="vig"></div></div>`;
  if (kind === 'blueprint') return html`<div class="bg-fill bg-blueprint"><i class="rules"></i><i class="circle"></i><${Grain} /></div>`;
  if (kind === 'night') return html`<div class="bg-fill bg-night"><${Grain} /><div class="vig"></div></div>`;
  // The card looks' environments: up to three shapes, grain and a vignette, all drawn in CSS.
  if (CARD_ENVS.has(kind))
    return html`<div class=${`bg-fill bg-s bg-${kind}`}><i class="i1"></i><i class="i2"></i><i class="i3"></i><${Grain} /><div class="vig"></div></div>`;
  return html`<div class="bg-fill bg-glow"><div class="glow"></div><${Texture} /><div class="vig"></div></div>`;
}

// ------------------------------------------------------------------ frames

/** The words of `text` as spans, numbered from `start` in `field`, with the operator's emphasis marks. */
// A fixed pseudo-random number per (slide, word), so every output draws the same picture.
const hash = (a, b = 0) => {
  let h = (a * 2654435761 + b * 40503 + 12345) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519) >>> 0;
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
};

/**
 * The words of `text` as spans, numbered from `start` in `field`, with the operator's emphasis marks.
 * `seed` (the slide number) and `hero` (the word to swell) are for songs; each word also gets a font
 * class and a fly-in direction that the Mix and Wild settings may use.
 */
function Words({ text, field, start = 0, marks, seed = 0, hero = -1, head = null, tail = null, cur = null }) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const last = words.length - 1;
  return words.map((w, i) => {
    const n = start + i;
    const m = marks && marks[`${field}:${n}`];
    const font = Math.floor(hash(seed, n) * 5) + 1;
    const angle = hash(seed + 7, n) * Math.PI * 2;
    const r = 700 + hash(seed + 13, n) * 500;
    const fx = Math.round(Math.cos(angle) * r);
    const fy = Math.round(Math.sin(angle) * r * 0.7);
    const fr = Math.round((hash(seed + 29, n) - 0.5) * 80);
    // Following the singer: sung, being sung now, or still to come.
    const at = cur ? (n < cur[0] ? ' sung' : n <= cur[1] ? (cur[0] === cur[1] ? ' now one' : ' now') : ' next') : '';
    const cls = `w f${font}${n === hero ? ' hero' : ''}${m ? ` mk-${m.c}${m.b ? ' bend' : ''}` : ''}${at}`;
    // head / tail (an opening quote, a closing one, the dots of a verse that goes on) stay with their word.
    return html`${i > 0 ? ' ' : ''}<span class=${cls} style=${`--wi:${n};--li:${i};--fx:${fx}px;--fy:${fy}px;--fr:${fr}deg`}
      >${i === 0 ? head : null}${w}${i === last ? tail : null}</span
    >`;
  });
}

/** The word to swell: the longest word on the slide (ties: the later one). */
function heroOf(lines) {
  const words = lines.join(' ').split(/\s+/).filter(Boolean);
  let best = -1;
  words.forEach((w, i) => {
    if (best < 0 || w.length >= words[best].length) best = i;
  });
  return best;
}

/** Song lines; the words are numbered straight through the slide, however the lines are broken. */
function Lines({ lines, marks, seed = 0, hero = -1, cur = null }) {
  let start = 0;
  return lines.map((l, i) => {
    const n = String(l).split(/\s+/).filter(Boolean).length;
    const el = html`<span class="ln" style=${`--i:${i}`}><${Words} text=${l} field="l" start=${start} marks=${marks} seed=${seed} hero=${hero} cur=${cur} /></span>`;
    start += n;
    return el;
  });
}

const BASE = { classic: 140, worship: 130, praise: 125, poster: 200, sunshine: 150, lines: 120, beams: 140, banner: 150, midnight: 150, pixel: 200, neon: 160, grateful: 150, film: 200 };
const LINE_H = { classic: 1.18, worship: 1.15, praise: 1.08, poster: 0.98, sunshine: 1.05, lines: 1.15, beams: 1.1, banner: 1.0, midnight: 1.0, pixel: 0.95, neon: 0.98, grateful: 1.02, film: 0.98 };
const MAX_LYRIC = { poster: 340, pixel: 340, film: 340 };
const maxLyric = (preset) => (MAX_LYRIC[preset] || 300) / BASE[preset];
const LYRIC_H = SAFE_H * 0.88;
// These looks write the lyrics in capitals whatever the Capitals switch says.
const UPPER = new Set(['praise', 'poster', 'sunshine', 'lines', 'beams', 'banner', 'midnight', 'pixel', 'neon', 'grateful', 'film']);

/**
 * Fill mode: a one-line slide re-broken into two when that makes the letters clearly bigger
 * (a long line is held back by the screen's width). Never more than two lines.
 */
function bestLines(lines, preset, caps, textW) {
  const base = BASE[preset];
  const size = (ls) => {
    const widest = Math.max(...ls.map((l) => lineWidth(caps ? l.toUpperCase() : l, preset)));
    return Math.min(maxLyric(preset), textW / widest, LYRIC_H / (ls.length * base * LINE_H[preset]));
  };
  let best = lines;
  let bestSize = size(lines);
  const words = lines.join(' ');
  for (let k = lines.length + 1; k <= 2; k++) {
    const c = splitAtPauses(words, k);
    if (c.length !== k) break;
    const sz = size(c);
    if (sz > bestSize * 1.1) {
      best = c;
      bestSize = sz;
    }
  }
  return best;
}

function SongFrame({ item, index, lt, fill, caps, preset, textW, fontsReady, marks, hero = false, place = 'center', mix = false, wc = null }) {
  const slide = item.slides[index];
  const box = useRef(null);
  const refill = fill && !lt;
  // Re-breaking lines needs widths in one font; with mixed fonts or a hero word the DOM measure in useFill decides.
  const lines = slide ? (refill && fontsReady && !mix && !hero ? bestLines(slide.lines, preset, caps || UPPER.has(preset), textW) : slide.lines) : [];
  // A line is never allowed to wrap into a third: wide display fonts may shrink to half the standard.
  useFill(box, { on: refill, max: maxLyric(preset), min: 0.5, availH: LYRIC_H, lines: true }, [
    lines.join('\n'),
    fill,
    caps,
    textW,
    preset,
    fontsReady,
    hero,
    place,
    mix,
  ]);
  if (!slide) return null;
  // Where this slide's words sit.
  const side =
    place === 'alternate' ? ['left', 'right', 'center'][index % 3] : place === 'random' ? ['left', 'center', 'right'][Math.floor(hash(index, 99) * 3)] : place === 'lines' ? 'lines' : 'center';
  // The hero: with two lines the second line swells and the first takes the accent; with one, the longest word.
  const heroWord = hero && lines.length < 2 ? heroOf(lines) : -1;
  if (lt)
    return html`<div class="lt-band"><div class="lt-lyric"><${Lines} lines=${slide.lines} marks=${marks} cur=${wc} /></div></div>`;
  return html`<div class="safe">
    <div class=${`lyric place-${side}${hero ? ' hero-on' : ''}${hero && lines.length > 1 ? ' hero-line' : ''}`} ref=${box}>
      <${Lines} lines=${lines} marks=${marks} seed=${index} hero=${heroWord} cur=${wc} />
      ${PRESET_INFO[preset].subtitle && html`<div class="sub">${item.title}</div>`}
    </div>
    ${preset === 'classic' && html`<div class="songtag">${item.title}</div>`}
    ${preset === 'worship' && index === 0 && html`<div class="songtitle">${item.title}</div>`}
  </div>`;
}

/**
 * The verses on one slide. Each verse starts with its number; a verse continued from the slide
 * before starts with "…", one that goes on to the next slide ends with "…" (`contOut`); with
 * `quotes` the slide's text is “quoted”. With `reveal`, verse `cur` is the one being read: the
 * ones before it dim, the ones after it wait unseen (keeping their room, so nothing moves when they
 * come). `dropCap` hands the first letter to the look's illuminated capital (its number rides on it).
 */
function Verses({ slide, field, marks, cur = 0, reveal = false, dropCap = false, quotes = false, contOut = false }) {
  const segs = (slide.verses || [{ verse: slide.verse, part: slide.part, primary: slide.primary, secondary: slide.secondary }]).filter(
    (g) => g[field],
  );
  const key = field === 'primary' ? 'p' : 's';
  const lastI = segs.length - 1;
  let start = 0;
  return segs.map((g, i) => {
    const state = !reveal ? '' : i < cur ? ' read' : i === cur ? ' cur' : ' next';
    const text = String(g[field]);
    const whole = !g.part || g.part === 'a';
    const cap = dropCap && i === 0 && whole ? text.charAt(0) : '';
    const q = quotes && !cap;
    const vn = whole && html`<sup class="vn">${g.verse}</sup>`;
    const head = i === 0 && (q || !whole) ? html`${q && html`<span class="q">“</span>`}${!whole && html`<span class="el">…</span>`}` : null;
    const tail = i === lastI && (q || contOut) ? html`${contOut && html`<span class="el">…</span>`}${q && html`<span class="q">”</span>`}` : null;
    const el = html`${i > 0 ? ' ' : ''}<span class=${`vs${state}`}
        >${cap ? html`<span class="cap">${vn}${cap}</span>` : vn}<${Words}
          text=${cap ? text.slice(1) : text}
          field=${key}
          start=${start}
          marks=${marks}
          head=${head}
          tail=${tail}
      /></span>`;
    start += text.split(/\s+/).filter(Boolean).length;
    return el;
  });
}

// Room for the text in each scripture look (the environment's frame or heading takes the rest),
// and how far fill mode may grow it (narrow columns and cards grow less, so they stay elegant).
const SCRIP_H = { kitenge: 760, manuscript: 640, scroll: 700, parchment: 760 };
const SCRIP_MAX = { parchment: 1.4, blueprint: 1.3, scroll: 1.4 };
const CARD_MAX = 1.3;
// Card looks with one card per language, and the cards with their own way of showing the reference.
const TWO_CARDS = new Set(['twin', 'stack', 'bible']);

/** The three dots that say the passage goes on. */
const Dots = ({ cls = 'smore' }) => html`<div class=${cls} aria-label="continues"><i></i><i></i><i></i></div>`;

function ScriptureFrame({ item, index, lt, fill, textW, fontsReady, marks, look = 'ink', sub = 0, reveal = false, quotes = true }) {
  const s = item.slides[index];
  const box = useRef(null);
  const steps = s && s.verses ? s.verses.length : 1;
  const cur = Math.min(sub, steps - 1);
  const card = SCRIPTURE_INFO[look] && SCRIPTURE_INFO[look].group === 'card' && look !== 'linen' && look !== 'scroll';
  // Beside an illustration the Scroll's ribbon leaves room for its reference underneath.
  const many = Boolean(item.many);
  const scroll = Boolean(item.scroll);
  const col = useRef(null);
  const placed = useRef(false);
  const availH = (SCRIP_H[look] || SAFE_H * (many ? 0.95 : 0.92)) * (look === 'scroll' && textW < SAFE_W ? 0.8 : 1);
  // Many verses: as large as the screen allows for this much text, smaller or bigger than standard.
  useFill(box, scroll ? { on: false, availH } : many ? { on: !lt, max: 3, min: 0.3, availH, noOverflowX: true } : { on: fill && !lt, max: card ? CARD_MAX : SCRIP_MAX[look] || 1.8, min: 0.8, availH }, [
    s && s.ref,
    s && s.primary,
    s && s.secondary,
    fill,
    textW,
    fontsReady,
    look,
    quotes,
    many,
  ]);
  // Scroll: glide the column so the verse being read sits a little below the top of the view.
  useLayoutEffect(() => {
    const c = col.current;
    if (!scroll || !c) return;
    const view = c.parentElement;
    const el = c.querySelector(`[data-v="${cur}"]`);
    if (!el || !view) return;
    const y = Math.min(0, view.clientHeight * 0.2 - el.offsetTop);
    if (!placed.current) c.style.transition = 'none';
    c.style.transform = `translateY(${Math.round(y)}px)`;
    if (!placed.current) {
      void c.offsetHeight;
      c.style.transition = '';
      placed.current = true;
    }
  }, [scroll, cur, look, s && s.ref, fontsReady, quotes]);
  if (!s) return null;
  const more = index < item.slides.length - 1;
  // Does this slide stop in the middle of a verse (in this language)?
  const nf = more && item.slides[index + 1].verses && item.slides[index + 1].verses[0];
  const contOut = (field) => Boolean(nf && nf.part && nf.part !== 'a' && nf[field]);
  const v = (field, extra = {}) =>
    html`<${Verses} slide=${s} field=${field} marks=${marks} cur=${cur} reveal=${reveal} quotes=${quotes} contOut=${contOut(field)} ...${extra} />`;
  if (lt && (many || scroll) && s.verses && s.verses.length > 1) {
    // The stream's lower third has room for one verse: the one being read.
    const g = s.verses[cur];
    const one = { ...s, verses: [g], primary: g.primary, secondary: g.secondary };
    const ref = String(s.ref).replace(/: [\dA-Za-z]+(?:-\d+)?/g, `: ${g.verse}`);
    const vOne = (field) => html`<${Verses} slide=${one} field=${field} marks=${null} quotes=${quotes} />`;
    return html`<div class="lt-band lt-scrip" key=${g.verse}>
      <div class="ln ref" style="--i:0"><span class="tab">${ref}</span>${(more || cur < steps - 1) && html`<${Dots} cls="more" />`}</div>
      ${g.primary && html`<div class="ln pri" style="--i:1">${vOne('primary')}</div>`}
      ${g.secondary && html`<div class="ln sec" style="--i:2">${vOne('secondary')}</div>`}
    </div>`;
  }
  if (lt)
    return html`<div class="lt-band lt-scrip">
      <div class="ln ref" style="--i:0"><span class="tab">${s.ref}</span>${more && html`<${Dots} cls="more" />`}</div>
      ${s.primary && html`<div class="ln pri" style="--i:1">${v('primary')}</div>`}
      ${s.secondary && html`<div class="ln sec" style="--i:2">${v('secondary')}</div>`}
    </div>`;
  const cont = more && html`<${Dots} />`;
  const sec = (label = true) =>
    s.secondary &&
    html`<div class="ln sec" style="--i:2">
      ${label && item.secondaryLabel && s.primary && html`<span class="ver">${item.secondaryLabel}</span>`}${v('secondary')}
    </div>`;
  const pri = s.primary && html`<div class="ln pri" style="--i:1">${v('primary')}</div>`;
  const ref = html`<div class="ln ref" style="--i:0">${s.ref}</div>`;
  const vs = s.verses || [];
  const range = vs.length ? (vs[0].verse === vs[vs.length - 1].verse ? `${vs[0].verse}` : `${vs[0].verse}–${vs[vs.length - 1].verse}`) : '';

  if (scroll && !lt) {
    // Each verse with its translation right under it; the whole passage is one quotation.
    const segs = s.verses || [];
    let pStart = 0;
    let sStart = 0;
    const last = segs.length - 1;
    const q = (open) => quotes && html`<span class="q">${open ? '“' : '”'}</span>`;
    const rows = segs.map((g, i) => {
      const st = i < cur ? 'read' : i === cur ? 'cur' : 'next';
      const pw = String(g.primary || '').split(/\s+/).filter(Boolean).length;
      const sw = String(g.secondary || '').split(/\s+/).filter(Boolean).length;
      const row = html`<div class=${`sv ${st}`} data-v=${i}>
        ${g.primary &&
        html`<div class="pri"><sup class="vn">${g.verse}</sup><${Words} text=${g.primary} field="p" start=${pStart} marks=${marks} head=${i === 0 ? q(true) : null} tail=${i === last ? q(false) : null} /></div>`}
        ${g.secondary &&
        html`<div class="sec"><sup class="vn">${g.verse}</sup><${Words} text=${g.secondary} field="s" start=${sStart} marks=${marks} head=${i === 0 && !g.primary ? q(true) : null} tail=${i === last && !g.primary ? q(false) : null} /></div>`}
      </div>`;
      pStart += pw;
      sStart += sw;
      return row;
    });
    const column = html`<div class="scol" ref=${col}><div class="ref">${s.ref}</div>${rows}</div>`;
    // Looks whose ink is meant for a card or ribbon keep one behind the column.
    const onCard = card || look === 'scroll' || look === 'linen';
    return html`<div class=${`scrip sview l-${look} ${onCard ? 'lc' : ''}`} ref=${box}>
      ${onCard ? html`<div class="card scard">${column}</div>` : column}
    </div>`;
  }
  if (card && TWO_CARDS.has(look)) {
    // One card (or page) per language.
    const bible = look === 'bible';
    // Twin cards each carry their own half of the reference ("Yokaana 11 : 33" | "John 11 : 33 · KJV").
    const [refA, refB] = String(s.ref).split(' · ');
    const twin = look === 'twin' && refB;
    const label2 = twin ? [refB, item.secondaryLabel].filter(Boolean).join(' · ') : item.secondaryLabel;
    const head1 = bible && item.book
      ? html`<div class="ln rh" style="--i:0">${item.book.lg} ${item.chapter}</div>`
      : twin
        ? html`<div class="ln ref" style="--i:0">${refA}</div>`
        : ref;
    const head2 = bible && item.book
      ? html`<div class="ln rh" style="--i:0">${item.book.en === 'Psalms' ? 'Psalm' : item.book.en} ${item.chapter}</div>`
      : label2 && html`<div class="ln ver2" style="--i:0">${label2}</div>`;
    return html`<div class=${`scrip lc2 l-${look}`} ref=${box}>
        <div class="card c1"><i class="d1"></i>${head1}${pri}</div>
        ${s.secondary && html`<div class="card c2"><i class="d1"></i>${head2}<div class="ln sec" style="--i:2">${v('secondary')}</div></div>`}
      </div>
      ${cont}`;
  }
  if (card) {
    const body = look === 'split'
      ? html`<div class="side ln" style="--i:0">
            <div class="bk">${item.book ? item.book.lg : ''}</div>
            <div class="chn">${item.chapter || ''}</div>
            <div class="vv">${item.book ? (item.book.en === 'Psalms' ? 'Psalm' : item.book.en) : ''} · ${range}</div>
          </div>
          <div class="body">${pri}${sec(false)}</div>`
      : html`${look !== 'gallery' && ref}${pri}${look === 'tablet' && s.primary && s.secondary && html`<i class="rule"></i>`}${sec(false)}`;
    return html`<div class=${`scrip lc l-${look}`} ref=${box}>
        <div class="card">
          <i class="d1"></i><i class="d2"></i><i class="d3"></i><i class="d4"></i>
          ${look === 'bookmark' && html`<i class="ribbon"><b>${range}</b></i>`}
          ${body}
        </div>
        ${look === 'gallery' && html`<div class="ln caption" style="--i:3">${s.ref}</div>`}
      </div>
      ${cont}`;
  }
  if (look === 'parchment')
    return html`<div class="ln sref" style="--i:0">${s.ref}</div>
      <div class=${`scrip l-${look}`} ref=${box}>
        ${pri}
        <i class="rule"></i>
        ${sec(false)}
      </div>
      ${cont}`;
  if (look === 'manuscript') {
    const chap = item.chapter ? `Chapter ${item.chapter} · ${item.v1 === item.v2 ? `verse ${item.v1}` : `verses ${item.v1}–${item.v2}`}` : s.ref;
    return html`<div class="ln shead" style="--i:0">
        <div class="book">${item.book ? `${item.book.lg} · ${item.book.en}` : s.ref}</div>
        <div class="ch">${chap}</div>
      </div>
      <div class=${`scrip l-${look}`} ref=${box}>
        ${s.primary && html`<div class="ln pri" style="--i:1">${v('primary', { dropCap: true })}</div>`}
        ${sec(false)}
      </div>
      <div class="sorn">✦ ✦ ✦</div>
      ${cont}`;
  }
  if (look === 'linen')
    return html`<div class=${`scrip l-${look}`} ref=${box}>
        <div class="card">
          ${ref}
          ${pri}
          ${!s.primary && sec(false)}
        </div>
        ${s.primary &&
        s.secondary &&
        html`<div class="ln band" style="--i:2">${item.secondaryLabel && html`<b>${item.secondaryLabel}</b>`}<span class="sec">${v('secondary')}</span></div>`}
      </div>
      ${cont}`;
  if (look === 'scroll')
    return html`<div class=${`scrip l-${look}`} ref=${box}>
        <div class="ribbon">
          ${pri}
          ${sec(false)}
        </div>
      </div>
      <div class="ln sref" style="--i:0">${s.ref}</div>
      ${cont}`;
  // Stacked: Ink & stone, Dawn, Watercolour, Chalk & slate, Kitenge, Candlelight, Blueprint.
  return html`<div class=${`scrip l-${look}`} ref=${box}>
      <div class="bar"></div>
      ${ref}
      ${pri}
      ${look === 'chalk' && s.primary && s.secondary && html`<i class="ul"></i>`}
      ${sec()}
    </div>
    ${cont}`;
}

// Pictures and videos kept on this device (src "idb:<key>") become object URLs once.
const urlCache = new Map();
function useMediaUrl(src) {
  const [url, setUrl] = useState(() => (src.startsWith('idb:') ? urlCache.get(src) || '' : src));
  useEffect(() => {
    if (!src.startsWith('idb:')) {
      setUrl(src);
      return;
    }
    if (urlCache.has(src)) {
      setUrl(urlCache.get(src));
      return;
    }
    idbGet('files', src.slice(4))
      .then((blob) => {
        if (!blob) return;
        const u = URL.createObjectURL(blob);
        urlCache.set(src, u);
        setUrl(u);
      })
      .catch(() => {});
  }, [src]);
  return url;
}

/** One picture or video, filling its box. */
function MediaView({ src, type, title, live, loop, sound, blur = true }) {
  const url = useMediaUrl(src || '');
  const vid = useRef(null);
  useEffect(() => {
    const v = vid.current;
    if (!v || !live) return;
    v.muted = !sound;
    v.play().catch(() => {
      // Autoplay with sound needs a click on the page first: play silently rather than not at all.
      v.muted = true;
      v.play().catch(() => {});
    });
  }, [url, live]);
  if (!url) return null;
  if (type === 'video')
    return html`<div class="mf">
      <video ref=${vid} src=${url} class="mf-main" autoplay=${live} loop=${loop} playsinline muted=${!live || !sound}></video>
    </div>`;
  return html`<div class="mf">
    ${blur && html`<img src=${url} class="mf-blur" alt="" aria-hidden="true" />`}
    <img src=${url} class="mf-main" alt=${title || ''} />
  </div>`;
}

function MediaFrame({ item, index, live }) {
  const slide = item.slides[index];
  if (!slide) return null;
  return html`<${MediaView} ...${slide} live=${live} loop=${item.loop} sound=${item.sound} />`;
}

const TitleFrame = ({ item }) =>
  item.kind === 'scripture' && item.book
    ? html`<div class="titlecard tc-scrip">
        <div class="ln ornt" style="--i:0">✦ ✦ ✦</div>
        <div class="ln book" style="--i:1">${item.book.lg}</div>
        <div class="ln book2" style="--i:1">${item.book.en}</div>
        <div class="ln ch" style="--i:2">Chapter ${item.chapter} · ${item.v1 === item.v2 ? `verse ${item.v1}` : `verses ${item.v1}–${item.v2}`}</div>
      </div>`
    : html`<div class="titlecard">
        <div class="ln tc-title" style="--i:0">${item.title}</div>
        <div class="ln tc-church" style="--i:1">${CHURCH_NAME}</div>
      </div>`;

const LogoFrame = () => html`<div class="logo">
  <svg class="ln" style="--i:0" viewBox="0 0 40 56" width="56" height="78" aria-hidden="true">
    <path d="M17 0h6v16h17v6H23v34h-6V22H0v-6h17z" fill="currentColor" />
  </svg>
  <div class="ln logo-name" style="--i:1">Namasuba Redeemed</div>
  <div class="ln logo-sub" style="--i:2">Society Church · Kampala</div>
</div>`;

// How long a scripture frame takes to leave, by motion (the page turn and the slide travel further).
const SMO_OUT = { gentle: 250, page: 760, type: 300, reveal: 420, slide: 520 };

const marksFor = (st, item, index) => (st.marks && item ? st.marks[`${item.id}:${index}`] : null) || null;

/** Which frame the state shows on an output: { key, kind, preset } (preset = the song's look). */
export function frameOf(state, { titleFor = null, out = 'preview' } = {}) {
  const { item, index = 0, mode } = state || {};
  if (!state || mode === 'black' || mode === 'clear') return { key: 'none', kind: 'none' };
  if (mode === 'logo' || !item) return { key: 'logo', kind: 'logo' };
  if (!shownOn(item, out)) return { key: 'none', kind: 'none' };
  if ((item.kind === 'song' || item.kind === 'scripture') && titleFor === item.id && index === 0 && !state.sub)
    return { key: `title:${item.id}`, kind: 'title' };
  const kind = item.kind === 'scripture' ? 'scripture' : item.kind === 'media' ? 'media' : 'song';
  // A scripture look change crosses over like a slide change.
  const key = kind === 'scripture' ? `${item.id}:${index}:${scriptureLookOf(state)}` : `${item.id}:${index}`;
  return { key, kind, preset: kind === 'song' ? lookOf(state, item) : kind };
}

/**
 * @param {object} p
 * @param {object} p.state           screen state
 * @param {'tv'|'stream'|'preview'} [p.out]  which output this is (media and illustrations are for the TV)
 * @param {'full'|'lowerthird'} [p.layout]
 * @param {'auto'|'key'|'none'} [p.background]  auto = the TV background from the state; key = black for the ATEM; none = transparent (OBS)
 * @param {boolean} [p.titleCards]   show the 2 s title card before a song or passage (the real TV only)
 * @param {string} [p.video]         background video URL chosen on this PC
 * @param {boolean} [p.safe]         draw the 5% safe margin
 */
export function Stage({ state, out = 'preview', layout = 'full', background = 'auto', titleCards = false, video = '', safe = false, still = false }) {
  // still: true = a still picture (the side previews); 'bg' = the environment still but the words move (the live monitor).
  const st = state || {};
  const lowerThird = layout === 'lowerthird';
  const fontsReady = useFontsReady();
  const [titleFor, setTitleFor] = useState(null);
  const seen = useRef(st.item && st.item.id);
  const itemId = st.item && (st.item.kind === 'song' || st.item.kind === 'scripture') ? st.item.id : null;
  useEffect(() => {
    if (!titleCards || !itemId || seen.current === itemId) return undefined;
    seen.current = itemId;
    if (st.index !== 0 || st.mode !== 'show') return undefined;
    setTitleFor(itemId);
    const t = setTimeout(() => setTitleFor(null), 2000);
    return () => clearTimeout(t);
  }, [itemId, titleCards]);

  const f = frameOf(st, { titleFor: lowerThird ? null : titleFor, out });
  const showLogo = out !== 'stream' && background !== 'none';
  const key = f.kind === 'logo' && !showLogo ? 'none' : f.key;
  const motion = SCRIPTURE_MOTIONS[st.sMotion] ? st.sMotion : 'reveal';
  const outMs = f.kind === 'scripture' ? SMO_OUT[motion] : OUT_MS[f.kind === 'song' ? f.preset : f.kind] || 300;
  const frames = useSwap(key, { f, item: st.item, index: st.index || 0 }, outMs, key === 'none');

  // The illustration sits beside the words on the TV (never on the stream feed).
  const illus = out !== 'stream' && !lowerThird && st.illustration && (f.kind === 'song' || f.kind === 'scripture') ? st.illustration : null;
  const illusW = illus ? ILLUS_W[illus.size] || ILLUS_W.half : 0;
  const textW = SAFE_W - (illus ? illusW + 48 : 0);
  const fill = st.fill !== false;

  // A look with its own environment brings it while the song is up (title card included).
  const up = st.item && st.mode === 'show' && shownOn(st.item, out) ? st.item.kind : null;
  const songLook = up === 'song' ? lookOf(st, st.item) : null;
  // Scripture looks always bring theirs: a light page is the look.
  const sLook = scriptureLookOf(st);
  const env = songLook && st.lookBg !== 'mine' ? PRESET_INFO[songLook].env : up === 'scripture' ? SCRIPTURE_INFO[sLook].env : null;
  const bg = background === 'none' ? 'none' : background === 'key' ? (lowerThird ? 'black' : 'key') : env || st.bg;
  const keyed = bg === 'none' || bg === 'key' || bg === 'black';
  // The thin bar through the passage.
  const steps = stepsOf(st);
  const prog = up === 'scripture' && st.progress !== false && !lowerThird && st.item.slides.length ? ((st.index || 0) + Math.min(steps, (st.sub || 0) + 1) / steps) / st.item.slides.length : null;
  const cls = [
    'stage',
    lowerThird ? 'is-lt' : '',
    background === 'none' ? 'is-transparent' : '',
    st.calm ? 'calm' : '',
    `play-${st.play || 'mid'}`,
    st.mixFonts ? 'mix-fonts' : '',
    still === true ? 'still' : '',
    still ? 'still-bg' : '',
    st.caps !== false ? 'caps' : '',
    fill ? 'fill' : '',
    illus ? 'with-illus' : '',
    safe ? 'show-safe' : '',
    `sl-${sLook}`,
    `sfont-${st.sFont === 'sans' ? 'sans' : 'serif'}`,
    lowerThird ? '' : `smo-${motion}`,
    st.reveal !== false ? 'reveal-on' : '',
    up === 'scripture' && st.item.many ? 'smany' : '',
    st.followDim !== false ? 'follow-dim' : '',
    keyed ? 'keyed' : '',
  ].join(' ');
  return html`<div class=${cls} style=${`--illus-w:${illusW}px`}>
    <${Background} bg=${bg} video=${st.bgVideo || video} />
    ${frames.map(({ key: k, data, leaving, outMs: o }) => {
      const kind = data.f.kind;
      const preset = kind === 'song' ? data.f.preset : kind;
      return html`<div key=${k} class=${`frame k-${kind} p-${preset} ik-${data.item ? data.item.kind : 'none'} ${leaving ? 'out' : 'in'}`} style=${`--out:${o}ms`}>
        ${kind === 'song' &&
        html`<${SongFrame} item=${data.item} index=${data.index} lt=${lowerThird} fill=${fill} caps=${st.caps !== false} preset=${data.f.preset} textW=${textW} fontsReady=${fontsReady} marks=${marksFor(st, data.item, data.index)} hero=${Boolean(st.hero)} place=${st.place || 'center'} mix=${Boolean(st.mixFonts)} wc=${!leaving && data.index === (st.index || 0) && Array.isArray(st.wc) && (out !== 'stream' || st.followStream !== false) ? st.wc : null} />`}
        ${kind === 'scripture' &&
        html`<${ScriptureFrame} item=${data.item} index=${data.index} lt=${lowerThird} fill=${fill} textW=${textW} fontsReady=${fontsReady} marks=${marksFor(st, data.item, data.index)} look=${sLook} sub=${data.index === (st.index || 0) ? st.sub || 0 : steps} reveal=${st.reveal !== false} quotes=${st.quotes !== false} />`}
        ${kind === 'media' && html`<${MediaFrame} item=${data.item} index=${data.index} live=${out !== 'preview' && !leaving} />`}
        ${kind === 'title' && html`<${TitleFrame} item=${data.item} />`}
        ${kind === 'logo' && html`<${LogoFrame} />`}
      </div>`;
    })}
    ${illus &&
    html`<div class="illus" key=${illus.src}>
      <${MediaView} ...${illus} live=${out !== 'preview'} loop=${true} sound=${false} blur=${false} />
    </div>`}
    ${prog != null && html`<div class="progress"><i style=${`width:${(prog * 100).toFixed(1)}%`}></i></div>`}
    ${background !== 'none' && html`<div class=${`blackout ${st.mode === 'black' ? 'on' : ''}`}></div>`}
    <div class="safe-guide"></div>
  </div>`;
}
