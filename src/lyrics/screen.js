// /lyrics/screen.html — the picture on the hall TV (or an OBS browser source).
//
//   ?room=CODE        pairing code (otherwise one is made up and remembered on this PC)
//   ?transparent=1    no background, for OBS
//   ?mode=lowerthird  livestream subtitles in a band at the bottom
//
// Keys: Space / → next, ← previous, B black, C clear, L logo, F fullscreen, V pick a background video.

import { html, render, useState, useEffect, useRef } from '../ui/h.js';
import { Fit, Stage } from './stage.js';
import { Link, newCode, normalizeCode } from './link.js';
import { emptyState, reduce } from './state.js';
import { cloudConfig } from './cloud.js';
import { idbGet, idbSet } from './idb.js';

const params = new URLSearchParams(location.search);
const transparent = params.get('transparent') === '1';
const lowerThird = params.get('mode') === 'lowerthird';

function storageGet(k) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function storageSet(k, v) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private window: the screen still works, it just forgets on refresh */
  }
}

function roomCode() {
  let room = normalizeCode(params.get('room'));
  if (!room) room = normalizeCode(storageGet('ls-screen-room'));
  if (!room) room = newCode();
  storageSet('ls-screen-room', room);
  return room;
}

function cachedState(room) {
  try {
    return JSON.parse(storageGet(`ls-screen-state:${room}`)) || emptyState();
  } catch {
    return emptyState();
  }
}

function remoteUrl(room) {
  const u = new URL('./', location.href);
  u.search = `?room=${room}`;
  return u.href.replace(/^https?:\/\//, '');
}

function Screen() {
  const room = useRef(roomCode()).current;
  const [state, setState] = useState(() => cachedState(room));
  const [info, setInfo] = useState({ peers: { remote: 0, screen: 0 }, cloud: 'off' });
  const [video, setVideo] = useState('');
  const [hint, setHint] = useState(true);
  const [idle, setIdle] = useState(false);
  const link = useRef(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const l = new Link({
      room,
      role: 'screen',
      state: stateRef.current,
      cloud: cloudConfig(),
      onState: (s) => {
        setState(s);
        storageSet(`ls-screen-state:${room}`, JSON.stringify(s));
      },
      onInfo: setInfo,
    });
    link.current = l;
    return () => l.close();
  }, []);

  // Keyboard control on the screen PC.
  useEffect(() => {
    const act = (cmd) => {
      const next = reduce(stateRef.current, cmd, link.current.id);
      setState(next);
      storageSet(`ls-screen-state:${room}`, JSON.stringify(next));
      link.current.publish(next);
    };
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key;
      if (k === ' ' || k === 'ArrowRight' || k === 'PageDown' || k === 'ArrowDown') act({ type: 'next' });
      else if (k === 'ArrowLeft' || k === 'PageUp' || k === 'ArrowUp') act({ type: 'prev' });
      else if (k === 'b' || k === 'B' || k === '.') act({ type: 'mode', mode: 'black' });
      else if (k === 'c' || k === 'C') act({ type: 'mode', mode: 'clear' });
      else if (k === 'l' || k === 'L') act({ type: 'mode', mode: 'logo' });
      else if (k === 'Enter') act({ type: 'mode', mode: 'show' });
      else if (k === 'f' || k === 'F') toggleFullscreen();
      else if (k === 'v' || k === 'V') pickVideo();
      else return;
      e.preventDefault();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  // A background video chosen on this PC (kept in IndexedDB).
  useEffect(() => {
    idbGet('files', 'bg-video')
      .then((blob) => blob && setVideo(URL.createObjectURL(blob)))
      .catch(() => {});
  }, []);
  function pickVideo() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.onchange = async () => {
      const f = input.files[0];
      if (!f) return;
      setVideo(URL.createObjectURL(f));
      try {
        await idbSet('files', 'bg-video', f);
      } catch {
        /* too big to keep: plays until refresh */
      }
    };
    input.click();
  }

  // Keep the TV PC awake; hide the cursor and hints when nobody is touching it.
  useEffect(() => {
    let lock = null;
    const wake = async () => {
      try {
        if (document.visibilityState === 'visible') lock = await navigator.wakeLock.request('screen');
      } catch {
        /* not supported */
      }
    };
    wake();
    document.addEventListener('visibilitychange', wake);
    let t = setTimeout(() => setHint(false), 6000);
    const moved = () => {
      setIdle(false);
      clearTimeout(t);
      t = setTimeout(() => {
        setIdle(true);
        setHint(false);
      }, 2500);
    };
    addEventListener('pointermove', moved);
    return () => {
      document.removeEventListener('visibilitychange', wake);
      removeEventListener('pointermove', moved);
      if (lock) lock.release();
    };
  }, []);

  const paired = info.peers.remote > 0;
  const showPair = !transparent && !lowerThird && !paired && (!state.item || state.mode === 'logo');
  const cloudOff = info.cloud === 'off';

  return html`<div class=${`screen ${idle ? 'idle' : ''} ${transparent || lowerThird ? 'clear-bg' : ''}`} onDblClick=${toggleFullscreen}>
    <${Fit} fill=${true}>
      <${Stage} state=${state} transparent=${transparent} lowerThird=${lowerThird} titleCards=${true} video=${video} />
    <//>
    ${showPair &&
    html`<div class="pair">
      <div class="pair-code">${room.slice(0, 3)} ${room.slice(3)}</div>
      <div class="pair-text">
        ${cloudOff
          ? html`Open the remote in this browser: <b>${remoteUrl(room)}</b>`
          : html`On your phone open <b>${remoteUrl(room).replace(/\?room=.*/, '')}</b> and enter this code`}
      </div>
    </div>`}
    ${hint &&
    !transparent &&
    !lowerThird &&
    html`<div class="hint">F fullscreen · Space / → next · ← back · B black · C clear · L logo · V video</div>`}
    ${!transparent && info.cloud === 'closed' && html`<div class="offline">Reconnecting…</div>`}
  </div>`;
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else document.documentElement.requestFullscreen().catch(() => {});
}

render(html`<${Screen} />`, document.getElementById('app'));
