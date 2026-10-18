// /lyrics/ — the remote: pick songs, scripture, pictures and videos, step through slides,
// Clear / Black / Logo, and put the picture on the TV and the stream.
// Laptop: library, live slides and both outputs side by side (keys: Space / arrows, B, C, L). Phone: tabs.

import { html, render, useState, useEffect, useRef, useMemo } from '../ui/h.js';
import { Fit, Stage } from './stage.js';
import { Link, normalizeCode } from './link.js';
import { ROOM } from './config.js';
import { emptyState, reduce, songItem, mediaItem, BACKGROUNDS, BACKGROUND_INFO, PRESETS, PRESET_INFO, STREAM_LAYOUTS, ILLUSTRATION_SIZES, MARK_COLORS, PLAY_LEVELS, PLACES, SCRIPTURE_LOOKS, SCRIPTURE_INFO, SCRIPTURE_GROUPS, SCRIPTURE_MOTIONS, TEXT_SIZES, TEXT_SIZE_NAMES, stepSize, BALANCE_STEPS, BALANCE_NAMES, scriptureLookOf, stepsOf, lookOf, slideWords, markKey } from './state.js';
import { loadSongs, saveSongs, visibleSongs, upsertSong, removeSong, searchSongs, mergeSongs, exportLibrary, importLibrary } from './library.js';
import { parseRef, bookByCode, BOOKS, formatRef } from './books.js';
import { VerseIndex, fillIndex, highlight } from './search.js';
import { spokenRef, refText } from './spoken.js';
import { Listener, canListen, SPEECH_LANGS } from './voice.js';
import { readFollowKeys, saveFollowKeys, followCommand, validKey, FOLLOW_KEYS, FOLLOW_KEY_NAMES } from './keys.js';
import { allVersions, importVersion, removeVersion, passageItem, BUILTIN_VERSIONS, loadBook, versionById, isMany } from './bible.js';
import { onlineConfig, saveOnlineConfig, listBibles } from './online.js';
import { shareConfig, saveShareConfig, isSharing, syncSongs, connectShare, setupLink, readSetupLink, TOKEN_URL } from './share.js';
import { relayConfig, cloudConfigured, loadSession, captureSession, sendMagicLink, signOut, pullSongs, pushSongs } from './cloud.js';
import { canCast, castTo, displayPermission, extraDisplays, openOn, displayOf, platform } from './cast.js';
import { fontsReady, scriptureFit } from './measure.js';
import { myMedia, addMediaFiles, addMediaUrl, removeMedia, onMediaChange } from './media.js';
import { Orbit } from './orbit.js';
import { SongEditor } from './editor.js';
import qrcode from '../../vendor/qrcode.js';

const LS_PREFS = 'ls-remote-prefs';
const LS_RECENT_REFS = 'ls-recent-refs';
const LS_DISPLAYS = 'ls-displays';

const read = (k, d) => {
  try {
    const v = JSON.parse(localStorage.getItem(k));
    return v == null ? d : v;
  } catch {
    return d;
  }
};
const write = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* storage full or blocked */
  }
};

// ------------------------------------------------------------------ this console: theme, layout, font

// Per laptop, never sent to the screens. Kept as { theme, layout, font, dark } under ls-ui and applied as
// data-theme / data-layout / data-font on <html>; the inline script in index.html applies it before the first paint.
const LS_UI = 'ls-ui';
const THEMES = {
  midnight: { name: 'Midnight', hint: 'The church purple on near-black. Calm in a dim hall.', sw: ['#0f0c15', '#6b47a8', '#e3b75a'], bar: '#0e0b14' },
  studio: { name: 'Studio', hint: 'Graphite and amber, like broadcast software. The least glare in a dark hall.', sw: ['#18191b', '#8a5a1a', '#dca24a'], bar: '#111213' },
  daylight: { name: 'Daylight', hint: 'Light, for bright rooms and rehearsals. High contrast throughout.', sw: ['#f3f1ec', '#5a3a94', '#8a5a00'], bar: '#f3f1ec' },
  kampala: { name: 'Kampala', hint: 'Bark brown, terracotta and gold, after barkcloth and kitenge.', sw: ['#1f1711', '#a94e28', '#e2ae50'], bar: '#16100b' },
};
const LAYOUTS = {
  console: { name: 'Console', hint: 'Library, live slide and outputs side by side.' },
  focus: { name: 'Focus', hint: 'A big live picture for running Next and Back. The library and the outputs open from the side rails (Esc closes them).' },
  compact: { name: 'Compact', hint: 'Tighter, for a 1366 × 768 laptop: the live picture beside Next and Back, a narrow outputs column.' },
  orbit: {
    name: 'Orbit',
    hint: 'The floating console: orbs drift around the live picture, waiting. Touch one and it opens; close it and it floats back. While a passage is up the orbs slip to the bottom edge and the reading takes the room. Google, the calendar of verses and the sermon board live here.',
  },
};
const FONTS = {
  montserrat: { name: 'Montserrat', hint: 'The church type, as on the TV.', family: "'Montserrat', sans-serif" },
  system: { name: 'System', hint: "The laptop's own type (Segoe UI, San Francisco): crisp and compact.", family: "system-ui, -apple-system, 'Segoe UI', sans-serif" },
  serif: { name: 'Serif', hint: 'Source Serif, like a printed Bible.', family: "'Source Serif 4', Georgia, serif" },
};
const one = (map, k, d) => (typeof k === 'string' && Object.prototype.hasOwnProperty.call(map, k) ? k : d);
const uiOf = (u) => ({
  theme: one(THEMES, u && u.theme, 'midnight'),
  layout: one(LAYOUTS, u && u.layout, 'console'),
  font: one(FONTS, u && u.font, 'montserrat'),
  // The dark theme the light switch in the header goes back to.
  dark: u && u.dark !== 'daylight' ? one(THEMES, u.dark, 'midnight') : 'midnight',
});
const applyUi = (ui) => {
  const d = document.documentElement;
  d.dataset.theme = ui.theme;
  d.dataset.layout = ui.layout;
  d.dataset.font = ui.font;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = THEMES[ui.theme].bar;
};
function useUi() {
  const [ui, setRaw] = useState(() => uiOf(read(LS_UI, {})));
  const setUi = (patch) => {
    const next = uiOf({ ...ui, ...patch });
    setRaw(next);
    write(LS_UI, next);
    applyUi(next);
  };
  return [ui, setUi];
}

// Line icons for the rails and the light switch (stroke follows the text colour); fresh each call.
const icon = (d) => html`<svg class="ic" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICONS = {
  songs: () => icon(html`<path d="M9 18V6l11-2v12" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" />`),
  scripture: () => icon(html`<path d="M12 6.5C9 4.6 6 4.4 3 5.4v13.2c3-1 6-.8 9 1.1 3-1.9 6-2.1 9-1.1V5.4c-3-1-6-.8-9 1.1z" /><path d="M12 6.5v13.2" />`),
  media: () => icon(html`<rect x="3" y="4.5" width="18" height="15" rx="2" /><circle cx="9" cy="10" r="1.8" /><path d="M21 15.5l-5-5-9.5 9" />`),
  settings: () => icon(html`<path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" />`),
  tv: () => icon(html`<rect x="3" y="4.5" width="18" height="12" rx="2" /><path d="M8.5 20.5h7M12 16.5v4" />`),
  stream: () => icon(html`<circle cx="12" cy="12" r="1.8" /><path d="M8.3 8.3a5.2 5.2 0 0 0 0 7.4M15.7 8.3a5.2 5.2 0 0 1 0 7.4M5.4 5.4a9.3 9.3 0 0 0 0 13.2M18.6 5.4a9.3 9.3 0 0 1 0 13.2" />`),
  sun: () => icon(html`<circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />`),
  moon: () => icon(html`<path d="M20 14.6A8 8 0 0 1 9.4 4a8 8 0 1 0 10.6 10.6z" />`),
};

/** The header's light switch: Daylight, or back to the dark theme used before. */
function LightSwitch({ ui, setUi }) {
  const light = ui.theme === 'daylight';
  const label = light ? `Back to ${THEMES[ui.dark].name}` : 'Daylight theme, for a bright room';
  return html`<button class="icon-btn" onClick=${() => setUi(light ? { theme: ui.dark } : { theme: 'daylight', dark: ui.theme })} title=${label} aria-label=${label}>
    ${light ? ICONS.moon() : ICONS.sun()}
  </button>`;
}

/** Settings → This console: theme, layout and font for this laptop. */
function ThisConsole({ ui, setUi, wide }) {
  const seg = (key, map, label, inner) => html`<div class=${`ui-seg ui-${key}`} role="group" aria-label=${label}>
    ${Object.entries(map).map(
      ([k, v]) => html`<button class=${ui[key] === k ? 'on' : ''} aria-pressed=${ui[key] === k} onClick=${() => setUi({ [key]: k })}>${inner ? inner(k, v) : v.name}</button>`,
    )}
  </div>`;
  return html`<section class="card this-console">
    <h2>This console <span class="muted small">· this laptop only; the TV and the stream stay as they are</span></h2>
    <div class="field">
      <span>Theme</span>
      ${seg('theme', THEMES, 'Theme', (k, v) => html`<i class="theme-sw" style=${`--s1:${v.sw[0]};--s2:${v.sw[1]};--s3:${v.sw[2]}`}></i>${v.name}`)}
      <small class="muted">${THEMES[ui.theme].hint}</small>
    </div>
    <div class="field">
      <span>Layout</span>
      ${seg('layout', LAYOUTS, 'Layout')}
      <small class="muted">${LAYOUTS[ui.layout].hint}${wide ? '' : ' Layouts apply on a laptop-wide window; a phone keeps its tabs.'}</small>
    </div>
    <div class="field">
      <span>Font</span>
      ${seg('font', FONTS, 'Font', (k, v) => html`<span style=${`font-family:${v.family}`}>${v.name}</span>`)}
      <small class="muted">${FONTS[ui.font].hint}</small>
    </div>
  </section>`;
}

