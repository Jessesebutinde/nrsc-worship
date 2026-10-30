// The song editor: listen, fix cut points, split medleys, name songs, export.

import { html, useState, useEffect, useRef, useMemo, useCallback } from './h.js';
import { createPlayer, usePlayerState, SKIPS, skipLabel } from './player.js';
import { fmtTime, parseTime } from '../util.js';
import {
  fromDetected,
  splitSong,
  mergeWithNext,
  removeSong,
  addSong,
  updateSong,
  setEdge,
  sectionLabels,
  sectionName,
} from '../songs.js';
import { displayName, suggestNames, libraryRecord } from '../naming.js';
import { loadEdits, saveEdits, loadLibrary, saveLibrary } from '../store.js';
import { keepFocus, toast, Meter, AnimatedNumber } from './common.js';
import { NameAllSheet, SetlistSheet, LibrarySheet } from './sheets.js';
import { ExportPanel } from './export.js';

const SECTION_PRESETS = ['Intro', 'Verse', 'Pre-chorus', 'Chorus', 'Bridge', 'Tag', 'Vamp', 'Outro', 'Instrumental'];

function initState(jobKey, detected, estimated) {
  const saved = loadEdits(jobKey);
  if (saved && Array.isArray(saved.songs)) {
    return { songs: saved.songs, setlist: saved.setlist || [], exported: saved.exported || null, restored: true };
  }
  return { songs: fromDetected(detected, { estimated }), setlist: [], exported: null, restored: false };
}

/**
 * props:
 *  jobKey      stable key for saving edits (job id or local file key)
 *  title       service title; link: YouTube link (optional)
 *  audioSrc    URL the <audio> element plays
 *  loadMedia   () => Promise<media> for waveforms and export
 *  detected    songs from the backend / local analysis
 *  duration    seconds of audio scanned
 */
