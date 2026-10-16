// The sound engine proper: parts, a shared voice pool, sample banks, and a sample-accurate event queue.
// It renders into one stereo buffer per part. The AudioWorklet is a thin shell around this class, so
// the whole engine can be driven from Node tests too.

import { Adsr } from './env.js';
import { Lfo } from './osc.js';
import { Rng, midiToHz, clamp, Smooth } from './util.js';
import { compileProgram, fillProgram } from './programs.js';
import { synthRenderer } from './voice-synth.js';
import { organRenderer } from './voice-organ.js';
import { stringRenderer } from './voice-string.js';
import { samplerRenderer } from './voice-sampler.js';
import { drumsRenderer } from './voice-drums.js';

const RENDERERS = { synth: synthRenderer, organ: organRenderer, string: stringRenderer, sampler: samplerRenderer, drums: drumsRenderer };

export const MAX_PARTS = 8;
const POOL = 160;
/**
 * Voice budgets. Every part may keep this many voices sounding, release tails included; past that its
 * oldest tails fade out quickly. Without it a pad or choir played chord after chord with long releases
 * fills the whole pool with tails nobody hears, and a phone cannot render that many voices in time.
 * Light mode (phones) is tighter and thins synth unison stacks too.
 */
export const BUDGETS = [
  { part: 40, pool: 128, unison: 7, linear: false }, // full
  { part: 18, pool: 64, unison: 3, linear: false }, // light (phones)
  { part: 10, pool: 40, unison: 2, linear: true }, // lighter: a device that still fell behind
];

class Voice {
  constructor(id, sr) {
    this.id = id;
    this.active = false;
    this.part = -1;
    this.note = 60;
    this.srcNote = 60;
    this.layer = 0;
    this.vel = 1;
    this.prog = null;
    this.r = null;
    this.s = null;
    this.freq = 440;
    this.targetFreq = 440;
    this.baseFreq = 440;
    this.glideCoef = 1;
    this.age = 0;
    this.released = false;
    this.held = false;
    this.hurried = false;
    this.env = new Adsr(sr);
    this.fenv = new Adsr(sr);
    this.rng = new Rng(0x1234567 + id * 7919);
    this.lfo = new Lfo(this.rng);
    this.gainL = 0.7071;
    this.gainR = 0.7071;
  }
}

class Part {
  constructor(index, sr) {
    this.index = index;
    this.sr = sr;
    this.prog = null; // compiled program; null = silent part
    this.heldNotes = [];
    this.heldBefore = 0;
    this.sustain = false;
    this.monoVoices = []; // the voice (or stacked voices) a mono part is playing
    this.bend = new Smooth(0, 0.08);
    this.mod = new Smooth(0, 0.05);
    this.expr = new Smooth(1, 0.05);
    this.bendMul = 1;
    this.bendSemis = 0;
    this.modV = 0;
    this.exprV = 1;
    this.bendRange = 2;
    this.drawbarsTarget = new Float32Array(9);
    this.drawbarsNow = new Float32Array(9);
    this.voiceCount = 0;
    this.nextPan = 0;
    // scanner vibrato / chorus (organ)
    this.vibBuf = null;
    this.vibW = 0;
    this.vibPhase = 0;
  }
}

export class EngineCore {
  constructor(sr, nParts = MAX_PARTS) {
    this.sr = sr;
    this.nParts = nParts;
    this.parts = [];
    for (let i = 0; i < nParts; i++) this.parts.push(new Part(i, sr));
    this.voices = [];
    for (let i = 0; i < POOL; i++) this.voices.push(new Voice(i, sr));
    this.banks = new Map();
    this.events = [];
    this.bpm = 120;
    this.frame = 0;
    this.voiceCount = 0;
    this.scratchL = new Float32Array(128);
    this.scratchR = new Float32Array(128);
    this.setLight(false);
  }

  /** Light level 0 (full), 1 (light: phones) or 2 (lighter): voice budgets and how rich each voice is. */
  setLight(level) {
    const l = level === true ? 1 : Math.max(0, Math.min(2, level | 0));
    this.light = l;
    this.budget = BUDGETS[l];
  }

  // ------------------------------------------------------------------ messages

