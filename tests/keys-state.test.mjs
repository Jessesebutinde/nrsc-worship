import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, initialState, newPart, newSong, reduce, migrate, exportJson, importJson, effectiveParts, setPath, partFromPreset, MAX_PARTS } from '../src/keys/state.js';
import { PRESETS, FAMILIES, presetById, presetBanks, searchPresets } from '../src/keys/presets.js';
import { COMBOS, buildPerformance } from '../src/keys/combos.js';
import { fillProgram, compileProgram } from '../src/keys/dsp/programs.js';
import { mergeFx, FX_ORDER } from '../src/keys/fx.js';
import { Router } from '../src/keys/router.js';
import { parseMidi } from '../src/keys/midi.js';

test('parts can be added, edited, moved and removed with the selection following', () => {
  const s = createStore(initialState());
  s.dispatch({ type: 'part/add', part: newPart({ name: 'A' }) });
  s.dispatch({ type: 'part/add', part: newPart({ name: 'B' }) });
  s.dispatch({ type: 'part/add', part: newPart({ name: 'C' }) });
  assert.equal(s.get().ui.selectedPart, 2);
  s.dispatch({ type: 'part/progPath', index: 1, path: 'filter.cutoff', value: 321 });
  s.dispatch({ type: 'part/fx', index: 1, stage: 'delay', patch: { on: true, mix: 0.4 } });
  assert.equal(s.get().performance.parts[1].prog.filter.cutoff, 321);
  assert.equal(s.get().performance.parts[1].fx.delay.mix, 0.4);
  assert.equal(s.get().performance.parts[0].prog.filter.cutoff, 8000, 'other parts untouched');
  s.dispatch({ type: 'part/move', from: 2, to: 0 });
  assert.deepEqual(s.get().performance.parts.map((p) => p.name), ['C', 'A', 'B']);
  s.dispatch({ type: 'part/remove', index: 0 });
  assert.deepEqual(s.get().performance.parts.map((p) => p.name), ['A', 'B']);
  assert.ok(s.get().ui.selectedPart < 2);
  for (let i = 0; i < 10; i++) s.dispatch({ type: 'part/add', part: newPart() });
  assert.equal(s.get().performance.parts.length, MAX_PARTS);
});

test('loading a preset keeps the zone and replaces the sound', () => {
  const s = createStore(initialState());
  s.dispatch({ type: 'part/add', part: newPart({ name: 'A', keyLow: 0, keyHigh: 47 }) });
  s.dispatch({ type: 'part/preset', index: 0, preset: presetById('sebene-bass'), keepZone: true });
  const p = s.get().performance.parts[0];
  assert.equal(p.name, 'Sebene Bass');
  assert.equal(p.prog.type, 'string');
  assert.equal(p.keyHigh, 47);
  assert.equal(p.fx.comp.on, true);
  assert.equal(p.fx.reverb.on, false);
});

test('songs: select loads a copy of the rig, move keeps the current index', () => {
  const s = createStore(initialState());
  s.dispatch({ type: 'part/add', part: newPart({ name: 'Piano' }) });
  const perf = s.get().performance;
  s.dispatch({ type: 'song/add', song: newSong({ name: 'One', tempo: 90, performance: perf }) });
  s.dispatch({ type: 'song/add', song: newSong({ name: 'Two', tempo: 120, performance: { ...perf, name: 'Two rig' } }) });
  s.dispatch({ type: 'song/select', index: 1 });
  assert.equal(s.get().currentSong, 1);
  assert.equal(s.get().performance.name, 'Two rig');
  assert.notEqual(s.get().performance, s.get().songs[1].performance, 'a copy, not the stored object');
  assert.equal(s.get().performance.tempo, 120);
  s.dispatch({ type: 'song/move', from: 1, to: 0 });
  assert.equal(s.get().currentSong, 0);
  assert.equal(s.get().songs[0].name, 'Two');
  s.dispatch({ type: 'song/remove', index: 0 });
  assert.equal(s.get().currentSong, -1);
});

test('a CC can control only one action at a time', () => {
  const s = createStore(initialState());
  s.dispatch({ type: 'settings/cc', cc: 82, action: 'nextSong' });
  s.dispatch({ type: 'settings/cc', cc: 82, action: 'panic' });
  assert.equal(s.get().settings.ccMap[82], 'panic');
  s.dispatch({ type: 'settings/cc', cc: 83, action: 'panic' });
  assert.equal(s.get().settings.ccMap[82], undefined);
  assert.equal(s.get().settings.ccMap[83], 'panic');
});

test('export / import round trip and migration of a sparse state', () => {
  const s = createStore(initialState());
  s.dispatch({ type: 'part/add', part: partFromPreset(presetById('oceans-pad')) });
  s.dispatch({ type: 'favorite/toggle', id: 'oceans-pad' });
  const back = importJson(exportJson(s.get()));
  assert.equal(back.performance.parts[0].name, 'Oceans Pad');
  assert.deepEqual(back.favorites, ['oceans-pad']);
  const m = migrate({ performance: { parts: [{ name: 'Old', prog: { type: 'organ' } }] }, songs: [{ name: 'X' }] });
  assert.equal(m.performance.parts[0].prog.drawbars.length, 9);
  assert.equal(m.performance.parts[0].fx.reverb.type, 'hall');
  assert.equal(m.performance.macros.length, 4);
  assert.equal(m.songs[0].tempo, 120);
  assert.equal(m.settings.latency, 'interactive');
});

