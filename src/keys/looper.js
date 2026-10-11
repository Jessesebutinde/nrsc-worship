// The loop tracks behind Stage Keys: a live musician plays a phrase once and the app keeps it going in time,
// one MIDI loop per instrument part (record / play / mute / clear), plus a transport with tap tempo, a
// metronome and built-in drum grooves. No DOM or Web Audio: the app passes a clock and an engine, so it runs
// in Node tests. Every loop is phase-locked to the transport's beat 0 (events live at `beat mod length`), so
// loops of different lengths stay in step, a take goes on from where the player is, and a muted loop comes
// back on the grid.

const MIN_DUR = 0.05; // beats: even a drum hit needs its note-off
const LATE = 0.05; // seconds: a tick this late still fires its notes (Web Audio plays a past time at once)
const GAP = 0.02; // beats kept between a note and the next start of the same note
const VEL = { X: 118, x: 96, o: 48 };

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const mod = (a, n) => ((a % n) + n) % n;
const byBeat = (a, b) => a.beat - b.beat || a.note - b.note;
const nextBar = (beat, bpb) => Math.ceil(beat / bpb - 1e-6) * bpb;

export class Transport {
  constructor({ clock, onChange } = {}) {
    this.clock = clock;
    this.onChange = onChange || (() => {});
    this.bpm = 120;
    this.beatsPerBar = 4;
    this.running = false;
    this.startTime = 0; // clock seconds of beat 0, valid while running
    this.taps = [];
  }

  setBpm(bpm) {
    bpm = clamp(Number(bpm) || 120, 40, 240);
    // Keep the beat we are on: the loops must not jump when the tempo changes.
    if (this.running) {
      const now = this.clock();
      this.startTime = now - (this.beatAt(now) * 60) / bpm;
    }
    this.bpm = bpm;
    this.onChange();
  }

  start(atTime = this.clock()) {
    this.running = true;
    this.startTime = atTime;
    this.onChange();
  }

  stop() {
    this.running = false;
    this.onChange();
  }

  beatAt(time) {
    return this.running ? ((time - this.startTime) * this.bpm) / 60 : 0;
  }

  timeAt(beat) {
    return this.startTime + (beat * 60) / this.bpm;
  }

  /** Bar and beat are 1-based for display; `beats` is the fractional total. */
  position() {
    const beats = Math.max(0, this.beatAt(this.clock()));
    const whole = Math.floor(beats);
    const bpb = this.beatsPerBar;
    return { bar: Math.floor(whole / bpb) + 1, beat: (whole % bpb) + 1, phase: beats - whole, beats };
  }

  /** Tap tempo: the average gap of the last 6 taps; a pause of 2 s starts over. */
  tap() {
    const now = this.clock();
    const taps = this.taps;
    if (taps.length && now - taps[taps.length - 1] > 2) taps.length = 0;
    taps.push(now);
    if (taps.length > 6) taps.shift();
    if (taps.length >= 2) this.setBpm(Math.round((60 * (taps.length - 1)) / (taps[taps.length - 1] - taps[0])));
    return this.bpm;
  }
}

/** Nearest grid point; grid 0 = off. */
export function quantizeBeat(beat, grid) {
  return grid > 0 ? Math.round(beat / grid) * grid : beat;
}

/** Bars for a take: rounded up, except that stopping just after a bar line means that bar, not one more. */
export function loopLengthBars(recordedBeats, beatsPerBar) {
  const bars = recordedBeats / beatsPerBar;
  const whole = Math.floor(bars);
  return Math.max(1, bars - whole < 1 / 8 ? whole : whole + 1);
}

