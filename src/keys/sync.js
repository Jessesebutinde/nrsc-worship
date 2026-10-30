// Keeps the engine in step with the state: whichever part, effect, fader or tempo changed is sent,
// nothing else. Sampled instruments a part needs are loaded on the way.

import { effectiveParts, MAX_PARTS } from './state.js';
import { presetBanks } from './presets.js';
import { wantLight } from './engine.js';

export function createSync({ engine, router, transport, looper, onLoading }) {
  let prevParts = [];
  let prevTempo = null;
  let prevLoadedAt = null;
  let prevSettings = null;
  let first = true;

  function ensureBanks(prog) {
    for (const id of presetBanks({ prog })) {
      if (engine.samples.isLoaded(id) || engine.samples.progress(id) > 0) continue;
      onLoading(id, 0);
      engine.samples
        .load(id, { onProgress: (p) => onLoading(id, p) })
        .then(() => onLoading(id, 1))
        .catch((e) => onLoading(id, e && e.cancelled ? 1 : 'error', e));
    }
  }

  return function sync(state) {
    if (!engine.ready) return;
    const perf = state.performance;
    const parts = effectiveParts(perf);
    const fresh = state.ui.loadedAt !== prevLoadedAt; // a rig or song was just loaded: let old notes ring out
    prevLoadedAt = state.ui.loadedAt;
    for (let i = 0; i < MAX_PARTS; i++) {
      const p = parts[i];
      const q = prevParts[i];
      if (p === q && !first) continue;
      if (!p) {
        if (q || first) {
          engine.setProgram(i, null);
          router.releasePart(i);
        }
        continue;
      }
      if (!q || p.prog !== q.prog || first) {
        engine.setProgram(i, p.prog, !fresh && !!q);
        ensureBanks(p.prog);
      }
      if (!q || p.fx !== q.fx || first) engine.setFx(i, p.fx);
      if (!q || p.volume !== q.volume || p.pan !== q.pan || p.mute !== q.mute || first) engine.setMix(i, { volume: p.volume, pan: p.pan, mute: p.mute });
    }
    prevParts = parts;
    if (perf.tempo !== prevTempo) {
      prevTempo = perf.tempo;
      engine.setTempo(perf.tempo);
      if (transport.bpm !== perf.tempo) transport.setBpm(perf.tempo);
    }
    const s = state.settings;
    if (s !== prevSettings) {
      if (!prevSettings || s.masterVolume !== prevSettings.masterVolume) engine.setMasterVolume(s.masterVolume);
      if (prevSettings && (s.engineMode !== prevSettings.engineMode || s.autoLight !== prevSettings.autoLight) && engine.setLight) engine.setLight(wantLight(s));
      if (!prevSettings || s.clickVolume !== prevSettings.clickVolume) engine.setClickVolume(s.clickVolume);
      if (!prevSettings || s.quality !== prevSettings.quality) engine.samples.setQuality(s.quality);
      if (!prevSettings || s.metronome !== prevSettings.metronome) looper.metronome = s.metronome;
      if (!prevSettings || s.quantize !== prevSettings.quantize) looper.quantize = s.quantize ? 0.25 : 0;
      if (!prevSettings || s.countIn !== prevSettings.countIn) looper.countIn = s.countIn;
      prevSettings = s;
    }
    first = false;
  };
}