export function Editor({ jobKey, title, link, subtitle, audioSrc, loadMedia, detected, duration, estimated }) {
  const [state, setState] = useState(() => initState(jobKey, detected, estimated));
  const [library, setLibrary] = useState(loadLibrary);
  const [sheet, setSheet] = useState(null);
  const [media, setMedia] = useState(null);
  const [mediaError, setMediaError] = useState(null);
  const [mediaProg, setMediaProg] = useState({ f: 0.05, label: 'Connecting to the audio' });
  const player = useMemo(() => createPlayer(audioSrc), [audioSrc]);
  const cuts = useRef(new Map());

  useEffect(() => () => player.destroy(), [player]);

  useEffect(() => {
    let alive = true;
    loadMedia((f, label) => alive && setMediaProg({ f, label }))
      .then((m) => alive && setMedia(m))
      .catch((e) => alive && setMediaError(e.message || String(e)));
    return () => {
      alive = false;
    };
  }, [loadMedia]);

  // Save on every change (cheap: a few KB of JSON).
  useEffect(() => {
    const { songs, setlist, exported } = state;
    if (!saveEdits(jobKey, { songs, setlist, exported })) {
      // Storage full or blocked: keep working, but say so once.
      if (!Editor.warned) toast("Couldn't save on this device — names will be lost on refresh");
      Editor.warned = true;
    }
  }, [state]);

  const total = duration || (media && media.duration) || Math.max(0, ...state.songs.map((s) => s.end));
  const songs = state.songs;

  const setSongs = useCallback((fn) => setState((s) => ({ ...s, songs: fn(s.songs) })), []);

  const latest = useRef(state);
  latest.current = state;

  // The only way a song gets a name: the user typed it or tapped it.
  const nameSong = useCallback(
    (id, name, opts = {}) => {
      const clean = name.replace(/\s+/g, ' ').trim();
      const song = latest.current.songs.find((x) => x.id === id);
      if (!song || song.name === clean) return;
      setState((s) => ({ ...s, songs: updateSong(s.songs, id, { name: clean }) }));
      setLibrary((lib) => {
        const next = libraryRecord(lib, `${jobKey}:${id}`, clean, { bpm: song.bpm, key: song.key });
        saveLibrary(next);
        return next;
      });
      if (opts.undo !== false) {
        const before = song.name;
        toast(clean ? `Renamed to “${clean}”` : 'Name cleared', {
          label: 'Undo',
          run: () => nameRef.current(id, before, { undo: false }),
        });
      }
    },
    [jobKey],
  );
  const nameRef = useRef(nameSong);
  nameRef.current = nameSong;

  const suggestFor = useCallback(
    (song, typed) =>
      suggestNames({
        song,
        typed,
        library,
        setlist: state.setlist,
        taken: songs.filter((s) => s.id !== song.id && s.name).map((s) => s.name),
      }),
    [library, state.setlist, songs],
  );

  const named = songs.filter((s) => s.name).length;
  const selected = songs.filter((s) => s.selected).length;
  const allSelected = selected === songs.length;

  return html`
    <div class="editor">
      <header class="svc-head">
        <h1 class="svc-title">${title || 'Service'}</h1>
        <div class="svc-meta">
          ${subtitle}
          ${link && html` · <a href=${link} target="_blank" rel="noopener">YouTube ↗</a>`}
        </div>
        ${state.restored && html`<div class="svc-meta saved">Your names and cut changes on this device were restored.</div>`}
      </header>

      ${songs.length > 0 &&
      html`<div class="named-meter">
        <div class="named-top">
          <span><strong><${AnimatedNumber} value=${named} /></strong> of ${songs.length} named</span>
          ${named === songs.length ? html`<span class="ok pop">All named ✓</span>` : html`<span class="muted small">tap a name to edit</span>`}
        </div>
        <${Meter} value=${(named / songs.length) * 100} small />
      </div>`}
      ${!media &&
      !mediaError &&
      html`<div class="media-loading">
        <${Meter} value=${mediaProg.f * 100} active small />
        <span class="muted small">${mediaProg.label}… ${Math.round(mediaProg.f * 100)}%</span>
      </div>`}

      <div class="toolbar">
        <button class="btn primary" onClick=${() => setSheet('nameAll')} disabled=${!songs.length}>
          Name all${named ? ` (${named}/${songs.length})` : ''}
        </button>
        <button class="btn" onClick=${() => setSheet('setlist')} disabled=${!songs.length}>Paste setlist</button>
        <button class="btn" onClick=${() => setSheet('library')}>Song library</button>
      </div>

      ${!songs.length &&
      html`<div class="card empty">
        <p>No songs were found in this part of the service.</p>
        <p class="muted">Play the audio, pause where a song starts, then add it.</p>
      </div>`}

      <div class="list-head">
        <label class="check">
          <input
            type="checkbox"
            checked=${allSelected}
            onChange=${() => setSongs((ss) => ss.map((s) => ({ ...s, selected: !allSelected })))}
          />
          <span>${selected} of ${songs.length} selected for export</span>
        </label>
        <button class="link-btn" onClick=${() => {
          const t = player.time;
          setSongs((ss) => addSong(ss, t, Math.min(total, t + 240)));
          toast(`Added a song at ${fmtTime(t)}`);
        }}>+ Add song at ${html`<${PlayheadTime} player=${player} />`}</button>
      </div>

      <ol class="songs">
        ${songs.map(
          (s, i) => html`<${SongCard}
            key=${s.id}
            song=${s}
            index=${i}
            isLast=${i === songs.length - 1}
            total=${total}
            player=${player}
            media=${media}
            setSongs=${setSongs}
            nameSong=${nameSong}
            suggestFor=${suggestFor}
          />`,
        )}
      </ol>

      <${ExportPanel}
        songs=${songs}
        media=${media}
        mediaError=${mediaError}
        cuts=${cuts.current}
        serviceTitle=${title}
        link=${link}
        exported=${state.exported}
        onExported=${(exported) => setState((s) => ({ ...s, exported }))}
      />

      <${PlayerBar} player=${player} songs=${songs} total=${total} />

      ${sheet === 'nameAll' &&
      html`<${NameAllSheet}
        songs=${songs}
        player=${player}
        nameSong=${nameSong}
        suggestFor=${suggestFor}
        onClose=${() => setSheet(null)}
      />`}
      ${sheet === 'setlist' &&
      html`<${SetlistSheet}
        songs=${songs}
        library=${library}
        initial=${state.setlist}
        player=${player}
        onApply=${(names, lines) => {
          setState((s) => ({ ...s, setlist: lines }));
          for (const [id, name] of names) nameSong(id, name, { undo: false });
          setSheet(null);
          if (names.length) toast(`Named ${names.length} song${names.length > 1 ? 's' : ''}`);
        }}
        onClose=${() => setSheet(null)}
      />`}
      ${sheet === 'library' &&
      html`<${LibrarySheet}
        library=${library}
        onChange=${(lib) => {
          saveLibrary(lib);
          setLibrary(lib);
        }}
        onClose=${() => setSheet(null)}
      />`}
    </div>
  `;
}