/** Shortens each note to end before the next start of the same note (cyclic), so no off cuts the next hit. */
function trimOverlaps(events, length) {
  const byNote = new Map();
  for (const e of events) {
    if (!byNote.has(e.note)) byNote.set(e.note, []);
    byNote.get(e.note).push(e);
  }
  for (const list of byNote.values()) {
    list.sort(byBeat).forEach((e, i) => {
      const next = i + 1 < list.length ? list[i + 1].beat : list[0].beat + length;
      e.dur = clamp(e.dur, MIN_DUR, Math.max(MIN_DUR, next - e.beat - GAP));
    });
  }
}

export class Looper {
  /**
   * clock: AudioContext currentTime; engine: { noteOn(part, note, vel, time), noteOff(part, note, time),
   * click(accent, time) }; onChange: called whenever a track's state changes (the UI re-renders).
   */
  constructor({ clock, engine, transport, onChange }) {
    this.clock = clock;
    this.engine = engine;
    this.transport = transport;
    this.onChange = onChange || (() => {});
    this.lookahead = 0.12; // seconds scheduled ahead at each tick
    this.quantize = 0.25; // note-start grid in beats; 0 = off
    this.metronome = false;
    this.countIn = 0; // bars of count-in before a take starts
    this.map = new Map();
    this.pending = []; // notes already handed to the engine: { part, note, on, off } in clock seconds
    this.clickBeat = 0; // metronome scheduled up to this beat
    this.startSeen = NaN; // transport.startTime at the last tick: a (re)start resets the scheduling windows
  }

  // Public fields: part, state ('empty'|'armed'|'recording'|'playing'|'muted'), bars, events, overdub, groove.
  // The rest is ours: rec/held capture a take, recStart is the transport beat it starts at (null = on the first
  // note), before is the state to return to if the take is cancelled, until the beat scheduled up to.
  track(part) {
    let t = this.map.get(part);
    if (!t) {
      t = { part, state: 'empty', bars: 0, events: [], overdub: false, groove: null };
      Object.assign(t, { rec: [], held: new Map(), recStart: null, before: 'empty', until: 0 });
      this.map.set(part, t);
    }
    return t;
  }

  tracks() {
    return [...this.map.values()];
  }

  /** Records from the next bar line; with the transport stopped, from the first note (or after the count-in). */
  arm(part) {
    const t = this.track(part);
    if (t.state === 'armed' || t.state === 'recording') return;
    const tr = this.transport;
    const bpb = tr.beatsPerBar;
    t.before = t.state;
    t.rec = [];
    t.held.clear();
    t.state = 'armed';
    if (!tr.running && this.countIn > 0) tr.start(); // the metronome counts the bar in
    t.recStart = tr.running ? nextBar(tr.beatAt(this.clock()), bpb) + this.countIn * bpb : null;
    this.onChange();
  }

  /** A MIDI event from the router: { type: 'on'|'off', note, vel, time }. The router plays it live; we only listen. */
  input(part, ev) {
    const t = this.map.get(part);
    if (!t || (t.state !== 'armed' && t.state !== 'recording')) return;
    const tr = this.transport;
    const time = ev.time ?? this.clock();
    if (t.state === 'armed') {
      if (ev.type !== 'on') return;
      if (!tr.running) {
        tr.start(time);
        for (const o of this.map.values()) if (o.state === 'armed' && o.recStart === null) o.recStart = 0;
      } else if (t.recStart === null) t.recStart = nextBar(tr.beatAt(time), tr.beatsPerBar);
      // A note a hair before the bar line is the downbeat; earlier ones are not part of the take.
      if (tr.beatAt(time) < t.recStart - Math.max(this.quantize / 2, MIN_DUR)) return;
      this.beginRecording(t);
    }
    const beat = Math.max(t.recStart, tr.beatAt(time));
    const held = t.held.get(ev.note);
    if (held) {
      t.rec.push({ beat: held.beat, note: ev.note, vel: held.vel, dur: beat - held.beat });
      t.held.delete(ev.note);
    }
    if (ev.type === 'on') t.held.set(ev.note, { beat, vel: ev.vel });
  }

