// The screen picture: a fixed 1920x1080 canvas scaled to fit its box. Used by the TV and stream
// outputs and by every preview in the remote, so what the operator sees is what the hall sees.

import { html, useState, useEffect, useRef, useLayoutEffect } from '../ui/h.js';
import { CHURCH_NAME } from './config.js';
import { shownOn } from './state.js';
import { idbGet } from './idb.js';

const W = 1920;
const H = 1080;

// How long a frame takes to fade out, by what it shows.
const OUT_MS = { worship: 400, praise: 200, classic: 250, scripture: 250, title: 300, logo: 400, media: 600, none: 400 };

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
  if (kind === 'bokeh')
    return html`<div class="bg-fill bg-bokeh">
      ${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => html`<i class=${`b${i}`}></i>`)}<div class="vig"></div>
    </div>`;
  if (kind === 'leaks')
    return html`<div class="bg-fill bg-leaks"><i class="l0"></i><i class="l1"></i><i class="l2"></i><div class="vig"></div></div>`;
  return html`<div class="bg-fill bg-glow"><div class="glow"></div><div class="vig"></div></div>`;
}

// ------------------------------------------------------------------ frames

const Lines = ({ lines }) => lines.map((l, i) => html`<span class="ln" style=${`--i:${i}`}>${l}</span>`);

function SongFrame({ item, index, lt }) {
  const slide = item.slides[index];
  if (!slide) return null;
  if (lt)
    return html`<div class="lt-band"><div class="lt-lyric"><${Lines} lines=${slide.lines} /></div></div>`;
  const preset = item.preset || 'worship';
  return html`<div class="safe">
    <div class="lyric"><${Lines} lines=${slide.lines} /></div>
    ${preset === 'classic' && html`<div class="songtag">${item.title}</div>`}
    ${preset === 'worship' && index === 0 && html`<div class="songtitle">${item.title}</div>`}
  </div>`;
}

/** The verses on one slide, with a small number where a new verse starts (only when there are several). */
function Verses({ slide, field }) {
  const segs = (slide.verses || [{ verse: slide.verse, part: slide.part, primary: slide.primary, secondary: slide.secondary }]).filter(
    (g) => g[field],
  );
  const many = new Set(segs.map((g) => g.verse)).size > 1;
  return segs.map(
    (g, i) => html`${i > 0 ? ' ' : ''}${many && (!g.part || g.part === 'a') && html`<sup class="vn">${g.verse}</sup>`}${g[field]}`,
  );
}