function PlayheadTime({ player }) {
  const { time } = usePlayerState(player);
  return fmtTime(time);
}

// ------------------------------------------------------------------ player

function PlayerBar({ player, songs, total }) {
  const { time, playing } = usePlayerState(player);

  // Keyboard: Space plays/pauses, ←/→ skip 30 s, Shift+←/→ skip 2 min.
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(t.tagName))) return;
      if (document.body.classList.contains('sheet-open')) return;
      if (e.key === ' ') {
        e.preventDefault();
        player.toggle();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const d = (e.shiftKey ? 120 : 30) * (e.key === 'ArrowRight' ? 1 : -1);
        player.seek(Math.max(0, Math.min(total, player.time + d)));
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [player, total]);
  const barRef = useRef(null);
  const current = songs.findIndex((s) => time >= s.start && time < s.end);
  const seekFromEvent = (e) => {
    const r = barRef.current.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    player.seek(x * total);
  };
  const err = player.error;
  return html`
    <div class="player">
      <div
        class="timeline"
        ref=${barRef}
        onPointerDown=${(e) => {
          seekFromEvent(e);
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove=${(e) => e.buttons && seekFromEvent(e)}
        role="slider"
        aria-label="Position in the service"
        aria-valuemin="0"
        aria-valuemax=${Math.round(total)}
        aria-valuenow=${Math.round(time)}
        tabindex="0"
        onKeyDown=${(e) => {
          if (e.key === 'ArrowRight') player.seek(time + 5);
          if (e.key === 'ArrowLeft') player.seek(time - 5);
        }}
      >
        ${songs.map(
          (s, i) => html`<div
            key=${s.id}
            class=${'tl-song' + (i === current ? ' current' : '') + (s.selected ? '' : ' off')}
            style=${{ left: `${(s.start / total) * 100}%`, width: `${((s.end - s.start) / total) * 100}%` }}
          >
            <span>${i + 1}</span>
          </div>`,
        )}
        <div class="tl-head" style=${{ left: `${(time / total) * 100}%` }}></div>
      </div>
      <div class="skips" role="group" aria-label="Skip">
        ${SKIPS.map(
          (d) => html`<button
            class=${'skip' + (d < 0 ? ' back' : ' fwd')}
            aria-label=${`${d < 0 ? 'Back' : 'Forward'} ${skipLabel(d)}`}
            onClick=${() => player.seek(Math.max(0, Math.min(total, time + d)))}
          >
            ${d < 0 ? '−' : '+'}${skipLabel(d)}
          </button>`,
        )}
      </div>
      <div class="player-row">
        <button class="icon-btn" aria-label="Back 10 seconds" onClick=${() => player.seek(time - 10)}>−10</button>
        <button class="play-btn" aria-label=${playing ? 'Pause' : 'Play'} onClick=${() => player.toggle()}>
          ${playing ? '❚❚' : '▶'}
        </button>
        <button class="icon-btn" aria-label="Forward 10 seconds" onClick=${() => player.seek(time + 10)}>+10</button>
        <div class="player-time">
          <strong>${fmtTime(time)}</strong> / ${fmtTime(total)}
          <div class="muted now">
            ${err ? 'Audio could not be played' : current >= 0 ? displayName(songs[current], current) : 'between songs'}
          </div>
        </div>
      </div>
    </div>
  `;
}

// --------------------------------------------------------------- song card

