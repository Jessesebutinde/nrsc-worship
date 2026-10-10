// /lyrics/ — the remote: pick songs and scripture, step through slides, Clear / Black / Logo.
// Phone first; also works on the operator laptop (Space / arrows, B, C, L).

import { html, render, useState, useEffect, useRef, useMemo } from '../ui/h.js';
import { Fit, Stage } from './stage.js';
import { Link, newCode, normalizeCode } from './link.js';
import { emptyState, reduce, songItem, BACKGROUNDS, BACKGROUND_INFO, PRESET_INFO } from './state.js';
import { loadSongs, saveSongs, visibleSongs, upsertSong, removeSong, searchSongs, mergeSongs, exportLibrary, importLibrary } from './library.js';
import { parseRef } from './books.js';
import { allVersions, importVersion, removeVersion, passageItem, BUILTIN_VERSIONS } from './bible.js';
import { cloudConfig, cloudConfigured, loadSession, captureSession, sendMagicLink, signOut, pullSongs, pushSongs } from './cloud.js';
import { SongEditor } from './editor.js';

const LS_ROOM = 'ls-remote-room';
const LS_PREFS = 'ls-remote-prefs';
const LS_RECENT_REFS = 'ls-recent-refs';

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

// ------------------------------------------------------------------ toast

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

// ------------------------------------------------------------------ pairing

function Pair({ onPair }) {
  const [code, setCode] = useState('');
  const openHere = () => {
    const room = newCode();
    window.open(`screen.html?room=${room}`, 'lyric-screen', 'popup,width=1280,height=720');
    onPair(room);
  };
  return html`<div class="pair-page">
    <div class="brand"><span class="cross">✝</span> Lyric Slides</div>
    <p class="muted">Lyrics and scripture for the hall TV.</p>
    <div class="card">
      <h2>Connect to the screen</h2>
      <p class="muted small">Open <b>screen.html</b> on the hall PC. It shows a six-letter code.</p>
      <form
        class="row"
        onSubmit=${(e) => {
          e.preventDefault();
          const c = normalizeCode(code);
          if (c.length >= 4) onPair(c);
        }}
      >
        <input
          class="code-input"
          value=${code}
          onInput=${(e) => setCode(normalizeCode(e.target.value))}
          placeholder="ABC123"
          autocapitalize="characters"
          autocomplete="off"
          aria-label="Screen code"
        />
        <button class="primary" disabled=${normalizeCode(code).length < 4}>Connect</button>
      </form>
      ${!cloudConfigured() &&
      html`<p class="note small">Cloud link is off, so the remote and the screen must be in the same browser on one
        computer. Add a Supabase project in <code>src/lyrics/config.js</code> to use a phone.</p>`}
    </div>
    <div class="card">
      <h2>Screen on this computer</h2>
      <p class="muted small">Opens the screen in a new window. Drag it to the TV and press F for fullscreen.</p>
      <button onClick=${openHere}>Open a screen window</button>
    </div>
  </div>`;
}

// ------------------------------------------------------------------ live

