// Settings: keyboard and audio devices, latency, sample quality, learned controls, the KROSS 2 guide.

import { html, useEffect, useState } from '../../ui/h.js';
import { Slider, Toggle, Seg, toast } from './controls.js';
import { CC_ACTIONS } from '../router.js';
import { LATENCY_MODES, Engine } from '../engine.js';
import { presetBanks } from '../presets.js';

export function Settings({ ctx, state }) {
  const { dispatch } = ctx.store;
  const s = state.settings;
  const [outputs, setOutputs] = useState([]);
  const [guide, setGuide] = useState(false);
  const [prep, setPrep] = useState(null);
  useEffect(() => {
    if (ctx.engine.ready) ctx.engine.listOutputs().then(setOutputs).catch(() => {});
  }, [ctx.engine.ready]);
  const lat = ctx.engine.latency();
  const inputs = ctx.midi.inputs || [];
  const learning = ctx.actions.learning;
  const prepare = async () => {
    const ids = new Set();
    for (const song of state.songs) if (song.performance) for (const p of song.performance.parts) for (const b of presetBanks({ prog: p.prog })) ids.add(b);
    for (const p of state.performance.parts) for (const b of presetBanks({ prog: p.prog })) ids.add(b);
    const list = [...ids];
    if (!list.length) {
      toast('No sampled sounds in the set list');
      return;
    }
    let done = 0;
    setPrep({ done, total: list.length });
    for (const id of list) {
      try {
        await ctx.engine.samples.load(id);
      } catch (e) {
        toast(e.message || `Could not load ${id}`);
      }
      setPrep({ done: ++done, total: list.length });
    }
    toast('All sounds for the set list are downloaded');
    setTimeout(() => setPrep(null), 2000);
  };
  return html`<div class="settings">
    <div class="card">
      <h2>Keyboard (MIDI)</h2>
      <div class="kv">
        <span>Input</span>
        <select value=${s.midiInput} onChange=${(e) => ctx.actions.setMidiInput(e.target.value)}>
          <option value="">All inputs</option>
          ${inputs.map((i) => html`<option key=${i.id} value=${i.id}>${i.name}${i.state !== 'connected' ? ' (disconnected)' : ''}</option>`)}
        </select>
      </div>
      <div class="kv"><span>Status</span><span class="muted">${ctx.midi.error || (inputs.length ? inputs.map((i) => i.name).join(', ') : 'No MIDI device seen yet. Plug the keyboard in; it appears automatically.')}</span></div>
      <div class="kv"><span>Play with the computer keyboard (Z–M and Q–P, [ ] for octave)</span><${Toggle} on=${s.typing} onChange=${(v) => ctx.actions.setTyping(v)} /></div>
      <div class="kv"><span>Program change from the keyboard selects songs</span><${Toggle} on=${s.programChange} onChange=${(v) => dispatch({ type: 'settings/patch', patch: { programChange: v } })} /></div>
      <div class="kv"><span>Show the keyboard strip on Perform</span><${Toggle} on=${s.showKeys} onChange=${(v) => dispatch({ type: 'settings/patch', patch: { showKeys: v } })} /></div>
      <button class="ghost small" style="margin-top:8px" onClick=${() => setGuide(!guide)}>${guide ? 'Hide' : 'Show'} the KROSS 2 setup guide</button>
      ${guide ? html`<${KrossGuide} />` : null}
    </div>

    <div class="card">
      <h2>Audio</h2>
      <div class="kv">
        <span>Output${Engine.canPickOutput ? '' : ' (this browser cannot choose)'}</span>
        <div class="row">
          <select value=${s.audioOutput} disabled=${!Engine.canPickOutput} onChange=${(e) => ctx.actions.setOutput(e.target.value)}>
            <option value="">System default</option>
            ${outputs.map((o) => html`<option key=${o.id} value=${o.id}>${o.label}</option>`)}
          </select>
          <button class="small ghost" title="Asks the browser for permission to name the devices" onClick=${() => ctx.engine.listOutputs(true).then(setOutputs)}>Name devices</button>
        </div>
      </div>
      <div class="kv">
        <span>Latency (applies after a reload)</span>
        <select value=${s.latency} onChange=${(e) => dispatch({ type: 'settings/patch', patch: { latency: e.target.value } })}>
          ${Object.entries(LATENCY_MODES).map(([k, v]) => html`<option key=${k} value=${k}>${v.label}</option>`)}
        </select>
      </div>
      <div class="kv"><span>Measured</span><span class="muted">${lat ? `${lat.sampleRate} Hz · ${Math.round(lat.base * 1000)} ms buffer + ${Math.round(lat.output * 1000)} ms output · ${ctx.engine.voices} voices` : 'engine not running'}</span></div>
      <div class="kv">
        <span>Sample quality (memory vs. notes between samples)</span>
        <${Seg} value=${s.quality} options=${[{ v: 'low', label: 'Light' }, { v: 'medium', label: 'Normal' }, { v: 'high', label: 'Full' }]} onChange=${(v) => dispatch({ type: 'settings/patch', patch: { quality: v } })} />
      </div>
      <${Slider} label="Master volume" value=${s.masterVolume} onChange=${(v) => dispatch({ type: 'settings/patch', patch: { masterVolume: v } })} fmt=${(v) => `${Math.round(v * 100)}%`} />
      <${Slider} label="Click volume" value=${s.clickVolume} onChange=${(v) => dispatch({ type: 'settings/patch', patch: { clickVolume: v } })} fmt=${(v) => `${Math.round(v * 100)}%`} />
      <div class="row" style="margin-top:8px">
        <button onClick=${prepare} disabled=${!!prep}>${prep ? `Downloading ${prep.done}/${prep.total}…` : 'Download every sound in the set list (for offline)'}</button>
        <button class="ghost small" onClick=${() => location.reload()}>Reload the app</button>
      </div>
    </div>

    <div class="card">
      <h2>Knobs, pedals, switches</h2>
      <p class="muted" style="margin:0 0 8px">Press Learn, then move the knob or press the pedal on the keyboard. The KROSS 2 tone knobs (CC 74/71/73/72) drive the four macros out of the box. The sustain pedal, mod wheel, pitch bend and expression pedal always work.</p>
      <div class="ccmap">
        ${Object.entries(CC_ACTIONS).map(([action, label]) => {
          const cc = Object.keys(s.ccMap).find((k) => s.ccMap[k] === action);
          return html`<div class="ccrow" key=${action}>
            <span>${label}</span>
            <span class="muted">${cc != null ? `CC ${cc}` : '—'}</span>
            <span class="row" style="gap:4px">
              <button class=${'small ' + (learning === action ? 'rec on' : '')} onClick=${() => ctx.actions.learn(learning === action ? null : action)}>${learning === action ? 'Waiting…' : 'Learn'}</button>
              ${cc != null ? html`<button class="small ghost" onClick=${() => dispatch({ type: 'settings/cc', cc: null, action })}>✕</button>` : null}
            </span>
          </div>`;
        })}
      </div>
    </div>

    <div class="card">
      <h2>Keys on the computer</h2>
      <p class="muted" style="margin:0">Esc: all notes off. In Songs: ← → previous / next song. Tap a part card to select it for the sound browser and the editor. Double-tap a fader to reset it.</p>
    </div>
  </div>`;
}