function SongCard({ song, index, isLast, total, player, media, setSongs, nameSong, suggestFor }) {
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const len = song.end - song.start;
  const moved = Math.abs(song.start - song.detected.start) > 0.05 || Math.abs(song.end - song.detected.end) > 0.05;

  return html`
    <li
      class=${'song card' + (song.selected ? '' : ' deselected') + (song.check ? ' needs-check' : '') + (song.name ? ' is-named' : '')}
      style=${{ '--i': index }}
    >
      <div class="song-top">
        <label class="check big" title="Export this song">
          <input
            type="checkbox"
            checked=${song.selected}
            aria-label=${`Export ${displayName(song, index)}`}
            onChange=${() => setSongs((ss) => updateSong(ss, song.id, { selected: !song.selected }))}
          />
        </label>
        <div class="song-num">${song.name ? html`<span class="num-tick">✓</span>` : index + 1}</div>
        <div class="song-main">
          <${NameField} song=${song} index=${index} suggestFor=${suggestFor} onCommit=${(name) => nameSong(song.id, name)} />
          <div class="song-times">
            ${fmtTime(song.start)} – ${fmtTime(song.end)} <span class="muted">(${fmtTime(len)})</span>
            ${moved && html`<span class="tag">cuts adjusted</span>`}
          </div>
          <div class="badges">
            ${song.check && html`<span class="badge warn" title=${song.note}>Check</span>`}
            ${song.medley && html`<span class="badge">Medley?</span>`}
            ${song.bpm && html`<span class="badge plain">${song.estimated ? '~' : ''}${Math.round(song.bpm)} BPM</span>`}
            ${song.key && html`<span class="badge plain">${song.estimated ? '~' : ''}${song.key}</span>`}
            ${song.confidence != null && html`<span class="badge plain">${song.confidence}% sure</span>`}
          </div>
        </div>
      </div>

      ${song.note && html`<p class="song-note">${song.note}</p>`}

      <div class="song-actions">
        <button class="btn small" onClick=${() => player.play(song.start)}>▶ Start</button>
        <button class="btn small" onClick=${() => player.play(Math.max(song.start, song.end - 6), song.end)}>
          ▶ Hear the end
        </button>
        <button class=${'btn small' + (open ? ' active' : '')} aria-expanded=${open} onClick=${() => setOpen(!open)}>
          ${open ? 'Done' : 'Fix cuts'}
        </button>
        <div class="menu-wrap">
          <button class="btn small" aria-haspopup="true" aria-expanded=${menu} onClick=${() => setMenu(!menu)}>⋯</button>
          ${menu &&
          html`<div class="menu" onClick=${() => setMenu(false)}>
            ${!isLast && html`<button onClick=${() => setSongs((ss) => mergeWithNext(ss, song.id))}>Join with next song</button>`}
            ${moved &&
            html`<button
              onClick=${() =>
                setSongs((ss) => updateSong(ss, song.id, { start: song.detected.start, end: song.detected.end }))}
            >
              Reset cut points
            </button>`}
            <button
              class="danger"
              onClick=${() => {
                if (confirm(`Remove "${displayName(song, index)}" from the list?`)) setSongs((ss) => removeSong(ss, song.id));
              }}
            >
              Remove from list
            </button>
          </div>`}
        </div>
      </div>

      ${open &&
      html`<div class="cut-panel">
        <${CutEditor} edge="start" song=${song} total=${total} player=${player} media=${media} setSongs=${setSongs} />
        <${CutEditor} edge="end" song=${song} total=${total} player=${player} media=${media} setSongs=${setSongs} />
        <${SplitTools} song=${song} player=${player} setSongs=${setSongs} />
        ${song.sections.length > 0 && html`<${SectionTools} song=${song} index=${index} setSongs=${setSongs} player=${player} />`}
      </div>`}
    </li>
  `;
}

/**
 * The song name is a real <input> at all times, so tapping it opens the
 * phone keyboard straight away (iOS only does that for a direct tap).
 * Suggestions appear while it has focus; nothing changes until Enter,
 * leaving the field, or tapping a suggestion.
 */
