// Scripture controls shared by the classic console and Orbit: the margin round the words, and how
// much a long verse is broken up (a level, or a limit of so many words or lines a screen).

import { html, useState } from '../ui/h.js';
import { MARGINS, marginOf, SPLITS, splitOf, parseSplit } from './state.js';

export function MarginControl({ state, setLook }) {
  return html`<span class="labelled" title="The border round the words: the look's own, a slim 40 px, or none (12 px all round: the words run to the edge of the picture and a card fills the screen)">
    <span class="muted small">Margin</span>
    <span class="seg" role="group" aria-label="Margin">
      ${Object.entries(MARGINS).map(([k, l]) => html`<button class=${marginOf(state) === k ? 'on' : ''} onClick=${() => setLook({ sMargin: k, sWide: k === 'slim' })}>${l}</button>`)}
    </span>
  </span>`;
}

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(n) || lo)));
const LIMITS = { words: { lo: 3, hi: 400, step: 5, start: 20, label: 'words a screen' }, lines: { lo: 1, hi: 12, step: 1, start: 3, label: 'lines a screen' } };

export function SplitControl({ state, setLook }) {
  const cur = parseSplit(splitOf(state));
  // The counts last used here, so switching back to Words or Lines picks them up again.
  const [last, setLast] = useState({ words: LIMITS.words.start, lines: LIMITS.lines.start });
  const set = (mode, n) => {
    if (mode === 'words' || mode === 'lines') {
      const v = clamp(n == null ? last[mode] : n, LIMITS[mode].lo, LIMITS[mode].hi);
      setLast({ ...last, [mode]: v });
      setLook({ sSplit: `${mode[0]}${v}` });
    } else setLook({ sSplit: mode });
  };
  const lim = LIMITS[cur.mode];
  return html`<span class="labelled" title="How much a long verse is broken up across screens: more than the standard, the standard, less (the words shrink a little to fit), never (a whole verse on one screen, shrunk as far as it needs), or at most so many words or lines a screen">
    <span class="muted small">Break up a verse</span>
    <span class="seg" role="group" aria-label="Break up a verse">
      ${Object.entries(SPLITS).map(([k, l]) => html`<button class=${cur.mode === k ? 'on' : ''} onClick=${() => set(k)}>${l}</button>`)}
      <button class=${cur.mode === 'words' ? 'on' : ''} onClick=${() => set('words')}>Words</button>
      <button class=${cur.mode === 'lines' ? 'on' : ''} onClick=${() => set('lines')}>Lines</button>
    </span>
    ${lim &&
    html`<span class="seg count" role="group" aria-label=${`At most how many ${cur.mode} a screen`}>
      <button onClick=${() => set(cur.mode, cur.n - lim.step)} aria-label="Fewer">−</button>
      <input type="number" min=${lim.lo} max=${lim.hi} value=${cur.n} onChange=${(e) => set(cur.mode, e.target.value)} aria-label=${`${cur.mode[0].toUpperCase()}${cur.mode.slice(1)} a screen`} />
      <button onClick=${() => set(cur.mode, cur.n + lim.step)} aria-label="More">+</button>
      <span class="muted small">${lim.label}</span>
    </span>`}
  </span>`;
}
