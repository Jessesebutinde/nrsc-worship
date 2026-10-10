// /lyrics/screen.html — an output: the hall TV, the ATEM (stream) feed, or an OBS browser source.
//
//   ?out=tv           the TV (default): full layout, backgrounds, logo, title cards
//   ?out=stream       the stream feed for the ATEM: lower thirds on black by default (set from the remote)
//   ?transparent=1    no background at all, for an OBS browser source
//   ?badge=1          show which output this is for a few seconds (the laptop sets it when it opens windows)
//   ?room=NAME        another channel (default: the church's, from config.js)
//
// Keys: Space / → next, ← previous, B black, C clear, L logo, F fullscreen, V pick a background video.
// Opened from the laptop the window arrives fullscreen; otherwise the first click or key press makes it so.

import { html, render, useState, useEffect, useRef } from '../ui/h.js';
import { Fit, Stage } from './stage.js';
import { Link, normalizeCode } from './link.js';
import { ROOM } from './config.js';
import { emptyState, reduce } from './state.js';
import { relayConfig } from './cloud.js';
import { receiveCast } from './cast.js';
import { idbGet, idbSet } from './idb.js';

const params = new URLSearchParams(location.search);
const transparent = params.get('transparent') === '1';
const out = params.get('out') === 'stream' ? 'stream' : 'tv';
const badge = params.get('badge') === '1';

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
  return normalizeCode(params.get('room')) || normalizeCode(ROOM);
}

function cachedState(room) {
  try {
    return JSON.parse(storageGet(`ls-screen-state:${room}`)) || emptyState();
  } catch {
    return emptyState();
  }
}

function remoteUrl() {
  const u = new URL('./', location.href);
  u.search = '';
  return u.href.replace(/^https?:\/\//, '');
}

function goFullscreen() {
  if (document.fullscreenElement) return;
  const p = document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
  if (p && p.catch) p.catch(() => {});
}

function Screen() {
  const room = useRef(roomCode()).current;
  const [state, setState] = useState(() => cachedState(room));
  const [info, setInfo] = useState({ peers: { remote: 0, screen: 0 }, cloud: 'off' });
  const [video, setVideo] = useState('');
  const [hint, setHint] = useState(!badge);
  const [showBadge, setShowBadge] = useState(badge);
  const [idle, setIdle] = useState(false);
  const [full, setFull] = useState(Boolean(document.fullscreenElement));
  const [cast, setCast] = useState(false);
  const link = useRef(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const l = new Link({
      room,
      role: 'screen',
      state: stateRef.current,
      relay: relayConfig(),
      onState: (s) => {
        setState(s);
        storageSet(`ls-screen-state:${room}`, JSON.stringify(s));
      },
      onInfo: setInfo,
    });
    link.current = l;
    // Shown through Google Cast: the remote talks to us over the Cast connection too.
    if (receiveCast((conn) => l.addPort(conn))) setCast(true);
    return () => l.close();
  }, []);

  // Fullscreen: try at once (works when the laptop opened us with its permission), and on the first
  // click or key press otherwise. No bars once fullscreen.
  useEffect(() => {
    goFullscreen();
    const onChange = () => {
      setFull(Boolean(document.fullscreenElement));
      if (document.fullscreenElement) setHint(false);
    };
    document.addEventListener('fullscreenchange', onChange);
    const first = () => {
      goFullscreen();
      setHint(false);
    };
    addEventListener('pointerup', first);
    addEventListener('keydown', first);
    const t = setTimeout(() => setShowBadge(false), 5000);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      removeEventListener('pointerup', first);
      removeEventListener('keydown', first);
      clearTimeout(t);
    };
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

  const paired = info.peers.remote > 0 || cast;
  const isTv = out === 'tv' && !transparent;
  const showPair = isTv && !paired && (!state.item || state.mode === 'logo');
  const layout = out === 'stream' ? state.streamLayout || 'lowerthird' : 'full';
  const background = transparent ? 'none' : out === 'stream' && state.streamBg !== 'tv' ? 'key' : 'auto';

  return html`<div class=${`screen ${idle ? 'idle' : ''} ${transparent ? 'clear-bg' : ''}`}>
    <${Fit} fill=${true}>
      <${Stage} state=${state} out=${out} layout=${layout} background=${background} titleCards=${isTv} video=${video} />
    <//>
    ${showBadge &&
    html`<div class=${`badge ${out}`}>
      <b>${out === 'stream' ? 'STREAM FEED' : 'TV'}</b>
      <span>${out === 'stream' ? 'this display goes to the ATEM' : 'this display is the hall TV'}</span>
    </div>`}
    ${showPair &&
    html`<div class="pair">
      <div class="pair-text">
        ${info.cloud === 'off'
          ? html`Waiting for the remote in this browser`
          : html`Waiting for the remote. On the laptop open <b>${remoteUrl()}</b>`}
      </div>
    </div>`}
    ${hint &&
    !full &&
    !transparent &&
    html`<div class="hint">Click once for fullscreen · Space / → next · ← back · B black · C clear · L logo</div>`}
    ${!transparent && info.cloud === 'closed' && html`<div class="offline">Reconnecting…</div>`}
  </div>`;
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else goFullscreen();
}

render(html`<${Screen} />`, document.getElementById('app'));
