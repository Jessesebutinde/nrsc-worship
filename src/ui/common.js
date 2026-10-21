import { html, useEffect, useRef, useState } from './h.js';

export function Sheet({ title, onClose, children, wide }) {
  const ref = useRef(null);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('sheet-open');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('sheet-open');
    };
  }, []);
  return html`
    <div class="sheet-backdrop" onClick=${(e) => e.target === e.currentTarget && onClose()}>
      <div class=${'sheet' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label=${title} ref=${ref}>
        <div class="sheet-head">
          <h2>${title}</h2>
          <button class="icon-btn" aria-label="Close" onClick=${onClose}>✕</button>
        </div>
        <div class="sheet-body">${children}</div>
      </div>
    </div>
  `;
}

/**
 * A metered progress bar. `active` adds a moving sheen so you can see work is
 * happening even between updates; `indeterminate` is for steps with no
 * measurable progress.
 */
export function Meter({ value = 0, indeterminate, active, small }) {
  const v = Math.max(0, Math.min(100, value));
  return html`<div
    class=${'meter' + (indeterminate ? ' indeterminate' : '') + (active ? ' active' : '') + (small ? ' small' : '')}
    role="progressbar"
    aria-valuemin="0"
    aria-valuemax="100"
    aria-valuenow=${indeterminate ? undefined : Math.round(v)}
  >
    <div class="fill" style=${{ width: indeterminate ? '35%' : `${Math.max(1.5, v)}%` }}></div>
  </div>`;
}

export const ProgressBar = Meter;

/** Circular meter with the percentage in the middle. */
export function Ring({ value = 0, size = 132, label, spinning }) {
  const r = (size - 14) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return html`<div class=${'ring' + (spinning ? ' spinning' : '')} style=${{ width: `${size}px`, height: `${size}px` }}>
    <svg viewBox=${`0 0 ${size} ${size}`} aria-hidden="true">
      <circle class="ring-bg" cx=${size / 2} cy=${size / 2} r=${r} />
      <circle
        class="ring-fg"
        cx=${size / 2}
        cy=${size / 2}
        r=${r}
        stroke-dasharray=${c}
        stroke-dashoffset=${spinning ? c * 0.7 : c * (1 - v / 100)}
      />
    </svg>
    <div class="ring-text">
      ${spinning ? html`<${Bars} />` : html`<strong><${AnimatedNumber} value=${Math.round(v)} />%</strong>`}
      ${label && html`<span>${label}</span>`}
    </div>
  </div>`;
}

/** Little "equaliser" animation used while waiting. */
export function Bars() {
  return html`<span class="bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>`;
}

/** Counts smoothly towards `value`. */
export function AnimatedNumber({ value, format = (v) => String(Math.round(v)) }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !Number.isFinite(value)) {
      setShown(value);
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (now) => {
      const t = Math.min(1, (now - start) / 350);
      const e = 1 - (1 - t) ** 3;
      const v = a + (value - a) * e;
      from.current = v;
      setShown(v);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return format(shown);
}

export function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 120000);
}

let toastTimer = 0;
/** Short message at the top; optional action button (e.g. Undo). */
export function toast(msg, action) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  if (action) {
    const b = document.createElement('button');
    b.textContent = action.label;
    b.onclick = () => {
      el.classList.remove('show');
      action.run();
    };
    el.appendChild(b);
  }
  el.classList.remove('show');
  void el.offsetWidth; // restart the animation
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), action ? 5000 : 2600);
}

/** Keeps focus in an input while tapping a chip below it. */
export const keepFocus = (e) => e.preventDefault();
