// The app's data: the live performance (parts + macros), the set list of songs, settings, favourites.
// A plain reducer over immutable objects, saved to localStorage.

import { fillProgram } from './dsp/programs.js';
import { defaultFx, mergeFx } from './fx.js';

export const VERSION = 1;
export const MAX_PARTS = 8;
export const COLORS = ['amber', 'teal', 'rose', 'violet', 'lime', 'sky', 'coral', 'gold'];
export const VIEWS = ['perform', 'sounds', 'loops', 'songs', 'settings'];

let seq = 0;
export const uid = (p = 'id') => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export function newMacro(i) {
  return { name: ['Air', 'Dark/Bright', 'Space', 'Drive'][i] || `Macro ${i + 1}`, value: 0, targets: [] };
}

export function newPart(over = {}) {
  return {
    id: uid('part'),
    name: 'Init',
    presetId: null,
    family: 'synth',
    kind: 'Synth',
    prog: fillProgram({ type: 'synth' }),
    fx: defaultFx(),
    volume: 0.8,
    pan: 0,
    mute: false,
    keyLow: 0,
    keyHigh: 127,
    velLow: 1,
    velHigh: 127,
    transpose: 0,
    octave: 0,
    channel: 0,
    sustain: true,
    velScale: 1,
    color: COLORS[0],
    enabled: true,
    ...over,
  };
}

/** A part playing a preset from the sound library. */
export function partFromPreset(preset, over = {}) {
  return newPart({
    name: preset.name,
    presetId: preset.id,
    family: preset.family,
    kind: preset.kind,
    prog: fillProgram(preset.prog),
    fx: mergeFx(preset.fx),
    octave: preset.octave || 0,
    ...over,
  });
}

export function newPerformance(over = {}) {
  return { id: uid('perf'), name: 'New rig', tempo: 120, parts: [], macros: [0, 1, 2, 3].map(newMacro), notes: '', ...over };
}

export function newSong(over = {}) {
  return { id: uid('song'), name: 'New song', key: '', tempo: 120, performance: null, loops: null, notes: '', ...over };
}

export const defaultSettings = () => ({
  midiInput: '',
  audioOutput: '',
  latency: 'interactive',
  quality: 'medium',
  ccMap: { 74: 'macro1', 71: 'macro2', 73: 'macro3', 72: 'macro4' }, // the KROSS 2 tone knobs
  masterVolume: 0.9,
  clickVolume: 0.6,
  metronome: false,
  quantize: true,
  countIn: 0,
  typing: false,
  programChange: true,
  showKeys: true,
});

export function initialState() {
  return {
    version: VERSION,
    performance: newPerformance({ name: 'Start' }),
    songs: [],
    currentSong: -1,
    settings: defaultSettings(),
    favorites: [],
    userPresets: [],
    ui: { view: 'perform', selectedPart: 0, editor: null, browserFamily: 'sebene', query: '', loadedAt: 0 },
  };
}

// ------------------------------------------------------------------ helpers

export function getPath(obj, path) {
  let o = obj;
  for (const k of path.split('.')) {
    if (o == null) return undefined;
    o = o[k];
  }
  return o;
}

/** Immutable set: returns a copy of obj with path set. Arrays are copied too. */
export function setPath(obj, path, value) {
  const keys = path.split('.');
  const rec = (o, i) => {
    if (i === keys.length) return value;
    const k = keys[i];
    if (Array.isArray(o)) {
      const c = o.slice();
      c[Number(k)] = rec(o[Number(k)], i + 1);
      return c;
    }
    return { ...(o || {}), [k]: rec(o ? o[k] : undefined, i + 1) };
  };
  return rec(obj, 0);
}

export function deepMerge(base, over) {
  if (Array.isArray(over)) return over.map((v, i) => (v && typeof v === 'object' && base && base[i] && typeof base[i] === 'object' ? deepMerge(base[i], v) : v));
  if (over && typeof over === 'object') {
    const out = { ...(base || {}) };
    for (const k of Object.keys(over)) out[k] = over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) ? deepMerge(base ? base[k] : undefined, over[k]) : over[k];
    return out;
  }
  return over;
}

export const clone = (o) => JSON.parse(JSON.stringify(o));

