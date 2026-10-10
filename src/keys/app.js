// /keys/ — Stage Keys: a live keyboard rig in the browser. Boots the engine, MIDI, looper and the UI.

import { html, render, useState, useEffect, useRef } from '../ui/h.js';
import { createStore, loadState, saveState, partFromPreset, newSong, clone, MAX_PARTS } from './state.js';
import { Engine } from './engine.js';
import { MidiInput, TypingKeyboard } from './midi.js';
import { Router } from './router.js';
import { Transport, Looper } from './looper.js';
import { buildPerformance } from './combos.js';
import { createSync } from './sync.js';
import { Toast, toast } from './ui/controls.js';
import { Perform, Header } from './ui/perform.js';
import { Editor } from './ui/editor.js';
import { Sounds } from './ui/sounds.js';
import { Loops } from './ui/loops.js';
import { Songs } from './ui/songs.js';
import { Settings } from './ui/settings.js';

const store = createStore(loadState());
const engine = new Engine();
const transport = new Transport({ clock: () => engine.time });
const looper = new Looper({
  clock: () => engine.time,
  engine: { noteOn: (p, n, v, t) => engine.noteOn(p, n, v, t), noteOff: (p, n, t) => engine.noteOff(p, n, t), click: (a, t) => engine.click(a, t) },
  transport,
  onChange: () => bump(),
});
const lit = new Map(); // note -> colour, for the on-screen keyboard
const loading = new Map(); // bank id -> 0..1 | 'error'

const router = new Router({
  engine,
  getParts: () => store.get().performance.parts,
  getCcMap: () => store.get().settings.ccMap,
  onAction: (action, value, on) => ccAction(action, value, on),
  onNote: (part, note, on) => {
    const p = store.get().performance.parts[part];
    if (on) lit.set(note, p ? p.color : 'amber');
    else lit.delete(note);
    bump();
  },
  onLoopInput: (part, ev) => looper.input(part, ev),
  onLearn: (cc) => learned(cc),
  onProgram: (n) => {
    const s = store.get();
    if (s.settings.programChange && s.songs[n]) actions.selectSong(n);
  },
});
const midi = new MidiInput({ onMessage: (ev) => router.handle(ev), onDevices: () => bump() });
const typing = new TypingKeyboard((ev) => router.handle(ev));
const sync = createSync({
  engine,
  router,
  transport,
  looper,
  onLoading: (id, p, err) => {
    loading.set(id, p);
    if (err && p === 'error') toast(err.message || 'A sound could not be downloaded');
    bump();
  },
});

// ------------------------------------------------------------------ persistence + sync

let saveTimer = null;
store.subscribe((state) => {
  sync(state);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveState(state), 400);
});

let learnTarget = null;
function learned(cc) {
  if (!learnTarget) return;
  store.dispatch({ type: 'settings/cc', cc, action: learnTarget });
  toast(`CC ${cc} now controls ${learnTarget}`);
  learnTarget = null;
  router.learning = false;
  bump();
}

let macroThrottle = {};
function ccAction(action, value, on) {
  const s = store.get();
  const m = /^macro(\d)$/.exec(action);
  if (m) {
    const i = Number(m[1]) - 1;
    const now = performance.now();
    if (macroThrottle[i] && now - macroThrottle[i] < 40) return;
    macroThrottle[i] = now;
    store.dispatch({ type: 'macro/value', index: i, value });
    return;
  }
  const lp = /^loop(\d)$/.exec(action);
  if (lp) {
    if (on) looper.toggle(Number(lp[1]) - 1);
    return;
  }
  const pv = /^part(\d)vol$/.exec(action);
  if (pv) {
    const i = Number(pv[1]) - 1;
    if (s.performance.parts[i]) store.dispatch({ type: 'part/patch', index: i, patch: { volume: value } });
    return;
  }
  switch (action) {
    case 'rotary': {
      for (let i = 0; i < s.performance.parts.length; i++) {
        const p = s.performance.parts[i];
        if (p.fx.rotary.on) store.dispatch({ type: 'part/fx', index: i, stage: 'rotary', patch: { speed: on ? 'fast' : 'slow' } });
      }
      break;
    }
    case 'nextSong':
      if (on) actions.nextSong();
      break;
    case 'prevSong':
      if (on) actions.prevSong();
      break;
    case 'loopsOff':
      if (on) looper.muteAll();
      break;
    case 'tap':
      if (on) actions.tap();
      break;
    case 'panic':
      if (on) actions.panic();
      break;
    case 'master':
      store.dispatch({ type: 'settings/patch', patch: { masterVolume: value } });
      break;
    default:
      break;
  }
}

// ------------------------------------------------------------------ actions the UI calls

