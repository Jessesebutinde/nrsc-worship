// Plays a demo: keyboard notes through the router (so splits and layers answer exactly as they would to
// your hands), part notes straight to a part (drum grooves, loop-only parts, the audition part), all at
// exact audio times with a short look-ahead. Lights the on-screen keys at the moment each note sounds.

const LOOKAHEAD = 0.2; // seconds handed to the engine ahead of time
const TICK = 25; // ms

/**
 * A script: { bpm, beats, tracks: [{ kind: 'keys' | 'part', part, shift, light, color, events: [{ beat, note, dur, vel }] }] }
 */
export class DemoPlayer {
  constructor({ engine, router, onLight, onChange }) {
    this.engine = engine;
    this.router = router;
    this.onLight = onLight || (() => {});
    this.onChange = onChange || (() => {});
    this.timer = null;
    this.lightTimers = new Set();
    this.queue = [];
    this.parts = new Set();
    this.lit = new Set();
    this.name = '';
    this.endsAt = 0;
  }

  get playing() {
    return !!this.timer;
  }

  /** Seconds left, for the progress bar. */
  remaining() {
    return this.playing ? Math.max(0, this.endsAt - this.engine.time) : 0;
  }

  play(script, name = '') {
    this.stop();
    const spb = 60 / script.bpm;
    const t0 = this.engine.time + 0.12;
    const q = [];
    for (const tr of script.tracks) {
      if (tr.kind === 'part') this.parts.add(tr.part);
      for (const e of tr.events) {
        const on = t0 + e.beat * spb;
        const off = t0 + (e.beat + Math.max(0.03, e.dur)) * spb;
        q.push({ time: on, on: true, tr, e }, { time: off, on: false, tr, e });
      }
    }
    // offs before ons at the same instant, so a repeated key is released before it is struck again
    q.sort((a, b) => a.time - b.time || (a.on === b.on ? 0 : a.on ? 1 : -1));
    this.queue = q;
    this.name = name;
    this.endsAt = t0 + script.beats * spb;
    this.timer = setInterval(() => this.pump(), TICK);
    this.pump();
    this.onChange();
  }

  pump() {
    const now = this.engine.time;
    const until = now + LOOKAHEAD;
    while (this.queue.length && this.queue[0].time < until) {
      const { time, on, tr, e } = this.queue.shift();
      const at = Math.max(time, now);
      if (tr.kind === 'keys') {
        this.router.handle({ type: on ? 'noteon' : 'noteoff', ch: 1, note: e.note, vel: on ? e.vel : 0, virtual: true, at });
      } else {
        const n = e.note + (tr.shift || 0);
        if (on) this.engine.noteOn(tr.part, n, e.vel, at);
        else this.engine.noteOff(tr.part, n, at);
      }
      // keys light unless told not to; part tracks only when asked (the sound being demonstrated)
      const lights = tr.kind === 'keys' ? tr.light !== false : !!tr.light;
      if (lights) this.light(e.note, on, tr.color, at - now);
    }
    if (!this.queue.length && now > this.endsAt) this.finish();
  }

  light(note, on, color, delay) {
    const t = setTimeout(() => {
      this.lightTimers.delete(t);
      if (on) this.lit.add(note);
      else this.lit.delete(note);
      this.onLight(note, on, color);
    }, Math.max(0, delay * 1000));
    this.lightTimers.add(t);
  }

  finish() {
    clearInterval(this.timer);
    this.timer = null;
    this.parts.clear();
    this.name = '';
    this.onChange();
  }

  stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    for (const t of this.lightTimers) clearTimeout(t);
    this.lightTimers.clear();
    this.queue = [];
    this.router.releaseVirtual();
    for (const p of this.parts) this.engine.allOff(false, p);
    this.parts.clear();
    for (const n of this.lit) this.onLight(n, false);
    this.lit.clear();
    this.name = '';
    this.onChange();
  }
}
