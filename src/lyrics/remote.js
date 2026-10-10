// /lyrics/ — the remote: pick songs, scripture, pictures and videos, step through slides,
// Clear / Black / Logo, and put the picture on the TV and the stream.
// Laptop: library, live slides and both outputs side by side (keys: Space / arrows, B, C, L). Phone: tabs.

import { html, render, useState, useEffect, useRef, useMemo } from '../ui/h.js';
import { Fit, Stage } from './stage.js';
import { Link, normalizeCode } from './link.js';
import { ROOM } from './config.js';
import { emptyState, reduce, songItem, mediaItem, BACKGROUNDS, BACKGROUND_INFO, PRESET_INFO, STREAM_LAYOUTS, ILLUSTRATION_SIZES } from './state.js';
import { loadSongs, saveSongs, visibleSongs, upsertSong, removeSong, searchSongs, mergeSongs, exportLibrary, importLibrary } from './library.js';
import { parseRef } from './books.js';
import { allVersions, importVersion, removeVersion, passageItem, BUILTIN_VERSIONS } from './bible.js';
import { relayConfig, cloudConfigured, loadSession, captureSession, sendMagicLink, signOut, pullSongs, pushSongs } from './cloud.js';
import { canCast, castTo, displayPermission, extraDisplays, openOn, displayOf, platform } from './cast.js';
import { fontsReady, scriptureFit } from './measure.js';
import { idbSet, idbDel } from './idb.js';
import { SongEditor } from './editor.js';
import qrcode from '../../vendor/qrcode.js';

const LS_PREFS = 'ls-remote-prefs';
const LS_RECENT_REFS = 'ls-recent-refs';
const LS_MEDIA = 'ls-media';
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
    // Open / closed changes as the operator closes windows.
    const t = setInterval(() => tick((n) => n + 1), 2000);
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
      <div class="mini"><${Fit}><${Stage} state=${state} out="tv" /><//></div>
      <div class="row wrap">
        <button class="primary" onClick=${o.openTv} title="Opens fullscreen on the TV's display">TV picture</button>
        ${canCast() && html`<button onClick=${o.cast} disabled=${o.busy === 'cast'}>Cast…</button>`}
        ${o.picker('tv')}
      </div>
      <p class="muted small"><${WirelessSteps} /></p>
    </section>
    <section>
      <div class="row between"><h2>Stream · ATEM</h2>${status('stream')}</div>
      <div class="mini"><${Fit}><${Stage} state=${state} out="stream" layout=${layout} background=${state.streamBg === 'tv' ? 'auto' : 'key'} /><//></div>
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

// ------------------------------------------------------------------ live

function Live({ state, act, info, goTab, onOutputs, wide }) {
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

  return html`<div class="live">
    <div class="preview" onPointerDown=${onDown} onPointerUp=${onUp}>
      <${Fit}><${Stage} state=${state} /><//>
      <span class="preview-tag">${state.mode === 'show' ? 'LIVE' : state.mode.toUpperCase()}</span>
    </div>
    <div class="nav">
      <button class="big" onClick=${() => act({ type: 'prev' })} aria-label="Previous slide">‹ Back</button>
      <button class="big primary" onClick=${() => act({ type: 'next' })} aria-label="Next slide">Next ›</button>
    </div>
    <div class="modes">${modeBtn('clear', 'Clear')}${modeBtn('black', 'Black')}${modeBtn('logo', 'Logo')}</div>
    ${!connected &&
    !wide &&
    html`<button class="note-btn" onClick=${onOutputs}>
      <b>No TV connected yet.</b> <span>Tap to put the picture on the TV or the stream ›</span>
    </button>`}
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
                ${`${item.kind === 'song' ? PRESET_INFO[item.preset || 'worship'].name : item.kind === 'scripture' ? item.versions.join(' + ') : { both: 'TV + stream', tv: 'TV only', stream: 'Stream only' }[item.to || 'both']} · ${state.index + 1}/${item.slides.length}`}
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
  </div>`;
}

// ------------------------------------------------------------------ songs

