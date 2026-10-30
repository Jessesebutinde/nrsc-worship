// The operator's microphone, through the browser's own speech recognition (Chrome and Edge;
// Chrome sends the audio to Google's speech service, so it needs the internet). Listens until
// switched off, restarting itself when the browser stops after a pause.

export const SPEECH_LANGS = { 'en-GB': 'English', 'lg-UG': 'Luganda' };

const Recognition = () => globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition || null;

/** Can this browser listen? */
export const canListen = () => Boolean(Recognition());

const ERRORS = {
  'not-allowed': 'The microphone was not allowed. Click the padlock by the address and allow the microphone.',
  'service-not-allowed': 'The browser does not allow speech recognition here.',
  'audio-capture': 'No microphone was found. Plug one in or check the sound settings.',
  network: 'Speech recognition needs the internet.',
  'language-not-supported': 'This browser cannot recognise that language yet; try English.',
};

export class Listener {
  /**
   * onText(finalText | null, interimText): a finished phrase (once) or what is being said now.
   * onState('on' | 'off', message?) when listening starts or stops (with the reason if it failed).
   */
  constructor({ lang = 'en-GB', onText = () => {}, onState = () => {} } = {}) {
    this.lang = lang;
    this.onText = onText;
    this.onState = onState;
    this.wanted = false;
    this.rec = null;
  }

  start() {
    const R = Recognition();
    if (!R) {
      this.onState('off', 'Voice needs Chrome or Edge.');
      return;
    }
    this.wanted = true;
    this.open(R);
  }

  open(R) {
    const rec = new R();
    rec.lang = this.lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onstart = () => this.onState('on');
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const t = r[0] && r[0].transcript ? r[0].transcript.trim() : '';
        if (!t) continue;
        if (r.isFinal) this.onText(t, '');
        else interim += `${interim ? ' ' : ''}${t}`;
      }
      if (interim) this.onText(null, interim);
    };
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      if (ERRORS[e.error]) {
        this.wanted = false;
        this.onState('off', ERRORS[e.error]);
      }
    };
    rec.onend = () => {
      if (this.rec !== rec) return;
      // The browser stops after a pause; keep listening until the operator switches off.
      if (this.wanted) {
        try {
          rec.start();
          return;
        } catch {
          setTimeout(() => this.wanted && this.open(R), 300);
          return;
        }
      }
      this.onState('off');
    };
    this.rec = rec;
    try {
      rec.start();
    } catch (err) {
      this.wanted = false;
      this.onState('off', err.message);
    }
  }

  stop() {
    this.wanted = false;
    const rec = this.rec;
    this.rec = null;
    if (rec) {
      try {
        rec.stop();
      } catch {
        /* already stopped */
      }
    }
    this.onState('off');
  }
}