// The church's own channel needs nothing in the address; any other is carried as ?room=.
const roomQuery = (room) => (room === normalizeCode(ROOM) ? '' : `room=${room}`);
const screenUrl = (room, extra = '') => {
  const q = [roomQuery(room), extra].filter(Boolean).join('&');
  return new URL(`screen.html${q ? `?${q}` : ''}`, location.href).href;
};
const remoteUrl = (room) => new URL(roomQuery(room) ? `./?${roomQuery(room)}` : './', location.href).href;
const shortUrl = (u) => u.replace(/^https?:\/\//, '').replace(/\/$/, '');

// ------------------------------------------------------------------ small parts

const WIDE = '(min-width: 1100px)';
function useWide() {
  const [wide, setWide] = useState(() => matchMedia(WIDE).matches);
  useEffect(() => {
    const m = matchMedia(WIDE);
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}

let showToast = () => {};
function Toast() {
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    let t;
    showToast = (m) => {
      setMsg(m);
      clearTimeout(t);
      t = setTimeout(() => setMsg(null), 3200);
    };
  }, []);
  return msg ? html`<div class="toast" role="status">${msg}</div>` : null;
}

function Qr({ text, size = 160 }) {
  const svg = useMemo(() => {
    const q = qrcode(0, 'M');
    q.addData(text);
    q.make();
    return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  }, [text]);
  return html`<div class="qr" style=${`width:${size}px;height:${size}px`} dangerouslySetInnerHTML=${{ __html: svg }}></div>`;
}

async function copy(text, what = 'Link') {
  try {
    await navigator.clipboard.writeText(text);
    showToast(`${what} copied`);
  } catch {
    prompt(`Copy this ${what.toLowerCase()}`, text);
  }
}

// ------------------------------------------------------------------ outputs: TV and stream

const WIN = { tv: 'lyric-screen', stream: 'lyric-stream' };
const withParam = (url, q) => `${url}${url.includes('?') ? '&' : '?'}${q}`;
const WHAT = { tv: 'The TV picture', stream: 'The stream feed' };

/**
 * Everything behind "TV picture", "Stream feed" and "Cast…". Each output has its own display,
 * remembered on this laptop (TV → one, ATEM → the other); the windows open straight from the
 * click so the browser lets them arrive fullscreen, and each shows a badge saying which it is.
 */
function useOutputs(room, link) {
  const [busy, setBusy] = useState('');
  const [perm, setPerm] = useState('prompt');
  const [displays, setDisplays] = useState([]);
  const [assign, setAssignRaw] = useState(() => read(LS_DISPLAYS, {}));
  const [, tick] = useState(0);
  const wins = useRef({ tv: null, stream: null });
  const tvUrl = screenUrl(room);
  const streamUrl = screenUrl(room, 'out=stream');

  const setAssign = (a) => {
    setAssignRaw(a);
    write(LS_DISPLAYS, a);
  };

  useEffect(() => {
    displayPermission().then(async (p) => {
      setPerm(p);
      if (p === 'granted') setDisplays(await extraDisplays(setDisplays));
    });
    // Open / closed changes as the operator closes windows; re-render only when it does.
    let last = '';
    const t = setInterval(() => {
      const now = ['tv', 'stream'].map((k) => (wins.current[k] && !wins.current[k].closed ? '1' : '0')).join('');
      if (now !== last) {
        last = now;
        tick((n) => n + 1);
      }
    }, 3000);
    return () => clearInterval(t);
  }, []);

  // Asks the browser once to see the displays (a click is needed for the prompt).
  const allow = async () => {
    const d = await extraDisplays(setDisplays);
    setDisplays(d);
    setPerm(await displayPermission());
  };

  // Which display each output uses: the remembered one, else a guess from the display's name
  // (ATEM / Blackmagic / HDMI → the stream; TV / wireless / a TV brand → the TV), else by position.
  const looksLike = (d, which) =>
    (which === 'stream' ? /atem|blackmagic|bmd|hdmi|capture/i : /\btv\b|wireless|miracast|airplay|cast|samsung|lg\b|sony|hisense|tcl|philips|panasonic/i).test(d.label);
  const displayFor = (which) => {
    if (!displays.length) return null;
    const chosen = displays.find((d) => d.id === assign[which]);
    if (chosen) return chosen;
    const other = displays.find((d) => d.id === assign[which === 'tv' ? 'stream' : 'tv']);
    const free = displays.filter((d) => d !== other);
    if (!free.length) return displays[0];
    const named = free.find((d) => looksLike(d, which)) || free.find((d) => !looksLike(d, which === 'tv' ? 'stream' : 'tv'));
    if (named) return named;
    return which === 'tv' ? free[0] : free[free.length - 1];
  };
  const isOpen = (which) => {
    const w = wins.current[which];
    return Boolean(w && !w.closed);
  };

  const open = (which) => {
    const d = displayFor(which);
    const url = which === 'tv' ? tvUrl : streamUrl;
    const w = openOn(d ? withParam(url, 'badge=1') : url, WIN[which], d);
    wins.current[which] = w;
    if (!w) {
      showToast('The browser blocked the window. Allow pop-ups for this site, then try again.');
      return;
    }
    if (!d) {
      showToast(`${WHAT[which]} opened. Drag it onto the ${which === 'tv' ? 'TV' : 'ATEM display'} and click it once for fullscreen.`);
      return;
    }
    showToast(`${WHAT[which]} is on ${d.label}.`);
    // A moment later, check it really landed there (the OS can refuse the position).
    setTimeout(() => {
      const at = displayOf(w, displays);
      if (at && at.id !== d.id) showToast(`${WHAT[which]} ended up on ${at.label}. Use Swap if the TV and the ATEM are the wrong way round.`);
      tick((n) => n + 1);
    }, 1500);
  };

  const swap = () => {
    const tv = displayFor('tv');
    const st = displayFor('stream');
    if (!tv || !st) return;
    setAssign({ tv: st.id, stream: tv.id });
    const reopen = [];
    for (const which of ['tv', 'stream']) {
      if (isOpen(which)) {
        wins.current[which].close();
        wins.current[which] = null;
        reopen.push(which);
      }
    }
    // Only one window can open per click; the first reopens now, the other on the next click.
    if (reopen.length) {
      const first = reopen[0];
      const d = first === 'tv' ? st : tv;
      wins.current[first] = openOn(withParam(first === 'tv' ? tvUrl : streamUrl, 'badge=1'), WIN[first], d);
      showToast(reopen.length > 1 ? `Swapped. Now click ${first === 'tv' ? 'Stream feed' : 'TV picture'} to reopen it too.` : 'Swapped.');
    } else showToast('Swapped: the next windows open the other way round.');
  };

  const cast = async () => {
    setBusy('cast');
    try {
      const conn = await castTo(tvUrl);
      link.addPort(conn);
      showToast('Casting to the TV');
    } catch (e) {
      if (!/abort|cancel|dismiss|not ?allowed/i.test(`${e.name} ${e.message}`)) showToast(e.message || 'Could not cast');
    } finally {
      setBusy('');
    }
  };

  /** The display picker for one output (nothing to pick with one display). */
  const picker = (which) => {
    if (!displays.length) return null;
    const cur = displayFor(which);
    return html`<label class="disp">
      <span class="muted small">on</span>
      <select value=${cur ? cur.id : ''} onChange=${(e) => setAssign({ ...assign, [which]: e.target.value })} disabled=${displays.length < 2}>
        ${displays.map((d) => html`<option value=${d.id}>${d.label} · ${d.width}×${d.height}</option>`)}
      </select>
    </label>`;
  };

  // The one-off permission, or the fallback when the browser cannot place windows.
  const setup =
    perm === 'unsupported'
      ? html`<p class="muted small">This browser cannot place windows on a display: each window opens on the laptop, drag it onto the right screen and click it once. Chrome or Edge can do it for you.</p>`
      : perm !== 'granted'
        ? html`<button class="chip" onClick=${allow}>Allow the browser to see your displays</button>`
        : displays.length
          ? null
          : html`<p class="muted small">No other display yet. Join the TV (wireless or HDMI) and plug the ATEM in; they appear here by themselves.</p>`;

  return {
    busy,
    cast,
    openTv: () => open('tv'),
    openStream: () => open('stream'),
    swap,
    isOpen,
    displays,
    displayFor,
    picker,
    setup,
    tvUrl,
    streamUrl,
  };
}

function WirelessSteps() {
  const os = platform();
  if (os === 'windows')
    return html`<span>Press <kbd>Windows</kbd> + <kbd>K</kbd>, pick the TV, and choose <b>Extend</b> (<kbd>Windows</kbd> + <kbd>P</kbd> → Extend). Then click <b>TV picture</b>.</span>`;
  if (os === 'mac')
    return html`<span>Open <b>Control Centre → Screen Mirroring</b>, pick the TV (AirPlay), and choose <b>Use As Separate Display</b>. Then click <b>TV picture</b>.</span>`;
  return html`<span>Join the TV as a wireless display in the laptop's display settings, set it to <b>extend</b>, then click <b>TV picture</b>.</span>`;
}

const ATEM_STEPS = html`<ol class="small">
  <li>HDMI from the laptop into a spare ATEM input (say input 4). Set the laptop to <b>extend</b> to it, not mirror.</li>
  <li>Click <b>Stream feed</b> here and pick that display.</li>
  <li>In ATEM Software Control open <b>Palettes → Upstream Key 1</b>, choose <b>Luma</b>, and set both <b>Fill Source</b> and <b>Key Source</b> to input 4.</li>
  <li>Set <b>Clip</b> around 10% and <b>Gain</b> around 50% so the black disappears and the white text stays. Leave <b>Invert Key</b> off.</li>
  <li>Press <b>KEY 1</b> on the ATEM. The text now sits over whatever camera is live.</li>
</ol>`;

/** The full "Show on TV & stream" sheet: every way, with the steps. */
function Outputs({ room, link, info, onClose }) {
  const o = useOutputs(room, link);
  const tvPage = new URL('tv.html', location.href).href;

  return html`<div class="sheet outputs" role="dialog" aria-label="Outputs">
    <header class="sheet-head">
      <button class="ghost" onClick=${onClose}>Done</button>
      <b>Show on TV & stream</b>
      <span></span>
    </header>
    <div class="outputs-body">
      <section class="card best">
        <h2>Best with one laptop</h2>
        <p class="small">The laptop's <b>HDMI cable goes to the ATEM</b> (stream feed). The <b>TV gets the picture wirelessly</b>: Cast, or the TV as a wireless display.
        Everything is driven from this window; both outputs follow it.</p>
      </section>

      <section class="card">
        <h2>Hall TV <span class=${`pill ${info.peers.screen || info.ports ? 'ok' : ''}`}>${info.peers.screen || info.ports ? 'connected' : 'not yet'}</span></h2>
        <div class="out-grid">
          <div class="out-btn static">
            <span class="out-ic">📶</span><b>TV as a wireless display</b>
            <span class="muted small"><${WirelessSteps} /></span>
            <button class="primary" onClick=${o.openTv}>TV picture</button>
          </div>
          ${canCast() &&
          html`<button class="out-btn" onClick=${o.cast} disabled=${o.busy === 'cast'}>
            <span class="out-ic">📡</span><b>Cast to the TV</b>
            <span class="muted small">Chromecast, Google TV or Android TV on the same Wi-Fi. Chrome shows the list.</span>
          </button>`}
          <button class="out-btn" onClick=${o.openTv}>
            <span class="out-ic">🖥</span><b>TV on HDMI</b>
            <span class="muted small">The TV is plugged into this laptop. Opens the picture on it.</span>
          </button>
          <div class="out-btn static">
            <span class="out-ic">📺</span><b>The TV's own browser</b>
            <span class="muted small">On the TV open <b>${shortUrl(tvPage)}</b>. Or scan:</span>
            <${Qr} text=${o.tvUrl} size=${132} />
            <button class="chip ghost" onClick=${() => copy(o.tvUrl, 'TV link')}>Copy TV link</button>
          </div>
        </div>
        ${info.cloud === 'off' &&
        html`<p class="note small">The relay is off in <code>src/lyrics/config.js</code>, so only windows of this browser (and Cast) can follow this remote.</p>`}
      </section>

      <section class="card">
        <h2>Stream · ATEM / Blackmagic</h2>
        <p class="muted small">A second picture made for the switcher: lower thirds on black, so the ATEM keys it over the camera.</p>
        ${o.setup}
        ${o.displays.length > 0 && html`<div class="row wrap">${o.picker('tv')}${o.picker('stream')}${o.displays.length > 1 && html`<button class="ghost" onClick=${o.swap}>⇄ Swap</button>`}</div>`}
        <div class="out-grid">
          <button class="out-btn" onClick=${o.openStream}>
            <span class="out-ic">🎬</span><b>Stream feed</b>
            <span class="muted small">Opens on the display that goes to the ATEM (the laptop's HDMI).</span>
          </button>
          <div class="out-btn static">
            <span class="out-ic">🎥</span><b>OBS</b>
            <span class="muted small">Browser Source, 1920×1080, with this link (transparent):</span>
            <button class="chip ghost" onClick=${() => copy(`${o.streamUrl}${o.streamUrl.includes('?') ? '&' : '?'}transparent=1`, 'OBS link')}>Copy OBS link</button>
          </div>
        </div>
        <details>
          <summary>Set up the ATEM Mini once</summary>
          ${ATEM_STEPS}
        </details>
      </section>

      <section class="card">
        <h2>Another remote</h2>
        <p class="muted small">A phone or a second laptop can control the same screens: open <b>${shortUrl(remoteUrl(room))}</b> or scan.</p>
        <div class="row wrap">
          <${Qr} text=${remoteUrl(room)} size=${120} />
          <button class="chip ghost" onClick=${() => copy(remoteUrl(room), 'Remote link')}>Copy remote link</button>
        </div>
      </section>
    </div>
  </div>`;
}

/** The laptop console's right column: what the TV and the stream show, and one click to put them up. */
function OutputsPanel({ room, link, info, state, act, onMore }) {
  const o = useOutputs(room, link);
  const tvOn = info.peers.screen > 0 || info.ports > 0;
  const layout = state.streamLayout || 'lowerthird';
  const status = (which) => (o.isOpen(which) ? html`<span class="pill ok">open</span>` : html`<span class="pill">closed</span>`);
  return html`<div class="out-panel">
    <section>
      <div class="row between"><h2>TV</h2>${status('tv')}</div>
      <div class="mini"><${Fit}><${Stage} state=${state} out="tv" still=${true} /><//></div>
      <div class="row wrap">
        <button class="primary" onClick=${o.openTv} title="Opens fullscreen on the TV's display">TV picture</button>
        ${canCast() && html`<button onClick=${o.cast} disabled=${o.busy === 'cast'}>Cast…</button>`}
        ${o.picker('tv')}
      </div>
      <p class="muted small"><${WirelessSteps} /></p>
    </section>
    <section>
      <div class="row between"><h2>Stream · ATEM</h2>${status('stream')}</div>
      <div class="mini"><${Fit}><${Stage} state=${state} out="stream" layout=${layout} background=${state.streamBg === 'tv' ? 'auto' : 'key'} still=${true} /><//></div>
      <div class="row wrap">
        <button class="primary" onClick=${o.openStream} title="Opens fullscreen on the display that goes to the ATEM">Stream feed</button>
        <div class="seg">
          <button class=${layout === 'lowerthird' ? 'on' : ''} onClick=${() => act({ type: 'set', patch: { streamLayout: 'lowerthird' } })}>Lower thirds</button>
          <button class=${layout === 'full' ? 'on' : ''} onClick=${() => act({ type: 'set', patch: { streamLayout: 'full' } })}>Full</button>
        </div>
        ${o.picker('stream')}
      </div>
      <p class="muted small">Illustrations and the TV's pictures never go here; the stream gets the words only.</p>
      <details>
        <summary class="small">ATEM keyer setup</summary>
        ${ATEM_STEPS}
      </details>
    </section>
    <section class="displays">
      ${o.setup}
      ${o.displays.length > 1 &&
      html`<div class="row between wrap">
        <span class="small muted">Each window shows <b>TV</b> or <b>STREAM FEED</b> for 5 s when it opens.</span>
        <button class="ghost" onClick=${o.swap} title="The TV and the ATEM are the wrong way round">⇄ Swap TV and ATEM</button>
      </div>`}
      ${tvOn && !o.isOpen('tv') && html`<p class="muted small">A TV is connected another way (Cast or the TV's own browser).</p>`}
    </section>
    <button class="ghost more" onClick=${onMore}>More ways: TV browser, QR codes, OBS, another remote ›</button>
  </div>`;
}

// ------------------------------------------------------------------ emphasis: tap a word


/** Re-renders when the follow letters are changed in Settings. */
function useFollowKeys() {
  const [keys, setKeys] = useState(readFollowKeys);
  useEffect(() => {
    const f = () => setKeys(readFollowKeys());
    addEventListener('ls-keys', f);
    return () => removeEventListener('ls-keys', f);
  }, []);
  return keys;
}

/** "J / F", the follow letters chosen on this laptop. */
function FollowKeyHint() {
  const k = useFollowKeys();
  return `${k.next.toUpperCase()} / ${k.prev.toUpperCase()}`;
}

/** Following the singer word by word: the keys, as buttons too, and where the cursor is. */
function FollowBar({ state, act }) {
  const keys = useFollowKeys();
  const slide = state.item.slides[state.index];
  const n = slide ? slide.lines.join(' ').split(/\s+/).filter(Boolean).length : 0;
  const wc = Array.isArray(state.wc) ? state.wc : null;
  const kbd = (k) => html`<kbd>${k.toUpperCase()}</kbd>`;
  return html`<div class="follow-bar">
    <span class="small"><b>Follow the singer</b>
      <span class="muted"> · ${wc ? (wc[0] === wc[1] ? `word ${wc[0] + 1} of ${n}` : `line, words ${wc[0] + 1}–${wc[1] + 1} of ${n}`) : 'off'}</span></span>
    <span class="seg" role="group" aria-label="Follow the singer">
      <button onClick=${() => act({ type: 'word', dir: -1 })} title="Previous word">${kbd(keys.prev)} ‹ word</button>
      <button onClick=${() => act({ type: 'word', dir: 1 })} title="Next word (after the last word, the next slide)">word › ${kbd(keys.next)}</button>
      <button onClick=${() => act({ type: 'word', dir: 1, unit: 'line' })} title="Light the next whole line">line › ${kbd(keys.line)}</button>
      <button onClick=${() => act({ type: 'word', off: true })} disabled=${!wc}>Off</button>
    </span>
  </div>`;
}

function Emphasis({ state, act }) {
  const [pen, setPen] = useState({ c: 'gold', b: false, follow: false });
  const item = state.item;
  const slide = item && item.slides[state.index];
  const groups = slideWords(item, slide);
  if (!groups.length) return null;
  const key = markKey(item, state.index);
  const marks = (state.marks && state.marks[key]) || {};
  const any = Object.keys(state.marks || {}).some((k) => Object.keys(state.marks[k]).length);
  return html`<div class="emph">
    <div class="row wrap between">
      <span class="small"><b>Emphasis</b> <span class="muted">· ${pen.follow ? 'tap a word to follow from there' : 'tap a word'}</span></span>
      <div class="row wrap">
        ${Object.entries(MARK_COLORS).map(
          ([k, v]) => html`<button class=${`swatch ${pen.c === k && !pen.follow ? 'on' : ''}`} style=${`--c:${v}`} onClick=${() => setPen({ ...pen, c: k, follow: false })} aria-label=${`${k} pen`} title=${k}></button>`,
        )}
        <button class=${`chip ${pen.b ? 'on' : ''}`} onClick=${() => setPen({ ...pen, b: !pen.b, follow: false })} title="Slant the word"><span class="bend">Bend</span></button>
        ${item.kind === 'song' &&
        html`<button class=${`chip follow-pen ${pen.follow ? 'on' : ''}`} onClick=${() => setPen({ ...pen, follow: !pen.follow })} title="Tap a word to follow the singer from there">▶ Follow</button>`}
        <button class="chip ghost" onClick=${() => act({ type: 'unmark', slide: key })} disabled=${!Object.keys(marks).length}>Clear slide</button>
        ${any && html`<button class="chip ghost" onClick=${() => act({ type: 'unmark' })}>Clear all</button>`}
      </div>
    </div>
    ${groups.map(
      (g) => html`<div class="emph-words">
        ${g.label && html`<span class="muted small lab">${g.label}</span>`}
        ${g.words.map((w, i) => {
          const id = `${g.field}:${i}`;
          const m = marks[id];
          const wc = g.field === 'l' && Array.isArray(state.wc) ? state.wc : null;
          const at = wc ? (i < wc[0] ? 'sung' : i <= wc[1] ? 'cur' : '') : '';
          return html`<button
            class=${`word ${m ? `mk-${m.c}` : ''} ${m && m.b ? 'bend' : ''} ${at}`}
            onClick=${() => (pen.follow && g.field === 'l' ? act({ type: 'word', at: i }) : act({ type: 'mark', slide: key, word: id, mark: { c: pen.c, b: pen.b } }))}
          >
            ${w}
          </button>`;
        })}
      </div>`,
    )}
  </div>`;
}

// ------------------------------------------------------------------ live

// A short verse every look can show, for the gallery's thumbnails.
const SAMPLE_VERSE = {
  kind: 'scripture',
  id: 'sample',
  title: 'Zabbuli 23 : 1',
  book: { lg: 'Zabbuli', en: 'Psalms', code: 'PSA' },
  chapter: 23,
  v1: 1,
  v2: 1,
  versions: ['Luganda 1968', 'KJV'],
  secondaryLabel: 'KJV',
  slides: [
    {
      ref: 'Zabbuli 23 : 1 · Psalm 23 : 1',
      primary: 'Mukama ye musumba wange; seetaagenga:',
      secondary: 'The LORD is my shepherd; I shall not want.',
      verses: [{ verse: 1, part: '', primary: 'Mukama ye musumba wange; seetaagenga:', secondary: 'The LORD is my shepherd; I shall not want.' }],
    },
  ],
};

/** Renders its children only once scrolled into view (the gallery's thumbnails are real stages). */
function Lazy({ children, class: cls }) {
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return undefined;
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setSeen(true), { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return html`<div class=${cls} ref=${ref}>${seen ? children : null}</div>`;
}

/** Text size: smaller / the size name / larger. */
function SizeControl({ value, onChange, label = 'Text size' }) {
  const v = TEXT_SIZES.includes(Number(value)) ? Number(value) : 1;
  return html`<span class="seg size-ctl" role="group" aria-label=${label}>
    <button onClick=${() => onChange(stepSize(v, -1))} disabled=${v === TEXT_SIZES[0]} title="Smaller (−)" aria-label="Smaller">A−</button>
    <button class=${v !== 1 ? 'on' : ''} onClick=${() => onChange(1)} title="Back to the standard size">${TEXT_SIZE_NAMES[v]}</button>
    <button onClick=${() => onChange(stepSize(v, 1))} disabled=${v === TEXT_SIZES[TEXT_SIZES.length - 1]} title="Larger (+)" aria-label="Larger">A+</button>
  </span>`;
}

/** How big the language below is next to the one on top. */
function BalanceControl({ value, onChange }) {
  const v = BALANCE_STEPS.includes(Number(value)) ? Number(value) : 1;
  const i = BALANCE_STEPS.indexOf(v);
  const step = (d) => onChange(BALANCE_STEPS[Math.max(0, Math.min(BALANCE_STEPS.length - 1, i + d))]);
  return html`<span class="seg size-ctl balance" role="group" aria-label="Size of the language below" title="How big the language below (usually English) is next to the one read aloud">
    <button onClick=${() => step(-1)} disabled=${i === 0} aria-label="Language below smaller">a−</button>
    <button class=${v !== 1 ? 'on' : ''} onClick=${() => onChange(1)} title="Back to the look's own balance">Below · ${BALANCE_NAMES[v]}</button>
    <button onClick=${() => step(1)} disabled=${i === BALANCE_STEPS.length - 1} aria-label="Language below bigger">a+</button>
  </span>`;
}

/** Every scripture look as a small live picture, in two groups: pages and cards. */
function LookGallery({ state, setLook, onClose }) {
  const look = scriptureLookOf(state);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
  const tile = (k) => {
    const st = { ...emptyState(), rev: 1, mode: 'show', item: SAMPLE_VERSE, index: 0, sLook: k, sFont: state.sFont, quotes: state.quotes, progress: false, reveal: false };
    return html`<button class=${`look-tile ${look === k ? 'on' : ''}`} onClick=${() => setLook({ sLook: k })} title=${SCRIPTURE_INFO[k].hint}>
      <${Lazy} class="look-pic"><${Fit}><${Stage} state=${st} still=${true} /><//><//>
      <span class="look-name"><i class="sw" style=${`--a:${SCRIPTURE_INFO[k].sw[0]};--b:${SCRIPTURE_INFO[k].sw[1]}`}></i>${SCRIPTURE_INFO[k].name}</span>
    </button>`;
  };
  return html`<div class="sheet gallery" role="dialog" aria-label="Scripture looks">
    <header class="sheet-head">
      <button class="ghost" onClick=${onClose}>Done</button>
      <b>Scripture looks</b>
      <span class="muted small">${SCRIPTURE_INFO[look].name}</span>
    </header>
    <div class="gallery-body">
      ${Object.entries(SCRIPTURE_GROUPS).map(
        ([g, label]) => html`<section>
          <h2>${label} <span class="muted small">${g === 'page' ? 'the words on the page' : 'the words on a card, a book or a stone'}</span></h2>
          <div class="look-grid">${SCRIPTURE_LOOKS.filter((k) => SCRIPTURE_INFO[k].group === g).map(tile)}</div>
        </section>`,
      )}
    </div>
  </div>`;
}

/** The scripture look, motion and reading switches (under the live slide and in Settings). */
function ScriptureControls({ state, act, setLook, hints = false }) {
  const look = scriptureLookOf(state);
  const [open, setOpen] = useState(false);
  const motion = SCRIPTURE_MOTIONS[state.sMotion] ? state.sMotion : 'reveal';
  const i = SCRIPTURE_LOOKS.indexOf(look);
  const step = (d) => setLook({ sLook: SCRIPTURE_LOOKS[(i + d + SCRIPTURE_LOOKS.length) % SCRIPTURE_LOOKS.length] });
  return html`<div class="scrip-ctl">
      <div class="row look-pick">
        <button class="ghost arrow" onClick=${() => step(-1)} aria-label="Previous look">‹</button>
        <button class="look-btn" onClick=${() => setOpen(true)} title="All scripture looks">
          <i class="sw" style=${`--a:${SCRIPTURE_INFO[look].sw[0]};--b:${SCRIPTURE_INFO[look].sw[1]}`}></i>
          <b>${SCRIPTURE_INFO[look].name}</b>
          <span class="muted small">${SCRIPTURE_GROUPS[SCRIPTURE_INFO[look].group]} · ${i + 1} of ${SCRIPTURE_LOOKS.length}</span>
          <span class="more">All looks ▾</span>
        </button>
        <button class="ghost arrow" onClick=${() => step(1)} aria-label="Next look">›</button>
      </div>
      <div class="wordplay row wrap">
        <span class="seg" role="group" aria-label="Motion">
          ${Object.entries(SCRIPTURE_MOTIONS).map(
            ([k, l]) => html`<button class=${motion === k ? 'on' : ''} onClick=${() => act({ type: 'set', patch: { sMotion: k } })}>${l}</button>`,
          )}
        </span>
      </div>
      <div class="wordplay row wrap">
        <span class="seg" role="group" aria-label="Type">
          <button class=${state.sFont !== 'sans' ? 'on' : ''} onClick=${() => setLook({ sFont: 'serif' })} title="Source Serif, like a printed Bible">Serif</button>
          <button class=${state.sFont === 'sans' ? 'on' : ''} onClick=${() => setLook({ sFont: 'sans' })} title="Montserrat, like the lyrics">Sans</button>
        </span>
        <${SizeControl} value=${state.sSize} onChange=${(v) => setLook({ sSize: v })} label="Scripture text size" />
        <${BalanceControl} value=${state.sBalance} onChange=${(v) => setLook({ sBalance: v })} />
        <button class=${`chip ${state.sWide ? 'on' : ''}`} onClick=${() => setLook({ sWide: !state.sWide })} title="Run the words edge to edge across the screen (a slim margin instead of the usual border)">⟷ Edge to edge</button>
        <span class="seg" role="group" aria-label="Reading">
          <button class=${state.reveal !== false ? 'on' : ''} onClick=${() => act({ type: 'set', patch: { reveal: state.reveal === false } })} title="Next brings the next verse; verses already read dim">Verse by verse</button>
          <button class=${state.progress !== false ? 'on' : ''} onClick=${() => act({ type: 'set', patch: { progress: state.progress === false } })} title="A thin bar along the bottom shows how far through the passage you are">Progress bar</button>
          <button class=${state.quotes !== false ? 'on' : ''} onClick=${() => act({ type: 'set', patch: { quotes: state.quotes === false } })} title="Quotation marks around the words">“Quotes”</button>
        </span>
      </div>
    </div>
    ${open && html`<${LookGallery} state=${state} setLook=${setLook} onClose=${() => setOpen(false)} />`}
    ${hints &&
    html`<small class="muted">${SCRIPTURE_LOOKS.length} looks: ${SCRIPTURE_LOOKS.filter((k) => SCRIPTURE_INFO[k].group === 'page').length} pages and ${SCRIPTURE_LOOKS.filter((k) => SCRIPTURE_INFO[k].group === 'card').length} cards; ‹ › step through them, All looks shows them all. Motion: Gentle lines rise in turn; Page turn turns the old page over from its edge (the open Bible turns its right-hand leaf); Typing writes each word in; Reveal sweeps a soft edge of light across; Slide comes in from the right and leaves to the left. Calm mode always crossfades. Verse by verse: with several verses on a slide, Next reveals them one at a time and dims the ones already read. Each verse starts with its number; a verse that goes on to the next slide ends with … and continues with …; three dots at the corner say the passage goes on.</small>`}`;
}

/** A song's look and how its words play (the Live tab and the Orbit Looks orb). */
function SongLooks({ state, act }) {
  return html`<div class="looks chips" role="group" aria-label="Look">
      <button class=${`chip ${!state.look ? 'on' : ''}`} onClick=${() => act({ type: 'set', patch: { look: '' } })} title="Each song's own look">Song's own</button>
      ${PRESETS.map(
        (p) => html`<button class=${`chip ${state.look === p ? 'on' : ''}`} onClick=${() => act({ type: 'set', patch: { look: p } })} title=${PRESET_INFO[p].hint}>${PRESET_INFO[p].name}</button>`,
      )}
    </div>
    <div class="wordplay row wrap">
      <${SizeControl} value=${state.lSize} onChange=${(v) => act({ type: 'set', patch: { lSize: v } })} label="Lyrics text size" />
      <span class="seg play" role="group" aria-label="How much the words play">
        ${Object.entries(PLAY_LEVELS).map(
          ([k, l]) => html`<button class=${(state.play || 'mid') === k ? 'on' : ''} onClick=${() => act({ type: 'set', patch: { play: k } })}>${l}</button>`,
        )}
      </span>
      <span class="seg" role="group" aria-label="Mix">
        <button class=${state.mixFonts ? 'on' : ''} onClick=${() => act({ type: 'set', patch: { mixFonts: !state.mixFonts } })} title="A different font on each word">Mixed fonts</button>
        <button class=${state.hero ? 'on' : ''} onClick=${() => act({ type: 'set', patch: { hero: !state.hero } })} title="One word (or the second line) swells, like GOD I'M JUST / GRATEFUL">Hero word</button>
      </span>
      <span class="seg" role="group" aria-label="Where the words sit">
        ${Object.entries(PLACES).map(
          ([k, l]) => html`<button class=${(state.place || 'center') === k ? 'on' : ''} onClick=${() => act({ type: 'set', patch: { place: k } })}>${l}</button>`,
        )}
      </span>
    </div>`;
}

function Live({ state, act, info, goTab, onOutputs, wide, setLook }) {
  const item = state.item;
  const list = useRef(null);
  const swipe = useRef(null);
  const connected = info.peers.screen > 0 || info.ports > 0;

  useEffect(() => {
    const el = list.current && list.current.querySelector('.on');
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [state.index, item && item.id]);

  const onDown = (e) => (swipe.current = { x: e.clientX, y: e.clientY });
  const onUp = (e) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - s.y)) act({ type: dx < 0 ? 'next' : 'prev' });
  };

  const modeBtn = (mode, label) =>
    html`<button class=${`mode ${state.mode === mode ? 'on' : ''}`} onClick=${() => act({ type: 'mode', mode })}>${label}</button>`;

  // live-top (picture, Next / Back, modes) and live-rest are plain blocks in the Console layout;
  // Focus and Compact pin the top and scroll the rest (see the end of remote.css).
  return html`<div class="live">
    <div class="live-top">
    <div class="preview" onPointerDown=${onDown} onPointerUp=${onUp}>
      <${Fit}><${Stage} state=${state} still="bg" /><//>
      <span class="preview-tag">${state.mode === 'show' ? 'LIVE' : state.mode.toUpperCase()}</span>
    </div>
    <div class="nav">
      <button class="big" onClick=${() => act({ type: 'prev' })} aria-label="Previous slide">‹ Back</button>
      <button class="big primary" onClick=${() => act({ type: 'next' })} aria-label="Next slide">Next ›</button>
    </div>
    <div class="modes">${modeBtn('clear', 'Clear')}${modeBtn('black', 'Black')}${modeBtn('logo', 'Logo')}</div>
    </div>
    <div class="live-rest">
    ${item && item.kind === 'song' && html`<${SongLooks} state=${state} act=${act} />`}
    ${item && item.kind === 'scripture' && html`<${ScriptureControls} state=${state} act=${act} setLook=${setLook} />`}
    ${!connected &&
    !wide &&
    html`<button class="note-btn" onClick=${onOutputs}>
      <b>No TV connected yet.</b> <span>Tap to put the picture on the TV or the stream ›</span>
    </button>`}
    ${item && item.kind === 'song' && html`<${FollowBar} state=${state} act=${act} />`}
    ${(!item || item.kind !== 'media') && html`<${Emphasis} state=${state} act=${act} />`}
    ${state.illustration &&
    html`<div class="illus-row">
      <span class="small"><b>Beside the words on the TV:</b> ${state.illustration.title}</span>
      <div class="seg">
        ${Object.entries(ILLUSTRATION_SIZES).map(
          ([k, l]) => html`<button class=${state.illustration.size === k ? 'on' : ''} onClick=${() => act({ type: 'set', patch: { illustration: { ...state.illustration, size: k } } })}>${l}</button>`,
        )}
      </div>
      <button class="ghost" onClick=${() => act({ type: 'set', patch: { illustration: null } })}>Remove</button>
    </div>`}
    ${item
      ? html`<div class="item-head">
            <div>
              <b>${item.title}</b>
              <span class="muted small">
                ${`${item.kind === 'song' ? PRESET_INFO[lookOf(state, item)].name : item.kind === 'scripture' ? `${SCRIPTURE_INFO[scriptureLookOf(state)].name} · ${item.versions.join(' + ')}` : { both: 'TV + stream', tv: 'TV only', stream: 'Stream only' }[item.to || 'both']} · ${state.index + 1}/${item.slides.length}${stepsOf(state) > 1 ? ` · verse ${(state.sub || 0) + 1} of ${stepsOf(state)}` : ''}${item.kind === 'song' && Array.isArray(state.wc) ? ` · word ${state.wc[0] + 1}` : ''}`}
              </span>
            </div>
          </div>
          <ol class="slides" ref=${list}>
            ${item.slides.map(
              (s, i) => html`<li
                class=${`slide ${i === state.index ? 'on' : ''}`}
                onClick=${() => act({ type: 'goto', index: i })}
              >
                <span class="slide-no">${i + 1}${s.label ? ` · ${s.label}` : ''}${s.ref ? ` · ${s.ref.split(' · ')[0].replace(/^\S+ /, '')}` : ''}</span>
                ${item.kind === 'song' && s.lines.map((l) => html`<span class="slide-line">${l}</span>`)}
                ${item.kind === 'scripture' &&
                html`<span class="slide-line">${s.primary}</span>
                  ${s.secondary && html`<span class="slide-line dim">${s.secondary}</span>`}`}
                ${item.kind === 'media' && html`<span class="slide-line">${s.type === 'video' ? '▶ ' : '🖼 '}${s.title}</span>`}
              </li>`,
            )}
          </ol>`
      : html`<div class="empty">
          <p>Nothing on the screen yet.</p>
          <div class="row center wrap">
            <button onClick=${() => goTab('songs')}>Pick a song</button>
            <button onClick=${() => goTab('scripture')}>Scripture</button>
            <button onClick=${() => goTab('media')}>Pictures & video</button>
          </div>
        </div>`}
    </div>
  </div>`;
}

// ------------------------------------------------------------------ songs

const clock = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** One line under the song search while the library is shared with the other laptops. */
function ShareLine({ share, onSync, onSetup }) {
  if (!share.on)
    return html`<p class="share-line small muted">
      These songs are only on this laptop. <button class="link" onClick=${onSetup}>Share them with your other laptops</button>
    </p>`;
  const bad = share.status === 'error';
  return html`<p class=${`share-line small ${bad ? 'error' : 'muted'}`}>
    ${bad ? html`<b>Not shared right now:</b> ${share.msg}` : share.status === 'syncing' ? 'Sharing songs with your other laptops…' : share.at ? `Shared with your other laptops · up to date at ${clock(share.at)}` : 'Shared with your other laptops'}
    ${!(share.status === 'syncing') && html` <button class="link" onClick=${onSync}>${bad ? 'Try again' : 'Sync now'}</button>`}
  </p>`;
}

function Songs({ songs, onShow, onEdit, onNew, liveId, share, onSync, onSetup }) {
  const [q, setQ] = useState('');
  const list = useMemo(() => searchSongs(songs, q), [songs, q]);
  return html`<div class="songs">
    <div class="row">
      <input class="grow" type="search" value=${q} onInput=${(e) => setQ(e.target.value)} placeholder="Search songs, words, tags" />
      <button class="primary" onClick=${onNew}>+ New</button>
    </div>
    <${ShareLine} share=${share} onSync=${onSync} onSetup=${onSetup} />
    <ul class="song-list">
      ${list.map(
        (s) => html`<li class=${`song-row ${s.id === liveId ? 'on' : ''}`}>
          <button class="song-main" onClick=${() => onShow(s)}>
            <b>${s.title}</b>
            <span class="muted small">
              ${{ lg: 'Luganda', en: 'English', mixed: 'Luganda + English' }[s.language] || ''} ·
              ${PRESET_INFO[s.preset] ? PRESET_INFO[s.preset].name : ''} · ${s.slides.length} slides
            </span>
            <span class="first-line">${s.slides[0] ? s.slides[0].lines.join(' / ') : ''}</span>
          </button>
          <button class="ghost edit" onClick=${() => onEdit(s)} aria-label=${`Edit ${s.title}`}>Edit</button>
        </li>`,
      )}
    </ul>
    ${!list.length && html`<p class="muted center">${q ? 'No song matches.' : 'No songs yet. Tap + New.'}</p>`}
  </div>`;
}

// ------------------------------------------------------------------ scripture

// ------------------------------------------------------------------ finding a passage by words or voice

// One search index per Bible version, filled book by book in the background the first time it is needed.
const indexes = new Map();
function versionIndex(id) {
  let e = indexes.get(id);
  // An online Bible is not downloaded, so it is not searched by words.
  if (!e && versionById(id) && !versionById(id).online) {
    const v = versionById(id);
    e = { ix: new VerseIndex(v.lang === 'lg' ? 'lg' : 'en'), books: 0, subs: new Set() };
    indexes.set(id, e);
    fillIndex(e.ix, (n) => loadBook(id, n), (c) => {
      e.books = c;
      e.subs.forEach((f) => f());
    });
  }
  return e || null;
}

/** Starts the indexes for these versions and re-renders as books arrive (every few books). */
function useIndexes(ids, on) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!on) return undefined;
    const es = ids.map(versionIndex).filter(Boolean);
    let last = 0;
    const f = () => {
      const n = Math.min(...es.map((e) => e.books));
      if (n - last >= 6 || n === 66) {
        last = n;
        tick((x) => x + 1);
      }
    };
    es.forEach((e) => e.subs.add(f));
    return () => es.forEach((e) => e.subs.delete(f));
  }, [ids.join('|'), on]);
  const es = ids.map((id) => indexes.get(id)).filter(Boolean);
  return es.length ? Math.min(...es.map((e) => e.books)) : 0;
}

/** The best verses for some words, from every version searched, one entry per verse. */
function suggestVerses(query, ids, partial) {
  const best = new Map();
  for (const id of ids) {
    const e = indexes.get(id);
    if (!e) continue;
    for (const r of e.ix.search(query, { limit: 8, partial })) {
      const k = `${r.book}.${r.chapter}.${r.verse}`;
      const cur = best.get(k);
      if (!cur || r.score > cur.score) best.set(k, { ...r, lang: e.ix.lang, keys: e.ix.keyTerms(query, partial), from: id });
    }
  }
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, 5);
}

function useDebounced(value, ms) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const wordCount = (t) => (String(t || '').match(/[\p{L}]+/gu) || []).length;

/** A verse's text cut to about `n` characters around its first matched word, with the matches marked. */
function Snippet({ text, query, lang, n = 120 }) {
  const parts = highlight(text, query, lang);
  let first = 0;
  for (let i = 0, at = 0; i < parts.length; at += parts[i].length, i++) if (i % 2 === 1) {
    first = at;
    break;
  }
  const start = Math.max(0, Math.min(first - 30, text.length - n));
  let at = 0;
  const out = [];
  parts.forEach((p, i) => {
    const a = at;
    at += p.length;
    const lo = Math.max(a, start) - a;
    const hi = Math.min(at, start + n) - a;
    if (hi <= lo) return;
    const piece = p.slice(lo, hi);
    out.push(i % 2 ? html`<mark>${piece}</mark>` : piece);
  });
  return html`${start > 0 ? '…' : ''}${out}${start + n < text.length ? '…' : ''}`;
}

// How much scripture goes on one screen.
const PER_SCREEN_LABELS = [
  ['auto', 'Same size', 'Verses continue across screens at the standard size'],
  ['verse', '1 verse', 'One verse per screen at the standard size (a long verse is split)'],
  ['one', '1 verse, full', 'One whole verse per screen, never split, as large as the screen allows'],
  ['solo', '1 language at a time', 'Each verse twice: the language on top alone, then the other alone, each as large as the screen allows'],
  [2, '2'],
  [3, '3'],
  [4, '4'],
  [6, '6'],
  [8, '8'],
  ['all', 'Whole passage', 'As much as can be read at once; a long passage is shared evenly over a few screens'],
  ['scroll', 'Scroll', 'The whole passage in one long column; Next glides it to the next verse'],
];
const perScreenOf = (prefs) => {
  const p = prefs.perScreen;
  if (PER_SCREEN_LABELS.some(([k]) => k === p)) return p;
  return prefs.perVerse ? 'verse' : 'auto';
};

function Scripture({ prefs, setPrefs, onShow, look = 'ink', font = 'serif', size = 1, balance = 1, wide = false, relayout = null, liveScripture = false }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [recent, setRecent] = useState(() => read(LS_RECENT_REFS, ['Zabbuli 23:1-6', 'Yokaana 3:16']));
  const [sel, setSel] = useState(0);
  // Voice: listening, what is being said now, the last reference heard, and the words to search.
  const [listening, setListening] = useState(false);
  const [micErr, setMicErr] = useState('');
  const [line, setLine] = useState('');
  const [heard, setHeard] = useState(null);
  const [voiceQuery, setVoiceQuery] = useState('');
  const listener = useRef(null);
  const lastShown = useRef('');
  const versions = allVersions();
  const ids = [prefs.primary, prefs.secondary].filter(Boolean);
  // The World English Bible is always searched too, so a verse quoted in today's words is found.
  const searchIds = [...new Set([...ids, 'web'])];
  const ref = parseRef(text);
  const micLang = SPEECH_LANGS[prefs.micLang] ? prefs.micLang : 'en-GB';

  // The books start loading as soon as the Scripture tab opens (once per visit; the browser keeps
  // them), so the search is complete by the time words are typed or said.
  const wantsSearch = listening || (!ref && wordCount(text) >= 2);
  const loaded = useIndexes(searchIds, true);
  const query = useDebounced(listening ? voiceQuery : ref ? '' : text, 160);
  const results = useMemo(
    () => (wordCount(query) >= 2 ? suggestVerses(query, searchIds, !listening) : []),
    [query, searchIds.join('|'), loaded, listening],
  );
  useEffect(() => setSel(0), [query]);

  const show = async (r, label) => {
    setBusy(true);
    setErr('');
    try {
      // Measured in the real font, so a slide holds exactly what fits at the fixed size.
      const ok = await Promise.race([fontsReady(), new Promise((res) => setTimeout(() => res(null), 3000))]);
      const fit = ok !== null && document.fonts.check('600 92px Montserrat') ? scriptureFit(look, font, size, { balance, wide }) : undefined;
      const item = await passageItem({ ref: r, primaryId: prefs.primary, secondaryId: prefs.secondary, perScreen: perScreenOf(prefs), fit });
      onShow(item);
      const next = [label, ...recent.filter((x) => x.toLowerCase() !== label.toLowerCase())].slice(0, 8);
      setRecent(next);
      write(LS_RECENT_REFS, next);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  const go = (t = text) => {
    const r = parseRef(t);
    if (r) return show(r, t.trim());
    if (results.length) return showVerse(results[Math.min(sel, results.length - 1)]);
    setErr('Type a reference like “Zabbuli 23:1-4” or “Psalm 23:1-4”, or a few words of the verse.');
    return null;
  };
  const showVerse = (v, toEnd = false) => {
    const book = BOOKS[v.book - 1];
    return show({ book, chapter: v.chapter, from: v.verse, to: toEnd ? null : v.verse }, `${book.lg} ${v.chapter}:${v.verse}${toEnd ? '-' : ''}`);
  };
  const showHeard = (r) => {
    lastShown.current = refText(r);
    return show(r, `${r.book.lg} ${r.chapter}${r.from ? `:${r.from}${r.to && r.to !== r.from ? `-${r.to}` : ''}` : ''}`);
  };

  // The microphone.
  const heardText = (finalText, interim) => {
    const t = finalText || interim;
    setLine(t);
    const r = spokenRef(t);
    if (r) {
      setHeard(r);
      if (finalText && prefs.autoShow && refText(r) !== lastShown.current) showHeard(r);
    } else if (wordCount(t) >= 3) setVoiceQuery(t.split(/\s+/).slice(-16).join(' '));
  };
  const startMic = () => {
    setMicErr('');
    setLine('');
    const l = new Listener({
      lang: micLang,
      // Always the latest handler (it reads the current settings).
      onText: (f, i) => onHeard.current(f, i),
      onState: (st, msg) => {
        setListening(st === 'on');
        if (msg) setMicErr(msg);
      },
    });
    listener.current = l;
    l.start();
    setListening(true);
  };
  const toggleMic = () => (listening && listener.current ? listener.current.stop() : startMic());
  const onHeard = useRef(heardText);
  onHeard.current = heardText;
  // Switching language restarts the mic.
  useEffect(() => () => listener.current && listener.current.stop(), []);
  useEffect(() => {
    if (!listening || !listener.current) return;
    listener.current.stop();
    setTimeout(startMic, 250);
  }, [micLang]);

  const vSelect = (key, allowNone) => html`<select value=${prefs[key] || ''} onChange=${(e) => setPrefs({ ...prefs, [key]: e.target.value })}>
    ${allowNone && html`<option value="">None</option>`}
    ${versions.map((v) => html`<option value=${v.id}>${v.name}</option>`)}
  </select>`;

  const heardLabel = heard && formatRef(heard.book, heard.chapter, heard.from == null ? null : heard.to && heard.to !== heard.from ? `${heard.from}-${heard.to}` : heard.from);

  return html`<div class="scripture">
    <form
      class="row"
      onSubmit=${(e) => {
        e.preventDefault();
        go();
      }}
    >
      <input
        class="grow"
        value=${text}
        onInput=${(e) => {
          setText(e.target.value);
          setErr('');
        }}
        onKeyDown=${(e) => {
          if (!results.length) return;
          if (e.key === 'ArrowDown') setSel((i) => Math.min(results.length - 1, i + 1));
          else if (e.key === 'ArrowUp') setSel((i) => Math.max(0, i - 1));
          else return;
          e.preventDefault();
        }}
        placeholder="Zabbuli 23:1-4, or words of the verse"
        autocomplete="off"
        aria-label="Bible reference"
      />
      <button
        type="button"
        class=${`mic ${listening ? 'on' : ''}`}
        onClick=${toggleMic}
        disabled=${!canListen()}
        title=${canListen() ? (listening ? 'Stop listening' : 'Say a reference or a few words of the verse') : 'Voice needs Chrome or Edge'}
        aria-label=${listening ? 'Stop listening' : 'Listen'}
        aria-pressed=${listening}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z"/></svg>
      </button>
      <button class="primary" disabled=${busy || (!text.trim() && !results.length)}>${busy ? '…' : 'Show'}</button>
    </form>
    ${!listening &&
    html`<p class="small ${ref ? 'ok' : 'muted'}">
      ${ref
        ? `${ref.book.lg} ${ref.chapter}${ref.from ? `:${ref.from}${ref.to !== ref.from ? `-${ref.to}` : ''}` : ' (whole chapter)'} · ${ref.book.en}`
        : 'A reference (Zab 23:1, Ps 23) or a few words of the verse in Luganda or English. Or press the microphone and say it.'}
    </p>`}
    ${listening &&
    html`<div class="listen-bar" role="status">
      <i class="rec-dot"></i>
      <span class="heard-line">${line || 'Listening… say “Psalm 23 verse 1” or a few words of the verse'}</span>
      <select value=${micLang} onChange=${(e) => setPrefs({ ...prefs, micLang: e.target.value })} aria-label="Language spoken">
        ${Object.entries(SPEECH_LANGS).map(([k, l]) => html`<option value=${k}>${l}</option>`)}
      </select>
    </div>`}
    ${micErr && html`<p class="error small">${micErr}</p>`}
    ${err && html`<p class="error small">${err}</p>`}
    ${heard &&
    html`<div class="heard">
      <span class="muted small">Heard</span>
      <b>${heardLabel}</b>
      <button class="primary" onClick=${() => showHeard(heard)} disabled=${busy}>Show</button>
      <button class="ghost" onClick=${() => setHeard(null)} aria-label="Dismiss">×</button>
    </div>`}
    ${results.length > 0 &&
    html`<div class="suggest">
      <div class="row between">
        <span class="muted small">${listening ? 'From what was said' : 'Best matches'}${loaded < 66 ? ` · searching ${loaded} of 66 books…` : ''}</span>
        <span class="muted small">↑ ↓ and Enter</span>
      </div>
      <ul>
        ${results.map(
          (r, i) => html`<li class=${i === sel ? 'on' : ''}>
            <button class="sg" onClick=${() => showVerse(r)} onMouseEnter=${() => setSel(i)}>
              <span class="sg-ref">${formatRef(BOOKS[r.book - 1], r.chapter, r.verse)}${!ids.includes(r.from) && versionById(r.from) ? html` <em>matched in ${versionById(r.from).label}</em>` : ''}</span>
              <span class="sg-text"><${Snippet} text=${r.text} query=${r.keys} lang=${r.lang} /></span>
            </button>
            <button class="chip ghost" onClick=${() => showVerse(r, true)} title="From this verse to the end of the chapter">to end</button>
          </li>`,
        )}
      </ul>
    </div>`}
    ${wantsSearch && !results.length && wordCount(query) >= 2 && loaded < 66 && html`<p class="muted small">Searching ${loaded} of 66 books…</p>`}
    <div class="row wrap">
      <label class="field grow"><span>On top (read aloud)</span>${vSelect('primary', false)}</label>
      <label class="field grow"><span>Below, smaller</span>${vSelect('secondary', true)}</label>
    </div>
    <div class="field per-screen"><span>Verses on screen</span>
      <div class="seg" role="group" aria-label="Verses on screen">
        ${PER_SCREEN_LABELS.map(
          ([k, label, hint]) => html`<button
            class=${perScreenOf(prefs) === k ? 'on' : ''}
            title=${hint || `${k} verses together, as large as the screen allows`}
            onClick=${() => {
              setPrefs({ ...prefs, perScreen: k, perVerse: k === 'verse' });
              if (liveScripture && relayout) relayout(k);
            }}
          >
            ${label}
          </button>`,
        )}
      </div>
      <small class="muted">${perScreenOf(prefs) === 'scroll'
        ? 'The whole passage in one long column at the standard size, each verse with its translation under it. Next glides it up to the next verse; the stream shows the verse being read.'
        : isMany(perScreenOf(prefs))
        ? 'Whole verses together, the words as large as the screen allows for that much text. Verse by verse lights each one in turn; the stream shows the verse being read.'
        : perScreenOf(prefs) === 'verse'
          ? 'One verse per screen at the standard size (a long verse is split).'
          : 'The text continues across screens at the standard size until the passage ends.'}</small>
    </div>
    ${canListen() &&
    html`<label class="toggle">
      <input type="checkbox" checked=${Boolean(prefs.autoShow)} onChange=${(e) => setPrefs({ ...prefs, autoShow: e.target.checked })} />
      <span>Put a reference on the screen as soon as it is heard (off: one click on Show)</span>
    </label>
    <p class="muted small">The microphone uses the browser's own speech recognition; Chrome sends the sound to Google to turn it into text, so it needs the internet.</p>`}
    ${recent.length > 0 &&
    html`<div class="recent">
      <span class="muted small">Recent</span>
      <div class="chips">
        ${recent.map(
          (r) => html`<button
            class="chip"
            onClick=${() => {
              setText(r);
              go(r);
            }}
          >
            ${r}
          </button>`,
        )}
      </div>
    </div>`}
  </div>`;
}

// ------------------------------------------------------------------ pictures and video

function Media({ onShow, onIllustrate, illustration, liveId, relayOn }) {
  const [folder, setFolder] = useState(null);
  const [mine, setMine] = useState(myMedia);
  const [url, setUrl] = useState('');
  const [to, setTo] = useState('both');
  const [loop, setLoop] = useState(false);
  const [picked, setPicked] = useState(new Set());
  const [selecting, setSelecting] = useState(false);

  useEffect(() => {
    fetch('media/index.json')
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => setFolder(list.map((f) => ({ id: `f:${f.file}`, title: f.title, type: f.type, src: `media/${f.file}` }))))
      .catch(() => setFolder([]));
  }, []);
  // The Google orb adds pictures too: show them as they come.
  useEffect(() => onMediaChange(() => setMine(myMedia())), []);

  const opts = () => ({ to, loop });
  const show = (files) => onShow(mediaItem(files, opts()));

  const addFiles = async (files) => {
    const { added, tooBig } = await addMediaFiles(files);
    for (const name of tooBig) showToast(`${name} is too big to keep`);
    if (added.length) showToast(`Added ${added.length} file${added.length === 1 ? '' : 's'}`);
  };
  const remove = (m) => removeMedia(m);
  const addUrl = () => {
    if (addMediaUrl(url)) setUrl('');
  };

  const toggle = (m) => {
    const n = new Set(picked);
    if (n.has(m.id)) n.delete(m.id);
    else n.add(m.id);
    setPicked(n);
  };
  const all = [...(folder || []), ...mine];
  const chosen = all.filter((m) => picked.has(m.id));

  const card = (m, canRemove) => html`<li class=${`media-card ${liveId === mediaItem(m).id ? 'on' : ''} ${picked.has(m.id) ? 'picked' : ''} ${illustration && illustration.src === m.src ? 'illus-on' : ''}`}>
    <button class="media-main" onClick=${() => (selecting ? toggle(m) : show(m))} aria-label=${`Show ${m.title}`}>
      ${m.type === 'video'
        ? html`<span class="media-thumb video">▶</span>`
        : html`<img class="media-thumb" src=${m.src.startsWith('idb:') ? '' : m.src} alt="" loading="lazy" />`}
      <span class="media-title">${m.title}</span>
    </button>
    ${!selecting &&
    html`<button class="chip beside" onClick=${() => onIllustrate(m)} aria-label=${`Show ${m.title} beside the words`}>
      ${illustration && illustration.src === m.src ? '✓ Beside the words' : 'Beside the words'}
    </button>`}
    ${canRemove && !selecting && html`<button class="ghost small" onClick=${() => remove(m)} aria-label=${`Remove ${m.title}`}>✕</button>`}
  </li>`;

  return html`<div class="media-tab">
    <div class="row wrap between">
      <div class="seg" role="group" aria-label="Where to show">
        ${[
          ['both', 'TV + stream'],
          ['tv', 'TV only'],
          ['stream', 'Stream only'],
        ].map(([k, l]) => html`<button class=${to === k ? 'on' : ''} onClick=${() => setTo(k)}>${l}</button>`)}
      </div>
      <label class="toggle compact"><input type="checkbox" checked=${loop} onChange=${(e) => setLoop(e.target.checked)} /><span>Loop video</span></label>
    </div>
    <p class="muted small">Tap a picture to show it full screen. <b>Beside the words</b> keeps it next to the lyrics or scripture on the TV only (the stream never gets it).</p>
    <div class="row wrap">
      <button class=${selecting ? 'primary' : ''} onClick=${() => { setSelecting(!selecting); setPicked(new Set()); }}>
        ${selecting ? 'Cancel' : 'Select several'}
      </button>
      ${selecting && chosen.length > 0 && html`<button class="primary" onClick=${() => { show(chosen); setSelecting(false); setPicked(new Set()); }}>Show ${chosen.length} as a set</button>`}
    </div>

    <h2 class="sec-head">In the app's folder <span class="muted small">lyrics/media on GitHub</span></h2>
    ${folder === null && html`<p class="muted small">Loading…</p>`}
    ${folder && !folder.length && html`<p class="muted small">Empty. Add pictures or videos to the <code>lyrics/media</code> folder and run <code>npm run media</code>.</p>`}
    <ul class="media-grid">${(folder || []).map((m) => card(m, false))}</ul>

    <h2 class="sec-head">On this device</h2>
    <div class="row wrap">
      <label class="button">Add pictures or videos<input type="file" accept="image/*,video/*" multiple hidden onChange=${(e) => addFiles([...e.target.files])} /></label>
      <form class="row grow" onSubmit=${(e) => { e.preventDefault(); addUrl(); }}>
        <input class="grow" value=${url} onInput=${(e) => setUrl(e.target.value)} placeholder="or paste a picture / video link" />
        <button disabled=${!url.trim()}>Add</button>
      </form>
    </div>
    ${relayOn && mine.some((m) => m.src.startsWith('idb:')) &&
    html`<p class="note small">Files added here only reach screens open in this same browser. For a TV on another device, put the file in the app's folder or use a link.</p>`}
    <ul class="media-grid">${mine.map((m) => card(m, true))}</ul>
  </div>`;
}

// ------------------------------------------------------------------ settings

/** The letters that follow the singer (this laptop) and how the words look while following. */
function FollowSettings({ state, act }) {
  const [keys, setKeys] = useState(readFollowKeys);
  const [msg, setMsg] = useState('');
  const change = (name, raw) => {
    const k = String(raw || '').slice(-1).toLowerCase();
    if (!k) return;
    if (!validKey(k)) {
      setMsg(`${k.toUpperCase()} is taken (Space, B, C, L and V already do something) or is not a letter.`);
      return;
    }
    if (Object.entries(keys).some(([n, v]) => n !== name && v === k)) {
      setMsg(`${k.toUpperCase()} is already ${FOLLOW_KEY_NAMES[Object.keys(keys).find((n) => keys[n] === k)].toLowerCase()}.`);
      return;
    }
    const next = { ...keys, [name]: k };
    setKeys(next);
    saveFollowKeys(next);
    setMsg('');
  };
  return html`<div class="field follow-set"><span>Follow the singer (songs)</span>
    <div class="row wrap">
      ${Object.entries(FOLLOW_KEY_NAMES).map(
        ([name, label]) => html`<label class="keybox"><input value=${keys[name].toUpperCase()} maxlength="2" onInput=${(e) => {
          change(name, e.target.value);
          e.target.value = (readFollowKeys()[name] || '').toUpperCase();
        }} aria-label=${label} /><small>${label}</small></label>`,
      )}
      <button class="chip ghost" onClick=${() => {
        setKeys({ ...FOLLOW_KEYS });
        saveFollowKeys({ ...FOLLOW_KEYS });
        setMsg('');
      }}>J F U</button>
    </div>
    ${msg && html`<small class="error">${msg}</small>`}
    <small class="muted">Tap the next-word key as each word is sung: it swells and glows on the screen; after the last word it moves on to the next slide. The line key lights a whole line at once, easier on fast songs. These letters are kept on this laptop (the TV page on it uses them too).</small>
    <label class="toggle">
      <input type="checkbox" checked=${state.followDim !== false} onChange=${(e) => act({ type: 'set', patch: { followDim: e.target.checked } })} />
      <span>Dim the words still to come</span>
    </label>
    <label class="toggle">
      <input type="checkbox" checked=${state.followStream !== false} onChange=${(e) => act({ type: 'set', patch: { followStream: e.target.checked } })} />
      <span>The stream's lower third follows too (off: the stream stays plain)</span>
    </label>
  </div>`;
}

/** Songs shared between laptops through one private gist on the church's GitHub account (src/lyrics/share.js). */
function ShareSongs({ songs, share, onConnect, onSync, onLeave }) {
  const [token, setToken] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [link, setLink] = useState('');
  const connect = async () => {
    setBusy(true);
    setErr('');
    try {
      await onConnect(token.trim());
      setToken('');
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  const copyLink = async () => {
    const url = setupLink(shareConfig(), location.href);
    try {
      await navigator.clipboard.writeText(url);
      showToast('Link copied. Open it on the other laptop.');
      setLink('');
    } catch {
      setLink(url);
    }
  };
  return html`<section class="card share-songs">
    <h2>Share songs between laptops</h2>
    ${share.on
      ? html`<p class="small">
            <span class=${`pill ${share.status === 'error' ? 'warn' : 'ok'}`}>${share.status === 'error' ? 'Not up to date' : 'Sharing'}</span>${' '}
            ${visibleSongs(songs).length} songs · a song saved on any laptop appears on the others within a minute${share.at ? ` · last checked ${clock(share.at)}` : ''}.
          </p>
          ${share.status === 'error' && html`<p class="error small">${share.msg}</p>`}
          <div class="row wrap">
            <button onClick=${onSync} disabled=${share.status === 'syncing'}>${share.status === 'syncing' ? 'Syncing…' : 'Sync now'}</button>
            <button onClick=${copyLink}>Copy setup link for another laptop</button>
            <button class="ghost" onClick=${onLeave}>Stop sharing on this laptop</button>
          </div>
          ${link && html`<input class="grow" readonly value=${link} onFocus=${(e) => e.target.select()} aria-label="Setup link" />`}
          <p class="muted small">
            The setup link carries the key to the shared songs: send it only to your own team. Stopping here keeps this laptop's songs and leaves the shared copy as it is.
          </p>`
      : html`<p class="muted small">
            Songs saved on one laptop appear on your other laptops by themselves. They are kept in one private file (a <i>gist</i>) on the church's GitHub account; nothing else is shared and the lyrics are never public. One-time setup:
          </p>
          <ol class="small steps">
            <li><a href=${TOKEN_URL} target="_blank" rel="noopener">Make the key on GitHub</a>: sign in, press <b>Generate token</b> at the bottom (only the <i>gist</i> box is ticked) and copy it.</li>
            <li>Paste it here and press <b>Connect</b>. The first laptop starts the shared file from its songs.</li>
            <li>On each other laptop do the same, or use <b>Copy setup link</b> here and open that link there.</li>
          </ol>
          <form class="row" onSubmit=${(e) => { e.preventDefault(); connect(); }}>
            <input class="grow" type=${show ? 'text' : 'password'} value=${token} onInput=${(e) => setToken(e.target.value)} placeholder="GitHub token (ghp_…)" autocomplete="off" aria-label="GitHub token" />
            <button type="button" class="ghost" onClick=${() => setShow(!show)}>${show ? 'Hide' : 'Show'}</button>
            <button class="primary" disabled=${busy || !token.trim()}>${busy ? 'Connecting…' : 'Connect'}</button>
          </form>
          ${err && html`<p class="error small">${err}</p>`}
          <p class="muted small">The key stays in this browser only, never in the app. It can only read and write gists.</p>`}
  </section>`;
}

/** Licensed Bibles online (NIV, Amplified, ...) through API.Bible with the church's own key. */
function OnlineBibles({ prefs, setPrefs, onChange }) {
  const [cfg, setCfg] = useState(onlineConfig);
  const [key, setKey] = useState(cfg.key);
  const [show, setShow] = useState(false);
  const [found, setFound] = useState(null);
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const save = (next) => {
    setCfg(next);
    saveOnlineConfig(next);
    onChange();
  };
  const connect = async () => {
    const k = key.trim();
    if (!k) return;
    setBusy(true);
    setMsg('');
    try {
      const list = await listBibles(k);
      setFound(list);
      save({ ...cfg, key: k });
      setMsg(`${list.length} Bibles this key may use.`);
    } catch (e) {
      setFound(null);
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  };
  const add = (b) => {
    if (cfg.bibles.some((x) => x.id === b.id)) return;
    save({ ...cfg, bibles: [...cfg.bibles, { id: b.id, abbreviation: b.abbreviation, name: b.name, lang: b.lang, copyright: b.copyright }] });
  };
  const remove = (id) => {
    save({ ...cfg, bibles: cfg.bibles.filter((x) => x.id !== id) });
    const vid = `api:${id}`;
    if (prefs.primary === vid || prefs.secondary === vid)
      setPrefs({ ...prefs, primary: prefs.primary === vid ? 'lug68' : prefs.primary, secondary: prefs.secondary === vid ? 'kjv' : prefs.secondary });
  };
  const forget = () => {
    save({ key: '', bibles: [] });
    setKey('');
    setFound(null);
    setMsg('');
    if (String(prefs.primary).startsWith('api:') || String(prefs.secondary).startsWith('api:'))
      setPrefs({ ...prefs, primary: String(prefs.primary).startsWith('api:') ? 'lug68' : prefs.primary, secondary: String(prefs.secondary).startsWith('api:') ? 'kjv' : prefs.secondary });
  };
  const q = filter.trim().toLowerCase();
  const shown = (found || []).filter((b) => !q || `${b.abbreviation} ${b.name} ${b.langName}`.toLowerCase().includes(q)).slice(0, 40);
  return html`<section class="card online">
    <h2>Online Bibles <span class="muted small">NIV, Amplified, NLT …</span></h2>
    <p class="muted small">
      These translations are copyrighted, so they are not built into the app. They come from <b>API.Bible</b> (the
      American Bible Society) with the church's own key: sign up free at api.bible, add the translations you want to
      your app there (the free plan allows up to 3 licensed Bibles for non-commercial use, some need the publisher's
      own permission), then paste the key here. Chapters are fetched as they are read and kept on this laptop only;
      they are not searched by words.
    </p>
    <form
      class="row"
      onSubmit=${(e) => {
        e.preventDefault();
        connect();
      }}
    >
      <input class="grow" type=${show ? 'text' : 'password'} value=${key} onInput=${(e) => setKey(e.target.value)} placeholder="API.Bible key" autocomplete="off" aria-label="API.Bible key" />
      <button type="button" class="ghost" onClick=${() => setShow(!show)}>${show ? 'Hide' : 'Show'}</button>
      <button class="primary" disabled=${busy || !key.trim()}>${busy ? '…' : cfg.key ? 'Find Bibles' : 'Connect'}</button>
    </form>
    ${msg && html`<p class=${`small ${found ? 'ok' : 'error'}`}>${msg}</p>`}
    ${cfg.bibles.length > 0 &&
    html`<ul class="plain">
      ${cfg.bibles.map(
        (b) => html`<li class="row between">
          <span><b>${b.abbreviation}</b> ${b.name} <span class="muted small">${b.lang === 'lg' ? 'Luganda' : b.lang === 'en' ? 'English' : ''}</span>
            ${b.copyright && html`<br /><span class="muted small">${b.copyright}</span>`}</span>
          <button class="ghost small" onClick=${() => remove(b.id)}>Remove</button>
        </li>`,
      )}
    </ul>`}
    ${found &&
    html`<div class="found">
      <input class="grow" value=${filter} onInput=${(e) => setFilter(e.target.value)} placeholder="Find: NIV, Amplified, NLT…" aria-label="Find a Bible" />
      <ul class="plain">
        ${shown.map(
          (b) => html`<li class="row between">
            <span><b>${b.abbreviation}</b> ${b.name} <span class="muted small">${b.langName}</span></span>
            ${cfg.bibles.some((x) => x.id === b.id)
              ? html`<span class="muted small">added</span>`
              : html`<button class="chip" onClick=${() => add(b)}>Add</button>`}
          </li>`,
        )}
        ${found.length > shown.length && html`<li class="muted small">${found.length - shown.length} more; type to find one.</li>`}
      </ul>
    </div>`}
    ${cfg.key && html`<button class="ghost small" onClick=${forget}>Forget the key and its Bibles</button>`}
    <p class="muted small">The key is kept in this browser only, never in the app or on the TV. The service counts what is shown (its fair-use rule) and asks for that on every web app.</p>
  </section>`;
}

function Settings({ state, act, info, prefs, setPrefs, songs, setSongs, session, setSession, onOutputs, setLook, ui, setUi, wide, share, onConnectShare, onSync, onLeaveShare }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState('');
  const [verName, setVerName] = useState('');
  const [verLang, setVerLang] = useState('lg');
  const [versions, setVersions] = useState(allVersions());
  const [videoUrl, setVideoUrl] = useState(state.bgVideo || '');

  const importBible = (file) => {
    if (!file) return;
    setBusy('bible');
    file
      .text()
      .then((t) => importVersion({ name: verName.trim() || file.name.replace(/\.[^.]+$/, ''), lang: verLang, text: t }))
      .then((r) => {
        showToast(`Imported ${r.books} books, ${r.verses} verses`);
        setVersions(allVersions());
        setVerName('');
      })
      .catch((e) => showToast(e.message))
      .finally(() => setBusy(''));
  };

  const download = () => {
    const blob = new Blob([exportLibrary(songs)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `lyric-slides-songs-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const upload = (file) =>
    file &&
    file
      .text()
      .then((t) => {
        const r = importLibrary(songs, t);
        setSongs(r.songs);
        showToast(`Imported ${r.count} songs`);
      })
      .catch((e) => showToast(e.message));

  const sync = async () => {
    setBusy('sync');
    try {
      const remote = await pullSongs();
      const { songs: merged, push } = mergeSongs(songs, remote);
      await pushSongs(push);
      setSongs(merged);
      showToast(`Synced: ${visibleSongs(merged).length} songs`);
    } catch (e) {
      showToast(e.message);
      setSession(loadSession());
    } finally {
      setBusy('');
    }
  };

  return html`<div class="settings">
    <section class="card">
      <h2>Screens</h2>
      <div class="row between wrap">
        <div>
          <span class=${`pill ${info.peers.screen || info.ports ? 'ok' : ''}`}>
            ${info.peers.screen || info.ports ? `${info.peers.screen + info.ports} connected` : 'no screen'}
          </span>
        </div>
        <span class="row">
          <button class="primary" onClick=${onOutputs}>Show on TV & stream</button>
        </span>
      </div>
      <p class="muted small">
        Relay: ${info.cloud === 'off' ? 'off (this browser only)' : info.cloud === 'joined' ? 'connected' : 'reconnecting…'}
        ${info.pending ? ' · last change waiting to send' : ''}
      </p>
    </section>

    <${ThisConsole} ui=${ui} setUi=${setUi} wide=${wide} />

    <section class="card">
      <h2>Stream feed (ATEM)</h2>
      <div class="field"><span>Layout</span>
        <div class="seg">
          ${Object.entries(STREAM_LAYOUTS).map(
            ([k, l]) => html`<button class=${(state.streamLayout || 'lowerthird') === k ? 'on' : ''} onClick=${() => act({ type: 'set', patch: { streamLayout: k } })}>${l}</button>`,
          )}
        </div>
      </div>
      <div class="field"><span>Behind the text</span>
        <div class="seg">
          <button class=${(state.streamBg || 'key') === 'key' ? 'on' : ''} onClick=${() => act({ type: 'set', patch: { streamBg: 'key' } })}>Black, for keying</button>
          <button class=${state.streamBg === 'tv' ? 'on' : ''} onClick=${() => act({ type: 'set', patch: { streamBg: 'tv' } })}>Same as the TV</button>
        </div>
      </div>
      <p class="muted small">Lower thirds keep the camera in view and continue long verses at the same size. Full screen shows the TV layout.</p>
    </section>

    <section class="card">
      <h2>TV background</h2>
      <div class="chips">
        ${BACKGROUNDS.map(
          (b) => html`<button class=${`chip ${state.bg === b ? 'on' : ''}`} onClick=${() => act({ type: 'set', patch: { bg: b } })}>
            ${BACKGROUND_INFO[b]}
          </button>`,
        )}
      </div>
      ${state.bg === 'key' &&
      html`<p class="muted small">Pure black with a dark band at the bottom, for luma keying over the live camera in the ATEM.</p>`}
      ${state.bg === 'video' &&
      html`<form
        class="row"
        onSubmit=${(e) => {
          e.preventDefault();
          act({ type: 'set', patch: { bgVideo: videoUrl.trim() } });
        }}
      >
        <input class="grow" value=${videoUrl} onInput=${(e) => setVideoUrl(e.target.value)} placeholder="https://…/loop.mp4 (or press V on the screen PC)" />
        <button>Use</button>
      </form>`}
      <label class="toggle">
        <input type="checkbox" checked=${state.calm} onChange=${(e) => act({ type: 'set', patch: { calm: e.target.checked } })} />
        <span>Calm mode: crossfades only, still background</span>
      </label>
    </section>

    <section class="card">
      <h2>Words</h2>
      <${FollowSettings} state=${state} act=${act} />
      <label class="toggle">
        <input type="checkbox" checked=${state.fill !== false} onChange=${(e) => act({ type: 'set', patch: { fill: e.target.checked } })} />
        <span>Grow the words to use the screen (never smaller than the standard size)</span>
      </label>
      <label class="toggle">
        <input type="checkbox" checked=${state.caps !== false} onChange=${(e) => act({ type: 'set', patch: { caps: e.target.checked } })} />
        <span>Capital letters for lyrics</span>
      </label>
      <div class="field"><span>How much the words play</span>
        <div class="seg">
          ${Object.entries(PLAY_LEVELS).map(
            ([k, l]) => html`<button class=${(state.play || 'mid') === k ? 'on' : ''} onClick=${() => act({ type: 'set', patch: { play: k } })}>${l}</button>`,
          )}
        </div>
        <small class="muted">Gentle: short, soft entrances. Lively: the lyric-video motion. Playful: words travel further, bounce on arrival and wobble while they are up. Wild: words fly in fast from all over the screen, spinning, and snap into place.</small>
      </div>
      <div class="field"><span>Mix</span>
        <div class="seg">
          <button class=${state.mixFonts ? 'on' : ''} onClick=${() => act({ type: 'set', patch: { mixFonts: !state.mixFonts } })}>Mixed fonts</button>
          <button class=${state.hero ? 'on' : ''} onClick=${() => act({ type: 'set', patch: { hero: !state.hero } })}>Hero word</button>
        </div>
        <small class="muted">Mixed fonts: a different font on each word. Hero word: the longest word swells and plays; with two lines the second line swells and the first takes the accent colour (GOD I'M JUST / GRATEFUL).</small>
      </div>
      <div class="field"><span>Where the words sit</span>
        <div class="seg">
          ${Object.entries(PLACES).map(
            ([k, l]) => html`<button class=${(state.place || 'center') === k ? 'on' : ''} onClick=${() => act({ type: 'set', patch: { place: k } })}>${l}</button>`,
          )}
        </div>
        <small class="muted">Alternate: left, then right, then centre, slide by slide. Left / right: the first line left and the second right. Random: a different side each slide.</small>
      </div>
      <label class="toggle">
        <input type="checkbox" checked=${state.lookBg !== 'mine'} onChange=${(e) => act({ type: 'set', patch: { lookBg: e.target.checked ? 'look' : 'mine' } })} />
        <span>Looks bring their own background (off: keep the TV background under every look)</span>
      </label>
      <p class="muted small">Poster, Sunshine, Lines and Beams are looks with their own environment. Pick one per song in the editor, or force one for every song from the chips under the live slide.</p>
    </section>

    <section class="card">
      <h2>Scripture</h2>
      <${ScriptureControls} state=${state} act=${act} setLook=${setLook} hints=${true} />
    </section>

    <${OnlineBibles} prefs=${prefs} setPrefs=${setPrefs} onChange=${() => setVersions(allVersions())} />

    <section class="card">
      <h2>Bible versions</h2>
      <ul class="plain">
        ${versions.map(
          (v) => html`<li class="row between">
            <span><b>${v.name}</b> <span class="muted small">${v.lang === 'lg' ? 'Luganda' : 'English'}${v.online ? ' · online' : ''}</span></span>
            ${!BUILTIN_VERSIONS.some((b) => b.id === v.id) && !v.online &&
            html`<button
              class="ghost small"
              onClick=${() => {
                removeVersion(v.id);
                setVersions(allVersions());
                if (prefs.primary === v.id || prefs.secondary === v.id)
                  setPrefs({ ...prefs, primary: prefs.primary === v.id ? 'lug68' : prefs.primary, secondary: prefs.secondary === v.id ? 'kjv' : prefs.secondary });
              }}
            >
              Remove
            </button>`}
          </li>`,
        )}
      </ul>
      <details>
        <summary>Import another version</summary>
        <p class="muted small">
          A text file with lines like <code>PSA 23:1 text</code> or <code>Zabbuli 23:1 text</code>, tab separated columns
          (book, chapter, verse, text), USFM, JSON or Bible XML. Stays on this device.
        </p>
        <div class="row wrap">
          <input class="grow" value=${verName} onInput=${(e) => setVerName(e.target.value)} placeholder="Name, e.g. NIV" />
          <select value=${verLang} onChange=${(e) => setVerLang(e.target.value)}>
            <option value="lg">Luganda</option><option value="en">English</option>
          </select>
          <label class="button">${busy === 'bible' ? 'Importing…' : 'Choose file'}
            <input type="file" accept=".txt,.tsv,.usfm,.sfm,.json,.xml,text/*" hidden onChange=${(e) => importBible(e.target.files[0])} />
          </label>
        </div>
      </details>
    </section>

    <${ShareSongs} songs=${songs} share=${share} onConnect=${onConnectShare} onSync=${onSync} onLeave=${onLeaveShare} />

    <section class="card">
      <h2>Song library</h2>
      <p class="muted small">${visibleSongs(songs).length} songs on this device.</p>
      <div class="row wrap">
        <button onClick=${download}>Export songs</button>
        <label class="button">Import songs<input type="file" accept=".json,application/json" hidden onChange=${(e) => upload(e.target.files[0])} /></label>
      </div>
      ${cloudConfigured() &&
      (session
        ? html`<div class="row between">
            <span class="small">Signed in as <b>${session.email}</b></span>
            <span class="row">
              <button onClick=${sync} disabled=${busy === 'sync'}>${busy === 'sync' ? 'Syncing…' : 'Sync now'}</button>
              <button class="ghost" onClick=${() => { signOut(); setSession(null); }}>Sign out</button>
            </span>
          </div>`
        : html`<form
            class="row"
            onSubmit=${(e) => {
              e.preventDefault();
              sendMagicLink(email.trim())
                .then(() => setSent(true))
                .catch((er) => showToast(er.message));
            }}
          >
            <input class="grow" type="email" value=${email} onInput=${(e) => setEmail(e.target.value)} placeholder="Media team email" required />
            <button>${sent ? 'Sent ✓' : 'Email me a sign-in link'}</button>
          </form>`)}
    </section>

    <section class="card small muted">
      <h2>About</h2>
      ${allVersions().map((v) => html`<p><b>${v.name}:</b> ${v.notice}</p>`)}
      <p>Montserrat font: SIL Open Font License. QR codes: qrcode-generator (MIT).</p>
    </section>
  </div>`;
}

// ------------------------------------------------------------------ app

function App() {
  const params = new URLSearchParams(location.search);
  // No code to type: everyone is on the church's channel unless the address names another.
  const room = useRef(normalizeCode(params.get('room')) || normalizeCode(ROOM)).current;
  const [state, setState] = useState(() => read(`ls-remote-state:${room}`, emptyState()));
  const [info, setInfo] = useState({ peers: { screen: 0, remote: 0 }, cloud: 'off', pending: false, ports: 0 });
  const wide = useWide();
  const [tab, setTab] = useState('live');
  const [libTab, setLibTab] = useState('songs');
  const [songs, setSongsRaw] = useState(() => loadSongs());
  // Sharing songs with the other laptops (src/lyrics/share.js).
  const [share, setShareRaw] = useState(() => ({ on: isSharing(), status: 'idle', at: 0, msg: '' }));
  const songsRef = useRef(songs);
  songsRef.current = songs;
  const syncing = useRef(false);
  const syncAgain = useRef(false);
  const syncTimer = useRef(null);
  const [editing, setEditing] = useState(null);
  const [outputs, setOutputs] = useState(false);
  const [ui, setUi] = useUi();
  // Focus layout: the library ('lib') or the outputs ('out') drawn over the live picture.
  const [drawer, setDrawer] = useState(null);
  const [prefs, setPrefsRaw] = useState(() => ({ primary: 'lug68', secondary: 'kjv', perVerse: false, ...read(LS_PREFS, {}) }));
  const [session, setSession] = useState(() => loadSession());
  const link = useRef(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const applySongs = (list) => {
    songsRef.current = list;
    setSongsRaw(list);
    saveSongs(list);
  };
  // Any change to the library (a save, a delete, an import) is shared a moment later.
  const setSongs = (list) => {
    applySongs(list);
    syncSoon();
  };
  const setShare = (patch) => setShareRaw((c) => ({ ...c, ...patch }));
  // Brings this laptop's songs and the shared copy level; one at a time, once more if something changed meanwhile.
  const runSync = async () => {
    const cfg = shareConfig();
    if (!isSharing(cfg)) return;
    if (syncing.current) {
      syncAgain.current = true;
      return;
    }
    syncing.current = true;
    setShare({ on: true, status: 'syncing' });
    try {
      const r = await syncSongs(songsRef.current, cfg);
      if (r.pulled) {
        // Edits made here while it was away are kept if newer.
        applySongs(mergeSongs(songsRef.current, r.songs).songs);
        showToast(`${r.pulled} song${r.pulled === 1 ? '' : 's'} updated from another laptop`);
      }
      setShare({ status: 'ok', at: Date.now(), msg: '' });
    } catch (e) {
      setShare({ status: 'error', msg: e.message });
    } finally {
      syncing.current = false;
      if (syncAgain.current) {
        syncAgain.current = false;
        syncSoon(0);
      }
    }
  };
  const runSyncRef = useRef(runSync);
  runSyncRef.current = runSync;
  function syncSoon(ms = 900) {
    clearTimeout(syncTimer.current);
    if (isSharing()) syncTimer.current = setTimeout(() => runSyncRef.current(), ms);
  }
  const connectShared = async (token) => {
    const r = await connectShare(token, songsRef.current);
    saveShareConfig(r.cfg);
    if (r.pulled) applySongs(mergeSongs(songsRef.current, r.songs).songs);
    setShare({ on: true, status: 'ok', at: Date.now(), msg: '' });
    showToast(r.created ? 'Sharing started with this laptop\'s songs' : `Sharing on: ${r.pulled} song${r.pulled === 1 ? '' : 's'} received`);
  };
  const leaveShare = () => {
    saveShareConfig(null);
    setShare({ on: false, status: 'idle', msg: '' });
    showToast('This laptop no longer shares songs');
  };
  const setPrefs = (p) => {
    setPrefsRaw(p);
    write(LS_PREFS, p);
  };

  useEffect(() => {
    if (params.get('room') && room === normalizeCode(ROOM)) history.replaceState(null, '', location.pathname);
    const l = new Link({
      room,
      role: 'remote',
      state: stateRef.current,
      relay: relayConfig(),
      onState: (s) => {
        setState(s);
        write(`ls-remote-state:${room}`, s);
      },
      onInfo: setInfo,
    });
    link.current = l;
    return () => l.close();
  }, [room]);

  // A setup link opened on this laptop (#share=…): keep it, tidy the address, and start sharing.
  useEffect(() => {
    const takeSetup = () => {
      const setup = readSetupLink(location.hash);
      if (!setup) return;
      saveShareConfig(setup);
      history.replaceState(null, '', location.pathname + location.search);
      setShare({ on: true, status: 'idle' });
      showToast('Sharing songs with your other laptops');
      runSyncRef.current();
    };
    takeSetup();
    // A link pasted into the address bar of a console that is already open only changes the #.
    addEventListener('hashchange', takeSetup);
    runSyncRef.current();
    // Again whenever the page comes back into view or the internet returns, and every minute while it is open.
    const again = () => document.visibilityState !== 'hidden' && runSyncRef.current();
    const tick = setInterval(again, 60000);
    addEventListener('online', again);
    document.addEventListener('visibilitychange', again);
    return () => {
      clearInterval(tick);
      removeEventListener('hashchange', takeSetup);
      removeEventListener('online', again);
      document.removeEventListener('visibilitychange', again);
    };
  }, []);

  // Magic-link sign-in lands here.
  useEffect(() => {
    if (!cloudConfigured()) return;
    const arriving = location.hash.includes('access_token');
    captureSession()
      .then((s) => {
        setSession(s);
        if (arriving && s) showToast(`Signed in as ${s.email}`);
      })
      .catch((e) => showToast(e.message));
  }, []);

  const act = (cmd) => {
    if (!link.current) return;
    const next = reduce(stateRef.current, cmd, link.current.id);
    stateRef.current = next;
    setState(next);
    write(`ls-remote-state:${room}`, next);
    link.current.publish(next);
  };

  // Laptop keys (not while typing).
  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || editing || outputs) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      const k = e.key;
      if (k === ' ' || k === 'ArrowRight' || k === 'PageDown') act({ type: 'next' });
      else if (k === 'ArrowLeft' || k === 'PageUp') act({ type: 'prev' });
      else if (k === 'b' || k === 'B') act({ type: 'mode', mode: 'black' });
      else if (k === 'c' || k === 'C') act({ type: 'mode', mode: 'clear' });
      else if (k === 'l' || k === 'L') act({ type: 'mode', mode: 'logo' });
      else if (followCommand(k)) act(followCommand(k));
      else if (k === '+' || k === '=' || k === '-' || k === '_') {
        // Text size of what is up: lyrics or scripture.
        const cur = stateRef.current;
        const dir = k === '-' || k === '_' ? -1 : 1;
        if (cur.item && cur.item.kind === 'scripture') setLookRef.current({ sSize: stepSize(cur.sSize, dir) });
        else act({ type: 'set', patch: { lSize: stepSize(cur.lSize, dir) } });
      } else return;
      e.preventDefault();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [editing, outputs, room]);

  // Focus: Esc closes an open drawer.
  useEffect(() => {
    if (!drawer) return undefined;
    const onKey = (e) => e.key === 'Escape' && !editing && !outputs && setDrawer(null);
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [drawer, editing, outputs]);

  const showItem = (item, index = 0) => {
    act({ type: 'item', item, index });
    if (!wide) setTab('live');
    // Picked from a Focus drawer: close it so the live picture is in view.
    setDrawer(null);
  };
  const showSong = (song, index = 0) => showItem(songItem(song), index);

  // A scripture look (or type) change: the passage up on the screen is laid out again for it,
  // staying on the verse being read.
  const setLookRef = useRef(null);
  const setLook = async (patch, perScreen = null) => {
    const cur = stateRef.current;
    const next = { ...cur, ...patch };
    const it = cur.item;
    if (!it || it.kind !== 'scripture' || !it.book) {
      act({ type: 'set', patch });
      return;
    }
    try {
      const slide = it.slides[cur.index] || it.slides[0];
      const verse = slide && slide.verses ? slide.verses[Math.min(cur.sub || 0, slide.verses.length - 1)].verse : it.v1;
      await Promise.race([fontsReady(), new Promise((res) => setTimeout(() => res(null), 3000))]);
      const item = await passageItem({
        ref: { book: bookByCode(it.book.code) || it.book, chapter: it.chapter, from: it.v1, to: it.v2 },
        primaryId: it.primaryId,
        secondaryId: it.secondaryId,
        flow: it.flow,
        perScreen: perScreen || it.perScreen || (it.flow === false ? 'verse' : 'auto'),
        fit: scriptureFit(scriptureLookOf(next), next.sFont, next.sSize, { balance: next.sBalance, wide: Boolean(next.sWide) }),
      });
      let index = 0;
      let sub = 0;
      item.slides.forEach((s, i) =>
        (s.verses || []).forEach((v, j) => {
          if (v.verse <= verse && (!v.part || v.part === 'a' || v.verse < verse)) {
            index = i;
            sub = j;
          }
        }),
      );
      act({ type: 'set', patch: { ...patch, item, index, sub: next.reveal === false ? 0 : sub, marks: {} } });
    } catch (e) {
      act({ type: 'set', patch });
      showToast(e.message);
    }
  };

  setLookRef.current = setLook;

  const saveSong = (song) => {
    setSongs(upsertSong(songs, song));
    setEditing(null);
    showToast('Saved');
    // The song is up on the screen: send the new words.
    const live = stateRef.current.item;
    if (live && live.kind === 'song' && live.id === song.id) act({ type: 'item', item: songItem(song), index: stateRef.current.index });
    if (session) pushSongs([song]).catch(() => showToast('Saved here; cloud sync failed'));
  };

  const deleteSong = (song) => {
    const next = removeSong(songs, song.id);
    setSongs(next);
    setEditing(null);
    showToast(`Deleted “${song.title}”`);
    if (session) pushSongs(next.filter((s) => s.id === song.id)).catch(() => {});
  };

  const connected = info.peers.screen > 0 || info.ports > 0;
  const songsPane = html`<${Songs}
    songs=${songs}
    share=${share}
    onSync=${() => runSync()}
    onSetup=${() => {
      // To Settings, where the sharing card is: Orbit opens its Settings orb, the classic console its tab.
      if (wide && ui.layout === 'orbit') dispatchEvent(new Event('ls-open-settings'));
      else if (wide) openLib('settings');
      else setTab('settings');
    }}
    liveId=${state.item && state.item.id}
    onShow=${(s) => showSong(s)}
    onEdit=${(s) => setEditing(s)}
    onNew=${() => setEditing('new')}
  />`;
  const scripturePane = html`<${Scripture}
    prefs=${prefs}
    setPrefs=${setPrefs}
    onShow=${showItem}
    look=${scriptureLookOf(state)}
    font=${state.sFont}
    size=${state.sSize}
    balance=${state.sBalance}
    wide=${Boolean(state.sWide)}
    liveScripture=${Boolean(state.item && state.item.kind === 'scripture' && state.item.book)}
    relayout=${(k) => setLook({}, k)}
  />`;
  const mediaPane = html`<${Media}
    onShow=${showItem}
    illustration=${state.illustration}
    onIllustrate=${(m) => {
      const same = state.illustration && state.illustration.src === m.src;
      act({ type: 'set', patch: { illustration: same ? null : { src: m.src, type: m.type, title: m.title, size: (state.illustration && state.illustration.size) || 'half' } } });
      showToast(same ? 'Removed from beside the words' : `${m.title} is beside the words on the TV`);
    }}
    liveId=${state.item && state.item.id}
    relayOn=${info.cloud !== 'off'}
  />`;
  const settingsPane = html`<${Settings}
    state=${state}
    act=${act}
    info=${info}
    prefs=${prefs}
    setPrefs=${setPrefs}
    songs=${songs}
    setSongs=${setSongs}
    session=${session}
    setSession=${setSession}
    onOutputs=${() => setOutputs(true)}
    setLook=${setLook}
    ui=${ui}
    setUi=${setUi}
    wide=${wide}
    share=${share}
    onConnectShare=${connectShared}
    onSync=${() => runSync()}
    onLeaveShare=${leaveShare}
  />`;
  // A library tab; in Focus it opens the library drawer (again on the open tab: closes it).
  const openLib = (k) => {
    setLibTab(k);
    if (ui.layout === 'focus') setDrawer(drawer === 'lib' && libTab === k ? null : 'lib');
  };
  const livePane = html`<${Live} state=${state} act=${act} info=${info} wide=${wide} goTab=${wide ? openLib : setTab} onOutputs=${() => setOutputs(true)} setLook=${setLook} />`;
  const keysHint = html`Space / → next · ← back · B black · C clear · L logo · <${FollowKeyHint} /> word by word · + / − size`;
  const header = html`<header class="top">
    <div class="brand"><span class="cross">✝</span> Lyric Slides</div>
    ${wide && html`<span class="muted small keys">${keysHint}</span>`}
    <div class="row top-end">
      ${wide && html`<button class="ghost small" onClick=${() => setUi({ layout: 'orbit' })} title="The floating console: orbs around the live picture (Settings → This console → Layout)">Orbit</button>`}
      <${LightSwitch} ui=${ui} setUi=${setUi} />
      <button class=${`pill ${connected ? 'ok' : 'warn'}`} onClick=${() => setOutputs(true)}>
        ${connected ? 'TV ✓' : 'Show on TV'}${info.pending ? ' · waiting' : ''}
      </button>
    </div>
  </header>`;
  const sheets = html`
    ${outputs && link.current && html`<${Outputs} room=${room} link=${link.current} info=${info} onClose=${() => setOutputs(false)} />`}
    ${editing &&
    html`<${SongEditor}
      song=${editing === 'new' ? null : editing}
      songs=${songs}
      onSave=${saveSong}
      onDelete=${deleteSong}
      onClose=${() => setEditing(null)}
      onShow=${(song, index) => {
        saveSong(song);
        showSong(song, index);
      }}
    />`}
    <${Toast} />`;

  // Orbit: the floating console (src/lyrics/orbit.js), on a laptop-wide window.
  if (wide && ui.layout === 'orbit') {
    const looksPane =
      state.item && state.item.kind === 'scripture'
        ? html`<${ScriptureControls} state=${state} act=${act} setLook=${setLook} /><${Emphasis} state=${state} act=${act} />`
        : state.item && state.item.kind === 'song'
          ? html`<${SongLooks} state=${state} act=${act} /><${FollowBar} state=${state} act=${act} /><${Emphasis} state=${state} act=${act} />`
          : html`<p class="muted">Put a song or a passage up first; its looks come here.</p>`;
    return html`<${Orbit}
      state=${state}
      act=${act}
      info=${info}
      prefs=${prefs}
      setPrefs=${setPrefs}
      setUi=${setUi}
      showItem=${showItem}
      setLook=${setLook}
      relayout=${(k) => setLook({}, k)}
      panes=${{ songs: songsPane, scripture: scripturePane, media: mediaPane, settings: settingsPane, looks: looksPane }}
      onOutputs=${() => setOutputs(true)}
      toast=${(m) => showToast(m)}
      sheets=${sheets}
      keysHint=${keysHint}
    />`;
  }

  // Laptop: library | live | outputs, all on one screen (Settings → This console → Layout).
  // Console and Compact show the three columns; Focus shows the rails and opens either side as a drawer.
  if (wide) {
    const libTabs = [
      ['songs', 'Songs'],
      ['scripture', 'Scripture'],
      ['media', 'Media'],
      ['settings', 'Settings'],
    ];
    // Either rail button opens the outputs drawer, scrolled to that output (again: closes it).
    const openOut = (which) => {
      setDrawer(drawer === 'out' ? null : 'out');
      const pane = document.querySelector('.pane.out-pane');
      const sec = document.querySelector(`.out-panel > section:nth-child(${which === 'stream' ? 2 : 1})`);
      if (pane && sec && drawer !== 'out') pane.scrollTop += sec.getBoundingClientRect().top - pane.getBoundingClientRect().top - 12;
    };
    const railBtn = (on, ic, label, onClick) =>
      html`<button class=${`rail-btn ${on ? 'on' : ''}`} onClick=${onClick} title=${label} aria-pressed=${on}>${ic}<span>${label}</span></button>`;
    return html`<div class="app console">
      ${header}
      <div class="console-grid">
        <nav class="rail lib-rail" aria-label="Library">
          ${libTabs.map(([k, label]) => railBtn(drawer === 'lib' && libTab === k, ICONS[k](), label, () => openLib(k)))}
        </nav>
        <aside class=${`pane lib ${drawer === 'lib' ? 'open' : ''}`}>
          <nav class="lib-tabs">
            ${libTabs.map(([k, label]) => html`<button class=${libTab === k ? 'on' : ''} onClick=${() => setLibTab(k)}>${label}</button>`)}
          </nav>
          <div class="pane-body">
            ${libTab === 'songs' && songsPane}${libTab === 'scripture' && scripturePane}${libTab === 'media' && mediaPane}${libTab === 'settings' && settingsPane}
          </div>
        </aside>
        <main class="pane live-pane">${livePane}</main>
        <aside class=${`pane out-pane ${drawer === 'out' ? 'open' : ''}`}>
          ${link.current && html`<${OutputsPanel} room=${room} link=${link.current} info=${info} state=${state} act=${act} onMore=${() => setOutputs(true)} />`}
        </aside>
        <nav class="rail out-rail" aria-label="Outputs">
          ${railBtn(drawer === 'out', ICONS.tv(), 'TV', () => openOut('tv'))}
          ${railBtn(drawer === 'out', ICONS.stream(), 'Stream', () => openOut('stream'))}
          <span class=${`rail-dot ${connected ? 'ok' : ''}`} title=${connected ? 'A TV is connected' : 'No TV connected yet'}></span>
        </nav>
        ${drawer && html`<div class="scrim" onClick=${() => setDrawer(null)}></div>`}
      </div>
      ${sheets}
    </div>`;
  }

  const tabs = [
    ['live', 'Live'],
    ['songs', 'Songs'],
    ['scripture', 'Scripture'],
    ['media', 'Media'],
    ['settings', 'Settings'],
  ];

  return html`<div class="app">
    ${header}
    <main>
      ${tab === 'live' && livePane}${tab === 'songs' && songsPane}${tab === 'scripture' && scripturePane}${tab === 'media' && mediaPane}${tab === 'settings' && settingsPane}
    </main>
    <nav class="tabs">
      ${tabs.map(([k, label]) => html`<button class=${tab === k ? 'on' : ''} onClick=${() => setTab(k)}>${label}</button>`)}
    </nav>
    ${sheets}
  </div>`;
}

render(html`<${App} />`, document.getElementById('app'));
