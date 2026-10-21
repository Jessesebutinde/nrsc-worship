// The sound browser: families down the side, presets as cards, whole rigs under Combos.

import { html, useState } from '../../ui/h.js';
import { FAMILIES, PRESETS, searchPresets, presetBanks } from '../presets.js';
import { COMBO_GROUPS, combosIn } from '../combos.js';
import { SOUND_GUIDE, RIG_GUIDE } from '../guide.js';
import { noteName } from './controls.js';

export function Sounds({ ctx, state }) {
  const { dispatch } = ctx.store;
  const fam = state.ui.browserFamily;
  const q = state.ui.query || '';
  const sel = state.ui.selectedPart;
  const target = state.performance.parts[sel];
  const [showAll, setShowAll] = useState(false);
  const families = [{ id: 'combos', label: 'Combos / rigs', color: 'amber' }, { id: 'favorites', label: '★ Favourites', color: 'gold' }, { id: 'mine', label: 'My sounds', color: 'sky' }, ...FAMILIES];
  const setFam = (id) => dispatch({ type: 'ui/patch', patch: { browserFamily: id } });
  let list;
  if (fam === 'combos') list = [];
  else if (fam === 'favorites') list = [...PRESETS, ...state.userPresets].filter((p) => state.favorites.includes(p.id));
  else if (fam === 'mine') list = state.userPresets;
  else list = searchPresets(q, q ? null : fam, state.userPresets);
  const famColor = (families.find((f) => f.id === fam) || {}).color || 'amber';
  return html`<div class="sounds">
    <div class="families">
      ${families.map((f) => html`<button key=${f.id} class=${fam === f.id ? 'on' : ''} style=${`--c:var(--${f.color})`} onClick=${() => setFam(f.id)}>${f.label}</button>`)}
    </div>
    <div>
      <div class="row" style="margin-bottom:10px">
        <input type="text" class="grow" placeholder="Search sounds…" value=${q} onInput=${(e) => dispatch({ type: 'ui/patch', patch: { query: e.target.value } })} />
        <div class="target">
          <span class="dim">Load into</span>
          ${state.performance.parts.map((p, i) => html`<button key=${p.id} class=${'small ' + (i === sel ? 'on' : 'ghost')} style=${`--c:var(--${p.color})`} onClick=${() => ctx.actions.selectPart(i)}>${i + 1}</button>`)}
          ${state.performance.parts.length < 8 ? html`<span class="dim">or add a new part</span>` : null}
        </div>
      </div>
      ${fam === 'combos' && !q
        ? html`<div>
            <p class="muted" style="margin:0 0 10px">A combo replaces the whole rig: its parts, splits, macros and groove. Save the current rig as a song first if you want it back.</p>
            ${COMBO_GROUPS.map(
              (grp) => html`<div key=${grp.id} class="group">
            <h3 class="grouphead">${grp.label}</h3>
            <div class="presets">
              ${combosIn(grp).map(
                (c) => html`<div class="preset" key=${c.id} style=${`--c:var(--${(FAMILIES.find((f) => f.id === c.family) || {}).color || 'amber'})`} onClick=${() => ctx.actions.loadCombo(c)}>
                  <div class="pname"><span>${c.name}</span><span class="pkind">${c.parts.length} parts · ${c.tempo} bpm</span></div>
                  <div class="pdesc">${c.desc}</div>
                  <div class="pdesc">${c.parts.map((sp) => zoneText(sp)).join(' · ')}</div>
                  ${RIG_GUIDE[c.id] ? html`<div class="tip"><b>How to play:</b> ${RIG_GUIDE[c.id].tip}</div>` : null}
                  <div class="pact">
                    <button class="primary" onClick=${(e) => {
                      e.stopPropagation();
                      ctx.actions.loadCombo(c);
                    }}>Load rig</button>
                    ${RIG_GUIDE[c.id]
                      ? html`<button onClick=${(e) => {
                          e.stopPropagation();
                          ctx.actions.demoRig(c);
                        }}>▶ Demo</button>`
                      : null}
                  </div>
                </div>`,
              )}
            </div>
          </div>`,
            )}
          </div>`
        : html`<div>
            ${fam !== 'favorites' && fam !== 'mine' && !q ? html`<p class="muted" style="margin:0 0 10px">${(FAMILIES.find((f) => f.id === fam) || {}).blurb || ''}</p>` : null}
            ${!list.length ? html`<p class="dim">${fam === 'mine' ? 'Nothing saved yet. Edit a part and use "Save as my sound".' : fam === 'favorites' ? 'Tap ★ on a sound to keep it here.' : 'No sound matches.'}</p>` : null}
            <div class="presets">
              ${list.map((p) => html`<${PresetCard} key=${p.id} ctx=${ctx} state=${state} preset=${p} current=${target && target.presetId === p.id} />`)}
            </div>
          </div>`}
    </div>
  </div>`;
}