  beginRecording(t) {
    // Without overdub the old loop is replaced: silence it now, its last notes were not scheduled past this point.
    if (!(t.overdub && t.events.length)) {
      this.allOff(t.part);
      Object.assign(t, { events: [], bars: 0, groove: null });
    }
    t.state = 'recording';
    this.onChange();
  }

  /** Ends the take and plays it on, from where the player is (never from bar 1). Armed but no take: cancels. */
  stopRecording(part) {
    const t = this.map.get(part);
    if (!t) return;
    if (t.state === 'armed') {
      t.state = t.events.length ? t.before : 'empty';
      this.onChange();
      return;
    }
    if (t.state !== 'recording') return;
    const tr = this.transport;
    const bpb = tr.beatsPerBar;
    const stopBeat = tr.beatAt(this.clock());
    const keep = t.overdub && t.events.length > 0;
    const bars = keep ? t.bars : loopLengthBars(stopBeat - t.recStart, bpb);
    const length = bars * bpb;
    // Still held: the note lasts to the end of the loop pass it started in.
    for (const [note, h] of t.held) {
      const end = t.recStart + (Math.floor((h.beat - t.recStart) / length) + 1) * length;
      t.rec.push({ beat: h.beat, note, vel: h.vel, dur: end - h.beat });
    }
    t.held.clear();
    const events = keep ? t.events.slice() : [];
    for (const e of t.rec) {
      const beat = mod(quantizeBeat(e.beat, this.quantize), length);
      // The same note twice on one step (a take stopped after replaying its first note) would double-trigger.
      if (events.some((x) => x.note === e.note && x.beat === beat)) continue;
      events.push({ beat, note: e.note, vel: e.vel, dur: Math.max(MIN_DUR, e.dur) });
    }
    trimOverlaps(events, length);
    Object.assign(t, { events: events.sort(byBeat), bars, rec: [], state: events.length ? 'playing' : 'empty' });
    // Continue from here; an overdubbed loop was already scheduled a little ahead, don't send those again.
    t.until = Math.max(t.until, stopBeat);
    this.onChange();
  }

  play(part) {
    const t = this.track(part);
    if (t.state !== 'muted' && t.state !== 'playing') return;
    const tr = this.transport;
    if (!tr.running) tr.start();
    t.state = 'playing';
    t.until = tr.beatAt(this.clock());
    this.onChange();
  }

  mute(part) {
    const t = this.track(part);
    if (t.state === 'recording') this.stopRecording(part); // keep the take: Clear is the explicit way to lose it
    else if (t.state === 'armed') t.state = t.events.length ? t.before : 'empty';
    if (t.state === 'empty') return;
    t.state = 'muted';
    this.allOff(part);
    this.onChange();
  }

  toggle(part) {
    const s = this.track(part).state;
    if (s === 'playing') this.mute(part);
    else if (s === 'muted') this.play(part);
    else if (s === 'empty') this.arm(part);
    else this.stopRecording(part);
  }

  clear(part) {
    const t = this.map.get(part);
    if (!t) return;
    this.allOff(part);
    Object.assign(t, { state: 'empty', bars: 0, events: [], groove: null });
    this.onChange();
  }

  clearAll() {
    for (const t of this.tracks()) this.clear(t.part);
  }

  muteAll() {
    for (const t of this.tracks()) this.mute(t.part);
  }

  /** Fills the track with a built-in groove (an ordinary loop); the groove also sets the meter. null clears. */
  setGroove(part, grooveId) {
    const g = grooveId && GROOVES.find((x) => x.id === grooveId);
    if (!g) return this.clear(part);
    const t = this.track(part);
    const tr = this.transport;
    this.allOff(part);
    if (tr.beatsPerBar !== g.beatsPerBar) {
      tr.beatsPerBar = g.beatsPerBar;
      tr.onChange();
    }
    if (!tr.running) tr.start();
    Object.assign(t, { state: 'playing', bars: g.bars, events: expandGroove(g), groove: g.id });
    t.until = tr.beatAt(this.clock());
    this.onChange();
  }