function Songs({ songs, onShow, onEdit, onNew, liveId }) {
  const [q, setQ] = useState('');
  const list = useMemo(() => searchSongs(songs, q), [songs, q]);
  return html`<div class="songs">
    <div class="row">
      <input class="grow" type="search" value=${q} onInput=${(e) => setQ(e.target.value)} placeholder="Search songs, words, tags" />
      <button class="primary" onClick=${onNew}>+ New</button>
    </div>
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

function Scripture({ prefs, setPrefs, onShow }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [recent, setRecent] = useState(() => read(LS_RECENT_REFS, ['Zabbuli 23:1-6', 'Yokaana 3:16']));
  const versions = allVersions();
  const ref = parseRef(text);

  const go = async (t = text) => {
    const r = parseRef(t);
    if (!r) {
      setErr('Type a reference like “Zabbuli 23:1-4” or “Psalm 23:1-4”.');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      // Measured in the real font, so a slide holds exactly what fits at the fixed size.
      const loaded = await Promise.race([fontsReady(), new Promise((res) => setTimeout(() => res(null), 3000))]);
      const fit = loaded !== null && document.fonts.check('600 92px Montserrat') ? scriptureFit() : undefined;
      const item = await passageItem({ ref: r, primaryId: prefs.primary, secondaryId: prefs.secondary, flow: !prefs.perVerse, fit });
      onShow(item);
      const label = t.trim();
      const next = [label, ...recent.filter((x) => x.toLowerCase() !== label.toLowerCase())].slice(0, 8);
      setRecent(next);
      write(LS_RECENT_REFS, next);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const vSelect = (key, allowNone) => html`<select value=${prefs[key] || ''} onChange=${(e) => setPrefs({ ...prefs, [key]: e.target.value })}>
    ${allowNone && html`<option value="">None</option>`}
    ${versions.map((v) => html`<option value=${v.id}>${v.name}</option>`)}
  </select>`;

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
        placeholder="Zabbuli 23:1-4 or Psalm 23:1-4"
        autocomplete="off"
        aria-label="Bible reference"
      />
      <button class="primary" disabled=${busy || !text.trim()}>${busy ? '…' : 'Show'}</button>
    </form>
    <p class="small ${ref ? 'ok' : 'muted'}">
      ${ref
        ? `${ref.book.lg} ${ref.chapter}${ref.from ? `:${ref.from}${ref.to !== ref.from ? `-${ref.to}` : ''}` : ' (whole chapter)'} · ${ref.book.en}`
        : 'Luganda or English book names, short forms work too (Zab, Yk, Ps, Jn).'}
    </p>
    ${err && html`<p class="error small">${err}</p>`}
    <div class="row wrap">
      <label class="field grow"><span>On top (read aloud)</span>${vSelect('primary', false)}</label>
      <label class="field grow"><span>Below, smaller</span>${vSelect('secondary', true)}</label>
    </div>
    <label class="toggle">
      <input type="checkbox" checked=${!prefs.perVerse} onChange=${(e) => setPrefs({ ...prefs, perVerse: !e.target.checked })} />
      <span>Continue the text across slides at the same size until it ends (off: one verse per slide)</span>
    </label>
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
  const [mine, setMine] = useState(() => read(LS_MEDIA, []));
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

  const opts = () => ({ to, loop });
  const show = (files) => onShow(mediaItem(files, opts()));

  const addFiles = async (files) => {
    const added = [];
    for (const f of files) {
      const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      try {
        await idbSet('files', `media:${id}`, f);
        added.push({ id, title: f.name.replace(/\.[^.]+$/, ''), type: f.type.startsWith('video') ? 'video' : 'image', src: `idb:media:${id}` });
      } catch {
        showToast(`${f.name} is too big to keep`);
      }
    }
    const next = [...mine, ...added];
    setMine(next);
    write(LS_MEDIA, next);
    if (added.length) showToast(`Added ${added.length} file${added.length === 1 ? '' : 's'}`);
  };
  const remove = (m) => {
    idbDel('files', `media:${m.id}`).catch(() => {});
    const next = mine.filter((x) => x.id !== m.id);
    setMine(next);
    write(LS_MEDIA, next);
  };
  const addUrl = () => {
    const u = url.trim();
    if (!u) return;
    const type = /\.(mp4|webm|m4v|mov|ogv)(\?|$)/i.test(u) ? 'video' : 'image';
    const m = { id: `u:${u}`, title: u.split('/').pop().split('?')[0] || u, type, src: u };
    const next = [...mine.filter((x) => x.id !== m.id), m];
    setMine(next);
    write(LS_MEDIA, next);
    setUrl('');
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

function Settings({ state, act, info, prefs, setPrefs, songs, setSongs, session, setSession, onOutputs }) {
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
      <label class="toggle">
        <input type="checkbox" checked=${state.fill !== false} onChange=${(e) => act({ type: 'set', patch: { fill: e.target.checked } })} />
        <span>Grow the words to use the screen (never smaller than the standard size)</span>
      </label>
      <label class="toggle">
        <input type="checkbox" checked=${state.caps !== false} onChange=${(e) => act({ type: 'set', patch: { caps: e.target.checked } })} />
        <span>Capital letters for lyrics</span>
      </label>
    </section>

    <section class="card">
      <h2>Bible versions</h2>
      <ul class="plain">
        ${versions.map(
          (v) => html`<li class="row between">
            <span><b>${v.name}</b> <span class="muted small">${v.lang === 'lg' ? 'Luganda' : 'English'}</span></span>
            ${!BUILTIN_VERSIONS.some((b) => b.id === v.id) &&
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
  const [editing, setEditing] = useState(null);
  const [outputs, setOutputs] = useState(false);
  const [prefs, setPrefsRaw] = useState(() => ({ primary: 'lug68', secondary: 'kjv', perVerse: false, ...read(LS_PREFS, {}) }));
  const [session, setSession] = useState(() => loadSession());
  const link = useRef(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const setSongs = (list) => {
    setSongsRaw(list);
    saveSongs(list);
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
      else return;
      e.preventDefault();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [editing, outputs, room]);

  const showItem = (item, index = 0) => {
    act({ type: 'item', item, index });
    if (!wide) setTab('live');
  };
  const showSong = (song, index = 0) => showItem(songItem(song), index);

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
    liveId=${state.item && state.item.id}
    onShow=${(s) => showSong(s)}
    onEdit=${(s) => setEditing(s)}
    onNew=${() => setEditing('new')}
  />`;
  const scripturePane = html`<${Scripture} prefs=${prefs} setPrefs=${setPrefs} onShow=${showItem} />`;
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
  />`;
  const livePane = html`<${Live} state=${state} act=${act} info=${info} wide=${wide} goTab=${wide ? setLibTab : setTab} onOutputs=${() => setOutputs(true)} />`;
  const header = html`<header class="top">
    <div class="brand"><span class="cross">✝</span> Lyric Slides</div>
    ${wide && html`<span class="muted small keys">Space / → next · ← back · B black · C clear · L logo</span>`}
    <button class=${`pill ${connected ? 'ok' : 'warn'}`} onClick=${() => setOutputs(true)}>
      ${connected ? 'TV ✓' : 'Show on TV'}${info.pending ? ' · waiting' : ''}
    </button>
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

  // Laptop: library | live | outputs, all on one screen.
  if (wide) {
    const libTabs = [
      ['songs', 'Songs'],
      ['scripture', 'Scripture'],
      ['media', 'Media'],
      ['settings', 'Settings'],
    ];
    return html`<div class="app console">
      ${header}
      <div class="console-grid">
        <aside class="pane lib">
          <nav class="lib-tabs">
            ${libTabs.map(([k, label]) => html`<button class=${libTab === k ? 'on' : ''} onClick=${() => setLibTab(k)}>${label}</button>`)}
          </nav>
          <div class="pane-body">
            ${libTab === 'songs' && songsPane}${libTab === 'scripture' && scripturePane}${libTab === 'media' && mediaPane}${libTab === 'settings' && settingsPane}
          </div>
        </aside>
        <main class="pane live-pane">${livePane}</main>
        <aside class="pane out-pane">
          ${link.current && html`<${OutputsPanel} room=${room} link=${link.current} info=${info} state=${state} act=${act} onMore=${() => setOutputs(true)} />`}
        </aside>
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