  /** Queue or apply a message. `now` = the time (seconds) the next render block starts. */
  handle(m, now = 0) {
    switch (m.t) {
      case 'note':
      case 'cc':
      case 'bend':
      case 'allOff':
        if (m.time && m.time > now) {
          this.events.push(m);
          if (this.events.length > 1 && m.time < this.events[this.events.length - 2].time) this.events.sort((a, b) => a.time - b.time);
        } else this.apply(m);
        break;
      case 'program':
        this.setProgram(m.part, m.prog, m.live);
        break;
      case 'drawbars': {
        const p = this.parts[m.part];
        if (p) for (let i = 0; i < 9; i++) p.drawbarsTarget[i] = drawbarGain(m.values[i]);
        if (p && p.prog && p.prog.type === 'organ') p.prog.drawbars = m.values.slice();
        break;
      }
      case 'bankStart':
        this.banks.set(m.id, { id: m.id, notes: [], samples: new Map(), ready: false });
        break;
      case 'bankNote': {
        let b = this.banks.get(m.id);
        if (!b) {
          b = { id: m.id, notes: [], samples: new Map(), ready: false };
          this.banks.set(m.id, b);
        }
        b.samples.set(m.note, { root: m.note, L: m.L, R: m.R || null, rate: m.rate, loopStart: m.loopStart || 0, loopEnd: m.loopEnd || 0, loopAuto: m.loopAuto !== false });
        if (!b.notes.includes(m.note)) {
          b.notes.push(m.note);
          b.notes.sort((a, c) => a - c);
        }
        break;
      }
      case 'bankDone': {
        const b = this.banks.get(m.id);
        if (b) b.ready = true;
        break;
      }
      case 'bankFree':
        this.banks.delete(m.id);
        break;
      case 'tempo':
        this.bpm = clamp(m.bpm, 20, 300);
        break;
      case 'light':
        this.setLight(m.level != null ? m.level : m.on ? 1 : 0);
        break;
      default:
        break;
    }
  }

  apply(m) {
    switch (m.t) {
      case 'note':
        if (m.on && m.vel > 0) this.noteOn(m.part, m.note, m.vel);
        else this.noteOff(m.part, m.note);
        break;
      case 'cc':
        this.cc(m.part, m.cc, m.value);
        break;
      case 'bend':
        if (this.parts[m.part]) this.parts[m.part].bend.set(clamp(m.value, -1, 1));
        break;
      case 'allOff':
        this.allOff(m.part, m.hard);
        break;
      default:
        break;
    }
  }

  setProgram(idx, prog, live) {
    const part = this.parts[idx];
    if (!part) return;
    if (!prog) {
      this.releasePart(part, true);
      part.prog = null;
      return;
    }
    const compiled = compileProgram(fillProgram(prog));
    compiled.glideCoef = glideCoef(compiled.glide, this.sr);
    if (compiled.type === 'layer') for (const l of compiled.layers) l.glideCoef = compiled.glideCoef;
    const typeChanged = !part.prog || part.prog.type !== compiled.type;
    if (typeChanged) this.releasePart(part, true);
    part.prog = compiled;
    part.bendRange = compiled.bendRange;
    if (compiled.type === 'organ') {
      for (let i = 0; i < 9; i++) part.drawbarsTarget[i] = compiled.drawbarGains[i];
      if (typeChanged) part.drawbarsNow.set(part.drawbarsTarget);
    }
    if (live && !typeChanged) {
      // Editing a sound while holding keys: running voices follow the new settings.
      for (const v of this.voices) {
        if (!v.active || v.part !== idx) continue;
        const np = compiled.type === 'layer' ? compiled.layers[v.layer] : compiled;
        if (!np || np.type !== v.prog.type) continue;
        v.prog = np;
        v.glideCoef = np.glideCoef || compiled.glideCoef;
        if (np.env && v.env) v.env.set(np.env.a, np.env.d, np.env.s, np.env.r);
        if (np.fenv && v.fenv) v.fenv.set(np.fenv.a, np.fenv.d, np.fenv.s, np.fenv.r);
      }
    }
  }

  // ------------------------------------------------------------------ notes

