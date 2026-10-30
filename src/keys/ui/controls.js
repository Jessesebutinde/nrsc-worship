// Shared controls: sliders you can grab, vertical faders with a meter, toggles, segments, drawbars.

import { html, useRef, useState, useEffect } from '../../ui/h.js';

const COLOR_VAR = (c) => (c ? `var(--${c})` : 'var(--accent)');

/** Horizontal slider with label and value. `log` spreads a 20..20000 Hz style range evenly. */
export function Slider({ label, value, min = 0, max = 1, step = 0.01, unit = '', fmt, log = false, onChange, color, disabled }) {
  const toPos = (v) => (log ? Math.log(Math.max(v, min) / min) / Math.log(max / min) : (v - min) / (max - min));
  const fromPos = (p) => (log ? min * Math.pow(max / min, p) : min + (max - min) * p);
  const pos = Math.max(0, Math.min(1, toPos(value == null ? min : value)));
  const shown = fmt ? fmt(value) : typeof value === 'number' ? (Math.abs(value) >= 100 ? Math.round(value) : Number(value.toFixed(step < 0.01 ? 3 : 2))) + unit : '';
  return html`<div class="slider" style=${`--c:${COLOR_VAR(color)}`}>
    <label>${label}</label>
    <input
      type="range"
      min="0"
      max="1000"
      step="1"
      value=${Math.round(pos * 1000)}
      disabled=${disabled}
      style=${`--p:${(pos * 100).toFixed(1)}%`}
      onInput=${(e) => {
        const p = Number(e.target.value) / 1000;
        let v = fromPos(p);
        if (!log && step) v = Math.round(v / step) * step;
        onChange(Number(v.toFixed(6)));
      }}
    />
    <span class="v">${shown}</span>
  </div>`;
}

/** Vertical fader (0..1) with an optional meter element next to it; drag anywhere on the track. */
export function Fader({ value, onChange, color, meterRef, label }) {
  const track = useRef(null);
  const drag = (e) => {
    const el = track.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const v = 1 - (e.clientY - r.top) / r.height;
    onChange(Math.max(0, Math.min(1, v)));
  };
  return html`<div class="fader" style=${`--c:${COLOR_VAR(color)}`}>
    <div
      class="track"
      ref=${track}
      onPointerDown=${(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        e.stopPropagation();
        drag(e);
      }}
      onPointerMove=${(e) => {
        if (e.buttons) drag(e);
      }}
      onDblClick=${() => onChange(0.8)}
    >
      <div class="fill" style=${`height:${(value * 100).toFixed(1)}%`}></div>
      <div class="knob" style=${`bottom:${(value * 100).toFixed(1)}%`}></div>
      <div class="val">${label || Math.round(value * 100)}</div>
    </div>
    <div class="meter"><div class="lvl" ref=${meterRef}></div></div>
  </div>`;
}

export function Toggle({ label, on, onChange }) {
  return html`<span class=${'toggle' + (on ? ' on' : '')} role="switch" aria-checked=${!!on} tabindex="0" onClick=${() => onChange(!on)} onKeyDown=${(e) => e.key === ' ' && onChange(!on)}>
    <span class="sw"></span>${label ? html`<span>${label}</span>` : null}
  </span>`;
}

/** Segmented choice. Options: ['a','b'] or [{ v, label }]. */
export function Seg({ value, options, onChange, small }) {
  return html`<span class="seg">
    ${options.map((o) => {
      const v = typeof o === 'object' ? o.v : o;
      const label = typeof o === 'object' ? o.label : o;
      return html`<button key=${v} class=${(v === value ? 'on' : '') + (small ? ' small' : '')} onClick=${() => onChange(v)}>${label}</button>`;
    })}
  </span>`;
}

export function Stepper({ label, value, min, max, step = 1, fmt, onChange }) {
  const show = fmt ? fmt(value) : value;
  return html`<div class="slider">
    <label>${label}</label>
    <div class="row" style="gap:4px">
      <button class="small" onClick=${() => onChange(Math.max(min, value - step))}>−</button>
      <button class="small" onClick=${() => onChange(Math.min(max, value + step))}>+</button>
    </div>
    <span class="v">${show}</span>
  </div>`;
}

const DRAWBAR_LABELS = ["16'", "5⅓'", "8'", "4'", "2⅔'", "2'", "1⅗'", "1⅓'", "1'"];
const DRAWBAR_CLASS = ['white', 'white', 'white', 'white', 'black', 'white', 'black', 'black', 'white'];

/** Nine Hammond drawbars (0..8). Drag down to pull out. */
export function Drawbars({ values, onChange }) {
  const set = (i, v) => {
    const next = values.slice();
    next[i] = v;
    onChange(next);
  };
  const dragTo = (i, e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const v = Math.round(((e.clientY - r.top) / r.height) * 8);
    set(i, Math.max(0, Math.min(8, v)));
  };
  return html`<div class="drawbars">
    ${values.map(
      (v, i) => html`<div class="drawbar" key=${i}>
        <div class="num">${v}</div>
        <div
          class="bar"
          onPointerDown=${(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            dragTo(i, e);
          }}
          onPointerMove=${(e) => e.buttons && dragTo(i, e)}
        >
          <div class=${'pull ' + DRAWBAR_CLASS[i]} style=${`height:${(v / 8) * 100}%`}></div>
        </div>
        <div class="lbl">${DRAWBAR_LABELS[i]}</div>
      </div>`,
    )}
  </div>`;
}

let toastFn = () => {};
export const toast = (m) => toastFn(m);
export function Toast() {
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    let t;
    toastFn = (m) => {
      setMsg(m);
      clearTimeout(t);
      t = setTimeout(() => setMsg(null), 2800);
    };
    return () => {
      toastFn = () => {};
    };
  }, []);
  return msg ? html`<div class="toast" role="status">${msg}</div>` : null;
}

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const noteName = (n) => `${NOTE_NAMES[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`;
export const FX_LABELS = { comp: 'Comp', drive: 'Drive', eq: 'EQ', mod: 'Chorus', trem: 'Trem', rotary: 'Rotary', delay: 'Delay', reverb: 'Reverb' };