export function NameField({ song, index, suggestFor, onCommit }) {
  const [text, setText] = useState(song.name || '');
  const [focused, setFocused] = useState(false);
  const [hi, setHi] = useState(-1);
  const [flash, setFlash] = useState(0);
  const ref = useRef(null);
  const cancelled = useRef(false);
  useEffect(() => {
    if (!focused) setText(song.name || '');
  }, [song.name]);
  const sugg = focused ? suggestFor(song, text === song.name ? '' : text) : [];
  const commit = (name) => {
    if ((name || '').trim() !== (song.name || '')) setFlash((n) => n + 1);
    onCommit(name);
  };
  const pick = (title) => {
    setText(title);
    commit(title);
    cancelled.current = true;
    ref.current.blur();
  };
  return html`
    <div class=${'name-edit' + (focused ? ' focused' : '')}>
      <div class="name-wrap">
        <input
          ref=${ref}
          class=${'song-name' + (song.name ? '' : ' unnamed')}
          value=${text}
          placeholder=${`Song ${index + 1} — tap to name`}
          aria-label=${`Name of song ${index + 1}`}
          aria-autocomplete="list"
          autocomplete="off"
          autocorrect="off"
          spellcheck=${false}
          autocapitalize="words"
          enterkeyhint="done"
          onFocus=${(e) => {
            cancelled.current = false;
            setFocused(true);
            setHi(-1);
            e.currentTarget.select();
          }}
          onInput=${(e) => {
            setText(e.currentTarget.value);
            setHi(-1);
          }}
          onKeyDown=${(e) => {
            if (e.key === 'ArrowDown' && sugg.length) {
              e.preventDefault();
              setHi((h) => (h + 1) % sugg.length);
            } else if (e.key === 'ArrowUp' && sugg.length) {
              e.preventDefault();
              setHi((h) => (h <= 0 ? sugg.length - 1 : h - 1));
            } else if (e.key === 'Enter') {
              if (hi >= 0 && sugg[hi]) pick(sugg[hi].title);
              else e.currentTarget.blur();
            } else if (e.key === 'Tab' && !e.shiftKey && sugg.length && text && text !== song.name) {
              e.preventDefault();
              pick(sugg[Math.max(0, hi)].title);
            } else if (e.key === 'Escape') {
              cancelled.current = true;
              setText(song.name || '');
              e.currentTarget.blur();
            }
          }}
          onBlur=${() => {
            setFocused(false);
            if (!cancelled.current) commit(text);
          }}
        />
        ${flash > 0 && html`<span class="saved-flash" key=${flash} aria-hidden="true">✓ saved</span>`}
      </div>
      ${sugg.length > 0 &&
      html`<div class="chips suggest" role="listbox" aria-label="Suggestions">
        ${sugg.map(
          (s, i) => html`<button
            role="option"
            aria-selected=${i === hi}
            class=${'chip' + (s.taken ? ' taken' : '') + (i === hi ? ' hi' : '')}
            style=${{ '--i': i }}
            onMouseDown=${keepFocus}
            onPointerDown=${keepFocus}
            onClick=${() => pick(s.title)}
            title=${s.reason}
          >
            ${s.title}<small>${s.taken ? 'already used' : s.reason}</small>
          </button>`,
        )}
      </div>`}
    </div>
  `;
}

// -------------------------------------------------------------- cut editing

const NUDGES = [-5, -1, -0.2, 0.2, 1, 5];