const updateParts = (state, fn) => ({ ...state, performance: { ...state.performance, parts: fn(state.performance.parts) } });
const updatePart = (state, index, fn) => updateParts(state, (parts) => parts.map((p, i) => (i === index ? fn(p) : p)));

// ------------------------------------------------------------------ reducer

export function reduce(state, action) {
  const a = action;
  switch (a.type) {
    case 'part/patch':
      return updatePart(state, a.index, (p) => ({ ...p, ...a.patch }));
    case 'part/prog':
      return updatePart(state, a.index, (p) => ({ ...p, prog: deepMerge(p.prog, a.patch) }));
    case 'part/progPath':
      return updatePart(state, a.index, (p) => ({ ...p, prog: setPath(p.prog, a.path, a.value) }));
    case 'part/fx':
      return updatePart(state, a.index, (p) => ({ ...p, fx: { ...p.fx, [a.stage]: { ...p.fx[a.stage], ...a.patch } } }));
    case 'part/preset':
      return updatePart(state, a.index, (p) => ({
        ...p,
        name: a.preset.name,
        presetId: a.preset.id,
        family: a.preset.family,
        kind: a.preset.kind,
        prog: fillProgram(a.preset.prog),
        fx: mergeFx(a.preset.fx),
        octave: a.keepZone ? p.octave : a.preset.octave || 0,
      }));
    case 'part/add': {
      if (state.performance.parts.length >= MAX_PARTS) return state;
      const parts = state.performance.parts.slice();
      const part = { ...a.part, color: a.part.color || COLORS[parts.length % COLORS.length] };
      if (a.index == null || a.index >= parts.length) parts.push(part);
      else parts.splice(a.index, 0, part);
      const s = updateParts(state, () => parts);
      return a.select === false ? s : { ...s, ui: { ...s.ui, selectedPart: a.index == null ? parts.length - 1 : a.index } };
    }
    case 'part/remove': {
      const parts = state.performance.parts.filter((_, i) => i !== a.index);
      const s = updateParts(state, () => parts);
      return { ...s, ui: { ...s.ui, selectedPart: Math.max(0, Math.min(s.ui.selectedPart, parts.length - 1)) } };
    }
    case 'part/move': {
      const parts = state.performance.parts.slice();
      const [m] = parts.splice(a.from, 1);
      parts.splice(a.to, 0, m);
      return { ...updateParts(state, () => parts), ui: { ...state.ui, selectedPart: a.to } };
    }
    case 'performance/patch':
      return { ...state, performance: { ...state.performance, ...a.patch } };
    case 'performance/load':
      return { ...state, performance: clone(a.performance), ui: { ...state.ui, selectedPart: 0, editor: null, loadedAt: Date.now() } };
    case 'macro/value':
      return { ...state, performance: { ...state.performance, macros: state.performance.macros.map((m, i) => (i === a.index ? { ...m, value: a.value } : m)) } };
    case 'macro/patch':
      return { ...state, performance: { ...state.performance, macros: state.performance.macros.map((m, i) => (i === a.index ? { ...m, ...a.patch } : m)) } };
    case 'song/add': {
      const songs = state.songs.slice();
      const song = a.song;
      if (a.index == null) songs.push(song);
      else songs.splice(a.index, 0, song);
      return { ...state, songs };
    }
    case 'song/update':
      return { ...state, songs: state.songs.map((s, i) => (i === a.index ? { ...s, ...a.patch } : s)) };
    case 'song/remove': {
      const songs = state.songs.filter((_, i) => i !== a.index);
      const cur = state.currentSong === a.index ? -1 : state.currentSong > a.index ? state.currentSong - 1 : state.currentSong;
      return { ...state, songs, currentSong: cur };
    }
    case 'song/move': {
      const songs = state.songs.slice();
      const [m] = songs.splice(a.from, 1);
      songs.splice(a.to, 0, m);
      let cur = state.currentSong;
      if (cur === a.from) cur = a.to;
      else if (a.from < cur && a.to >= cur) cur--;
      else if (a.from > cur && a.to <= cur) cur++;
      return { ...state, songs, currentSong: cur };
    }
    case 'song/select': {
      const song = state.songs[a.index];
      if (!song) return state;
      const s = { ...state, currentSong: a.index };
      if (song.performance) {
        s.performance = clone(song.performance);
        s.performance.tempo = song.tempo || s.performance.tempo;
        s.ui = { ...state.ui, selectedPart: 0, editor: null, loadedAt: Date.now() };
      }
      return s;
    }
    case 'settings/patch':
      return { ...state, settings: { ...state.settings, ...a.patch } };
    case 'settings/cc': {
      const ccMap = { ...state.settings.ccMap };
      for (const k of Object.keys(ccMap)) if (ccMap[k] === a.action) delete ccMap[k];
      if (a.cc != null) ccMap[a.cc] = a.action;
      return { ...state, settings: { ...state.settings, ccMap } };
    }
    case 'ui/patch':
      return { ...state, ui: { ...state.ui, ...a.patch } };
    case 'favorite/toggle':
      return { ...state, favorites: state.favorites.includes(a.id) ? state.favorites.filter((x) => x !== a.id) : [...state.favorites, a.id] };
    case 'userPreset/save':
      return { ...state, userPresets: [...state.userPresets.filter((p) => p.id !== a.preset.id), a.preset] };
    case 'userPreset/remove':
      return { ...state, userPresets: state.userPresets.filter((p) => p.id !== a.id) };
    case 'state/replace':
      return migrate(a.state);
    default:
      return state;
  }
}

