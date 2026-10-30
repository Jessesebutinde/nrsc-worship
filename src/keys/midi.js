// Web MIDI input: finds the keyboard (a KROSS by preference), follows plug/unplug, and turns raw bytes
// into simple events. Also a computer-keyboard fallback so the app can be tried without a keyboard.

export const midiSupported = () => typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;

export class MidiInput {
  constructor({ onMessage, onDevices }) {
    this.onMessage = onMessage;
    this.onDevices = onDevices || (() => {});
    this.access = null;
    this.inputs = [];
    this.selected = ''; // '' = every input
    this.activity = 0;
    this.error = '';
  }
  async start() {
    if (!midiSupported()) {
      this.error = 'This browser has no Web MIDI. Use Chrome or Edge.';
      return false;
    }
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
    } catch (e) {
      this.error = 'MIDI access was refused: ' + (e && e.message ? e.message : e);
      return false;
    }
    this.access.onstatechange = () => this.refresh();
    this.refresh();
    return true;
  }
  refresh() {
    if (!this.access) return;
    this.inputs = [...this.access.inputs.values()].map((i) => ({ id: i.id, name: i.name || 'MIDI input', manufacturer: i.manufacturer || '', state: i.state }));
    for (const input of this.access.inputs.values()) {
      const active = !this.selected || this.selected === input.id;
      input.onmidimessage = active ? (e) => this.handle(e) : null;
    }
    this.onDevices(this.inputs, this.activeNames());
  }
  select(id) {
    this.selected = id || '';
    this.refresh();
  }
  activeNames() {
    const list = this.inputs.filter((i) => i.state === 'connected' && (!this.selected || this.selected === i.id));
    return list.map((i) => i.name);
  }
  /** The input most likely to be the stage keyboard. */
  static preferred(inputs) {
    return inputs.find((i) => /kross/i.test(i.name)) || inputs.find((i) => !/through|loop|virtual/i.test(i.name)) || inputs[0] || null;
  }
  handle(e) {
    const ev = parseMidi(e.data, e.timeStamp);
    if (!ev) return;
    this.activity = performance.now();
    this.onMessage(ev);
  }
}

/** Raw MIDI bytes to { type, ch (1..16), ... }. Returns null for messages we don't use. */
export function parseMidi(data, time = 0) {
  if (!data || data.length === 0) return null;
  const status = data[0] & 0xf0;
  const ch = (data[0] & 0x0f) + 1;
  switch (status) {
    case 0x90:
      return data[2] > 0 ? { type: 'noteon', ch, note: data[1], vel: data[2], time } : { type: 'noteoff', ch, note: data[1], vel: 0, time };
    case 0x80:
      return { type: 'noteoff', ch, note: data[1], vel: data[2], time };
    case 0xb0:
      return { type: 'cc', ch, cc: data[1], value: data[2], time };
    case 0xe0:
      return { type: 'bend', ch, value: ((data[2] << 7) | data[1]) - 8192, time };
    case 0xc0:
      return { type: 'program', ch, program: data[1], time };
    case 0xd0:
      return { type: 'aftertouch', ch, value: data[1], time };
    default:
      return null;
  }
}

// ---------------------------------------------------------------- computer keyboard

// Two rows of a QWERTY keyboard become two octaves (like most DAWs): Z = C3 ... , Q = C4 ...
const KEY_NOTES = {
  KeyZ: 48, KeyS: 49, KeyX: 50, KeyD: 51, KeyC: 52, KeyV: 53, KeyG: 54, KeyB: 55, KeyH: 56, KeyN: 57, KeyJ: 58, KeyM: 59, Comma: 60, KeyL: 61, Period: 62, Semicolon: 63, Slash: 64,
  KeyQ: 60, Digit2: 61, KeyW: 62, Digit3: 63, KeyE: 64, KeyR: 65, Digit5: 66, KeyT: 67, Digit6: 68, KeyY: 69, Digit7: 70, KeyU: 71, KeyI: 72, Digit9: 73, KeyO: 74, Digit0: 75, KeyP: 76,
};

/** Listens on `target` and reports note events like a MIDI keyboard would (channel 1, velocity 100). */
export class TypingKeyboard {
  constructor(onMessage) {
    this.onMessage = onMessage;
    this.octave = 0;
    this.down = new Set();
    this.enabled = false;
    this._onDown = (e) => this.key(e, true);
    this._onUp = (e) => this.key(e, false);
  }
  attach(target = window) {
    target.addEventListener('keydown', this._onDown);
    target.addEventListener('keyup', this._onUp);
  }
  detach(target = window) {
    target.removeEventListener('keydown', this._onDown);
    target.removeEventListener('keyup', this._onUp);
  }
  key(e, on) {
    if (!this.enabled || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (on && (e.code === 'BracketLeft' || e.code === 'BracketRight')) {
      this.octave += e.code === 'BracketLeft' ? -1 : 1;
      e.preventDefault();
      return;
    }
    const base = KEY_NOTES[e.code];
    if (base == null) return;
    if (on && e.repeat) {
      e.preventDefault();
      return;
    }
    const note = base + this.octave * 12;
    if (on) {
      if (this.down.has(note)) return;
      this.down.add(note);
      this.onMessage({ type: 'noteon', ch: 1, note, vel: 100, time: performance.now() });
    } else {
      this.down.delete(note);
      this.onMessage({ type: 'noteoff', ch: 1, note, vel: 0, time: performance.now() });
    }
    e.preventDefault();
  }
}
