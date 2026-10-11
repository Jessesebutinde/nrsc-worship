// The playable keyboard strip. On a laptop it shows all 88 keys; on a phone it shows about an octave and
// a half of big keys with octave buttons, so it can be played with the thumbs. Every part's key range is a
// coloured band (drag a band's end to move a split), sounding keys light up, and several fingers can play
// at once. Lower on a key is louder.

import { html, useRef, useState, useEffect } from '../../ui/h.js';
import { noteName } from './controls.js';

const LOW = 21,
  HIGH = 108;
const IS_BLACK = [false, true, false, true, false, false, true, false, true, false, true, false];
const ALL_WHITES = [];
for (let n = LOW; n <= HIGH; n++) if (!IS_BLACK[n % 12]) ALL_WHITES.push(n);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * @param {object} p
 * @param {Array} p.parts
 * @param {number} p.selected
 * @param {Map} p.lit  note -> colour of a sounding note
 * @param {(index:number, patch:object) => void} p.onZone
 * @param {(note:number, on:boolean, vel:number) => void} p.onPlay
 */
export function Keyboard({ parts, selected, lit, onZone, onPlay }) {
  const el = useRef(null);
  const [width, setWidth] = useState(1000);
  const [start, setStart] = useState(() => ALL_WHITES.indexOf(53)); // F3: the middle of the keyboard on a phone
  const [drag, setDrag] = useState(null);
  const fingers = useRef(new Map()); // pointerId -> note
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el.current);
    return () => ro.disconnect();
  }, []);

  // The whole keyboard when its keys can be at least 17 px wide (a laptop, with a mouse); otherwise a
  // window of keys at least 30 px wide, for fingers on a phone.
  const full = width / ALL_WHITES.length >= 17;
  const count = full ? ALL_WHITES.length : Math.max(8, Math.floor(width / 30));
  const first = full ? 0 : clamp(start, 0, ALL_WHITES.length - count);
  const whites = ALL_WHITES.slice(first, first + count);
  const lo = whites[0],
    hi = whites[whites.length - 1];
  const nw = whites.length;
  const whiteIndex = (n) => {
    let i = 0;
    while (i < nw && whites[i] <= n) i++;
    return i - 1;
  };
  /** x (0..1) of the left and right edges of a note's key */
  const leftOf = (n) => (IS_BLACK[n % 12] ? (whiteIndex(n - 1) + 1 - 0.31) / nw : whiteIndex(n) / nw);
  const rightOf = (n) => (IS_BLACK[n % 12] ? (whiteIndex(n - 1) + 1 + 0.31) / nw : (whiteIndex(n) + 1) / nw);

  const rel = (e) => {
    const r = el.current.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top - 16) / (r.height - 16) };
  };
  const noteAt = (e) => {
    const { x, y } = rel(e);
    const wi = clamp(Math.floor(x * nw), 0, nw - 1);
    const w = whites[wi];
    if (y < 0.6) {
      const frac = x * nw - wi;
      if (frac < 0.31 && w - 1 >= lo && IS_BLACK[(w - 1) % 12]) return w - 1;
      if (frac > 0.69 && w + 1 <= hi && IS_BLACK[(w + 1) % 12]) return w + 1;
    }
    return w;
  };
  const velAt = (e) => Math.round(50 + 77 * clamp(rel(e).y, 0, 1));

  const down = (e) => {
    e.preventDefault();
    const n = noteAt(e);
    if (e.currentTarget.setPointerCapture) e.currentTarget.setPointerCapture(e.pointerId);
    fingers.current.set(e.pointerId, n);
    onPlay(n, true, velAt(e));
  };
  const move = (e) => {
    const prev = fingers.current.get(e.pointerId);
    if (prev == null) return;
    const n = noteAt(e);
    if (n !== prev) {
      onPlay(prev, false, 0);
      fingers.current.set(e.pointerId, n);
      onPlay(n, true, velAt(e));
    }
  };
  const up = (e) => {
    const prev = fingers.current.get(e.pointerId);
    if (prev == null) return;
    fingers.current.delete(e.pointerId);
    onPlay(prev, false, 0);
  };
  useEffect(
    () => () => {
      for (const n of fingers.current.values()) onPlay(n, false, 0);
      fingers.current.clear();
    },
    [],
  );

  const bandDown = (e, i) => {
    e.stopPropagation();
    const p = parts[i];
    const { x } = rel(e);
    const edge = Math.abs(x - leftOf(clamp(p.keyLow, lo, hi))) < Math.abs(x - rightOf(clamp(p.keyHigh, lo, hi))) ? 'low' : 'high';
    setDrag({ i, edge });
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const bandMove = (e) => {
    if (!drag || !e.buttons) return;
    const p = parts[drag.i];
    const n = whites[clamp(Math.floor(rel(e).x * nw), 0, nw - 1)];
    if (drag.edge === 'low') onZone(drag.i, { keyLow: Math.min(n, p.keyHigh) });
    else onZone(drag.i, { keyHigh: Math.max(n, p.keyLow) });
  };
  const shift = (d) => setStart(clamp(first + d, 0, ALL_WHITES.length - count));

  return html`<div class="kbdbox">
    ${!full
      ? html`<div class="kbdnav">
          <button class="small" disabled=${first === 0} onClick=${() => shift(-7)}>◀ Octave</button>
          <span class="dim">${noteName(lo)} – ${noteName(hi)}</span>
          <button class="small" disabled=${first + count >= ALL_WHITES.length} onClick=${() => shift(7)}>Octave ▶</button>
        </div>`
      : null}
    <div class=${'kbd' + (full ? '' : ' big')} ref=${el}>
      <div class="zones" onPointerMove=${bandMove} onPointerUp=${() => setDrag(null)}>
        ${parts.map((p, i) => {
          if (!p || p.enabled === false || p.keyHigh < lo || p.keyLow > hi) return null;
          const a = leftOf(clamp(p.keyLow, lo, hi)),
            b = rightOf(clamp(p.keyHigh, lo, hi));
          return html`<div
            key=${p.id}
            class="zband"
            title=${`${p.name}: ${noteName(p.keyLow)} – ${noteName(p.keyHigh)} (drag the ends)`}
            style=${`left:${a * 100}%;width:${Math.max(0.5, (b - a) * 100)}%;--c:var(--${p.color});height:${i === selected ? '100%' : '60%'};opacity:${i === selected ? 1 : 0.55}`}
            onPointerDown=${(e) => bandDown(e, i)}
          ></div>`;
        })}
      </div>
      <div class="keys" onPointerDown=${down} onPointerMove=${move} onPointerUp=${up} onPointerCancel=${up} onContextMenu=${(e) => e.preventDefault()}>
        ${whites.map((n, i) => {
          const on = lit && lit.has(n);
          return html`<div key=${n} class=${'w' + (on ? ' on' : '')} style=${`left:${(i / nw) * 100}%;width:${(1 / nw) * 100}%;--c:var(--${(on && lit.get(n)) || 'amber'})`}>
            ${n % 12 === 0 ? html`<span class="c" style="left:3px">${noteName(n)}</span>` : null}
          </div>`;
        })}
        ${whites.map((n, i) => {
          const b = n + 1;
          if (i === nw - 1 || !IS_BLACK[b % 12]) return null;
          const on = lit && lit.has(b);
          return html`<div key=${'b' + b} class=${'b' + (on ? ' on' : '')} style=${`left:${((i + 1 - 0.31) / nw) * 100}%;width:${(0.62 / nw) * 100}%;--c:var(--${(on && lit.get(b)) || 'amber'})`}></div>`;
        })}
      </div>
    </div>
  </div>`;
}