  noteOn(idx, note, vel127) {
    const part = this.parts[idx];
    if (!part || !part.prog) return;
    const prog = part.prog;
    const vel = clamp(vel127 / 127, 0.01, 1);
    const layers = prog.type === 'layer' ? prog.layers : [prog];
    if (!layers.length) return;
    if (prog.type === 'drums') {
      this.trimTails(idx, 1);
      this.startVoice(this.alloc(part), part, note, vel, prog, 0);
      return;
    }
    part.heldBefore = part.heldNotes.length;
    const hi = part.heldNotes.indexOf(note);
    if (hi >= 0) part.heldNotes.splice(hi, 1);
    part.heldNotes.push(note);
    if (prog.mode !== 'poly') {
      const live = part.monoVoices.filter((mv) => mv.active && mv.part === idx);
      if (live.length) {
        const legato = prog.mode === 'legato' && part.heldBefore > 0;
        for (const mv of live) {
          const lp = mv.prog;
          mv.srcNote = note;
          mv.note = note + (lp.layerTranspose || 0);
          mv.vel = vel;
          mv.released = false;
          mv.held = false;
          mv.baseFreq = midiToHz(mv.note) * (lp.layerDetune ? Math.pow(2, lp.layerDetune / 1200) : 1);
          mv.targetFreq = mv.baseFreq;
          if (!(prog.glide > 0 && (!prog.glideLegato || part.heldBefore > 0))) mv.freq = mv.targetFreq;
          mv.r.retune(mv, lp, part, this, legato);
        }
        return;
      }
    } else {
      // retrigger an identical held note rather than stacking it
      for (const v of this.voices) if (v.active && v.part === idx && v.srcNote === note && !v.released) this.release(v);
      // per-part polyphony: let the oldest note of this part go
      let count = 0,
        oldest = null;
      for (const v of this.voices) {
        if (!v.active || v.part !== idx || v.released || v.layer !== 0) continue;
        count++;
        if (!oldest || v.age < oldest.age) oldest = v;
      }
      if (count >= prog.voices && oldest) for (const v of this.voices) if (v.active && v.part === idx && v.srcNote === oldest.srcNote && v.age === oldest.age) this.release(v, true);
      this.trimTails(idx, layers.length);
    }
    const started = [];
    for (let li = 0; li < layers.length; li++) {
      const lp = layers[li];
      const v = this.alloc(part);
      this.startVoice(v, part, note, vel, lp, li);
      if (prog.glide > 0 && part.lastFreq && (!prog.glideLegato || part.heldBefore > 0)) v.freq = part.lastFreq * (v.baseFreq / midiToHz(note));
      started.push(v);
    }
    if (prog.mode !== 'poly') part.monoVoices = started;
    part.lastFreq = midiToHz(note);
  }

  startVoice(v, part, note, vel, prog, layer) {
    v.active = true;
    v.part = part.index;
    v.srcNote = note;
    v.layer = layer;
    v.note = note + (prog.layerTranspose || 0);
    v.vel = vel;
    v.prog = prog;
    v.r = RENDERERS[prog.type];
    v.baseFreq = midiToHz(v.note) * (prog.layerDetune ? Math.pow(2, prog.layerDetune / 1200) : 1);
    v.freq = v.targetFreq = v.baseFreq;
    v.glideCoef = prog.glideCoef || 1;
    v.age = this.frame;
    v.released = false;
    v.held = false;
    v.hurried = false;
    // stereo placement: pianos/samples follow the keyboard, synths alternate
    const spread = prog.spread || 0;
    let pan = 0;
    if (spread > 0) {
      if (prog.type === 'sampler' || prog.type === 'string') pan = clamp(((v.note - 60) / 36) * spread, -1, 1);
      else {
        pan = (part.nextPan % 2 === 0 ? -1 : 1) * spread * 0.6;
        part.nextPan++;
      }
    }
    v.gainL = Math.cos(((pan + 1) * Math.PI) / 4);
    v.gainR = Math.sin(((pan + 1) * Math.PI) / 4);
    v.r.init(v, prog, part, this);
  }