const actions = {
  async startAudio() {
    const s = store.get().settings;
    try {
      await engine.start({ latency: s.latency, sinkId: s.audioOutput, quality: s.quality });
    } catch (e) {
      toast('The sound engine could not start: ' + (e && e.message ? e.message : e));
      throw e;
    }
    await engine.resume();
    typing.enabled = s.typing;
    typing.attach(window);
    sync(store.get());
    const perf = store.get().performance;
    if (perf.groove && !looper.tracks().some((t) => t.state !== 'empty')) applyGroove(perf);
    setInterval(() => looper.tick(), 25);
    meterLoop();
    bump();
    // MIDI asks for permission; the rig must not wait for the answer.
    midi.start().then((ok) => {
      if (ok && s.midiInput) midi.select(s.midiInput);
      if (!ok && midi.error) toast(midi.error);
      bump();
    });
  },
  selectPart(i) {
    store.dispatch({ type: 'ui/patch', patch: { selectedPart: i } });
  },
  loadPreset(index, preset) {
    const s = store.get();
    if (!s.performance.parts[index]) {
      actions.addPart(preset);
      return;
    }
    router.releasePart(index);
    store.dispatch({ type: 'part/preset', index, preset, keepZone: true });
    toast(`${preset.name} → part ${index + 1}`);
  },
  addPart(preset, over = {}) {
    const s = store.get();
    if (s.performance.parts.length >= MAX_PARTS) {
      toast('All 8 parts are in use');
      return;
    }
    store.dispatch({ type: 'part/add', part: partFromPreset(preset, over) });
    toast(`${preset.name} added as part ${s.performance.parts.length + 1}`);
  },
  removePart(i) {
    router.releasePart(i);
    looper.clear(i);
    store.dispatch({ type: 'part/remove', index: i });
  },
  loadCombo(combo) {
    router.panic();
    looper.clearAll();
    const perf = buildPerformance(combo);
    store.dispatch({ type: 'performance/load', performance: perf });
    store.dispatch({ type: 'ui/patch', patch: { view: 'perform' } });
    applyGroove(perf);
    toast(`${combo.name} loaded`);
  },
  setTempo(bpm) {
    store.dispatch({ type: 'performance/patch', patch: { tempo: Math.round(Math.max(40, Math.min(240, bpm))) } });
  },
  tap() {
    const bpm = transport.tap();
    if (bpm) actions.setTempo(bpm);
    bump();
  },
  panic() {
    router.panic();
    looper.muteAll();
    lit.clear();
    toast('All notes off');
    bump();
  },
  // songs
  addSong() {
    const s = store.get();
    const song = newSong({ name: s.performance.name || `Song ${s.songs.length + 1}`, tempo: s.performance.tempo, performance: clone(s.performance), loops: looper.serialize() });
    store.dispatch({ type: 'song/add', song });
    store.dispatch({ type: 'song/select', index: s.songs.length });
    toast(`Saved as song ${s.songs.length + 1}`);
  },
  saveSong(i) {
    const s = store.get();
    if (!s.songs[i]) return;
    store.dispatch({ type: 'song/update', index: i, patch: { performance: clone(s.performance), tempo: s.performance.tempo, loops: looper.serialize() } });
    toast(`${s.songs[i].name} updated`);
  },
  selectSong(i) {
    const s = store.get();
    const song = s.songs[i];
    if (!song) return;
    router.panic();
    looper.clearAll();
    store.dispatch({ type: 'song/select', index: i });
    const perf = store.get().performance;
    if (song.loops) {
      looper.restore(song.loops);
      for (const t of looper.tracks()) if (t.state === 'playing') looper.mute(t.part); // loops wait for you
    } else if (perf.groove) applyGroove(perf);
    toast(`${i + 1}. ${song.name}`);
  },
  nextSong() {
    const s = store.get();
    if (!s.songs.length) return;
    actions.selectSong(Math.min(s.songs.length - 1, s.currentSong + 1));
  },
  prevSong() {
    const s = store.get();
    if (!s.songs.length) return;
    actions.selectSong(Math.max(0, s.currentSong - 1));
  },
  learn(action) {
    learnTarget = action;
    router.learning = !!action;
    if (action) toast('Move a knob or press a pedal on the keyboard…');
    bump();
  },
  get learning() {
    return learnTarget;
  },
  /** A short phrase on a part, to hear a sound without a keyboard. */
  preview(i) {
    const t = engine.time + 0.05;
    const notes = [60, 64, 67, 72];
    notes.forEach((n, k) => {
      engine.noteOn(i, n, 100, t + k * 0.12);
      engine.noteOff(i, n, t + 1.2);
    });
  },
  playScreenNote(note, on) {
    router.handle({ type: on ? 'noteon' : 'noteoff', ch: 1, note, vel: 100, time: performance.now() });
  },
  setTyping(on) {
    typing.enabled = on;
    store.dispatch({ type: 'settings/patch', patch: { typing: on } });
  },
  async setMidiInput(id) {
    midi.select(id);
    store.dispatch({ type: 'settings/patch', patch: { midiInput: id } });
  },
  async setOutput(id) {
    try {
      await engine.setOutput(id);
      store.dispatch({ type: 'settings/patch', patch: { audioOutput: id } });
      toast('Audio output changed');
    } catch (e) {
      toast('Could not switch output: ' + (e && e.message ? e.message : e));
    }
  },
};

