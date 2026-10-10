// The set list: songs in order, each with its rig and loops. Next/Prev move through them live.

import { html, useState } from '../../ui/h.js';
import { exportJson, importJson } from '../state.js';
import { toast } from './controls.js';

export function Songs({ ctx, state }) {
  const { dispatch } = ctx.store;
  const cur = state.currentSong;
  const [editing, setEditing] = useState(-1);
  const download = () => {
    const blob = new Blob([exportJson(state)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `stage-keys-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const upload = () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'application/json,.json';
    inp.onchange = async () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      try {
        const next = importJson(await f.text());
        ctx.router.panic();
        ctx.looper.clearAll();
        dispatch({ type: 'state/replace', state: next });
        toast('Set list imported');
      } catch (e) {
        toast('That file could not be read');
      }
    };
    inp.click();
  };
  return html`<div style="display:grid;gap:12px;max-width:900px">
    <div class="card">
      <div class="bigbtns">
        <button onClick=${ctx.actions.prevSong} disabled=${cur <= 0}>◀ Previous</button>
        <button class="primary" onClick=${ctx.actions.nextSong} disabled=${cur >= state.songs.length - 1}>Next song ▶</button>
      </div>
      <div class="row" style="margin-top:10px">
        <button onClick=${ctx.actions.addSong}>+ Save current rig as a song</button>
        ${cur >= 0 ? html`<button class="ghost" onClick=${() => ctx.actions.saveSong(cur)}>Update "${state.songs[cur].name}" with the current rig & loops</button>` : null}
        <span class="grow"></span>
        <button class="ghost small" onClick=${download}>Export</button>
        <button class="ghost small" onClick=${upload}>Import</button>
      </div>
      <p class="muted" style="margin:8px 0 0">A song remembers its rig (parts, splits, effects, macros), its tempo and its loops. Switching songs lets the old notes ring out. A pedal or knob can be learned for Next / Previous in Settings.</p>
    </div>
    <div class="songs">
      ${state.songs.map(
        (s, i) => html`<div class=${'song' + (i === cur ? ' current' : '')} key=${s.id} onClick=${() => ctx.actions.selectSong(i)}>
          <div class="n">${i + 1}</div>
          <div>
            ${editing === i
              ? html`<div class="row" onClick=${(e) => e.stopPropagation()}>
                  <input type="text" value=${s.name} placeholder="Song name" onChange=${(e) => dispatch({ type: 'song/update', index: i, patch: { name: e.target.value } })} />
                  <input type="text" value=${s.key} placeholder="Key" style="width:80px" onChange=${(e) => dispatch({ type: 'song/update', index: i, patch: { key: e.target.value } })} />
                  <input type="number" value=${s.tempo} min="40" max="240" style="width:90px" onChange=${(e) => dispatch({ type: 'song/update', index: i, patch: { tempo: Number(e.target.value) } })} />
                  <button class="small" onClick=${() => setEditing(-1)}>Done</button>
                </div>`
              : html`<div class="sname">${s.name}</div>`}
            <div class="sinfo">${s.key ? `Key ${s.key} · ` : ''}${s.tempo} bpm · ${s.performance ? `${s.performance.parts.length} part${s.performance.parts.length === 1 ? '' : 's'}: ${s.performance.parts.map((p) => p.name).join(', ')}` : 'no rig'}${s.loops && s.loops.tracks && s.loops.tracks.length ? ` · ${s.loops.tracks.length} loop${s.loops.tracks.length > 1 ? 's' : ''}` : ''}</div>
            ${s.notes ? html`<div class="sinfo">${s.notes}</div>` : null}
          </div>
          <div class="sbtns" onClick=${(e) => e.stopPropagation()}>
            <button class="small ghost" onClick=${() => setEditing(editing === i ? -1 : i)}>Rename</button>
            <button class="small ghost" disabled=${i === 0} onClick=${() => dispatch({ type: 'song/move', from: i, to: i - 1 })}>▲</button>
            <button class="small ghost" disabled=${i === state.songs.length - 1} onClick=${() => dispatch({ type: 'song/move', from: i, to: i + 1 })}>▼</button>
            <button class="small ghost danger" onClick=${() => {
              if (confirm(`Remove "${s.name}" from the set list?`)) dispatch({ type: 'song/remove', index: i });
            }}>✕</button>
          </div>
        </div>`,
      )}
      ${!state.songs.length ? html`<p class="dim">No songs yet. Set up the rig you want for a song, then "Save current rig as a song".</p>` : null}
    </div>
  </div>`;
}
