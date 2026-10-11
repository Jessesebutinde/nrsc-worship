// The live screen: one card per part with its fader and meter, the macros, the song box, the keyboard.

import { html } from '../../ui/h.js';
import { Fader, Slider, noteName, FX_LABELS } from './controls.js';
import { Keyboard } from './keyboard.js';
import { presetBanks } from '../presets.js';
import { FX_ORDER } from '../fx.js';
import { LATENCY_MODES } from '../engine.js';

export function Header({ ctx, state, tabs }) {
  const { dispatch } = ctx.store;
  const midiNames = ctx.midi.activeNames ? ctx.midi.activeNames() : [];
  const recent = ctx.midi.activity && performance.now() - ctx.midi.activity < 150;
  const midiClass = !ctx.engine.ready ? '' : midiNames.length ? (recent ? 'ok active' : 'ok') : 'warn';
  const midiLabel = !ctx.engine.ready ? 'MIDI' : midiNames.length ? midiNames.join(', ').replace(/\s+MIDI\s*\d*$/i, '') : ctx.midi.error ? 'No MIDI' : 'No keyboard found';
  const lat = ctx.engine.latency();
  const latMs = lat ? Math.round((lat.base + lat.output) * 1000) : null;
  return html`<header class="head">
    <div class="brand"><img src="icon.svg" alt="" /><span>Stage Keys</span></div>
    <div class="nav">
      ${tabs.map(([id, ico, label]) => html`<button key=${id} class=${'small ' + (state.ui.view === id ? 'on' : 'ghost')} onClick=${() => dispatch({ type: 'ui/patch', patch: { view: id, editor: null } })}>${label}</button>`)}
    </div>
    <span class="grow"></span>
    <span class=${'pill ' + midiClass} title=${ctx.midi.error || 'MIDI input'}><span class="dot"></span>${midiLabel}</span>
    ${latMs != null ? html`<span class="pill" title=${`Audio: ${lat.sampleRate} Hz, ${LATENCY_MODES[state.settings.latency] ? LATENCY_MODES[state.settings.latency].label : ''}`}>${latMs} ms</span>` : null}
    <span class="pill" title="Tempo"><b>${state.performance.tempo}</b> bpm</span>
    <div class="pill" style="min-width:120px;gap:8px" title="Master">
      <span class="dim">Out</span>
      <div style="flex:1;height:8px;border-radius:4px;background:var(--panel);overflow:hidden"><div ref=${ctx.masterRef} style="height:100%;width:0;background:linear-gradient(90deg,var(--ok) 0 70%,var(--warn) 70% 90%,var(--danger) 90%)"></div></div>
    </div>
    <button class="small danger" onClick=${ctx.actions.panic} title="All notes off (Esc)">Panic</button>
  </header>`;
}

export function Perform({ ctx, state }) {
  const { dispatch } = ctx.store;
  const perf = state.performance;
  const sel = state.ui.selectedPart;
  const song = state.songs[state.currentSong];
  return html`<div class="perform">
    <div style="display:grid;gap:12px">
      <div class="parts">
        ${perf.parts.map((p, i) => html`<${PartCard} key=${p.id} ctx=${ctx} state=${state} part=${p} index=${i} selected=${i === sel} />`)}
        ${perf.parts.length < 8 ? html`<div class="part add" onClick=${() => dispatch({ type: 'ui/patch', patch: { view: 'sounds' } })}>+ Add a sound</div>` : null}
      </div>
      <div class="macros">
        ${perf.macros.map(
          (m, i) => html`<div class="macro" key=${i}>
            <div class="mname"><span>${m.name}</span><span class="dim">${m.targets.length ? `${m.targets.length} target${m.targets.length > 1 ? 's' : ''}` : 'unassigned'}</span></div>
            <input type="range" min="0" max="1000" value=${Math.round(m.value * 1000)} style=${`--p:${m.value * 100}%`} onInput=${(e) => dispatch({ type: 'macro/value', index: i, value: Number(e.target.value) / 1000 })} />
          </div>`,
        )}
      </div>
      ${state.settings.showKeys
        ? html`<${Keyboard}
            parts=${perf.parts}
            selected=${sel}
            lit=${ctx.lit}
            onZone=${(i, patch) => dispatch({ type: 'part/patch', index: i, patch })}
            onPlay=${(n, on, vel) => ctx.actions.playScreenNote(n, on, vel)}
          />`
        : null}
    </div>
    <aside class="sidebar">
      <div class="card songbox">
        <h3>Song</h3>
        <div class="cur">${song ? `${state.currentSong + 1}. ${song.name}` : perf.name}</div>
        <div class="dim" style="margin-bottom:8px">${song && song.key ? `Key ${song.key} · ` : ''}${perf.tempo} bpm${perf.parts.length ? ` · ${perf.parts.length} part${perf.parts.length > 1 ? 's' : ''}` : ''}</div>
        <div class="nav">
          <button onClick=${ctx.actions.prevSong} disabled=${state.currentSong <= 0}>◀ Prev</button>
          <button onClick=${ctx.actions.nextSong} disabled=${state.currentSong >= state.songs.length - 1}>Next ▶</button>
        </div>
        <div class="row" style="margin-top:8px">
          <button class="small ghost grow" onClick=${() => dispatch({ type: 'ui/patch', patch: { view: 'songs' } })}>Set list</button>
          <button class="small ghost grow" onClick=${ctx.actions.addSong}>Save as song</button>
        </div>
      </div>
      <div class="card">
        <h3>Tempo</h3>
        <div class="transport">
          <button class="icon" onClick=${() => ctx.actions.setTempo(perf.tempo - 1)}>−</button>
          <span class="bpm">${perf.tempo}</span>
          <button class="icon" onClick=${() => ctx.actions.setTempo(perf.tempo + 1)}>+</button>
          <button onClick=${ctx.actions.tap}>Tap</button>
        </div>
      </div>
      <${LoopsMini} ctx=${ctx} state=${state} />
    </aside>
  </div>`;
}

