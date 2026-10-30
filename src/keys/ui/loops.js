// Phrase loops: the transport, one row per part (record, play/mute, clear), grooves for the drum parts.

import { html, useEffect, useState } from '../../ui/h.js';
import { Toggle } from './controls.js';
import { GROOVES } from '../looper.js';

export function Loops({ ctx, state }) {
  const { dispatch } = ctx.store;
  const { looper, transport } = ctx;
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 100);
    return () => clearInterval(t);
  }, []);
  const perf = state.performance;
  const pos = transport.position ? transport.position() : { bar: 1, beat: 1 };
  const sel = state.ui.selectedPart;
  return html`<div style="display:grid;gap:12px">
    <div class="card">
      <div class="transport">
        <button class=${'primary'} onClick=${() => (transport.running ? looper.stop() : transport.start())}>${transport.running ? '■ Stop' : '▶ Start'}</button>
        <button class="icon" onClick=${() => ctx.actions.setTempo(perf.tempo - 1)}>−</button>
        <span class="bpm">${perf.tempo}</span>
        <button class="icon" onClick=${() => ctx.actions.setTempo(perf.tempo + 1)}>+</button>
        <button onClick=${ctx.actions.tap}>Tap</button>
        <span class="pos">${transport.running ? `${pos.bar}.${pos.beat}` : '—'}</span>
        <span class="row" style="gap:4px">${[1, 2, 3, 4].map((b) => html`<span key=${b} class=${'beat' + (transport.running && pos.beat === b ? ' on' : '')}></span>`)}</span>
        <span class="grow"></span>
        <${Toggle} label="Click" on=${state.settings.metronome} onChange=${(v) => dispatch({ type: 'settings/patch', patch: { metronome: v } })} />
        <${Toggle} label="Quantise 1/16" on=${state.settings.quantize} onChange=${(v) => dispatch({ type: 'settings/patch', patch: { quantize: v } })} />
        <${Toggle} label="1 bar count-in" on=${state.settings.countIn > 0} onChange=${(v) => dispatch({ type: 'settings/patch', patch: { countIn: v ? 1 : 0 } })} />
        <button class="ghost" onClick=${() => looper.muteAll()}>All loops off</button>
      </div>
      <p class="muted" style="margin:8px 0 0">Arm a part and play the phrase once. Stop it at the end of the phrase: it rounds to whole bars and keeps going. Mute it for the next song, or clear it.</p>
    </div>
    <div class="loops">
      ${perf.parts.map((p, i) => {
        const t = looper.track(i);
        const isDrums = p.prog && p.prog.type === 'drums';
        const stateLabel = { empty: 'no loop', armed: 'armed: play to record', recording: `recording… bar ${pos.bar}`, playing: `playing · ${t.bars} bar${t.bars > 1 ? 's' : ''}`, muted: `muted · ${t.bars} bar${t.bars > 1 ? 's' : ''}` }[t.state];
        const barNow = t.state === 'playing' && transport.running ? ((pos.bar - 1) % Math.max(1, t.bars)) : -1;
        return html`<div class="loop" key=${p.id} style=${`--c:var(--${p.color})`} onClick=${() => ctx.actions.selectPart(i)}>
          <div>
            <div class="lname">${i + 1}. ${p.name}${t.groove ? html` <span class="dim">· groove: ${(GROOVES.find((g) => g.id === t.groove) || {}).name || t.groove}</span>` : ''}</div>
            <div class=${'lstate ' + t.state}>${stateLabel}${t.overdub ? ' · overdub' : ''}</div>
            ${t.bars ? html`<div class="bars">${Array.from({ length: Math.min(16, t.bars) }, (_, b) => html`<i key=${b} class=${b === barNow ? 'on' : ''}></i>`)}</div>` : null}
            ${isDrums
              ? html`<div class="grooves" style="margin-top:6px">
                  ${GROOVES.map((g) => html`<button key=${g.id} class=${'small ' + (t.groove === g.id ? 'on' : '')} onClick=${(e) => {
                    e.stopPropagation();
                    looper.setGroove(i, g.id);
                    if (!transport.running) transport.start();
                  }}>${g.name}</button>`)}
                </div>`
              : null}
          </div>
          <div class="lbtns">
            ${t.state === 'recording' || t.state === 'armed'
              ? html`<button class="rec on" onClick=${(e) => {
                  e.stopPropagation();
                  looper.stopRecording(i);
                }}>${t.state === 'armed' ? 'Cancel' : '■ Done'}</button>`
              : html`<button class="rec" onClick=${(e) => {
                  e.stopPropagation();
                  if (t.state !== 'empty') t.overdub = true;
                  looper.arm(i);
                }}>${t.state === 'empty' ? '● Rec' : '● Over'}</button>`}
            <button class=${t.state === 'playing' ? 'on' : ''} disabled=${t.state === 'empty' || t.state === 'armed' || t.state === 'recording'} onClick=${(e) => {
              e.stopPropagation();
              if (t.state === 'playing') looper.mute(i);
              else looper.play(i);
            }}>${t.state === 'playing' ? '▶ On' : '▶ Play'}</button>
            <button class="ghost" disabled=${t.state === 'empty'} onClick=${(e) => {
              e.stopPropagation();
              looper.clear(i);
            }}>Clear</button>
          </div>
        </div>`;
      })}
      ${!perf.parts.length ? html`<p class="dim">Add a sound first.</p>` : null}
    </div>
  </div>`;
}