test('macros morph the parts the engine hears without touching the stored parts', () => {
  const s = createStore(initialState());
  s.dispatch({ type: 'part/add', part: newPart({ name: 'A', volume: 0.5 }) });
  s.dispatch({ type: 'macro/patch', index: 0, patch: { targets: [{ part: 0, path: 'volume', min: 0.2, max: 1 }, { part: 0, path: 'fx.reverb.mix', min: 0, max: 0.8 }] } });
  s.dispatch({ type: 'macro/value', index: 0, value: 0.5 });
  const eff = effectiveParts(s.get().performance);
  assert.ok(Math.abs(eff[0].volume - 0.6) < 1e-9);
  assert.ok(Math.abs(eff[0].fx.reverb.mix - 0.4) < 1e-9);
  assert.equal(s.get().performance.parts[0].volume, 0.5);
  assert.equal(setPath({ a: [{ b: 1 }] }, 'a.0.b', 2).a[0].b, 2);
});

test('every preset compiles, every family exists, every combo resolves', () => {
  const ids = new Set();
  for (const p of PRESETS) {
    assert.ok(!ids.has(p.id), `duplicate ${p.id}`);
    ids.add(p.id);
    assert.ok(FAMILIES.some((f) => f.id === p.family), `${p.id} family`);
    assert.ok(p.desc && p.kind && p.name);
    const c = compileProgram(fillProgram(p.prog));
    assert.ok(c.type);
    const fx = mergeFx(p.fx);
    for (const k of FX_ORDER) assert.equal(typeof fx[k].on, 'boolean', `${p.id} fx ${k}`);
    for (const b of presetBanks(p)) assert.match(b, /^(MusyngKite|FluidR3_GM|FatBoy)\/[a-z0-9_]+$/);
  }
  assert.ok(PRESETS.filter((p) => p.family === 'sebene').length >= 12, 'the sebene family leads');
  for (const c of COMBOS) {
    const perf = buildPerformance(c);
    assert.equal(perf.parts.length, c.parts.length, `combo ${c.id}`);
    assert.equal(perf.macros.length, 4);
  }
  assert.ok(searchPresets('bass', 'sebene').length >= 4);
  assert.ok(searchPresets('', 'organs').every((p) => p.family === 'organs'));
});

function fakeEngine() {
  const log = [];
  return {
    log,
    time: 0,
    noteOn: (p, n, v) => log.push(['on', p, n, v]),
    noteOff: (p, n) => log.push(['off', p, n]),
    cc: (p, cc, v) => log.push(['cc', p, cc, v]),
    bend: (p, v) => log.push(['bend', p, v]),
    allOff: (hard) => log.push(['allOff', hard]),
  };
}

test('router sends notes to the parts whose zone and channel match, and note-offs follow the note-ons', () => {
  const engine = fakeEngine();
  let parts = [newPart({ keyLow: 0, keyHigh: 47 }), newPart({ keyLow: 48, keyHigh: 127, octave: 1, transpose: 2 }), newPart({ channel: 2 }), newPart({ enabled: false })];
  const r = new Router({ engine, getParts: () => parts, getCcMap: () => ({ 82: 'nextSong' }), onAction: (a, v, on) => engine.log.push(['action', a, on]) });
  r.handle(parseMidi([0x90, 40, 100]));
  r.handle(parseMidi([0x90, 60, 100]));
  assert.deepEqual(engine.log, [['on', 0, 40, 100], ['on', 1, 74, 100]]);
  engine.log.length = 0;
  parts = [newPart({ keyLow: 0, keyHigh: 30 }), parts[1]]; // zones changed while the keys are down
  r.handle(parseMidi([0x80, 40, 64]));
  r.handle(parseMidi([0x90, 60, 0])); // note-on with velocity 0 is a note-off
  assert.deepEqual(engine.log, [['off', 0, 40], ['off', 1, 74]]);
  engine.log.length = 0;
  r.handle(parseMidi([0x91, 60, 90])); // channel 2
  assert.deepEqual(engine.log, [['on', 1, 74, 90]]);
  engine.log.length = 0;
  r.handle(parseMidi([0xb0, 64, 127]));
  r.handle(parseMidi([0xb0, 82, 127]));
  r.handle(parseMidi([0xe0, 0, 96])); // bend up half way
  assert.deepEqual(engine.log[0], ['cc', 0, 64, 127]);
  assert.ok(engine.log.some((e) => e[0] === 'action' && e[1] === 'nextSong' && e[2] === true));
  assert.ok(engine.log.some((e) => e[0] === 'bend' && Math.abs(e[2] - 0.5) < 0.01));
  r.panic();
  assert.deepEqual(engine.log[engine.log.length - 1], ['allOff', true]);
});