  noteOff(idx, note) {
    const part = this.parts[idx];
    if (!part) return;
    const hi = part.heldNotes.indexOf(note);
    if (hi >= 0) part.heldNotes.splice(hi, 1);
    const prog = part.prog;
    if (prog && prog.mode !== 'poly' && prog.type !== 'drums') {
      const live = part.monoVoices.filter((mv) => mv.active && mv.srcNote === note);
      if (!live.length) return;
      if (part.heldNotes.length) {
        // back to the note still held under this one
        const prev = part.heldNotes[part.heldNotes.length - 1];
        for (const mv of live) {
          const lp = mv.prog;
          mv.srcNote = prev;
          mv.note = prev + (lp.layerTranspose || 0);
          mv.baseFreq = midiToHz(mv.note) * (lp.layerDetune ? Math.pow(2, lp.layerDetune / 1200) : 1);
          mv.targetFreq = mv.baseFreq;
          if (!(prog.glide > 0)) mv.freq = mv.targetFreq;
          mv.r.retune(mv, lp, part, this, true);
        }
      } else for (const mv of live) if (part.sustain) mv.held = true; else this.release(mv);
      return;
    }
    for (const v of this.voices) {
      if (!v.active || v.part !== idx || v.srcNote !== note || v.released) continue;
      if (part.sustain) v.held = true;
      else this.release(v);
    }
  }

  release(v, fast = false) {
    if (v.released) return;
    v.released = true;
    v.held = false;
    if (fast) v.r.kill(v);
    else v.r.release(v, this.parts[v.part], this);
  }

  cc(idx, cc, value) {
    const part = this.parts[idx];
    if (!part) return;
    switch (cc) {
      case 64: {
        const on = value >= 64;
        if (part.sustain && !on) {
          for (const v of this.voices) if (v.active && v.part === idx && v.held && !part.heldNotes.includes(v.srcNote)) this.release(v);
        }
        part.sustain = on;
        break;
      }
      case 1:
        part.mod.set(value / 127);
        break;
      case 11:
        part.expr.set(value / 127);
        break;
      case 120:
      case 123:
        this.allOff(idx, cc === 120);
        break;
      default:
        break;
    }
  }

  allOff(idx, hard) {
    const parts = idx == null || idx < 0 ? this.parts : [this.parts[idx]];
    for (const part of parts) {
      if (!part) continue;
      part.heldNotes.length = 0;
      part.sustain = false;
      this.releasePart(part, hard);
    }
  }

  /** Keep a part within its voice budget before `incoming` new voices start: its oldest tails fade out. */
  trimTails(idx, incoming) {
    let count = 0;
    for (const v of this.voices) if (v.active && v.part === idx && !v.hurried) count++;
    let over = count + incoming - this.budget.part;
    while (over > 0) {
      let oldest = null;
      for (const v of this.voices) if (v.active && v.part === idx && v.released && !v.hurried && (!oldest || v.age < oldest.age)) oldest = v;
      if (!oldest) break;
      oldest.hurried = true;
      if (oldest.r.hurry) oldest.r.hurry(oldest);
      else oldest.env.hurry();
      over--;
    }
  }

  /** Fade the oldest tail anywhere (else the oldest note): keeps the pool near its budget, without a click. */
  hurryOldest() {
    let best = null,
      bestScore = Infinity;
    for (const v of this.voices) {
      if (!v.active || v.hurried) continue;
      const score = (v.released ? 0 : 1e12) + v.age;
      if (score < bestScore) {
        bestScore = score;
        best = v;
      }
    }
    if (!best) return;
    if (!best.released) this.release(best);
    best.hurried = true;
    if (best.r.hurry) best.r.hurry(best);
    else best.env.hurry();
  }

  releasePart(part, fast) {
    for (const v of this.voices) if (v.active && v.part === part.index) this.release(v, fast);
    part.monoVoices = [];
  }

  alloc(part) {
    let best = null;
    let free = null,
      active = 0;
    for (const v of this.voices) {
      if (v.active) active++;
      else if (!free) free = v;
    }
    if (free) {
      // Over the budget (light modes): fade the oldest voice out rather than cut one, and play now.
      if (active >= this.budget.pool) this.hurryOldest();
      return free;
    }
    // The whole pool is sounding: steal the quietest voice already in release, else the oldest.
    let bestScore = Infinity;
    for (const v of this.voices) {
      if (!v.active) continue;
      const score = (v.released ? 0 : 1e9) + v.age;
      if (score < bestScore) {
        bestScore = score;
        best = v;
      }
    }
    const p = this.parts[best.part];
    if (p && p.monoVoices.includes(best)) p.monoVoices = p.monoVoices.filter((x) => x !== best);
    best.active = false;
    return best;
  }