function CutEditor({ edge, song, total, player, media, setSongs }) {
  const value = edge === 'start' ? song.start : song.end;
  const [text, setText] = useState(fmtTime(value, { tenths: true }));
  useEffect(() => setText(fmtTime(value, { tenths: true })), [value]);
  const set = (t) => setSongs((ss) => setEdge(ss, song.id, edge, t, total));
  const commitText = () => {
    const t = parseTime(text);
    if (t == null) setText(fmtTime(value, { tenths: true }));
    else set(t);
  };
  return html`
    <div class="cut">
      <div class="cut-row">
        <span class="cut-label">${edge === 'start' ? 'Starts' : 'Ends'}</span>
        <input
          class="time-input"
          value=${text}
          inputmode="decimal"
          aria-label=${edge === 'start' ? 'Start time' : 'End time'}
          onInput=${(e) => setText(e.currentTarget.value)}
          onBlur=${commitText}
          onKeyDown=${(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        ${edge === 'start'
          ? html`<button class="btn small" onClick=${() => player.play(value)}>▶ From here</button>`
          : html`<button class="btn small" onClick=${() => player.play(Math.max(0, value - 5), value)}>▶ Up to here</button>`}
        <button class="btn small" onClick=${() => set(player.time)} title="Use the current playback position">
          Set to playhead
        </button>
      </div>
      <div class="nudges" role="group" aria-label=${`Nudge ${edge}`}>
        ${NUDGES.map(
          (d) => html`<button class="btn small nudge" onClick=${() => set(value + d)}>
            ${d > 0 ? '+' : '−'}${Math.abs(d)}s
          </button>`,
        )}
      </div>
      <${Waveform}
        media=${media}
        at=${value}
        edge=${edge}
        player=${player}
        onPick=${(t) => {
          set(t);
          player.play(edge === 'start' ? t : Math.max(0, t - 4), edge === 'start' ? undefined : t);
        }}
      />
    </div>
  `;
}

const WAVE_SPAN = 24; // seconds shown around a cut
const WAVE_RATE = 8000;

function Waveform({ media, at, edge, player, onPick }) {
  const canvas = useRef(null);
  const [win, setWin] = useState(null); // { t0, t1, peaks }
  const [err, setErr] = useState(null);
  const { time } = usePlayerState(player);

  // (Re)load when the cut moves near the edge of what we have.
  useEffect(() => {
    if (!media) return;
    if (win && at > win.t0 + 4 && at < win.t1 - 4) return;
    let alive = true;
    const t0 = Math.max(0, at - WAVE_SPAN / 2);
    const t1 = Math.min(media.duration, t0 + WAVE_SPAN);
    media
      .readPcm(t0, t1, WAVE_RATE)
      .then((pcm) => {
        if (!alive) return;
        setWin({ t0, t1, pcm });
        setErr(null);
      })
      .catch((e) => alive && setErr(e.message || 'Could not load the waveform'));
    return () => {
      alive = false;
    };
  }, [media, Math.round(at)]);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !win) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth;
    const h = c.clientHeight;
    c.width = w * dpr;
    c.height = h * dpr;
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    const css = getComputedStyle(c);
    const col = (n) => css.getPropertyValue(n).trim();
    const { t0, t1, pcm } = win;
    const xOf = (t) => ((t - t0) / (t1 - t0)) * w;
    g.clearRect(0, 0, w, h);
    // Outside the song: dimmed.
    g.fillStyle = col('--wave-out');
    if (edge === 'start') g.fillRect(0, 0, xOf(at), h);
    else g.fillRect(xOf(at), 0, w - xOf(at), h);
    g.fillStyle = col('--wave');
    const { data, sampleRate, startTime } = pcm;
    let peak = 0.02;
    for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
    for (let x = 0; x < w; x++) {
      const a = Math.floor((t0 + ((t1 - t0) * x) / w - startTime) * sampleRate);
      const b = Math.floor((t0 + ((t1 - t0) * (x + 1)) / w - startTime) * sampleRate);
      let m = 0;
      for (let i = Math.max(0, a); i < Math.min(data.length, b); i++) m = Math.max(m, Math.abs(data[i]));
      const y = (m / peak) * (h / 2 - 2);
      g.fillRect(x, h / 2 - y, 1, Math.max(1, 2 * y));
    }
    g.fillStyle = col('--accent');
    g.fillRect(xOf(at) - 1, 0, 2, h);
    if (time >= t0 && time <= t1) {
      g.fillStyle = col('--playhead');
      g.fillRect(xOf(time), 0, 1, h);
    }
  }, [win, at, time, edge]);

  if (!media) return html`<div class="wave placeholder">${err || 'Loading waveform…'}</div>`;
  if (err) return html`<div class="wave placeholder">${err}</div>`;
  return html`
    <div class="wave-wrap">
      <canvas
        class="wave"
        ref=${canvas}
        aria-label="Waveform around the cut. Tap to move the cut."
        onClick=${(e) => {
          if (!win) return;
          const r = e.currentTarget.getBoundingClientRect();
          onPick(win.t0 + ((e.clientX - r.left) / r.width) * (win.t1 - win.t0));
        }}
      ></canvas>
      ${win &&
      html`<div class="wave-scale"><span>${fmtTime(win.t0)}</span><span>tap to move the cut</span><span>${fmtTime(win.t1)}</span></div>`}
    </div>
  `;
}