/** Fills in anything an older or imported state lacks. */
export function migrate(raw) {
  const init = initialState();
  if (!raw || typeof raw !== 'object') return init;
  const s = { ...init, ...raw, settings: { ...init.settings, ...(raw.settings || {}) }, ui: { ...init.ui, ...(raw.ui || {}), editor: null } };
  s.performance = raw.performance ? { ...newPerformance(), ...raw.performance } : init.performance;
  s.performance.parts = (s.performance.parts || []).slice(0, MAX_PARTS).map((p) => ({ ...newPart(), ...p, prog: fillProgram(p.prog), fx: mergeFx(p.fx) }));
  while (s.performance.macros.length < 4) s.performance.macros.push(newMacro(s.performance.macros.length));
  s.songs = (raw.songs || []).map((song) => ({ ...newSong(), ...song }));
  s.version = VERSION;
  return s;
}

// ------------------------------------------------------------------ store + persistence

export const LS_KEY = 'stage-keys-state';

export function createStore(initial, reducer = reduce) {
  let state = initial;
  const subs = new Set();
  return {
    get: () => state,
    dispatch(action) {
      const next = reducer(state, action);
      if (next === state) return;
      const prev = state;
      state = next;
      for (const fn of subs) fn(state, prev, action);
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}

export function loadState(storage = typeof localStorage !== 'undefined' ? localStorage : null) {
  if (!storage) return initialState();
  try {
    const raw = JSON.parse(storage.getItem(LS_KEY));
    return raw ? migrate(raw) : initialState();
  } catch {
    return initialState();
  }
}

/** What gets saved: everything but transient UI bits. */
export function persistable(state) {
  const { ui, ...rest } = state;
  return { ...rest, ui: { view: ui.view, browserFamily: ui.browserFamily, selectedPart: ui.selectedPart } };
}

export function saveState(state, storage = typeof localStorage !== 'undefined' ? localStorage : null) {
  if (!storage) return;
  try {
    storage.setItem(LS_KEY, JSON.stringify(persistable(state)));
  } catch {
    /* full or blocked */
  }
}

export const exportJson = (state) => JSON.stringify({ app: 'stage-keys', version: VERSION, exported: new Date().toISOString(), state: persistable(state) }, null, 1);

export function importJson(text) {
  const data = JSON.parse(text);
  const raw = data && data.app === 'stage-keys' ? data.state : data;
  return migrate(raw);
}

/** The parts with the macros applied: what the engine should actually play. */
export function effectiveParts(performance) {
  const macros = performance.macros || [];
  if (!macros.some((m) => m.value > 0 && m.targets.length)) return performance.parts;
  let parts = performance.parts;
  for (const m of macros) {
    if (!m.targets.length) continue;
    for (const t of m.targets) {
      const p = parts[t.part];
      if (!p) continue;
      const value = t.min + (t.max - t.min) * m.value;
      const next = setPath(p, t.path, value);
      parts = parts.map((x, i) => (i === t.part ? next : x));
    }
  }
  return parts;
}