  /** Every ~25 ms: hands the engine everything that starts within the lookahead, with exact times. */
  tick() {
    const tr = this.transport;
    if (!tr.running) {
      this.startSeen = NaN;
      return;
    }
    const now = this.clock();
    const bpb = tr.beatsPerBar;
    const late = tr.beatAt(now - LATE);
    if (tr.startTime !== this.startSeen) {
      // (Re)started: every window begins here, so playing loops come in from their downbeat.
      this.startSeen = tr.startTime;
      for (const t of this.map.values()) t.until = late;
      this.clickBeat = late;
    }
    const to = tr.beatAt(now + this.lookahead);
    const countIn = this.countIn > 0 && this.tracks().some((t) => t.state === 'armed');
    for (const t of this.map.values()) {
      if (!this.audible(t)) continue;
      // A loop about to be replaced stops at its bar line: the engine cannot take notes back.
      const end = t.state === 'armed' && !t.overdub && t.recStart !== null ? Math.min(to, t.recStart) : to;
      const from = Math.max(t.until, late);
      if (from < end) this.schedule(t, from, end, bpb);
      t.until = Math.max(t.until, end);
    }
    if (this.metronome || countIn) {
      const first = Math.ceil(Math.max(this.clickBeat, late));
      for (let b = first; b < to; b++) this.engine.click(b % bpb === 0, tr.timeAt(b));
    }
    this.clickBeat = to;
    const beat = tr.beatAt(now);
    for (const t of this.map.values()) {
      if (t.state !== 'armed') continue;
      if (t.recStart === null) t.recStart = nextBar(beat, bpb); // someone else started the transport
      if (beat >= t.recStart) this.beginRecording(t);
    }
    this.pending = this.pending.filter((p) => p.off > now);
  }

  audible(t) {
    if (t.state === 'playing') return true;
    if (t.before !== 'playing') return false;
    // The old loop goes on while a take waits for its bar line, and right through an overdub.
    return t.state === 'armed' || (t.state === 'recording' && t.overdub);
  }

  schedule(t, from, end, bpb) {
    const length = t.bars * bpb;
    if (!(length > 0)) return;
    const tr = this.transport;
    for (const ev of t.events) {
      for (let b = ev.beat + Math.ceil((from - ev.beat) / length) * length; b < end; b += length) {
        const on = tr.timeAt(b);
        const off = tr.timeAt(b + ev.dur);
        this.engine.noteOn(t.part, ev.note, ev.vel, on);
        this.engine.noteOff(t.part, ev.note, off);
        this.pending.push({ part: t.part, note: ev.note, on, off });
      }
    }
  }

  /** Note-offs now for what the engine already has (one part, or all); a note not yet started is cut as it starts. */
  allOff(part) {
    const now = this.clock();
    this.pending = this.pending.filter((p) => {
      if (part !== undefined && p.part !== part) return true;
      this.engine.noteOff(p.part, p.note, Math.max(now, p.on + 1e-3));
      return false;
    });
  }

  /** Stops the transport and silences everything; the tracks keep their loops and resume on the next start. */
  stop() {
    for (const t of this.map.values()) if (t.state === 'armed' || t.state === 'recording') this.stopRecording(t.part);
    this.allOff();
    this.transport.stop();
    this.startSeen = NaN;
    this.onChange();
  }

  /** Plain data for storage; events as [beat, note, vel, dur] tuples. */
  serialize() {
    const tr = this.transport;
    const tracks = this.tracks()
      .filter((t) => t.events.length)
      .map(({ part, bars, state, groove, events }) => ({
        part, bars, groove, state: state === 'muted' ? 'muted' : 'playing',
        events: events.map((e) => [e.beat, e.note, e.vel, e.dur]),
      }));
    return { bpm: tr.bpm, beatsPerBar: tr.beatsPerBar, tracks };
  }

