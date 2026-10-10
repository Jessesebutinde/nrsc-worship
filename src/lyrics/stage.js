// The screen picture: a fixed 1920x1080 canvas scaled to fit its box. Used by the screen page
// and by every preview in the remote, so what the operator sees is what the hall sees.

import { html, useState, useEffect, useRef, useLayoutEffect } from '../ui/h.js';
import { CHURCH_NAME } from './config.js';

const W = 1920;
const H = 1080;

// How long a frame takes to fade out, by what it shows.
const OUT_MS = { worship: 400, praise: 200, classic: 250, scripture: 250, title: 300, logo: 400, none: 400 };

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
    }, 650);
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

function Background({ bg, video, transparent }) {
  const kind = bg === 'video' && !video ? 'glow' : bg;
  const frames = useSwap(transparent ? `t-${kind === 'key' ? 'key' : 'none'}` : kind, { kind, video }, 800);
  return frames.map(
    (f) => html`<div key=${f.key} class=${`bg ${f.leaving ? 'bg-out' : 'bg-in'}`}>
      ${transparent ? f.data.kind === 'key' && html`<div class="bg-keyband"></div>` : html`<${BgLayer} ...${f.data} />`}
    </div>`,
  );
}

function BgLayer({ kind, video }) {
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

function ScriptureFrame({ item, index, lt }) {
  const s = item.slides[index];
  if (!s) return null;
  if (lt)
    return html`<div class="lt-band lt-scrip">
      <div class="ln ref" style="--i:0">${s.ref}</div>
      ${s.primary && html`<div class="ln pri" style="--i:1">${s.primary}</div>`}
      ${s.secondary && html`<div class="ln sec" style="--i:2">${s.secondary}</div>`}
    </div>`;
  return html`<div class="scrip">
    <div class="bar"></div>
    <div class="ln ref" style="--i:0">${s.ref}</div>
    ${s.primary && html`<div class="ln pri" style="--i:1">${s.primary}</div>`}
    ${s.secondary &&
    html`<div class="ln sec" style="--i:2">
      ${item.secondaryLabel && s.primary && html`<span class="ver">${item.secondaryLabel}</span>`}${s.secondary}
    </div>`}
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

/** Which frame the state shows: { key, kind, preset }. */
export function frameOf(state, { titleFor = null } = {}) {
  const { item, index = 0, mode } = state || {};
  if (!state || mode === 'black' || mode === 'clear') return { key: 'none', kind: 'none' };
  if (mode === 'logo' || !item) return { key: 'logo', kind: 'logo' };
  if (item.kind === 'song' && titleFor === item.id && index === 0) return { key: `title:${item.id}`, kind: 'title' };
  const kind = item.kind === 'scripture' ? 'scripture' : 'song';
  return { key: `${item.id}:${index}`, kind, preset: kind === 'song' ? item.preset || 'worship' : 'scripture' };
}

/**
 * @param {object} p
 * @param {object} p.state         screen state
 * @param {boolean} [p.lowerThird] livestream lower-third layout
 * @param {boolean} [p.transparent] no background (OBS browser source)
 * @param {boolean} [p.titleCards] show the 2 s song title card (the real screen only)
 * @param {string} [p.video]       background video URL
 * @param {boolean} [p.safe]       draw the 5% safe margin
 */
export function Stage({ state, lowerThird = false, transparent = false, titleCards = false, video = '', safe = false }) {
  const st = state || {};
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

  const f = frameOf(st, { titleFor: lowerThird ? null : titleFor });
  const showLogo = !(lowerThird || transparent);
  const key = f.kind === 'logo' && !showLogo ? 'none' : f.key;
  const outMs = OUT_MS[f.kind === 'song' ? f.preset : f.kind] || 300;
  const frames = useSwap(key, { f, item: st.item, index: st.index || 0 }, outMs, key === 'none');

  const cls = [
    'stage',
    lowerThird ? 'is-lt' : '',
    transparent ? 'is-transparent' : '',
    st.calm ? 'calm' : '',
    safe ? 'show-safe' : '',
  ].join(' ');
  return html`<div class=${cls}>
    ${!lowerThird && html`<${Background} bg=${st.bg} video=${st.bgVideo || video} transparent=${transparent} />`}
    ${frames.map(({ key: k, data, leaving, outMs: o }) => {
      const kind = data.f.kind;
      const preset = kind === 'song' ? data.f.preset : kind;
      return html`<div key=${k} class=${`frame k-${kind} p-${preset} ${leaving ? 'out' : 'in'}`} style=${`--out:${o}ms`}>
        ${kind === 'song' && html`<${SongFrame} item=${data.item} index=${data.index} lt=${lowerThird} />`}
        ${kind === 'scripture' && html`<${ScriptureFrame} item=${data.item} index=${data.index} lt=${lowerThird} />`}
        ${kind === 'title' && html`<${TitleFrame} item=${data.item} />`}
        ${kind === 'logo' && html`<${LogoFrame} />`}
      </div>`;
    })}
    ${!transparent && !lowerThird && html`<div class=${`blackout ${st.mode === 'black' ? 'on' : ''}`}></div>`}
    <div class="safe-guide"></div>
  </div>`;
}