function ScriptureFrame({ item, index, lt }) {
  const s = item.slides[index];
  if (!s) return null;
  const more = index < item.slides.length - 1;
  if (lt)
    return html`<div class="lt-band lt-scrip">
      <div class="ln ref" style="--i:0"><span class="tab">${s.ref}</span>${more && html`<span class="more">continues ›</span>`}</div>
      ${s.primary && html`<div class="ln pri" style="--i:1"><${Verses} slide=${s} field="primary" /></div>`}
      ${s.secondary && html`<div class="ln sec" style="--i:2"><${Verses} slide=${s} field="secondary" /></div>`}
    </div>`;
  return html`<div class="scrip">
    <div class="bar"></div>
    <div class="ln ref" style="--i:0">${s.ref}</div>
    ${s.primary && html`<div class="ln pri" style="--i:1"><${Verses} slide=${s} field="primary" /></div>`}
    ${s.secondary &&
    html`<div class="ln sec" style="--i:2">
      ${item.secondaryLabel && s.primary && html`<span class="ver">${item.secondaryLabel}</span>`}<${Verses} slide=${s} field="secondary" />
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

function MediaFrame({ item, index, live }) {
  const slide = item.slides[index];
  const url = useMediaUrl(slide ? slide.src : '');
  const vid = useRef(null);
  useEffect(() => {
    const v = vid.current;
    if (!v || !live) return;
    v.muted = !item.sound;
    v.play().catch(() => {
      // Autoplay with sound needs a click on the page first: play silently rather than not at all.
      v.muted = true;
      v.play().catch(() => {});
    });
  }, [url, live]);
  if (!slide || !url) return null;
  if (slide.type === 'video')
    return html`<div class="mf">
      <video ref=${vid} src=${url} class="mf-main" autoplay=${live} loop=${item.loop} playsinline muted=${!live || !item.sound}></video>
    </div>`;
  return html`<div class="mf">
    <img src=${url} class="mf-blur" alt="" aria-hidden="true" />
    <img src=${url} class="mf-main" alt=${slide.title || ''} />
  </div>`;
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

/** Which frame the state shows on an output: { key, kind, preset }. */
export function frameOf(state, { titleFor = null, out = 'preview' } = {}) {
  const { item, index = 0, mode } = state || {};
  if (!state || mode === 'black' || mode === 'clear') return { key: 'none', kind: 'none' };
  if (mode === 'logo' || !item) return { key: 'logo', kind: 'logo' };
  if (!shownOn(item, out)) return { key: 'none', kind: 'none' };
  if (item.kind === 'song' && titleFor === item.id && index === 0) return { key: `title:${item.id}`, kind: 'title' };
  const kind = item.kind === 'scripture' ? 'scripture' : item.kind === 'media' ? 'media' : 'song';
  return { key: `${item.id}:${index}`, kind, preset: kind === 'song' ? item.preset || 'worship' : kind };
}

/**
 * @param {object} p
 * @param {object} p.state           screen state
 * @param {'tv'|'stream'|'preview'} [p.out]  which output this is (media can be sent to one of them)
 * @param {'full'|'lowerthird'} [p.layout]
 * @param {'auto'|'key'|'none'} [p.background]  auto = the TV background from the state; key = black for the ATEM; none = transparent (OBS)
 * @param {boolean} [p.titleCards]   show the 2 s song title card (the real TV only)
 * @param {string} [p.video]         background video URL chosen on this PC
 * @param {boolean} [p.safe]         draw the 5% safe margin
 */
export function Stage({ state, out = 'preview', layout = 'full', background = 'auto', titleCards = false, video = '', safe = false }) {
  const st = state || {};
  const lowerThird = layout === 'lowerthird';
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

  const bg = background === 'none' ? 'none' : background === 'key' ? (lowerThird ? 'black' : 'key') : st.bg;
  const cls = [
    'stage',
    lowerThird ? 'is-lt' : '',
    background === 'none' ? 'is-transparent' : '',
    st.calm ? 'calm' : '',
    safe ? 'show-safe' : '',
  ].join(' ');
  return html`<div class=${cls}>
    <${Background} bg=${bg} video=${st.bgVideo || video} />
    ${frames.map(({ key: k, data, leaving, outMs: o }) => {
      const kind = data.f.kind;
      const preset = kind === 'song' ? data.f.preset : kind;
      return html`<div key=${k} class=${`frame k-${kind} p-${preset} ${leaving ? 'out' : 'in'}`} style=${`--out:${o}ms`}>
        ${kind === 'song' && html`<${SongFrame} item=${data.item} index=${data.index} lt=${lowerThird} />`}
        ${kind === 'scripture' && html`<${ScriptureFrame} item=${data.item} index=${data.index} lt=${lowerThird} />`}
        ${kind === 'media' && html`<${MediaFrame} item=${data.item} index=${data.index} live=${out !== 'preview' && !leaving} />`}
        ${kind === 'title' && html`<${TitleFrame} item=${data.item} />`}
        ${kind === 'logo' && html`<${LogoFrame} />`}
      </div>`;
    })}
    ${background !== 'none' && html`<div class=${`blackout ${st.mode === 'black' ? 'on' : ''}`}></div>`}
    <div class="safe-guide"></div>
  </div>`;
}
