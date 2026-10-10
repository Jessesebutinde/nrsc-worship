// The 88-key strip: shows every part's zone as a coloured band, lights the keys being played, lets you
// drag a zone's edges, and plays notes when tapped (handy without a keyboard).

import { html, useRef, useState, useEffect } from '../../ui/h.js';
import { noteName } from './controls.js';

const LOW = 21,
  HIGH = 108;
const IS_BLACK = [false, true, false, true, false, false, true, false, true, false, true, false];
const WHITES = [];
for (let n = LOW; n <= HIGH; n++) if (!IS_BLACK[n % 12]) WHITES.push(n);
const NW = WHITES.length;
const whiteIndex = (n) => WHITES.filter((w) => w <= n).length - 1;
/** x position (0..1) of a note's centre */
const xOf = (n) => {
  if (!IS_BLACK[n % 12]) return (whiteIndex(n) + 0.5) / NW;
  return (whiteIndex(n - 1) + 1) / NW;
};
const noteAtX = (x) => WHITES[Math.max(0, Math.min(NW - 1, Math.floor(x * NW)))];

/**
 * @param {object} p
 * @param {Array} p.parts
 * @param {number} p.selected
 * @param {Set|Map} p.lit  note -> colour of a sounding note
 * @param {(index:number, patch:object) => void} p.onZone
 * @param {(note:number, on:boolean) => void} p.onPlay
 */
export function Keyboard({ parts, selected, lit, onZone, onPlay }) {
  const el = useRef(null);
  const [drag, setDrag] = useState(null);
  const relX = (e) => {
    const r = el.current.getBoundingClientRect();
    return (e.clientX - r.left) / r.width;
  };
  const onBandDown = (e, i) => {
    e.stopPropagation();
    const p = parts[i];
    const x = relX(e);
    const edge = Math.abs(x - xOf(p.keyLow)) < Math.abs(x - xOf(p.keyHigh)) ? 'low' : 'high';
    setDrag({ i, edge });
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onBandMove = (e) => {
    if (!drag || !e.buttons) return;
    const p = parts[drag.i];
    const n = noteAtX(relX(e));
    if (drag.edge === 'low') onZone(drag.i, { keyLow: Math.min(n, p.keyHigh) });
    else onZone(drag.i, { keyHigh: Math.max(n, p.keyLow) });
  };
  const playing = useRef(null);
  const keyDown = (e) => {
    const n = noteFromEvent(e);
    if (n == null) return;
    playing.current = n;
    onPlay(n, true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const keyMove = (e) => {
    if (!e.buttons || playing.current == null) return;
    const n = noteFromEvent(e);
    if (n != null && n !== playing.current) {
      onPlay(playing.current, false);
      playing.current = n;
      onPlay(n, true);
    }
  };
  const keyUp = () => {
    if (playing.current != null) onPlay(playing.current, false);
    playing.current = null;
  };
  const noteFromEvent = (e) => {
    const r = el.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top - 16) / (r.height - 16);
    const w = noteAtX(x);
    // black key if the pointer is in the upper part and near a boundary with a black key
    if (y < 0.6) {
      const wi = Math.floor(x * NW);
      const frac = x * NW - wi;
      const left = WHITES[wi] - 1;
      const right = WHITES[wi] + 1;
      if (frac < 0.3 && left >= LOW && IS_BLACK[left % 12]) return left;
      if (frac > 0.7 && right <= HIGH && IS_BLACK[right % 12]) return right;
    }
    return w;
  };
  useEffect(() => () => keyUp(), []);
  return html`<div>
    <div class="kbd" ref=${el}>
      <div class="zones" onPointerMove=${onBandMove} onPointerUp=${() => setDrag(null)}>
        ${parts.map((p, i) =>
          p && p.enabled !== false
            ? html`<div
                key=${p.id}
                class="zband"
                title=${`${p.name}: ${noteName(p.keyLow)} – ${noteName(p.keyHigh)} (drag the ends)`}
                style=${`left:${(xOf(Math.max(LOW, p.keyLow)) - 0.5 / NW) * 100}%;width:${Math.max(0.5, (xOf(Math.min(HIGH, p.keyHigh)) - xOf(Math.max(LOW, p.keyLow)) + 1 / NW) * 100)}%;--c:var(--${p.color});height:${i === selected ? '100%' : '60%'};opacity:${i === selected ? 1 : 0.55}`}
                onPointerDown=${(e) => onBandDown(e, i)}
              ></div>`
            : null,
        )}
      </div>
      <div class="keys" onPointerDown=${keyDown} onPointerMove=${keyMove} onPointerUp=${keyUp} onPointerCancel=${keyUp}>
        ${WHITES.map((n, i) => {
          const on = lit && lit.has(n);
          return html`<div key=${n} class=${'w' + (on ? ' on' : '')} style=${`left:${(i / NW) * 100}%;width:${(1 / NW) * 100}%;--c:var(--${(on && lit.get(n)) || 'amber'})`}>
            ${n % 12 === 0 ? html`<span class="c" style="left:3px">${noteName(n)}</span>` : null}
          </div>`;
        })}
        ${WHITES.map((n, i) => {
          const b = n + 1;
          if (b > HIGH || !IS_BLACK[b % 12]) return null;
          const on = lit && lit.has(b);
          return html`<div key=${'b' + b} class=${'b' + (on ? ' on' : '')} style=${`left:${((i + 1) / NW) * 100 - 0.55 / NW * 100}%;width:${(0.62 / NW) * 100}%;--c:var(--${(on && lit.get(b)) || 'amber'})`}></div>`;
        })}
      </div>
    </div>
    <div class="kbdhint">Bands show each part's key range; drag a band's end to move a split. Tap the keys to play the selected zone.</div>
  </div>`;
}