const zoneText = (sp) => {
  const low = sp.keyLow == null ? 0 : sp.keyLow;
  const high = sp.keyHigh == null ? 127 : sp.keyHigh;
  const z = low <= 0 && high >= 127 ? '' : ` (${low <= 0 ? '…' : noteName(low)}–${high >= 127 ? '…' : noteName(high)})`;
  return `${sp.preset}${z}${sp.enabled === false ? ' [loop]' : ''}`;
};

function PresetCard({ ctx, state, preset: p, current }) {
  const { dispatch } = ctx.store;
  const fam = FAMILIES.find((f) => f.id === p.family) || {};
  const banks = presetBanks(p);
  const needs = banks.filter((b) => !(ctx.engine.samples && ctx.engine.samples.isLoaded(b)));
  const fav = state.favorites.includes(p.id);
  const guide = SOUND_GUIDE[p.user ? p.basePreset : p.id];
  const load = () => ctx.actions.loadPreset(state.ui.selectedPart, p);
  return html`<div class=${'preset' + (current ? ' current' : '')} style=${`--c:var(--${fam.color || 'sky'})`} onClick=${load}>
    <div class="pname">
      <span>${p.name}</span>
      <span class="row" style="gap:4px"><span class="pkind">${p.kind}</span><button class=${'star' + (fav ? ' on' : '')} onClick=${(e) => {
        e.stopPropagation();
        dispatch({ type: 'favorite/toggle', id: p.id });
      }}>★</button></span>
    </div>
    <div class="pdesc">${p.desc}</div>
    ${guide ? html`<div class="tip"><b>How to play:</b> ${guide.tip}</div>` : null}
    ${banks.length ? html`<div class="pdesc dim">${needs.length ? `Downloads ${needs.length} sample set${needs.length > 1 ? 's' : ''} on first use` : 'Samples ready'}</div>` : null}
    <div class="pact">
      ${guide
        ? html`<button onClick=${(e) => {
            e.stopPropagation();
            ctx.actions.demoSound(p.id);
          }}>▶ Demo</button>`
        : null}
      <button class="primary" onClick=${(e) => {
        e.stopPropagation();
        load();
      }}>Load</button>
      <button onClick=${(e) => {
        e.stopPropagation();
        ctx.actions.addPart(p);
      }}>+ Layer</button>
      <button class="ghost" onClick=${(e) => {
        e.stopPropagation();
        ctx.actions.addPart(p, { keyLow: 0, keyHigh: 59 });
      }}>+ Left hand</button>
      <button class="ghost" onClick=${(e) => {
        e.stopPropagation();
        ctx.actions.addPart(p, { keyLow: 60, keyHigh: 127 });
      }}>+ Right hand</button>
      ${p.user ? html`<button class="ghost danger" onClick=${(e) => {
        e.stopPropagation();
        dispatch({ type: 'userPreset/remove', id: p.id });
      }}>Delete</button>` : null}
    </div>
  </div>`;
}
