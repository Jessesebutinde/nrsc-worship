// /keys/ — Stage Keys: a live keyboard rig in the browser. Boots the engine, MIDI, looper and the UI.

import { html, render, useState, useEffect, useRef } from '../ui/h.js';
import { createStore, loadState, saveState, partFromPreset, newSong, clone, MAX_PARTS } from './state.js';
import { Engine, AUDITION, AUDITION_DRUMS, AUDITION_BED, wantLight } from './engine.js';
import { DemoPlayer } from './demo.js';
import { soundDemo, rigDemo, BED_PROGRAMS, SOUND_GUIDE, KIT_FOR_STYLE } from './guide.js';
import { songPerformance, demoBars } from './songbook.js';
import { presetById, presetBanks } from './presets.js';
import { mergeFx } from './fx.js';
import { MidiInput, TypingKeyboard } from './midi.js';
import { Router } from './router.js';
import { Transport, Looper } from './looper.js';
import { buildPerformance, comboById } from './combos.js';
import { createSync } from './sync.js';
import { Toast, toast, noteName } from './ui/controls.js';
import { Perform, Header } from './ui/perform.js';
import { Editor } from './ui/editor.js';
import { Sounds } from './ui/sounds.js';
import { Loops } from './ui/loops.js';
import { Songs } from './ui/songs.js';
import { Settings } from './ui/settings.js';
import { Keyboard } from './ui/keyboard.js';

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
let lastMiss = 0;

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
  onMiss: (note) => {
    const now = Date.now();
    if (now - lastMiss < 4000) return;
    lastMiss = now;
    toast(store.get().performance.parts.length ? `No sound on ${noteName(note)}: change a part's key range or add a sound` : 'No sound loaded yet: open Sounds and load one');
  },
  onProgram: (n) => {
    const s = store.get();
    if (s.settings.programChange && s.songs[n]) actions.selectSong(n);
  },
});
// Demos light the keys they play, in the colour of the part whose zone the key is in.
const demo = new DemoPlayer({
  engine,
  router,
  onLight: (note, on, color) => {
    if (on) {
      const parts = store.get().performance.parts;
      const p = parts.find((x) => x.enabled !== false && note >= x.keyLow && note <= x.keyHigh);
      lit.set(note, color || (p ? p.color : 'amber'));
    } else lit.delete(note);
    bump();
  },
  onChange: () => bump(),
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

// ------------------------------------------------------------------ light mode

let struggleWarned = false;
function struggling() {
  const s = store.get().settings;
  if (s.engineMode === 'full') return; // the player asked for full sound: their call
  if (engine.light < 2) {
    const level = engine.light + 1;
    engine.setLight(level);
    store.dispatch({ type: 'settings/patch', patch: { autoLight: level } });
    toast(level === 1 ? 'This device was falling behind, so Stage Keys switched to Light sound (Settings, Audio).' : 'Still falling behind: Stage Keys made the sound a little lighter again so every note keeps time.');
  } else if (!struggleWarned) {
    struggleWarned = true;
    toast('Sound is still struggling here: fewer layers, or closing other apps, will help.');
  }
  bump();
}

// ------------------------------------------------------------------ actions the UI calls

const actions = {
  async startAudio() {
    const s = store.get().settings;
    try {
      await engine.start({ latency: s.latency, sinkId: s.audioOutput, quality: s.quality, light: wantLight(s) });
    } catch (e) {
      toast('The sound engine could not start: ' + (e && e.message ? e.message : e));
      throw e;
    }
    await engine.resume();
    // Phones pause sound when the page is hidden or a call comes in: any tap brings it back.
    const wake = () => {
      if (engine.ctx && engine.ctx.state !== 'running') engine.ctx.resume().then(bump, () => {});
    };
    window.addEventListener('pointerdown', wake, true);
    window.addEventListener('keydown', wake, true);
    document.addEventListener('visibilitychange', () => !document.hidden && wake());
    engine.ctx.onstatechange = () => bump();
    engine.onStruggle = struggling;
    // An empty rig plays nothing: a first visit starts on the Sebene Rig, which needs no download.
    if (!store.get().performance.parts.length) actions.loadCombo(comboById('sebene-rig'));
    engine.chime();
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
    demo.stop();
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
    demo.stop();
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
  /** A part's own demo, on the part itself with your edits (falls back to a short arpeggio). */
  preview(i) {
    const p = store.get().performance.parts[i];
    if (!p) return;
    const base = SOUND_GUIDE[p.presetId] ? p.presetId : p.basePreset;
    const plan = base && SOUND_GUIDE[base] ? soundDemo(base) : null;
    if (!plan) {
      const t = engine.time + 0.05;
      [60, 64, 67, 72].forEach((n, k) => {
        engine.noteOn(i, n, 100, t + k * 0.12);
        engine.noteOff(i, n, t + 1.2);
      });
      return;
    }
    playSoundPlan(plan, { main: i, shift: (p.octave || 0) * 12 + (p.transpose || 0), name: p.name, style: SOUND_GUIDE[base].style });
  },
  /** Hear a sound from the library without touching the rig: it plays on the audition part. */
  async demoSound(id) {
    const preset = presetById(id) || store.get().userPresets.find((x) => x.id === id);
    const plan = soundDemo(preset && preset.user ? preset.basePreset || id : id);
    if (!preset || !plan) {
      toast('No demo for this sound yet');
      return;
    }
    demo.stop();
    engine.setProgram(AUDITION, preset.prog);
    engine.setFx(AUDITION, mergeFx(preset.fx), plan.bpm);
    engine.setMix(AUDITION, { volume: 0.8, pan: 0, mute: false });
    const ok = await loadBanksFor(preset.prog, preset.name);
    if (!ok) return;
    playSoundPlan(plan, { main: AUDITION, shift: (preset.octave || 0) * 12, name: preset.name, style: SOUND_GUIDE[preset.basePreset || id].style });
  },
  /** Load a rig and play its arrangement through the keys, so the lit keys show what each hand does. */
  async demoRig(combo) {
    demo.stop();
    actions.loadCombo(combo);
    const perf = store.get().performance;
    if (!(await loadAllBanks(perf))) return;
    const script = rigDemo(combo.id, perf);
    if (!script) {
      toast('No demo for this rig yet');
      return;
    }
    demo.play(script, combo.name);
  },
  /** Load a song's rig (with its tempo, groove and swapped parts) and play its chorus or vamp. */
  async demoSong(song) {
    demo.stop();
    router.panic();
    looper.clearAll();
    const perf = songPerformance(song);
    store.dispatch({ type: 'performance/load', performance: perf });
    store.dispatch({ type: 'ui/patch', patch: { view: 'perform' } });
    applyGroove(perf);
    const loaded = store.get().performance;
    if (!(await loadAllBanks(loaded))) return;
    const script = rigDemo(song.combo, loaded, { bars: demoBars(song), bpm: song.bpm, groove: song.groove, keys: song.keys });
    demo.play(script, `${song.title} (${song.demo})`);
  },
  /** Put a song idea in the set list, with its rig, key, tempo and chord sections as notes. */
  addSongIdea(song) {
    const s = store.get();
    const perf = songPerformance(song);
    const notes = `${song.feel}. ${perf.notes.replace(/\n/g, ' · ')}. ${song.tip}${song.check ? ' Check: ' + song.check : ''}`;
    store.dispatch({ type: 'song/add', song: newSong({ name: song.title, key: song.key, tempo: song.bpm, performance: perf, notes }) });
    toast(`${song.title} added as song ${s.songs.length + 1}`);
  },
  stopDemo() {
    demo.stop();
  },
  playScreenNote(note, on, vel = 100) {
    router.handle({ type: on ? 'noteon' : 'noteoff', ch: 1, note, vel: on ? vel : 0, time: performance.now() });
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

/** Waits for a program's sample sets, showing progress; false if one could not be downloaded. */
async function loadBanksFor(prog, label) {
  const ids = presetBanks({ prog }).filter((id) => !engine.samples.isLoaded(id));
  if (!ids.length) return true;
  toast(`Loading ${label}…`);
  try {
    await Promise.all(
      ids.map((id) =>
        engine.samples.load(id, {
          onProgress: (p) => {
            loading.set(id, p);
            bump();
          },
        }),
      ),
    );
    for (const id of ids) loading.set(id, 1);
    bump();
    return true;
  } catch (e) {
    toast(e.message || `${label} could not be downloaded`);
    return false;
  }
}

async function loadAllBanks(perf) {
  const loads = await Promise.all(perf.parts.map((p) => loadBanksFor(p.prog, p.name)));
  return !loads.includes(false);
}

/** Plays a sound's demo plan: the sound on `main`, a backing part and drums on the audition parts. */
async function playSoundPlan(plan, { main, shift, name, style }) {
  demo.stop();
  const bed = plan.tracks.find((t) => t.part === 'bed');
  if (bed) {
    const src = BED_PROGRAMS[bed.preset] || presetById(bed.preset);
    engine.setProgram(AUDITION_BED, src.prog);
    engine.setFx(AUDITION_BED, mergeFx(src.fx), plan.bpm);
    engine.setMix(AUDITION_BED, { volume: bed.volume || 0.4, pan: 0, mute: false });
    if (!(await loadBanksFor(src.prog, 'the backing sound'))) return;
  }
  if (plan.tracks.some((t) => t.part === 'drums')) {
    const kit = presetById(KIT_FOR_STYLE[style] || 'worship-kit');
    engine.setProgram(AUDITION_DRUMS, kit.prog);
    engine.setFx(AUDITION_DRUMS, mergeFx(kit.fx), plan.bpm);
    engine.setMix(AUDITION_DRUMS, { volume: 0.55, pan: 0, mute: false });
  }
  const parts = { main, bed: AUDITION_BED, drums: AUDITION_DRUMS };
  demo.play(
    {
      bpm: plan.bpm,
      beats: plan.beats,
      tracks: plan.tracks.map((t) => ({ kind: 'part', part: parts[t.part], shift: t.part === 'main' ? shift : 0, light: t.light, color: 'amber', events: t.events })),
    },
    name,
  );
}

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
  demo,
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
    ${demo.playing ? html`<${DemoBar} state=${state} />` : null}
    ${started && engine.ctx.state !== 'running'
      ? html`<div class="soundoff" role="alert" onClick=${() => engine.ctx.resume().then(bump, () => {})}>
          <span class="grow">The sound is paused. Tap here to turn it back on.</span>
        </div>`
      : null}
    ${!started ? html`<${Start} />` : null}
    <${Toast} />
  </div>`;
}

function DemoBar({ state }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 250);
    return () => clearInterval(t);
  }, []);
  const left = Math.ceil(demo.remaining());
  // On pages without the keyboard strip, the bar brings its own, so the lit keys are always in view.
  const showKeys = state.ui.view !== 'perform' || !state.settings.showKeys;
  return html`<div class=${'demobar' + (showKeys ? ' withkeys' : '')} role="status">
    <div class="row" style="flex-wrap:nowrap;width:100%">
      <span class="pulse"></span>
      <span class="grow">Demo: <b>${demo.name}</b><span class="dim"> · watch the keys light up · ${left} s</span></span>
      <button class="small" onClick=${() => demo.stop()}>■ Stop</button>
    </div>
    ${showKeys ? html`<${Keyboard} parts=${state.performance.parts} selected=${-1} lit=${lit} onZone=${() => {}} onPlay=${() => {}} watch />` : null}
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
      <p class="dim" style="margin-top:14px">You will hear a short chime. On a laptop, use Chrome or Edge and plug the keyboard in first. On a phone, turn the volume up (on an iPhone, also flip the silent switch off) and play the keys on screen.</p>
      ${err ? html`<p class="warnbox">${err}</p>` : null}
    </div>
  </div>`;
}

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

// A handle for the smoke tests and for poking at the rig from the console.
window.stageKeys = ctx;

render(html`<${App} />`, document.getElementById('app'));