function LoopsMini({ ctx, state }) {
  const tracks = ctx.looper.tracks().filter((t) => t.state !== 'empty');
  const parts = state.performance.parts;
  return html`<div class="card">
    <h3>Loops <button class="small ghost" onClick=${() => ctx.store.dispatch({ type: 'ui/patch', patch: { view: 'loops' } })}>Open</button></h3>
    ${tracks.length
      ? html`<div class="row">
          ${tracks.map((t) => {
            const p = parts[t.part];
            if (!p) return null;
            return html`<button key=${t.part} class=${'small ' + (t.state === 'playing' ? 'on' : t.state === 'recording' || t.state === 'armed' ? 'rec on' : '')} style=${`--c:var(--${p.color})`} onClick=${() => ctx.looper.toggle(t.part)}>
              ${t.state === 'playing' ? '▶' : t.state === 'recording' ? '●' : t.state === 'armed' ? '…' : '■'} ${p.name}${t.groove ? ' (groove)' : ''}
            </button>`;
          })}
          <button class="small ghost" onClick=${() => ctx.looper.muteAll()}>All off</button>
        </div>`
      : html`<div class="dim">No loops yet. Open Loops, arm a part and play a phrase once.</div>`}
  </div>`;
}

function PartCard({ ctx, state, part: p, index: i, selected }) {
  const { dispatch } = ctx.store;
  const banks = presetBanks({ prog: p.prog });
  let prog = 0,
    loadingAny = false,
    error = false;
  for (const b of banks) {
    const v = ctx.loading.get(b);
    if (v === 'error') error = true;
    else if (typeof v === 'number' && v < 1) {
      loadingAny = true;
      prog += v / banks.length;
    } else prog += 1 / banks.length;
  }
  const fxOn = FX_ORDER.filter((k) => p.fx[k] && p.fx[k].on);
  const zone = p.keyLow <= 21 && p.keyHigh >= 108 ? 'All keys' : `${noteName(p.keyLow)} – ${noteName(p.keyHigh)}`;
  const octave = p.octave ? (p.octave > 0 ? `+${p.octave}` : `${p.octave}`) : '0';
  return html`<div class=${'part' + (selected ? ' selected' : '') + (p.mute ? ' muted' : '') + (p.enabled === false ? ' off' : '')} style=${`--c:var(--${p.color})`} onClick=${() => ctx.actions.selectPart(i)}>
    ${loadingAny ? html`<div class="loading" style=${`--p:${Math.round(prog * 100)}%`}></div>` : null}
    <div onClick=${(e) => {
      e.stopPropagation();
      ctx.actions.selectPart(i);
      dispatch({ type: 'ui/patch', patch: { editor: 'sound' } });
    }}>
      <div class="kind">${i + 1} · ${p.kind}${p.enabled === false ? ' · loop only' : ''}${error ? ' · download failed' : loadingAny ? ' · loading…' : ''}</div>
      <div class="name">${p.name}</div>
      <div class="zone">${zone}${p.octave ? ` · oct ${octave}` : ''}${p.channel ? ` · ch ${p.channel}` : ''}</div>
    </div>
    <div class="body">
      <${Fader} value=${p.volume} color=${p.color} meterRef=${ctx.meterRef(i)} onChange=${(v) => dispatch({ type: 'part/patch', index: i, patch: { volume: v } })} />
      <div class="side">
        <button class=${p.mute ? 'on' : ''} onClick=${(e) => {
          e.stopPropagation();
          dispatch({ type: 'part/patch', index: i, patch: { mute: !p.mute } });
        }}>${p.mute ? 'Muted' : 'Mute'}</button>
        <div class="row" style="gap:4px;flex-wrap:nowrap">
          <button class="grow" title="Octave down" onClick=${(e) => {
            e.stopPropagation();
            dispatch({ type: 'part/patch', index: i, patch: { octave: Math.max(-3, p.octave - 1) } });
          }}>−</button>
          <span style="font-size:0.75rem;min-width:22px;text-align:center">${octave}</span>
          <button class="grow" title="Octave up" onClick=${(e) => {
            e.stopPropagation();
            dispatch({ type: 'part/patch', index: i, patch: { octave: Math.min(3, p.octave + 1) } });
          }}>+</button>
        </div>
        <button onClick=${(e) => {
          e.stopPropagation();
          ctx.actions.selectPart(i);
          dispatch({ type: 'ui/patch', patch: { editor: 'sound' } });
        }}>Edit</button>
        <button class="ghost" onClick=${(e) => {
          e.stopPropagation();
          ctx.actions.selectPart(i);
          dispatch({ type: 'ui/patch', patch: { view: 'sounds' } });
        }}>Change</button>
        <button class="ghost" title="Hear it" onClick=${(e) => {
          e.stopPropagation();
          ctx.actions.preview(i);
        }}>▶</button>
      </div>
    </div>
    <div class="fxchips">
      ${FX_ORDER.map(
        (k) => html`<button key=${k} class=${'chip' + (p.fx[k].on ? ' on' : '')} onClick=${(e) => {
          e.stopPropagation();
          dispatch({ type: 'part/fx', index: i, stage: k, patch: { on: !p.fx[k].on } });
        }}>${k === 'mod' ? (p.fx.mod.type === 'chorus' ? 'Chorus' : p.fx.mod.type) : k === 'rotary' && p.fx.rotary.on ? `Rotary ${p.fx.rotary.speed}` : FX_LABELS[k]}</button>`,
      )}
    </div>
  </div>`;
}