function KrossGuide() {
  return html`<div class="guide">
    <h3 style="margin-top:12px">KROSS 2 over one USB cable</h3>
    <ol>
      <li>Connect the KROSS 2's <b>USB B</b> port (the square "printer" socket) to the computer. It is class-compliant: Windows 10/11 and macOS see a <b>KROSS2 MIDI</b> device and a <b>KROSS2 audio</b> device with no driver. On Windows 11 24H2 or later do <b>not</b> install the KORG USB-MIDI driver (uninstall it if it is there).</li>
      <li>Windows lets only one program hold the MIDI port: close any DAW or Korg editor before opening Stage Keys.</li>
      <li>Open this page in Chrome or Edge and press <b>Start the rig</b>; allow MIDI when asked.</li>
      <li>So the keyboard plays <b>only</b> the computer's sounds: on the KROSS press <b>GLOBAL/MEDIA</b>, go to <code>G‑MIDI › BASIC</code> and untick <b>Local Control On</b>. Then <code>FUNCTION › Write Global Setting</code> so it stays off after power-off. Tick it again to layer the KROSS's own sounds under this rig.</li>
      <li>To hear the computer through the KROSS's own outputs and headphones, pick <b>KROSS2 audio</b> as the audio output above. The KROSS mixes it with its own sound at its USB audio input.</li>
      <li>The <b>damper</b> pedal (CC 64), <b>mod wheel</b> (CC 1) and <b>pitch bend</b> work as expected; an expression pedal on the assignable pedal jack set to <b>Expression (CC 11)</b> rides the volume of every part. The assignable switch set to <b>Foot Switch (CC 82)</b> can be learned for Next song, rotary speed or loop play/mute.</li>
      <li>The realtime <b>TONE</b> knobs send CC 74 and 71 (row 1) and CC 73 and 72 (row 2): the four macros. The ARP button sends CC 14 when "ARP Controllers MIDI Out" is set to Control Change.</li>
      <li>Program changes from the KROSS select songs in the set list (switch that off above if you change programs on the keyboard for its own sounds).</li>
    </ol>
  </div>`;
}