  /** The inverse of serialize(); does not start the transport. */
  restore(data) {
    const tr = this.transport;
    this.allOff();
    this.map.clear();
    if (data.bpm) tr.setBpm(data.bpm);
    if (data.beatsPerBar) tr.beatsPerBar = data.beatsPerBar;
    for (const d of data.tracks || []) {
      const t = this.track(d.part);
      t.bars = d.bars;
      t.groove = d.groove || null;
      t.state = d.state === 'muted' ? 'muted' : 'playing';
      const fromTuple = (e) => (Array.isArray(e) ? { beat: e[0], note: e[1], vel: e[2], dur: e[3] } : { ...e });
      t.events = (d.events || []).map(fromTuple);
      t.until = tr.beatAt(this.clock());
    }
    this.onChange();
  }
}

// Built-in grooves. One character per step (`steps` per beat): X accent, x normal, o ghost, . rest; a lane
// shorter than the groove repeats. GM notes: 36 kick, 35 808 sub kick, 38 snare, 37 rim, 39 clap, 31 snap,
// 42 closed hat, 46 open hat, 51 ride, 49 crash, 48 tom hi, 43 tom low, 54 tambourine, 56 cowbell (cloche),
// 67/68 agogo hi/lo, 65/66 talking drum hi/lo, 70 shaker, 63/64 conga hi/lo, 62 conga mute. Spaces only
// separate bars for the eye. bpm is in transport beats: in 6/8 the beat is the 8th note, so 180 is a dotted
// quarter at 60; a 12/8 groove counts dotted quarters with 3 steps each (steps: 3).
export const GROOVES = [
  {
    id: 'sebene', name: 'Sebene (cavacha)', bpm: 132, bars: 2, beatsPerBar: 4, steps: 4,
    lanes: {
      36: 'x...x...x...x...',
      38: 'XoxXxoXXxoXoXoxo XoxXxoXoxoXoXoXo',
      42: 'x.x.x.x.x.x.x.x.',
      46: '................ ...............X',
      56: 'x.x..x.x.x..x.x.',
      70: 'xoxoxoxoxoxoxoxo',
      63: '..x.x.....x.x...',
      64: '.......xx......x',
      62: 'o.....o.......o.',
    },
  },
  {
    id: 'ndombolo', name: 'Ndombolo', bpm: 128, bars: 2, beatsPerBar: 4, steps: 4,
    lanes: {
      36: 'x...x...x...x...',
      38: '....X..o....X.o. ....X..o..o.X.oo',
      37: '.......x........',
      42: 'xoxoxoxoxo.oxoxo xoxoxoxoxoxoxo..',
      46: '..........x..... ..............Xx',
      63: '..x.x.....x.x...',
      64: '......xx......xx',
      62: 'o...o...o...o...',
      70: 'xoxoxoxoxoxoxoxo',
    },
  },
  {
    id: 'rumba', name: 'Rumba (slow)', bpm: 100, bars: 2, beatsPerBar: 4, steps: 4,
    lanes: {
      36: 'x.......x.......',
      37: 'x..x..x...x.x...',
      42: 'x.x.x.x.x.x.x.x.',
      63: '..x.......x.....',
      64: '......xx......xx',
      62: 'o...o...o...o...',
      70: 'x.o.x.o.x.o.x.o.',
    },
  },
  {
    id: 'worship44', name: 'Worship 4/4', bpm: 72, bars: 2, beatsPerBar: 4, steps: 4,
    lanes: {
      36: 'x.......x....... x.......x.x.....',
      38: '....X.......X...',
      39: '....x.......x...',
      42: 'x.x.x.x.x.x.x.xo x.x.x.xox.x.x.xo',
    },
  },
  {
    id: 'worship68', name: 'Worship 6/8', bpm: 180, bars: 2, beatsPerBar: 6, steps: 2,
    lanes: { 36: 'x.....x..... x.....x...x.', 38: '......X.....', 42: 'X.x.x.X.x.x.', 70: 'xoxoxoxoxoxo' },
  },
  {
    id: 'pop', name: 'Pop 4/4', bpm: 96, bars: 1, beatsPerBar: 4, steps: 4,
    lanes: { 36: 'x.....x.x.......', 38: '....X.......X...', 39: '....x.......x...', 42: 'x.x.x.x.x.x.x.x.' },
  },
  {
    id: 'gospel', name: 'Gospel pocket', bpm: 92, bars: 2, beatsPerBar: 4, steps: 4,
    lanes: {
      36: 'x.....x...x..... x.....x...x...x.',
      38: '....X..o.o..X..o ....X..o.o..X.oo',
      42: 'x.xox.xox.xox.xo',
      46: '................ ..............x.',
    },
  },
  // South African gospel (Spirit of Praise / Joyous Celebration): a bouncing praise groove, and a 12/8 worship
  {
    id: 'sa-praise', name: 'SA gospel praise', bpm: 124, bars: 2, beatsPerBar: 4, steps: 4,
    lanes: {
      36: 'x...x...x...x..x',
      38: '....X..o....X.o. ....X..o....X.oo',
      42: 'xxXxxxXxxxXxxxXx',
      46: '................ ..............x.',
      39: '....x.......x...',
      54: '..x...x...x...x.',
    },
  },
  {
    id: 'sa-worship', name: 'SA gospel worship 12/8', bpm: 66, bars: 2, beatsPerBar: 4, steps: 3,
    lanes: { 36: 'x.....x..x.. x.....x..x.x', 38: '...X.....X..', 42: 'xooxooxooxoo', 49: 'x........... ............' },
  },
  // Nigerian praise: four on the floor under the agogo time-line, congas, shaker and a talking drum call
  {
    id: 'naija-praise', name: 'Naija praise', bpm: 128, bars: 2, beatsPerBar: 4, steps: 4,
    lanes: {
      36: 'x...x...x...x...',
      38: '....X..o.o..X..o',
      42: 'xo.oxo.oxo.oxo.o',
      46: '..x...x...x...x.',
      67: 'x..x..x...x.x...',
      62: 'x...x...x...x...',
      63: '......xx......xx',
      70: 'XxxxXxxxXxxxXxxx',
      65: 'x..x..x.x.X..... ................',
      66: '................ x..x..x...x.x...',
    },
  },
  {
    id: 'highlife', name: 'Highlife praise', bpm: 118, bars: 2, beatsPerBar: 4, steps: 4,
    lanes: {
      36: 'x.......x.......',
      37: '....x.......x...',
      42: 'x.x.x.x.x.x.x.x.',
      67: 'x.x.xx.x.x.x.xx.',
      68: '...x.......x....',
      63: '..x...x...x...x.',
      64: '.......x.......x',
      70: 'xoxoxoxoxoxoxoxo',
    },
  },
  // Amapiano (South African house-gospel crossover): four on the floor, shakers, off-beat hats; the log drum
  // bass is played on the keys
  {
    id: 'amapiano', name: 'Amapiano', bpm: 113, bars: 2, beatsPerBar: 4, steps: 4,
    lanes: {
      36: 'x...x...x...x...',
      42: '..x...x...x...x.',
      70: 'XxxxXxxxXxxxXxxx',
      37: '...x.x.....x.x.. ...x.x.....x..x.',
      39: '....x.......x...',
      63: '......x.......x.',
    },
  },
  // Afrobeats (2020s Lagos pop) and Afrobeat (Tony Allen's first pattern)
  {
    id: 'afrobeats', name: 'Afrobeats', bpm: 104, bars: 2, beatsPerBar: 4, steps: 4,
    lanes: {
      36: 'x..x....x.x.....',
      37: '...x..x......x..',
      39: '....x.......x...',
      70: 'XxoxXxoxXxoxXxox',
      63: '......x.......x. ......x....x..x.',
      46: '................ ..............x.',
    },
  },
  {
    id: 'afrobeat', name: 'Afrobeat (Tony Allen)', bpm: 112, bars: 1, beatsPerBar: 4, steps: 4,
    lanes: {
      36: 'xx......xx......',
      38: '...x.xx......xx.',
      42: 'x.Xxx.Xxx.Xxx.Xx',
      70: 'xoxoxoxoxoxoxoxo',
      62: '..x...x...x...x.',
      75: 'x..x..x...x.x...',
    },
  },
  // Worship bands: Elevation's driving chorus, its floor-tom build and 6/8 anthems; Hillsong's chorus and
  // half-time verse
  {
    id: 'elevation', name: 'Elevation drive', bpm: 130, bars: 2, beatsPerBar: 4, steps: 4,
    lanes: {
      36: 'x.x.x.x.x.x.x.x.',
      38: '....X.......X...',
      51: 'x.x.x.x.x.x.x.x.',
      49: 'x............... ................',
    },
  },
  {
    id: 'elevation-build', name: 'Elevation build', bpm: 130, bars: 2, beatsPerBar: 4, steps: 4,
    lanes: { 36: 'x.x.x.x.x.x.x.x.', 43: 'XoxoXoxoXoxoXoxo', 38: '................ ............xxXX' },
  },
  {
    id: 'elevation68', name: 'Anthem 6/8', bpm: 70, bars: 2, beatsPerBar: 4, steps: 3,
    lanes: { 36: 'x.....x..... x.....x..x..', 38: '...X.....X..', 42: 'xxxxxxxxxxxx', 49: 'x........... ............' },
  },
  {
    id: 'hillsong', name: 'Hillsong chorus', bpm: 72, bars: 2, beatsPerBar: 4, steps: 4,
    lanes: {
      36: 'x.....x...x..... x.....x...x...x.',
      38: '....X.......X...',
      51: 'x.x.x.x.x.x.x.x.',
      49: 'x............... ................',
    },
  },
  {
    id: 'hillsong-half', name: 'Hillsong verse (half-time)', bpm: 72, bars: 1, beatsPerBar: 4, steps: 4,
    lanes: { 36: 'x.........x.....', 37: '........x.......', 42: 'o.o.o.o.o.o.o.o.' },
  },
  // Billie Eilish / FINNEAS: dry, snaps instead of snares, the bass carries the low end
  {
    id: 'billie-pop', name: 'Billie pop', bpm: 105, bars: 1, beatsPerBar: 4, steps: 4,
    lanes: { 36: 'x...x...x...x...', 31: '....X.......X...', 42: '..o...o...o...o.' },
  },
  {
    id: 'billie-half', name: 'Billie half-time', bpm: 72, bars: 1, beatsPerBar: 4, steps: 4,
    lanes: { 36: 'x.........x.....', 31: '........X.......', 42: '..o...o...o...o.' },
  },
];

/** The groove (object or id) as loop events, drums as 0.2-beat one-shots. */
export function expandGroove(groove, bars = undefined) {
  const g = typeof groove === 'string' ? GROOVES.find((x) => x.id === groove) : groove;
  if (!g) return [];
  const steps = g.steps || 4;
  const total = (bars ?? g.bars) * (g.beatsPerBar || 4) * steps;
  const events = [];
  for (const [note, lane] of Object.entries(g.lanes)) {
    const pat = lane.replace(/\s/g, '');
    if (!pat) continue;
    for (let i = 0; i < total; i++) {
      const vel = VEL[pat[i % pat.length]];
      if (vel) events.push({ beat: i / steps, note: Number(note), vel, dur: 0.2 });
    }
  }
  return events.sort(byBeat);
}
