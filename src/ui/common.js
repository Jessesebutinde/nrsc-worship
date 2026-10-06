import { html, useEffect, useRef } from './h.js';

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

export function ProgressBar({ value, indeterminate }) {
  return html`<div class=${'progress' + (indeterminate ? ' indeterminate' : '')} role="progressbar"
    aria-valuemin="0" aria-valuemax="100" aria-valuenow=${indeterminate ? undefined : Math.round(value)}>
    <div style=${{ width: indeterminate ? '35%' : `${Math.max(2, Math.min(100, value))}%` }}></div>
  </div>`;
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
export function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/** Keeps focus in an input while tapping a chip below it. */
export const keepFocus = (e) => e.preventDefault();
