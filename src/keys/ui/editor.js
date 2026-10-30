// The edit drawer for the selected part: the sound's own parameters, the effect chain, mixing and zone.

import { html, useState } from '../../ui/h.js';
import { Slider, Toggle, Seg, Stepper, Drawbars, noteName, FX_LABELS, toast } from './controls.js';
import { COLORS, uid } from '../state.js';
import { FX_ORDER } from '../fx.js';
import { FEATURED, bankInfo } from '../banks.js';
import { NOTE_BEATS } from '../dsp/util.js';
import { GROOVES } from '../looper.js';

const WAVES = ['saw', 'square', 'pulse', 'tri', 'sine', 'supersaw'];
const SYNC = [{ v: '', label: 'Hz' }, { v: 'q', label: '1/4' }, { v: 'e', label: '1/8' }, { v: 'de', label: '1/8.' }, { v: 's', label: '1/16' }, { v: 'te', label: '1/8T' }];
const DELAY_TIMES = [{ v: 'q', label: '1/4' }, { v: 'dq', label: '1/4.' }, { v: 'e', label: '1/8' }, { v: 'de', label: '1/8.' }, { v: 's', label: '1/16' }, { v: 'te', label: '1/8T' }];
const sec = (v) => (v < 1 ? `${Math.round(v * 1000)} ms` : `${v.toFixed(2)} s`);
const hz = (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)} kHz` : `${Math.round(v)} Hz`);
const pct = (v) => `${Math.round(v * 100)}%`;
const db = (v) => `${v > 0 ? '+' : ''}${Number(v).toFixed(1)} dB`;

export function Editor({ ctx, state }) {
  const { dispatch } = ctx.store;
  const i = state.ui.selectedPart;
  const p = state.performance.parts[i];
  const tab = state.ui.editor || 'sound';
  const setTab = (t) => dispatch({ type: 'ui/patch', patch: { editor: t } });
  const close = () => dispatch({ type: 'ui/patch', patch: { editor: null } });
  const set = (path, value) => dispatch({ type: 'part/progPath', index: i, path, value });
  const tabs = [['sound', 'Sound'], ['fx', 'Effects'], ['mix', 'Mix & zone']];
  return html`<div class="drawer" style=${`--c:var(--${p.color})`}>
    <div class="dhead">
      <input type="text" class="grow" value=${p.name} onChange=${(e) => dispatch({ type: 'part/patch', index: i, patch: { name: e.target.value } })} />
      <button class="small ghost" onClick=${() => ctx.actions.preview(i)}>▶</button>
      <button class="small" onClick=${close}>Close</button>
    </div>
    <div class="dtabs">${tabs.map(([id, label]) => html`<button key=${id} class=${'small ' + (tab === id ? 'on' : 'ghost')} onClick=${() => setTab(id)}>${label}</button>`)}</div>
    <div class="dbody">
      ${tab === 'sound' ? html`<${SoundEditor} ctx=${ctx} prog=${p.prog} set=${set} index=${i} color=${p.color} />` : null}
      ${tab === 'fx' ? html`<${FxEditor} ctx=${ctx} part=${p} index=${i} tempo=${state.performance.tempo} />` : null}
      ${tab === 'mix' ? html`<${MixEditor} ctx=${ctx} state=${state} part=${p} index=${i} />` : null}
    </div>
  </div>`;
}

// ------------------------------------------------------------------ sound

function SoundEditor({ ctx, prog, set, index, color, prefix = '' }) {
  const at = (path) => (prefix ? `${prefix}.${path}` : path);
  const s = (path, v) => set(at(path), v);
  switch (prog.type) {
    case 'synth':
      return html`<${SynthEditor} prog=${prog} s=${s} color=${color} />`;
    case 'organ':
      return html`<${OrganEditor} prog=${prog} s=${s} color=${color} />`;
    case 'string':
      return html`<${StringEditor} prog=${prog} s=${s} color=${color} />`;
    case 'sampler':
      return html`<${SamplerEditor} ctx=${ctx} prog=${prog} s=${s} color=${color} />`;
    case 'drums':
      return html`<div class="section">
        <h3>Kit</h3>
        <${Seg} value=${prog.kit} options=${['sebene', 'worship']} onChange=${(v) => s('kit', v)} />
        <${Slider} label="Level" value=${prog.level} max=${1.5} color=${color} onChange=${(v) => s('level', v)} fmt=${pct} />
        <${Slider} label="Tune" value=${prog.tune} min=${-12} max=${12} step=${1} unit=" st" color=${color} onChange=${(v) => s('tune', v)} />
        <${Slider} label="Decay" value=${prog.decay} min=${0.3} max=${2.5} color=${color} onChange=${(v) => s('decay', v)} fmt=${(v) => `×${v.toFixed(2)}`} />
      </div>`;
    case 'layer':
      return html`<div>
        <div class="section">
          <h3>Stack</h3>
          <${PlaySection} prog=${prog} s=${s} color=${color} />
        </div>
        ${prog.layers.map(
          (l, li) => html`<div class="section osc" key=${li}>
            <h3>Layer ${li + 1} · ${l.type}</h3>
            <${Slider} label="Transpose" value=${l.transpose || 0} min=${-24} max=${24} step=${1} unit=" st" color=${color} onChange=${(v) => s(`layers.${li}.transpose`, v)} />
            <${Slider} label="Detune" value=${l.detune || 0} min=${-50} max=${50} step=${1} unit=" ct" color=${color} onChange=${(v) => s(`layers.${li}.detune`, v)} />
            <${SoundEditor} ctx=${ctx} prog=${l} set=${set} index=${index} color=${color} prefix=${at(`layers.${li}`)} />
          </div>`,
        )}
      </div>`;
    default:
      return html`<div class="dim">Nothing to edit.</div>`;
  }
}

function PlaySection({ prog, s, color, noVoices }) {
  return html`<div>
    <div class="row" style="margin-bottom:6px">
      <${Seg} value=${prog.mode} options=${['poly', 'mono', 'legato']} onChange=${(v) => s('mode', v)} />
      ${!noVoices ? html`<${Stepper} label="" value=${prog.voices} min=${1} max=${32} fmt=${(v) => `${v} voices`} onChange=${(v) => s('voices', v)} />` : null}
    </div>
    <${Slider} label="Glide" value=${prog.glide || 0} max=${0.5} color=${color} onChange=${(v) => s('glide', v)} fmt=${sec} />
    <${Slider} label="Bend range" value=${prog.bendRange} min=${0} max=${12} step=${1} unit=" st" color=${color} onChange=${(v) => s('bendRange', v)} />
  </div>`;
}

function EnvSection({ title, env, s, path, color, maxA = 5, maxR = 8 }) {
  return html`<div class="section">
    <h3>${title}</h3>
    <${Slider} label="Attack" value=${env.a} min=${0.001} max=${maxA} log color=${color} onChange=${(v) => s(`${path}.a`, v)} fmt=${sec} />
    <${Slider} label="Decay" value=${env.d} min=${0.001} max=${8} log color=${color} onChange=${(v) => s(`${path}.d`, v)} fmt=${sec} />
    <${Slider} label="Sustain" value=${env.s} color=${color} onChange=${(v) => s(`${path}.s`, v)} fmt=${pct} />
    <${Slider} label="Release" value=${env.r} min=${0.005} max=${maxR} log color=${color} onChange=${(v) => s(`${path}.r`, v)} fmt=${sec} />
  </div>`;
}

function FilterSection({ f, s, color, allowOff }) {
  const types = allowOff ? ['off', 'lp', 'hp', 'bp'] : ['lp', 'hp', 'bp'];
  return html`<div class="section">
    <h3>Filter</h3>
    <div class="row" style="margin-bottom:6px">
      <${Seg} value=${f.type} options=${types.map((t) => ({ v: t, label: t.toUpperCase() }))} onChange=${(v) => s('filter.type', v)} />
      <${Seg} value=${f.slope} options=${[{ v: 12, label: '12 dB' }, { v: 24, label: '24 dB' }]} onChange=${(v) => s('filter.slope', v)} />
    </div>
    <${Slider} label="Cutoff" value=${f.cutoff} min=${20} max=${20000} log color=${color} onChange=${(v) => s('filter.cutoff', v)} fmt=${hz} />
    <${Slider} label="Resonance" value=${f.res} color=${color} onChange=${(v) => s('filter.res', v)} fmt=${pct} />
    <${Slider} label="Env amount" value=${f.env} min=${-6} max=${6} step=${0.1} unit=" oct" color=${color} onChange=${(v) => s('filter.env', v)} />
    <${Slider} label="Key track" value=${f.key} color=${color} onChange=${(v) => s('filter.key', v)} fmt=${pct} />
    <${Slider} label="Velocity" value=${f.vel} color=${color} onChange=${(v) => s('filter.vel', v)} fmt=${pct} />
  </div>`;
}

function LfoSection({ lfo, mw, s, color }) {
  return html`<div class="section">
    <h3>LFO & mod wheel</h3>
    <div class="row" style="margin-bottom:6px">
      <${Seg} value=${lfo.shape} options=${['sine', 'tri', 'square', 'saw', 'sh']} onChange=${(v) => s('lfo.shape', v)} />
      <${Seg} value=${lfo.sync || ''} options=${SYNC} onChange=${(v) => s('lfo.sync', v)} />
    </div>
    ${!lfo.sync ? html`<${Slider} label="Rate" value=${lfo.rate} min=${0.02} max=${20} log color=${color} onChange=${(v) => s('lfo.rate', v)} fmt=${(v) => `${v.toFixed(2)} Hz`} />` : null}
    <${Slider} label="Delay" value=${lfo.delay} max=${3} color=${color} onChange=${(v) => s('lfo.delay', v)} fmt=${sec} />
    <${Slider} label="Fade in" value=${lfo.fade} max=${5} color=${color} onChange=${(v) => s('lfo.fade', v)} fmt=${sec} />
    <${Slider} label="→ Pitch" value=${lfo.pitch} max=${2} color=${color} onChange=${(v) => s('lfo.pitch', v)} fmt=${(v) => `${v.toFixed(2)} st`} />
    <${Slider} label="→ Filter" value=${lfo.filter} min=${-3} max=${3} step=${0.05} unit=" oct" color=${color} onChange=${(v) => s('lfo.filter', v)} />
    <${Slider} label="→ Tremolo" value=${lfo.amp} color=${color} onChange=${(v) => s('lfo.amp', v)} fmt=${pct} />
    <${Slider} label="→ Pulse width" value=${lfo.pw} color=${color} onChange=${(v) => s('lfo.pw', v)} fmt=${pct} />
    <h3 style="margin-top:8px">Mod wheel adds</h3>
    <${Slider} label="Vibrato" value=${mw.vibrato} max=${2} color=${color} onChange=${(v) => s('modWheel.vibrato', v)} fmt=${(v) => `${v.toFixed(2)} st`} />
    <${Slider} label="Filter" value=${mw.filter} min=${-4} max=${4} step=${0.1} unit=" oct" color=${color} onChange=${(v) => s('modWheel.filter', v)} />
    <${Slider} label="Tremolo" value=${mw.amp} color=${color} onChange=${(v) => s('modWheel.amp', v)} fmt=${pct} />
  </div>`;
}

function SynthEditor({ prog, s, color }) {
  return html`<div>
    <div class="section">
      <h3>Oscillators</h3>
      ${prog.osc.map(
        (o, k) => html`<div class="osc" key=${k}>
          <div class="row" style="margin-bottom:4px">
            <b>Osc ${k + 1}</b>
            <${Seg} value=${o.wave} options=${WAVES} onChange=${(v) => s(`osc.${k}.wave`, v)} />
          </div>
          <${Slider} label="Level" value=${o.level} color=${color} onChange=${(v) => s(`osc.${k}.level`, v)} fmt=${pct} />
          <div class="two">
            <${Stepper} label="Octave" value=${o.octave} min=${-3} max=${3} onChange=${(v) => s(`osc.${k}.octave`, v)} />
            <${Stepper} label="Semi" value=${o.semi} min=${-12} max=${12} onChange=${(v) => s(`osc.${k}.semi`, v)} />
          </div>
          <${Slider} label="Fine" value=${o.fine} min=${-50} max=${50} step=${1} unit=" ct" color=${color} onChange=${(v) => s(`osc.${k}.fine`, v)} />
          ${o.wave === 'square' || o.wave === 'pulse' ? html`<${Slider} label="Pulse width" value=${o.pw} min=${0.05} max=${0.95} color=${color} onChange=${(v) => s(`osc.${k}.pw`, v)} fmt=${pct} />` : null}
          ${o.wave !== 'supersaw' ? html`<${Stepper} label="Unison" value=${o.unison} min=${1} max=${7} onChange=${(v) => s(`osc.${k}.unison`, v)} />` : null}
          <${Slider} label="Detune" value=${o.detune} color=${color} onChange=${(v) => s(`osc.${k}.detune`, v)} fmt=${pct} />
          <${Slider} label="Spread" value=${o.spread} color=${color} onChange=${(v) => s(`osc.${k}.spread`, v)} fmt=${pct} />
        </div>`,
      )}
      <div class="row">
        <${Slider} label="Noise" value=${prog.noise.level} color=${color} onChange=${(v) => s('noise.level', v)} fmt=${pct} />
        <${Seg} value=${prog.noise.color} options=${['white', 'pink']} onChange=${(v) => s('noise.color', v)} />
      </div>
    </div>
    <${FilterSection} f=${prog.filter} s=${s} color=${color} />
    <${EnvSection} title="Amp envelope" env=${prog.env} s=${s} path="env" color=${color} />
    <${EnvSection} title="Filter envelope" env=${prog.fenv} s=${s} path="fenv" color=${color} />
    <${LfoSection} lfo=${prog.lfo} mw=${prog.modWheel} s=${s} color=${color} />
    <div class="section">
      <h3>Play</h3>
      <${PlaySection} prog=${prog} s=${s} color=${color} />
      <${Slider} label="Level" value=${prog.level} max=${1.5} color=${color} onChange=${(v) => s('level', v)} fmt=${pct} />
      <${Slider} label="Velocity → level" value=${prog.velAmp} color=${color} onChange=${(v) => s('velAmp', v)} fmt=${pct} />
      <${Slider} label="Stereo spread" value=${prog.spread} color=${color} onChange=${(v) => s('spread', v)} fmt=${pct} />
      <${Slider} label="Analogue drift" value=${prog.drift} color=${color} onChange=${(v) => s('drift', v)} fmt=${pct} />
    </div>
  </div>`;
}

function OrganEditor({ prog, s, color }) {
  return html`<div>
    <div class="section">
      <h3>Drawbars</h3>
      <${Drawbars} values=${prog.drawbars} onChange=${(v) => s('drawbars', v)} />
      <div class="row" style="margin-top:8px">
        ${[
          ['888000000', 'Jazz'],
          ['888800000', 'Rock'],
          ['808000000', 'Soft'],
          ['888000008', 'Gospel'],
          ['888888888', 'Full'],
          ['008000000', 'Flute'],
        ].map(([v, label]) => html`<button key=${v} class="small" onClick=${() => s('drawbars', v.split('').map(Number))}>${label} ${v}</button>`)}
      </div>
    </div>
    <div class="section">
      <h3>Percussion</h3>
      <div class="row">
        <${Toggle} label="On" on=${prog.perc.on} onChange=${(v) => s('perc.on', v)} />
        <${Seg} value=${prog.perc.third} options=${[{ v: false, label: '2nd' }, { v: true, label: '3rd' }]} onChange=${(v) => s('perc.third', v)} />
        <${Seg} value=${prog.perc.fast} options=${[{ v: true, label: 'Fast' }, { v: false, label: 'Slow' }]} onChange=${(v) => s('perc.fast', v)} />
        <${Seg} value=${prog.perc.soft} options=${[{ v: false, label: 'Normal' }, { v: true, label: 'Soft' }]} onChange=${(v) => s('perc.soft', v)} />
      </div>
    </div>
    <div class="section">
      <h3>Vibrato / chorus</h3>
      <${Seg} value=${prog.vibrato} options=${['off', 'V1', 'V2', 'V3', 'C1', 'C2', 'C3']} onChange=${(v) => s('vibrato', v)} />
    </div>
    <div class="section">
      <h3>Tone</h3>
      <${Slider} label="Key click" value=${prog.click} color=${color} onChange=${(v) => s('click', v)} fmt=${pct} />
      <${Slider} label="Leakage" value=${prog.leakage} max=${0.3} color=${color} onChange=${(v) => s('leakage', v)} fmt=${pct} />
      <${Slider} label="Attack" value=${prog.attack} min=${0.001} max=${1} log color=${color} onChange=${(v) => s('attack', v)} fmt=${sec} />
      <${Slider} label="Release" value=${prog.release} min=${0.005} max=${2} log color=${color} onChange=${(v) => s('release', v)} fmt=${sec} />
      <${Slider} label="Level" value=${prog.level} max=${1.2} color=${color} onChange=${(v) => s('level', v)} fmt=${pct} />
    </div>
    <div class="section"><h3>Play</h3><${PlaySection} prog=${prog} s=${s} color=${color} /></div>
  </div>`;
}

function StringEditor({ prog, s, color }) {
  return html`<div>
    <div class="section">
      <h3>String</h3>
      <div class="row" style="margin-bottom:6px">
        <${Seg} value=${prog.model} options=${['guitar', 'bass']} onChange=${(v) => s('model', v)} />
        <${Seg} value=${prog.unison} options=${[{ v: 1, label: 'Single' }, { v: 2, label: 'Doubled' }]} onChange=${(v) => s('unison', v)} />
        <${Toggle} label="Hammer-on (legato)" on=${prog.legato} onChange=${(v) => s('legato', v)} />
      </div>
      <${Slider} label="Pick position" value=${prog.pick} min=${0.03} max=${0.5} color=${color} onChange=${(v) => s('pick', v)} fmt=${pct} />
      <${Slider} label="Brightness" value=${prog.bright} color=${color} onChange=${(v) => s('bright', v)} fmt=${pct} />
      <${Slider} label="Decay" value=${prog.decay} min=${0.2} max=${8} log color=${color} onChange=${(v) => s('decay', v)} fmt=${sec} />
      <${Slider} label="Damping" value=${prog.damp} color=${color} onChange=${(v) => s('damp', v)} fmt=${pct} />
      <${Slider} label="Palm mute" value=${prog.mute} color=${color} onChange=${(v) => s('mute', v)} fmt=${pct} />
      <${Slider} label="Release" value=${prog.release} min=${0.02} max=${1} log color=${color} onChange=${(v) => s('release', v)} fmt=${sec} />
      <${Slider} label="Stiffness" value=${prog.stiff} max=${0.5} color=${color} onChange=${(v) => s('stiff', v)} fmt=${pct} />
      <${Slider} label="Double detune" value=${prog.detune} color=${color} onChange=${(v) => s('detune', v)} fmt=${pct} />
    </div>
    <div class="section">
      <h3>Pickup & body</h3>
      <${Slider} label="Tone" value=${prog.tone} min=${500} max=${12000} log color=${color} onChange=${(v) => s('tone', v)} fmt=${hz} />
      <${Slider} label="Body" value=${prog.body} color=${color} onChange=${(v) => s('body', v)} fmt=${pct} />
      <${Slider} label="Level" value=${prog.level} max=${1.5} color=${color} onChange=${(v) => s('level', v)} fmt=${pct} />
      <${Slider} label="Velocity → bright" value=${prog.velBright} color=${color} onChange=${(v) => s('velBright', v)} fmt=${pct} />
      <${Slider} label="Velocity → level" value=${prog.velAmp} color=${color} onChange=${(v) => s('velAmp', v)} fmt=${pct} />
      <${Slider} label="Stereo spread" value=${prog.spread} color=${color} onChange=${(v) => s('spread', v)} fmt=${pct} />
    </div>
    <div class="section">
      <h3>Wheel & vibrato</h3>
      <${Slider} label="Wheel → mute" value=${prog.modWheel.mute} color=${color} onChange=${(v) => s('modWheel.mute', v)} fmt=${pct} />
      <${Slider} label="Wheel → vibrato" value=${prog.modWheel.vibrato} max=${1} color=${color} onChange=${(v) => s('modWheel.vibrato', v)} fmt=${(v) => `${v.toFixed(2)} st`} />
      <${Slider} label="Vibrato rate" value=${prog.lfo.rate} min=${1} max=${10} color=${color} onChange=${(v) => s('lfo.rate', v)} fmt=${(v) => `${v.toFixed(1)} Hz`} />
    </div>
    <div class="section"><h3>Play</h3><${PlaySection} prog=${prog} s=${s} color=${color} /></div>
  </div>`;
}

function SamplerEditor({ ctx, prog, s, color }) {
  const banks = FEATURED.includes(prog.bank) ? FEATURED : [prog.bank, ...FEATURED];
  const loaded = ctx.engine.samples && ctx.engine.samples.isLoaded(prog.bank);
  const prog01 = ctx.loading.get(prog.bank);
  return html`<div>
    <div class="section">
      <h3>Instrument ${loaded ? html`<span class="dim">loaded</span>` : typeof prog01 === 'number' ? html`<span class="dim">loading ${Math.round(prog01 * 100)}%</span>` : null}</h3>
      <select value=${prog.bank} onChange=${(e) => s('bank', e.target.value)} style="width:100%">
        ${banks.map((id) => {
          let label = id;
          try {
            const info = bankInfo(id);
            label = `${info.label} · ${info.set}`;
          } catch {
            /* keep the id */
          }
          return html`<option key=${id} value=${id}>${label}</option>`;
        })}
      </select>
      <div class="row" style="margin-top:6px">
        <span class="dim">Loop</span>
        <${Seg} value=${prog.loop} options=${[{ v: 'auto', label: 'Auto' }, { v: 'on', label: 'On' }, { v: 'none', label: 'Off' }]} onChange=${(v) => s('loop', v)} />
      </div>
      <${Slider} label="Loop crossfade" value=${prog.loopFade} min=${0.005} max=${0.3} log color=${color} onChange=${(v) => s('loopFade', v)} fmt=${sec} />
      <${Slider} label="Start" value=${prog.start} max=${1} color=${color} onChange=${(v) => s('start', v)} fmt=${sec} />
    </div>
    <${EnvSection} title="Envelope" env=${prog.env} s=${s} path="env" color=${color} />
    <${FilterSection} f=${prog.filter} s=${s} color=${color} allowOff />
    <${EnvSection} title="Filter envelope" env=${prog.fenv} s=${s} path="fenv" color=${color} />
    <${LfoSection} lfo=${prog.lfo} mw=${prog.modWheel} s=${s} color=${color} />
    <div class="section">
      <h3>Play</h3>
      <${PlaySection} prog=${prog} s=${s} color=${color} />
      <${Slider} label="Level" value=${prog.level} max=${1.5} color=${color} onChange=${(v) => s('level', v)} fmt=${pct} />
      <${Slider} label="Velocity → level" value=${prog.velAmp} color=${color} onChange=${(v) => s('velAmp', v)} fmt=${pct} />
      <div class="row"><span class="dim">Velocity curve</span><${Seg} value=${prog.velCurve} options=${['soft', 'normal', 'hard', 'fixed']} onChange=${(v) => s('velCurve', v)} /></div>
      <${Slider} label="Stereo spread" value=${prog.spread} color=${color} onChange=${(v) => s('spread', v)} fmt=${pct} />
      <${Slider} label="Transpose" value=${prog.transpose} min=${-24} max=${24} step=${1} unit=" st" color=${color} onChange=${(v) => s('transpose', v)} />
      <${Slider} label="Fine" value=${prog.fine} min=${-100} max=${100} step=${1} unit=" ct" color=${color} onChange=${(v) => s('fine', v)} />
    </div>
  </div>`;
}

// ------------------------------------------------------------------ fx

function FxEditor({ ctx, part: p, index: i, tempo }) {
  const { dispatch } = ctx.store;
  const set = (stage, patch) => dispatch({ type: 'part/fx', index: i, stage, patch });
  const color = p.color;
  const fx = p.fx;
  const stage = (k, title, body) => html`<div class=${'fxstage' + (fx[k].on ? ' on' : '')} key=${k}>
    <div class="fxhead"><${Toggle} on=${fx[k].on} onChange=${(v) => set(k, { on: v })} /><span class="t">${title}</span></div>
    ${fx[k].on ? body : null}
  </div>`;
  const S = (k, label, key, o = {}) => html`<${Slider} label=${label} value=${fx[k][key]} color=${color} onChange=${(v) => set(k, { [key]: v })} ...${o} />`;
  return html`<div>
    ${stage('comp', 'Compressor', html`<div>
      ${S('comp', 'Threshold', 'thresh', { min: -60, max: 0, step: 1, fmt: db })}
      ${S('comp', 'Ratio', 'ratio', { min: 1, max: 20, step: 0.5, fmt: (v) => `${v}:1` })}
      ${S('comp', 'Attack', 'attack', { min: 0.0005, max: 0.5, log: true, fmt: sec })}
      ${S('comp', 'Release', 'release', { min: 0.02, max: 1, log: true, fmt: sec })}
      ${S('comp', 'Makeup', 'gain', { min: -12, max: 24, step: 0.5, fmt: db })}
    </div>`)}
    ${stage('drive', 'Drive / amp', html`<div>
      <${Seg} value=${fx.drive.type} options=${['tube', 'crunch', 'fuzz', 'amp']} onChange=${(v) => set('drive', { type: v })} />
      ${S('drive', 'Amount', 'amount', { fmt: pct })}
      ${S('drive', 'Tone', 'tone', { fmt: pct })}
      ${S('drive', 'Level', 'level', { max: 2, fmt: pct })}
    </div>`)}
    ${stage('eq', 'EQ', html`<div>
      ${S('eq', 'Low cut', 'hpf', { min: 0, max: 1000, step: 5, fmt: (v) => (v ? hz(v) : 'off') })}
      ${S('eq', 'Low (120 Hz)', 'low', { min: -18, max: 18, step: 0.5, fmt: db })}
      ${S('eq', 'Mid', 'mid', { min: -18, max: 18, step: 0.5, fmt: db })}
      ${S('eq', 'Mid freq', 'midFreq', { min: 100, max: 8000, log: true, fmt: hz })}
      ${S('eq', 'High (5 kHz)', 'high', { min: -18, max: 18, step: 0.5, fmt: db })}
    </div>`)}
    ${stage('mod', 'Chorus / flanger / phaser', html`<div>
      <${Seg} value=${fx.mod.type} options=${['chorus', 'ensemble', 'flanger', 'phaser']} onChange=${(v) => set('mod', { type: v })} />
      ${S('mod', 'Rate', 'rate', { min: 0.05, max: 10, log: true, fmt: (v) => `${v.toFixed(2)} Hz` })}
      ${S('mod', 'Depth', 'depth', { fmt: pct })}
      ${S('mod', 'Mix', 'mix', { fmt: pct })}
      ${S('mod', 'Feedback', 'feedback', { min: -0.9, max: 0.9, fmt: pct })}
      ${S('mod', 'One side wet', 'side', { fmt: pct })}
    </div>`)}
    ${stage('trem', 'Tremolo / auto-pan', html`<div>
      <div class="row">
        <${Seg} value=${fx.trem.type} options=${['tremolo', 'autopan']} onChange=${(v) => set('trem', { type: v })} />
        <${Seg} value=${fx.trem.shape} options=${['sine', 'tri', 'square']} onChange=${(v) => set('trem', { shape: v })} />
        <${Seg} value=${fx.trem.sync || ''} options=${SYNC} onChange=${(v) => set('trem', { sync: v })} />
      </div>
      ${!fx.trem.sync ? S('trem', 'Rate', 'rate', { min: 0.1, max: 20, log: true, fmt: (v) => `${v.toFixed(2)} Hz` }) : null}
      ${S('trem', 'Depth', 'depth', { fmt: pct })}
    </div>`)}
    ${stage('rotary', 'Rotary speaker', html`<div>
      <${Seg} value=${fx.rotary.speed} options=${['slow', 'fast', 'stop']} onChange=${(v) => set('rotary', { speed: v })} />
      ${S('rotary', 'Drive', 'drive', { fmt: pct })}
      ${S('rotary', 'Horn / drum', 'balance', { fmt: pct })}
    </div>`)}
    ${stage('delay', 'Delay', html`<div>
      <div class="row">
        <${Toggle} label="Tempo sync" on=${fx.delay.sync} onChange=${(v) => set('delay', { sync: v })} />
        <${Toggle} label="Ping-pong" on=${fx.delay.pingpong} onChange=${(v) => set('delay', { pingpong: v })} />
      </div>
      ${fx.delay.sync
        ? html`<div class="row" style="margin:6px 0"><span class="dim">Time</span><${Seg} value=${fx.delay.time} options=${DELAY_TIMES} onChange=${(v) => set('delay', { time: v })} /><span class="dim">${Math.round(((NOTE_BEATS[fx.delay.time] || 0.5) * 60000) / tempo)} ms</span></div>`
        : S('delay', 'Time', 'ms', { min: 10, max: 2000, log: true, fmt: (v) => `${Math.round(v)} ms` })}
      ${S('delay', 'Feedback', 'feedback', { max: 0.95, fmt: pct })}
      ${S('delay', 'Mix', 'mix', { fmt: pct })}
      ${S('delay', 'Tone', 'tone', { min: 300, max: 16000, log: true, fmt: hz })}
      ${S('delay', 'Right spread', 'spread', { min: 0.25, max: 2, fmt: (v) => `×${v.toFixed(2)}` })}
    </div>`)}
    ${stage('reverb', 'Reverb', html`<div>
      <${Seg} value=${fx.reverb.type} options=${['room', 'plate', 'hall', 'cathedral', 'spring', 'shimmer']} onChange=${(v) => set('reverb', { type: v })} />
      ${S('reverb', 'Decay', 'decay', { min: 0.2, max: 15, log: true, fmt: sec })}
      ${S('reverb', 'Pre-delay', 'predelay', { max: 0.25, fmt: sec })}
      ${S('reverb', 'Damping', 'damp', { fmt: pct })}
      ${S('reverb', 'Low cut', 'lowcut', { min: 20, max: 1000, log: true, fmt: hz })}
      ${S('reverb', 'Mix', 'mix', { fmt: pct })}
      ${fx.reverb.type === 'shimmer' ? S('reverb', 'Shimmer', 'shimmer', { max: 0.7, fmt: pct }) : null}
      ${fx.reverb.type === 'shimmer' && !ctx.engine.shimmer ? html`<div class="warnbox">The shimmer pitch-shifter could not load in this browser; the hall plays without it.</div>` : null}
    </div>`)}
  </div>`;
}

// ------------------------------------------------------------------ mix & zone

function MixEditor({ ctx, state, part: p, index: i }) {
  const { dispatch } = ctx.store;
  const patch = (o) => dispatch({ type: 'part/patch', index: i, patch: o });
  const [split, setSplit] = useState(60);
  const save = () => {
    const preset = { id: uid('user'), name: p.name, family: p.family, kind: p.kind, desc: 'Saved from the rig', prog: p.prog, fx: p.fx, octave: p.octave, user: true, tags: [], basePreset: p.presetId || p.basePreset || null };
    dispatch({ type: 'userPreset/save', preset });
    toast(`${p.name} saved to your sounds`);
  };
  return html`<div>
    <div class="section">
      <h3>Colour</h3>
      <div class="row">${COLORS.map((c) => html`<button key=${c} class=${'icon ' + (p.color === c ? 'on' : '')} style=${`background:var(--${c});border-color:transparent`} onClick=${() => patch({ color: c })}></button>`)}</div>
    </div>
    <div class="section">
      <h3>Key range</h3>
      <div class="two">
        <${Stepper} label="From" value=${p.keyLow} min=${0} max=${p.keyHigh} fmt=${noteName} onChange=${(v) => patch({ keyLow: v })} />
        <${Stepper} label="To" value=${p.keyHigh} min=${p.keyLow} max=${127} fmt=${noteName} onChange=${(v) => patch({ keyHigh: v })} />
      </div>
      <div class="row" style="margin-top:6px">
        <span class="dim">Split at</span>
        <${Stepper} label="" value=${split} min=${24} max=${96} fmt=${noteName} onChange=${setSplit} />
        <button class="small" onClick=${() => patch({ keyLow: 0, keyHigh: split - 1 })}>Left of split</button>
        <button class="small" onClick=${() => patch({ keyLow: split, keyHigh: 127 })}>Right of split</button>
        <button class="small" onClick=${() => patch({ keyLow: 0, keyHigh: 127 })}>Whole keyboard</button>
      </div>
      <div class="two" style="margin-top:6px">
        <${Stepper} label="Octave" value=${p.octave} min=${-3} max=${3} onChange=${(v) => patch({ octave: v })} />
        <${Stepper} label="Transpose" value=${p.transpose} min=${-12} max=${12} fmt=${(v) => `${v} st`} onChange=${(v) => patch({ transpose: v })} />
      </div>
    </div>
    <div class="section">
      <h3>Velocity</h3>
      <div class="two">
        <${Stepper} label="Lowest" value=${p.velLow} min=${1} max=${p.velHigh} onChange=${(v) => patch({ velLow: v })} />
        <${Stepper} label="Highest" value=${p.velHigh} min=${p.velLow} max=${127} onChange=${(v) => patch({ velHigh: v })} />
      </div>
      <${Slider} label="Velocity scale" value=${p.velScale} min=${0.3} max=${2} color=${p.color} onChange=${(v) => patch({ velScale: v })} fmt=${(v) => `×${v.toFixed(2)}`} />
    </div>
    <div class="section">
      <h3>Mix</h3>
      <${Slider} label="Pan" value=${p.pan} min=${-1} max=${1} color=${p.color} onChange=${(v) => patch({ pan: v })} fmt=${(v) => (Math.abs(v) < 0.05 ? 'centre' : v < 0 ? `L ${Math.round(-v * 100)}` : `R ${Math.round(v * 100)}`)} />
      <div class="row">
        <${Toggle} label="Sustain pedal" on=${p.sustain !== false} onChange=${(v) => patch({ sustain: v })} />
        <${Toggle} label="Played from the keys" on=${p.enabled !== false} onChange=${(v) => patch({ enabled: v })} />
      </div>
      <div class="row" style="margin-top:6px">
        <span class="dim">MIDI channel</span>
        <select value=${p.channel} onChange=${(e) => patch({ channel: Number(e.target.value) })}>
          <option value="0">Any</option>
          ${Array.from({ length: 16 }, (_, k) => html`<option key=${k} value=${k + 1}>${k + 1}</option>`)}
        </select>
      </div>
    </div>
    <div class="section">
      <div class="row">
        <button onClick=${save}>Save as my sound</button>
        ${i > 0 ? html`<button class="ghost" onClick=${() => dispatch({ type: 'part/move', from: i, to: i - 1 })}>◀ Move</button>` : null}
        ${i < state.performance.parts.length - 1 ? html`<button class="ghost" onClick=${() => dispatch({ type: 'part/move', from: i, to: i + 1 })}>Move ▶</button>` : null}
        <button class="danger ghost" onClick=${() => {
          ctx.actions.removePart(i);
          dispatch({ type: 'ui/patch', patch: { editor: null } });
        }}>Remove part</button>
      </div>
    </div>
  </div>`;
}