function applyGroove(perf) {
  if (!perf.groove) return;
  const di = perf.parts.findIndex((p) => p.prog && p.prog.type === 'drums');
  if (di >= 0) {
    looper.setGroove(di, perf.groove);
    looper.mute(di); // ready, not playing: you start it when the song starts
  }
}

// ------------------------------------------------------------------ meters

const meterEls = new Array(MAX_PARTS).fill(null);
let masterEl = null;
function meterLoop() {
  const lv = engine.levels();
  for (let i = 0; i < MAX_PARTS; i++) {
    const el = meterEls[i];
    if (el) el.style.height = Math.min(100, lv.parts[i] * 100) + '%';
  }
  if (masterEl) masterEl.style.width = Math.min(100, lv.master * 100) + '%';
  requestAnimationFrame(meterLoop);
}

// ------------------------------------------------------------------ root

let bump = () => {};
const ctx = {
  store,
  engine,
  midi,
  typing,
  router,
  looper,
  transport,
  loading,
  lit,
  actions,
  meterRef: (i) => (el) => {
    meterEls[i] = el;
  },
  masterRef: (el) => {
    masterEl = el;
  },
};

function App() {
  const [state, setState] = useState(store.get());
  const [, force] = useState(0);
  useEffect(() => {
    let raf = 0;
    bump = () => {
      if (!raf) raf = requestAnimationFrame(() => {
        raf = 0;
        force((x) => x + 1);
      });
    };
    const un = store.subscribe((s) => setState(s));
    return () => {
      un();
      bump = () => {};
    };
  }, []);
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (e.key === 'Escape') actions.panic();
      else if (e.key === 'ArrowRight' && state.ui.view === 'songs') actions.nextSong();
      else if (e.key === 'ArrowLeft' && state.ui.view === 'songs') actions.prevSong();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.ui.view]);
  const dispatch = store.dispatch;
  const view = state.ui.view;
  const started = engine.ready;
  const page =
    view === 'sounds'
      ? html`<${Sounds} ctx=${ctx} state=${state} />`
      : view === 'loops'
        ? html`<${Loops} ctx=${ctx} state=${state} />`
        : view === 'songs'
          ? html`<${Songs} ctx=${ctx} state=${state} />`
          : view === 'settings'
            ? html`<${Settings} ctx=${ctx} state=${state} />`
            : html`<${Perform} ctx=${ctx} state=${state} />`;
  const TABS = [
    ['perform', '🎹', 'Perform'],
    ['sounds', '🎛', 'Sounds'],
    ['loops', '🔁', 'Loops'],
    ['songs', '📋', 'Songs'],
    ['settings', '⚙', 'Settings'],
  ];
  return html`<div class="app">
    <${Header} ctx=${ctx} state=${state} tabs=${TABS} />
    <main class="main">${page}</main>
    <nav class="tabs">
      ${TABS.map(([id, ico, label]) => html`<button key=${id} class=${view === id ? 'on' : ''} onClick=${() => dispatch({ type: 'ui/patch', patch: { view: id, editor: null } })}><span class="ico">${ico}</span>${label}</button>`)}
    </nav>
    ${state.ui.editor != null && state.performance.parts[state.ui.selectedPart] ? html`<${Editor} ctx=${ctx} state=${state} />` : null}
    ${!started ? html`<${Start} />` : null}
    <${Toast} />
  </div>`;
}

function Start() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = async () => {
    setBusy(true);
    try {
      await actions.startAudio();
    } catch (e) {
      setErr(String(e && e.message ? e.message : e));
      setBusy(false);
    }
  };
  return html`<div class="overlay">
    <div class="box">
      <h1>Stage Keys</h1>
      <p>Sebene guitars and bass, worship pads, organs, choirs and loops, played from your keyboard over USB.</p>
      <button class="primary" disabled=${busy} onClick=${go}>${busy ? 'Starting…' : 'Start the rig'}</button>
      <p class="dim" style="margin-top:14px">Chrome or Edge. Plug the keyboard in first; the browser will ask to use MIDI.</p>
      ${err ? html`<p class="warnbox">${err}</p>` : null}
    </div>
  </div>`;
}

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

// A handle for the smoke tests and for poking at the rig from the console.
window.stageKeys = ctx;

render(html`<${App} />`, document.getElementById('app'));