function Live({ state, act, info, goTab }) {
  const item = state.item;
  const list = useRef(null);
  const swipe = useRef(null);

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
    ${!info.peers.screen &&
    html`<p class="note small">No screen connected. Open <b>screen.html</b> on the hall PC with code <b>${info.room}</b>.</p>`}
    ${item
      ? html`<div class="item-head">
            <div>
              <b>${item.title}</b>
              <span class="muted small">
                ${`${item.kind === 'song' ? PRESET_INFO[item.preset || 'worship'].name : item.versions.join(' + ')} · ${state.index + 1}/${item.slides.length}`}
              </span>
            </div>
          </div>
          <ol class="slides" ref=${list}>
            ${item.slides.map(
              (s, i) => html`<li
                class=${`slide ${i === state.index ? 'on' : ''}`}
                onClick=${() => act({ type: 'goto', index: i })}
              >
                <span class="slide-no">${i + 1}${s.label ? ` · ${s.label}` : ''}${s.verse ? ` · ${s.verse}${s.part || ''}` : ''}</span>
                ${item.kind === 'song'
                  ? s.lines.map((l) => html`<span class="slide-line">${l}</span>`)
                  : html`<span class="slide-line">${s.primary}</span>
                      ${s.secondary && html`<span class="slide-line dim">${s.secondary}</span>`}`}
              </li>`,
            )}
          </ol>`
      : html`<div class="empty">
          <p>Nothing on the screen yet.</p>
          <div class="row center">
            <button onClick=${() => goTab('songs')}>Pick a song</button>
            <button onClick=${() => goTab('scripture')}>Scripture</button>
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
      const item = await passageItem({ ref: r, primaryId: prefs.primary, secondaryId: prefs.secondary });
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
    <p class="muted small">One verse per slide. Long verses split into a / b at a natural pause, both languages at the same split.</p>
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

// ------------------------------------------------------------------ settings

function Settings({ room, state, act, info, prefs, setPrefs, songs, setSongs, onUnpair, session, setSession }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState('');
  const [verName, setVerName] = useState('');
  const [verLang, setVerLang] = useState('lg');
  const [versions, setVersions] = useState(allVersions());
  const [videoUrl, setVideoUrl] = useState(state.bgVideo || '');
  const base = new URL('screen.html', location.href).href;

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast('Link copied');
    } catch {
      prompt('Copy this link', text);
    }
  };

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
      <h2>Screen</h2>
      <div class="row between">
        <div>
          Code <b class="code">${room}</b>
          <span class=${`pill ${info.peers.screen ? 'ok' : ''}`}>${info.peers.screen ? `${info.peers.screen} screen connected` : 'no screen'}</span>
        </div>
        <button class="ghost" onClick=${onUnpair}>Change</button>
      </div>
      <div class="row wrap">
        <button onClick=${() => window.open(`screen.html?room=${room}`, 'lyric-screen', 'popup,width=1280,height=720')}>Open screen window</button>
        <button class="ghost" onClick=${() => copy(`${base}?room=${room}`)}>Copy TV link</button>
        <button class="ghost" onClick=${() => copy(`${base}?room=${room}&mode=lowerthird`)}>Copy livestream lower-third link</button>
        <button class="ghost" onClick=${() => copy(`${base}?room=${room}&transparent=1`)}>Copy OBS (transparent) link</button>
      </div>
      <p class="muted small">
        Cloud link: ${info.cloud === 'off' ? 'off (same computer only)' : info.cloud === 'joined' ? 'connected' : 'reconnecting…'}
        ${info.pending ? ' · last change waiting to send' : ''}
      </p>
    </section>

    <section class="card">
      <h2>Background</h2>
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
      <p>Montserrat font: SIL Open Font License.</p>
    </section>
  </div>`;
}

// ------------------------------------------------------------------ app

function App() {
  const params = new URLSearchParams(location.search);
  const [room, setRoom] = useState(() => normalizeCode(params.get('room')) || read(LS_ROOM, ''));
  const [state, setState] = useState(() => (room ? read(`ls-remote-state:${room}`, emptyState()) : emptyState()));
  const [info, setInfo] = useState({ peers: { screen: 0, remote: 0 }, cloud: 'off', pending: false });
  const [tab, setTab] = useState('live');
  const [songs, setSongsRaw] = useState(() => loadSongs());
  const [editing, setEditing] = useState(null);
  const [prefs, setPrefsRaw] = useState(() => ({ primary: 'lug68', secondary: 'kjv', ...read(LS_PREFS, {}) }));
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
    if (!room) return undefined;
    write(LS_ROOM, room);
    if (params.get('room')) history.replaceState(null, '', location.pathname);
    const l = new Link({
      room,
      role: 'remote',
      state: stateRef.current,
      cloud: cloudConfig(),
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
      if (e.ctrlKey || e.metaKey || e.altKey || editing) return;
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
  }, [editing, room]);

  if (!room) return html`<${Pair} onPair=${setRoom} /><${Toast} />`;

  const showSong = (song, index = 0) => {
    act({ type: 'item', item: songItem(song), index });
    setTab('live');
  };

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

  const tabs = [
    ['live', 'Live'],
    ['songs', 'Songs'],
    ['scripture', 'Scripture'],
    ['settings', 'Settings'],
  ];

  return html`<div class="app">
    <header class="top">
      <div class="brand"><span class="cross">✝</span> Lyric Slides</div>
      <button class=${`pill ${info.peers.screen ? 'ok' : 'warn'}`} onClick=${() => setTab('settings')}>
        ${info.peers.screen ? 'Screen ✓' : 'No screen'} · ${room}${info.pending ? ' · waiting' : ''}
      </button>
    </header>
    <main>
      ${tab === 'live' && html`<${Live} state=${state} act=${act} info=${{ ...info, room }} goTab=${setTab} />`}
      ${tab === 'songs' &&
      html`<${Songs}
        songs=${songs}
        liveId=${state.item && state.item.id}
        onShow=${(s) => showSong(s)}
        onEdit=${(s) => setEditing(s)}
        onNew=${() => setEditing('new')}
      />`}
      ${tab === 'scripture' &&
      html`<${Scripture}
        prefs=${prefs}
        setPrefs=${setPrefs}
        onShow=${(item) => {
          act({ type: 'item', item });
          setTab('live');
        }}
      />`}
      ${tab === 'settings' &&
      html`<${Settings}
        room=${room}
        state=${state}
        act=${act}
        info=${info}
        prefs=${prefs}
        setPrefs=${setPrefs}
        songs=${songs}
        setSongs=${setSongs}
        session=${session}
        setSession=${setSession}
        onUnpair=${() => {
          write(LS_ROOM, '');
          setRoom('');
        }}
      />`}
    </main>
    <nav class="tabs">
      ${tabs.map(([k, label]) => html`<button class=${tab === k ? 'on' : ''} onClick=${() => setTab(k)}>${label}</button>`)}
    </nav>
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
    <${Toast} />
  </div>`;
}

render(html`<${App} />`, document.getElementById('app'));
