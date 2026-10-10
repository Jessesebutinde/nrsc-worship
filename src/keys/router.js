// Turns keyboard events into notes for the right parts (zones, channels, velocity ranges, transpose),
// keeps note-offs matched to the parts that got the note-on, handles pedals and wheels, learns CCs.

export const CC_ACTIONS = {
  macro1: 'Macro 1',
  macro2: 'Macro 2',
  macro3: 'Macro 3',
  macro4: 'Macro 4',
  rotary: 'Rotary speed (slow/fast)',
  nextSong: 'Next song',
  prevSong: 'Previous song',
  loop1: 'Loop: part 1 play/mute',
  loop2: 'Loop: part 2 play/mute',
  loop3: 'Loop: part 3 play/mute',
  loop4: 'Loop: part 4 play/mute',
  loopsOff: 'All loops off',
  tap: 'Tap tempo',
  panic: 'Panic (all notes off)',
  master: 'Master volume',
  part1vol: 'Part 1 volume',
  part2vol: 'Part 2 volume',
  part3vol: 'Part 3 volume',
  part4vol: 'Part 4 volume',
};

export class Router {
  /**
   * @param {object} o
   * @param {object} o.engine        noteOn/noteOff/cc/bend/allOff
   * @param {() => object} o.getParts   current parts (zones, channels...)
   * @param {() => object} o.getCcMap   { [cc]: action }
   * @param {(action:string, value:number, on:boolean) => void} o.onAction   learned CC actions
   * @param {(part:number, note:number, on:boolean, vel:number) => void} [o.onNote]   for the on-screen keyboard
   * @param {(part:number, ev:object) => void} [o.onLoopInput]   feeds the looper while it records
   * @param {(cc:number) => void} [o.onLearn]   a CC arrived while learning
   */
  constructor({ engine, getParts, getCcMap, onAction, onNote, onLoopInput, onLearn, onProgram }) {
    this.engine = engine;
    this.getParts = getParts;
    this.getCcMap = getCcMap || (() => ({}));
    this.onAction = onAction || (() => {});
    this.onNote = onNote || (() => {});
    this.onLoopInput = onLoopInput || (() => {});
    this.onLearn = onLearn || (() => {});
    this.onProgram = onProgram || (() => {});
    this.active = new Map(); // "ch:note" -> [{ part, note }]
    this.learning = false;
    this.sustain = false;
    this.lastCc = {};
  }

  /** Which parts a note on this channel should reach. */
  targets(ev) {
    const parts = this.getParts();
    const out = [];
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (!p || p.enabled === false) continue;
      if (p.channel && p.channel !== ev.ch) continue;
      if (ev.note < p.keyLow || ev.note > p.keyHigh) continue;
      if (ev.vel < (p.velLow || 1) || ev.vel > (p.velHigh || 127)) continue;
      out.push(i);
    }
    return out;
  }

  handle(ev) {
    switch (ev.type) {
      case 'noteon': {
        const key = ev.ch + ':' + ev.note;
        if (this.active.has(key)) this.noteOff(ev); // same key twice: finish the first
        const parts = this.getParts();
        const hit = [];
        for (const i of this.targets(ev)) {
          const p = parts[i];
          const note = ev.note + (p.transpose || 0) + 12 * (p.octave || 0);
          if (note < 0 || note > 127) continue;
          const vel = scaleVelocity(ev.vel, p.velScale);
          this.engine.noteOn(i, note, vel, 0);
          hit.push({ part: i, note });
          this.onNote(i, note, true, vel);
          this.onLoopInput(i, { type: 'on', note, vel, time: this.engine.time });
        }
        if (hit.length) this.active.set(key, hit);
        break;
      }
      case 'noteoff':
        this.noteOff(ev);
        break;
      case 'bend': {
        const v = Math.max(-1, Math.min(1, ev.value / 8192));
        const parts = this.getParts();
        for (let i = 0; i < parts.length; i++) if (parts[i]) this.engine.bend(i, v, 0);
        break;
      }
      case 'cc':
        this.controlChange(ev);
        break;
      case 'program':
        this.onProgram(ev.program);
        break;
      default:
        break;
    }
  }

  noteOff(ev) {
    const key = ev.ch + ':' + ev.note;
    const hit = this.active.get(key);
    if (!hit) return;
    this.active.delete(key);
    for (const h of hit) {
      this.engine.noteOff(h.part, h.note, 0);
      this.onNote(h.part, h.note, false, 0);
      this.onLoopInput(h.part, { type: 'off', note: h.note, vel: 0, time: this.engine.time });
    }
  }

  controlChange(ev) {
    const { cc, value } = ev;
    this.lastCc = { cc, value, at: Date.now() };
    if (this.learning) {
      this.onLearn(cc);
      return;
    }
    const parts = this.getParts();
    switch (cc) {
      case 64: // damper, including half-damper values
        this.sustain = value >= 64;
        for (let i = 0; i < parts.length; i++) if (parts[i] && parts[i].sustain !== false) this.engine.cc(i, 64, value, 0);
        return;
      case 1:
      case 11:
        for (let i = 0; i < parts.length; i++) if (parts[i]) this.engine.cc(i, cc, value, 0);
        return;
      case 120:
      case 123:
        this.panic();
        return;
      default:
        break;
    }
    const action = this.getCcMap()[cc];
    if (action) this.onAction(action, value / 127, value >= 64);
  }

  panic() {
    this.active.clear();
    this.engine.allOff(true);
  }

  /** Release everything a part is holding (used when a part is removed or its sound changes type). */
  releasePart(part) {
    for (const [key, hit] of this.active) {
      const keep = hit.filter((h) => h.part !== part);
      for (const h of hit) if (h.part === part) this.engine.noteOff(h.part, h.note, 0);
      if (keep.length) this.active.set(key, keep);
      else this.active.delete(key);
    }
  }
}

function scaleVelocity(v, scale) {
  if (!scale || scale === 1) return v;
  return Math.max(1, Math.min(127, Math.round(v * scale)));
}