function SplitTools({ song, player, setSongs }) {
  const { time } = usePlayerState(player);
  const inside = time > song.start + 1 && time < song.end - 1;
  const points = song.medleyAt.filter((t) => t > song.start + 1 && t < song.end - 1);
  return html`
    <div class="split">
      <div class="cut-label">Split into two songs</div>
      <div class="chips">
        ${points.map(
          (t) => html`<span class="split-pt">
            <button class="chip" onClick=${() => player.play(Math.max(song.start, t - 5), t + 5)}>▶ ${fmtTime(t)}</button>
            <button class="chip strong" onClick=${() => setSongs((ss) => splitSong(ss, song.id, t))}>Split at ${fmtTime(t)}</button>
          </span>`,
        )}
        <button class="chip strong" disabled=${!inside} onClick=${() => setSongs((ss) => splitSong(ss, song.id, time))}>
          Split at playhead ${inside ? fmtTime(time) : ''}
        </button>
      </div>
      ${points.length > 0 && html`<p class="muted small">Suggested points come from where the music changes key.</p>`}
      ${!inside && html`<p class="muted small">Play the song and pause where the next one begins to split there.</p>`}
    </div>
  `;
}

// "Part A" -> "A" so the strip stays readable on a phone.
function shortSection(name) {
  const m = /^Part ([A-Z])$/.exec(name);
  return m ? m[1] : name;
}

function SectionTools({ song, index, setSongs, player }) {
  const labels = sectionLabels(song);
  const [editing, setEditing] = useState(null);
  const rename = (label, name) =>
    setSongs((ss) =>
      updateSong(ss, song.id, { sectionNames: { ...song.sectionNames, [label]: name.trim() || undefined } }),
    );
  return html`
    <div class="sections">
      <div class="cut-label">Sections</div>
      <div class="section-strip">
        ${song.sections.map(
          (s) => html`<button
            class="sec"
            style=${{ flexGrow: Math.max(1, s.end - s.start) }}
            title=${`${sectionName(song, s.label)} ${fmtTime(s.start)}–${fmtTime(s.end)}`}
            onClick=${() => player.play(s.start, s.end)}
          >
            ${shortSection(sectionName(song, s.label))}
          </button>`,
        )}
      </div>
      <div class="sec-names">
        ${labels.map(
          (l) => html`<div class="sec-name">
            ${song.sectionNames[l] && html`<span class="muted">${l} →</span>`}
            ${editing === l
              ? html`<span class="chips">
                  ${SECTION_PRESETS.map(
                    (p) => html`<button class="chip" onClick=${() => {
                      rename(l, p);
                      setEditing(null);
                    }}>${p}</button>`,
                  )}
                  <button class="chip" onClick=${() => {
                    const v = prompt('Section name', sectionName(song, l));
                    if (v != null) rename(l, v);
                    setEditing(null);
                  }}>Other…</button>
                  ${song.sectionNames[l] && html`<button class="chip" onClick=${() => {
                    rename(l, '');
                    setEditing(null);
                  }}>Reset</button>`}
                </span>`
              : html`<button class="link-btn" onClick=${() => setEditing(l)}>
                  ${sectionName(song, l)} ✎ ${!song.sectionNames[l] ? html`<span class="muted small">name it (chorus, verse…)</span>` : ''}
                </button>`}
          </div>`,
        )}
      </div>
      <label class="check">
        <input
          type="checkbox"
          checked=${song.clips}
          onChange=${() => setSongs((ss) => updateSong(ss, song.id, { clips: !song.clips }))}
        />
        <span>Also export section clips (named “${displayName(song, index)} - ${sectionName(song, labels[0])}”, …)</span>
      </label>
    </div>
  `;
}
