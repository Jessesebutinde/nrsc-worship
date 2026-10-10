// The screen picture: a fixed 1920x1080 canvas scaled to fit its box. Used by the TV and stream
// outputs and by every preview in the remote, so what the operator sees is what the hall sees.

import { html, useState, useEffect, useRef, useLayoutEffect } from '../ui/h.js';
import { CHURCH_NAME } from './config.js';
import { shownOn, lookOf, PRESET_INFO } from './state.js';
import { idbGet } from './idb.js';
import { splitAtPauses } from './split.js';
import { lineWidth } from './measure.js';

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

// Fonts arrive after the first paint; text measured before that is measured in the wrong font.
let fontsDone = typeof document === 'undefined' || !document.fonts ? true : document.fonts.status === 'loaded';
function useFontsReady() {
  const [ready, setReady] = useState(fontsDone);
  useEffect(() => {
    if (ready || !document.fonts) return;
    document.fonts.ready.then(() => {
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
function useFill(ref, { on, max, min = 1, availH, lines = false }, deps) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = (s) => el.style.setProperty('--fs', String(s));
    el.classList.remove('squeeze');
    if (!on) {
      set(1);
      return;
    }
    const fits = (s) => {
      set(s);
      return el.scrollHeight <= availH && (!lines || widestLine(el) <= 1);
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

function BgLayer({ kind, video }) {
  if (kind === 'none') return null;
  if (kind === 'black') return html`<div class="bg-fill bg-black"></div>`;
  if (kind === 'video')
    return html`<div class="bg-fill bg-video">
      <video src=${video} autoplay muted loop playsinline></video><div class="bg-dim"></div><div class="vig"></div>
    </div>`;
  if (kind === 'key') return html`<div class="bg-fill bg-key"><div class="bg-keyband"></div></div>`;
  if (kind === 'crowd')
    return html`<div class="bg-fill bg-crowd"><i class="lights"></i><i class="haze"></i><i class="grain"></i><div class="vig"></div></div>`;
  if (kind === 'wood') return html`<div class="bg-fill bg-wood"><i class="grainlines"></i><i class="corner"></i></div>`;
  if (kind === 'arcs') return html`<div class="bg-fill bg-arcs"><i class="art"></i><i class="marks"></i></div>`;
  if (kind === 'beams')
    return html`<div class="bg-fill bg-beams"><i class="beam"></i><i class="scan"></i><i class="floor"></i><div class="vig"></div></div>`;
  if (kind === 'bluestage')
    return html`<div class="bg-fill bg-bluestage"><i class="glows"></i><i class="truss"></i><i class="haze"></i><i class="grain"></i><div class="vig"></div></div>`;
  if (kind === 'forest')
    return html`<div class="bg-fill bg-forest"><i class="trees"></i><i class="g1"></i><i class="g2"></i><i class="g3"></i><i class="grain"></i></div>`;
  if (kind === 'darkglow') return html`<div class="bg-fill bg-darkglow"><i class="glow"></i></div>`;
  if (kind === 'mono')
    return html`<div class="bg-fill bg-mono"><i class="light"></i><i class="crowd"></i><i class="grain"></i><i class="tint"></i></div>`;
  if (kind === 'film')
    return html`<div class="bg-fill bg-film"><i class="leak"></i><i class="grain"></i><div class="vig"></div></div>`;
  if (kind === 'bokeh')
    return html`<div class="bg-fill bg-bokeh">
      ${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => html`<i class=${`b${i}`}></i>`)}<div class="vig"></div>
    </div>`;
  if (kind === 'leaks')
    return html`<div class="bg-fill bg-leaks"><i class="l0"></i><i class="l1"></i><i class="l2"></i><div class="vig"></div></div>`;
  return html`<div class="bg-fill bg-glow"><div class="glow"></div><div class="vig"></div></div>`;
}

// ------------------------------------------------------------------ frames

/** The words of `text` as spans, numbered from `start` in `field`, with the operator's emphasis marks. */
function Words({ text, field, start = 0, marks }) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  return words.map((w, i) => {
    const m = marks && marks[`${field}:${start + i}`];
    const cls = m ? `w mk-${m.c}${m.b ? ' bend' : ''}` : 'w';
    return html`${i > 0 ? ' ' : ''}<span class=${cls} style=${`--wi:${start + i}`}>${w}</span>`;
  });
}

/** Song lines; the words are numbered straight through the slide, however the lines are broken. */
function Lines({ lines, marks }) {
  let start = 0;
  return lines.map((l, i) => {
    const n = String(l).split(/\s+/).filter(Boolean).length;
    const el = html`<span class="ln" style=${`--i:${i}`}><${Words} text=${l} field="l" start=${start} marks=${marks} /></span>`;
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

function SongFrame({ item, index, lt, fill, caps, preset, textW, fontsReady, marks }) {
  const slide = item.slides[index];
  const box = useRef(null);
  const refill = fill && !lt;
  const lines = slide ? (refill && fontsReady ? bestLines(slide.lines, preset, caps || UPPER.has(preset), textW) : slide.lines) : [];
  // A line is never allowed to wrap into a third: wide display fonts may shrink to half the standard.
  useFill(box, { on: refill, max: maxLyric(preset), min: 0.5, availH: LYRIC_H, lines: true }, [
    lines.join('\n'),
    fill,
    caps,
    textW,
    preset,
    fontsReady,
  ]);
  if (!slide) return null;
  if (lt)
    return html`<div class="lt-band"><div class="lt-lyric"><${Lines} lines=${slide.lines} marks=${marks} /></div></div>`;
  return html`<div class="safe">
    <div class="lyric" ref=${box}>
      <${Lines} lines=${lines} marks=${marks} />
      ${PRESET_INFO[preset].subtitle && html`<div class="sub">${item.title}</div>`}
    </div>
    ${preset === 'classic' && html`<div class="songtag">${item.title}</div>`}
    ${preset === 'worship' && index === 0 && html`<div class="songtitle">${item.title}</div>`}
  </div>`;
}

/** The verses on one slide, with a small number where a new verse starts (only when there are several). */
function Verses({ slide, field, marks }) {
  const segs = (slide.verses || [{ verse: slide.verse, part: slide.part, primary: slide.primary, secondary: slide.secondary }]).filter(
    (g) => g[field],
  );
  const many = new Set(segs.map((g) => g.verse)).size > 1;
  const key = field === 'primary' ? 'p' : 's';
  let start = 0;
  return segs.map((g, i) => {
    const el = html`${i > 0 ? ' ' : ''}${many && (!g.part || g.part === 'a') && html`<sup class="vn">${g.verse}</sup>`}<${Words}
        text=${g[field]}
        field=${key}
        start=${start}
        marks=${marks}
      />`;
    start += String(g[field]).split(/\s+/).filter(Boolean).length;
    return el;
  });
}

function ScriptureFrame({ item, index, lt, fill, textW, fontsReady, marks }) {
  const s = item.slides[index];
  const box = useRef(null);
  useFill(box, { on: fill && !lt, max: 1.8, min: 0.8, availH: SAFE_H * 0.92 }, [s && s.ref, s && s.primary, s && s.secondary, fill, textW, fontsReady]);
  if (!s) return null;
  const more = index < item.slides.length - 1;
  if (lt)
    return html`<div class="lt-band lt-scrip">
      <div class="ln ref" style="--i:0"><span class="tab">${s.ref}</span>${more && html`<span class="more">continues ›</span>`}</div>
      ${s.primary && html`<div class="ln pri" style="--i:1"><${Verses} slide=${s} field="primary" marks=${marks} /></div>`}
      ${s.secondary && html`<div class="ln sec" style="--i:2"><${Verses} slide=${s} field="secondary" marks=${marks} /></div>`}
    </div>`;
  return html`<div class="scrip" ref=${box}>
    <div class="bar"></div>
    <div class="ln ref" style="--i:0">${s.ref}</div>
    ${s.primary && html`<div class="ln pri" style="--i:1"><${Verses} slide=${s} field="primary" marks=${marks} /></div>`}
    ${s.secondary &&
    html`<div class="ln sec" style="--i:2">
      ${item.secondaryLabel && s.primary && html`<span class="ver">${item.secondaryLabel}</span>`}<${Verses} slide=${s} field="secondary" marks=${marks} />
    </div>`}
  </div>`;
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

const TitleFrame = ({ item }) => html`<div class="titlecard">
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

const marksFor = (st, item, index) => (st.marks && item ? st.marks[`${item.id}:${index}`] : null) || null;

/** Which frame the state shows on an output: { key, kind, preset } (preset = the song's look). */
export function frameOf(state, { titleFor = null, out = 'preview' } = {}) {
  const { item, index = 0, mode } = state || {};
  if (!state || mode === 'black' || mode === 'clear') return { key: 'none', kind: 'none' };
  if (mode === 'logo' || !item) return { key: 'logo', kind: 'logo' };
  if (!shownOn(item, out)) return { key: 'none', kind: 'none' };
  if (item.kind === 'song' && titleFor === item.id && index === 0) return { key: `title:${item.id}`, kind: 'title' };
  const kind = item.kind === 'scripture' ? 'scripture' : item.kind === 'media' ? 'media' : 'song';
  return { key: `${item.id}:${index}`, kind, preset: kind === 'song' ? lookOf(state, item) : kind };
}

/**
 * @param {object} p
 * @param {object} p.state           screen state
 * @param {'tv'|'stream'|'preview'} [p.out]  which output this is (media and illustrations are for the TV)
 * @param {'full'|'lowerthird'} [p.layout]
 * @param {'auto'|'key'|'none'} [p.background]  auto = the TV background from the state; key = black for the ATEM; none = transparent (OBS)
 * @param {boolean} [p.titleCards]   show the 2 s song title card (the real TV only)
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
  const itemId = st.item && st.item.kind === 'song' ? st.item.id : null;
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
  const outMs = OUT_MS[f.kind === 'song' ? f.preset : f.kind] || 300;
  const frames = useSwap(key, { f, item: st.item, index: st.index || 0 }, outMs, key === 'none');

  // The illustration sits beside the words on the TV (never on the stream feed).
  const illus = out !== 'stream' && !lowerThird && st.illustration && (f.kind === 'song' || f.kind === 'scripture') ? st.illustration : null;
  const illusW = illus ? ILLUS_W[illus.size] || ILLUS_W.half : 0;
  const textW = SAFE_W - (illus ? illusW + 48 : 0);
  const fill = st.fill !== false;

  // A look with its own environment brings it while the song is up (title card included).
  const songLook = st.item && st.item.kind === 'song' && st.mode === 'show' && shownOn(st.item, out) ? lookOf(st, st.item) : null;
  const env = songLook && st.lookBg !== 'mine' ? PRESET_INFO[songLook].env : null;
  const bg = background === 'none' ? 'none' : background === 'key' ? (lowerThird ? 'black' : 'key') : env || st.bg;
  const cls = [
    'stage',
    lowerThird ? 'is-lt' : '',
    background === 'none' ? 'is-transparent' : '',
    st.calm ? 'calm' : '',
    still === true ? 'still' : '',
    still ? 'still-bg' : '',
    st.caps !== false ? 'caps' : '',
    fill ? 'fill' : '',
    illus ? 'with-illus' : '',
    safe ? 'show-safe' : '',
  ].join(' ');
  return html`<div class=${cls} style=${`--illus-w:${illusW}px`}>
    <${Background} bg=${bg} video=${st.bgVideo || video} />
    ${frames.map(({ key: k, data, leaving, outMs: o }) => {
      const kind = data.f.kind;
      const preset = kind === 'song' ? data.f.preset : kind;
      return html`<div key=${k} class=${`frame k-${kind} p-${preset} ${leaving ? 'out' : 'in'}`} style=${`--out:${o}ms`}>
        ${kind === 'song' &&
        html`<${SongFrame} item=${data.item} index=${data.index} lt=${lowerThird} fill=${fill} caps=${st.caps !== false} preset=${data.f.preset} textW=${textW} fontsReady=${fontsReady} marks=${marksFor(st, data.item, data.index)} />`}
        ${kind === 'scripture' &&
        html`<${ScriptureFrame} item=${data.item} index=${data.index} lt=${lowerThird} fill=${fill} textW=${textW} fontsReady=${fontsReady} marks=${marksFor(st, data.item, data.index)} />`}
        ${kind === 'media' && html`<${MediaFrame} item=${data.item} index=${data.index} live=${out !== 'preview' && !leaving} />`}
        ${kind === 'title' && html`<${TitleFrame} item=${data.item} />`}
        ${kind === 'logo' && html`<${LogoFrame} />`}
      </div>`;
    })}
    ${illus &&
    html`<div class="illus" key=${illus.src}>
      <${MediaView} ...${illus} live=${out !== 'preview'} loop=${true} sound=${false} blur=${false} />
    </div>`}
    ${background !== 'none' && html`<div class=${`blackout ${st.mode === 'black' ? 'on' : ''}`}></div>`}
    <div class="safe-guide"></div>
  </div>`;
}