  // ------------------------------------------------------------------ render

  /**
   * @param {Float32Array[][]} outputs one [L,R] pair per part (extra outputs are ignored)
   * @param {number} blockTime the context time at the first frame
   * @param {number} frames block length
   */
  render(outputs, blockTime, frames = 128) {
    const sr = this.sr;
    const blockEnd = blockTime + frames / sr;
    for (let p = 0; p < this.nParts; p++) {
      const o = outputs[p];
      if (!o) continue;
      o[0].fill(0);
      if (o[1]) o[1].fill(0);
    }
    // control values for this block
    for (const part of this.parts) {
      part.bendSemis = part.bend.skip(frames) * part.bendRange;
      part.bendMul = Math.pow(2, part.bendSemis / 12);
      part.modV = part.mod.skip(frames);
      part.exprV = part.expr.skip(frames);
      const d = part.drawbarsNow,
        t = part.drawbarsTarget;
      for (let i = 0; i < 9; i++) d[i] += (t[i] - d[i]) * 0.3;
    }
    // events due in this block, in time order
    let cursor = 0;
    while (this.events.length && this.events[0].time < blockEnd) {
      const ev = this.events.shift();
      let off = Math.floor((ev.time - blockTime) * sr);
      if (off < cursor) off = cursor;
      if (off > frames) off = frames;
      if (off > cursor) {
        this.renderRange(outputs, cursor, off);
        cursor = off;
      }
      this.apply(ev);
    }
    if (cursor < frames) this.renderRange(outputs, cursor, frames);
    // per-part post: organ scanner vibrato / chorus
    for (const part of this.parts) {
      const o = outputs[part.index];
      if (!o || !part.prog || part.prog.type !== 'organ' || !part.prog.vib) continue;
      scanner(part, o[0], o[1] || o[0], frames, sr, part.prog.vib);
    }
    this.frame += frames;
  }

  renderRange(outputs, from, to) {
    let n = 0;
    for (const v of this.voices) {
      if (!v.active) continue;
      const o = outputs[v.part];
      if (!o) {
        v.active = false;
        continue;
      }
      const part = this.parts[v.part];
      const alive = v.r.render(v, o[0], o[1] || o[0], from, to, part, this);
      if (!alive) {
        v.active = false;
        if (part.monoVoices.length && part.monoVoices.includes(v)) part.monoVoices = part.monoVoices.filter((x) => x !== v);
      } else n++;
    }
    this.voiceCount = n;
  }
}

function glideCoef(glide, sr) {
  if (!glide || glide <= 0) return 1;
  return 1 - Math.exp(-1 / (glide * 0.3 * sr));
}

function drawbarGain(v) {
  return v <= 0 ? 0 : Math.pow(10, ((clamp(v, 0, 8) - 8) * 3) / 20);
}

/** Hammond-style scanner vibrato/chorus: a short delay swept by a 6.9 Hz triangle, mixed with dry for chorus. */
function scanner(part, L, R, frames, sr, vib) {
  const depth = vib[0] * sr;
  const mix = vib[1];
  if (!part.vibBuf) part.vibBuf = new Float32Array(1024);
  const buf = part.vibBuf;
  for (let i = 0; i < frames; i++) {
    const x = (L[i] + R[i]) * 0.5;
    buf[part.vibW] = x;
    const ph = part.vibPhase;
    const tri = ph < 0.5 ? ph * 4 - 1 : 3 - ph * 4;
    const d = depth * (1 + tri) + 1;
    let rp = part.vibW - d;
    if (rp < 0) rp += 1024;
    const ri = rp | 0;
    const fr = rp - ri;
    const r2 = ri + 1 >= 1024 ? 0 : ri + 1;
    const w = buf[ri] + (buf[r2] - buf[ri]) * fr;
    const y = mix >= 1 ? w : x * (1 - mix) + w * mix;
    L[i] = y;
    R[i] = y;
    part.vibW = part.vibW + 1 >= 1024 ? 0 : part.vibW + 1;
    part.vibPhase += 6.9 / sr;
    if (part.vibPhase >= 1) part.vibPhase -= 1;
  }
}
