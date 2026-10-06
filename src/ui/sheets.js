// Fast naming: name-all pass, paste a setlist, and the song library.

import { html, useState, useEffect, useRef, useMemo } from './h.js';
import { Sheet, keepFocus, saveBlob, toast } from './common.js';
import { fmtTime } from '../util.js';
import {
  displayName,
  parseSetlist,
  normalizeTitle,
  libraryList,
  libraryAdd,
  libraryRename,
  libraryHide,
  mergeLibraries,
} from '../naming.js';
import { loadPrefs, savePrefs } from '../store.js';

// ------------------------------------------------------------ name all pass

export function NameAllSheet({ songs, player, nameSong, suggestFor, onClose }) {
  const firstUnnamed = songs.findIndex((s) => !s.name);
  const [i, setI] = useState(firstUnnamed >= 0 ? firstUnnamed : 0);
  const [text, setText] = useState('');
  const [autoplay, setAutoplay] = useState(true);
  const input = useRef(null);
  const done = i >= songs.length;
  const song = songs[i];

  useEffect(() => {
    if (done) {
      player.pause();
      return;
    }
    setText(song.name || '');
    if (autoplay) player.play(song.start);
    if (input.current) {
      input.current.focus();
      input.current.select();
    }
  }, [i]);

  const go = (next, name) => {
    if (song && name != null) nameSong(song.id, name);
    setI(Math.max(0, Math.min(songs.length, next)));
  };

  if (done) {
    const named = songs.filter((s) => s.name).length;
    return html`<${Sheet} title="Name all songs" onClose=${onClose}>
      <div class="done-box">
        <p class="big-num">${named} / ${songs.length}</p>
        <p>songs named. Unnamed songs are saved as “Song N”.</p>
        <div class="row">
          <button class="btn" onClick=${() => setI(0)}>Go through again</button>
          <button class="btn primary" onClick=${onClose}>Done</button>
        </div>
      </div>
    </${Sheet}>`;
  }

  const sugg = suggestFor(song, text === song.name ? '' : text);
  return html`<${Sheet} title=${`Song ${i + 1} of ${songs.length}`} onClose=${onClose}>
    <div class="dots" aria-hidden="true">
      ${songs.map((s, k) => html`<span class=${'dot' + (k === i ? ' on' : '') + (s.name ? ' named' : '')}></span>`)}
    </div>
    <div class="na-times">
      ${fmtTime(song.start)} – ${fmtTime(song.end)}
      ${song.bpm && html` · ${song.estimated ? '~' : ''}${Math.round(song.bpm)} BPM`}
      ${song.key && html` · ${song.estimated ? '~' : ''}${song.key}`}
    </div>
    <div class="row wrap">
      <button class="btn small" onClick=${() => player.play(song.start)}>▶ Start</button>
      <button class="btn small" onClick=${() => player.play(Math.min(song.end - 5, player.time + 30))}>+30s</button>
      <button class="btn small" onClick=${() => player.play((song.start + song.end) / 2)}>▶ Middle</button>
      <button class="btn small" onClick=${() => player.pause()}>❚❚</button>
      <label class="check small"><input type="checkbox" checked=${autoplay} onChange=${() => setAutoplay(!autoplay)} /> Auto-play</label>
    </div>
    <input
      ref=${input}
      class="name-input big"
      value=${text}
      placeholder=${displayName(song, i)}
      aria-label="Song name"
      autocomplete="off"
      autocapitalize="words"
      enterkeyhint="next"
      onInput=${(e) => setText(e.currentTarget.value)}
      onKeyDown=${(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          go(i + 1, text);
        }
      }}
    />
    ${sugg.length > 0 &&
    html`<div class="chips">
      ${sugg.map(
        (s) => html`<button
          class=${'chip' + (s.taken ? ' taken' : '')}
          onMouseDown=${keepFocus}
          onClick=${() => go(i + 1, s.title)}
        >
          ${s.title}<small>${s.taken ? 'already used' : s.reason}</small>
        </button>`,
      )}
    </div>`}
    <div class="row between sticky-actions">
      <button class="btn" disabled=${i === 0} onMouseDown=${keepFocus} onClick=${() => go(i - 1, text)}>‹ Back</button>
      <button class="btn" onMouseDown=${keepFocus} onClick=${() => go(i + 1, null)}>Skip</button>
      <button class="btn primary" onMouseDown=${keepFocus} onClick=${() => go(i + 1, text)}>
        ${i === songs.length - 1 ? 'Finish' : 'Next ›'}
      </button>
    </div>
  </${Sheet}>`;
}

// ---------------------------------------------------------------- setlists

export function SetlistSheet({ songs, library, initial, onApply, onClose, player }) {
  const [text, setText] = useState(() => (initial || []).map((l) => l.raw || l.title).join('\n'));
  const [dropArtist, setDropArtist] = useState(() => loadPrefs().dropArtist);
  const libTitles = useMemo(() => {
    const m = new Map();
    for (const it of libraryList(library)) m.set(normalizeTitle(it.title), it.title);
    return m;
  }, [library]);

  // Library spelling is used only when the line is the same title
  // (case/punctuation aside) — that is not a guess.
  const lines = useMemo(
    () =>
      parseSetlist(text, { dropArtist }).map((l) => {
        const lib = libTitles.get(normalizeTitle(l.title));
        return lib ? { ...l, title: lib, fromLibrary: lib !== l.title } : l;
      }),
    [text, dropArtist, libTitles],
  );

  const defaultPick = (song, k) => {
    if (k >= lines.length) return '';
    if (song.name && normalizeTitle(song.name) !== normalizeTitle(lines[k].title)) return '';
    return String(k);
  };
  const [picks, setPicks] = useState({});
  const pickFor = (song, k) => (song.id in picks ? picks[song.id] : defaultPick(song, k));

  const plan = songs
    .map((s, k) => ({ song: s, k, pick: pickFor(s, k) }))
    .filter((p) => p.pick !== '' && lines[Number(p.pick)])
    .map((p) => [p.song.id, lines[Number(p.pick)].title])
    .filter(([id, title]) => songs.find((s) => s.id === id).name !== title);

  const canPaste = !!(navigator.clipboard && navigator.clipboard.readText);

  return html`<${Sheet} title="Paste a setlist" onClose=${onClose} wide>
    <p class="muted">Paste the list from your chat. One song per line, in the order they were sung. Nothing is renamed until you tap Apply.</p>
    <textarea
      class="setlist-text"
      rows="6"
      value=${text}
      placeholder=${'1. Way Maker\n2. Goodness of God\n3. Build My Life'}
      onInput=${(e) => {
        setText(e.currentTarget.value);
        setPicks({});
      }}
    ></textarea>
    <div class="row wrap">
      ${canPaste &&
      html`<button class="btn small" onClick=${async () => {
        try {
          setText(await navigator.clipboard.readText());
          setPicks({});
        } catch {
          toast('Paste blocked — long-press the box and choose Paste');
        }
      }}>Paste from clipboard</button>`}
      <label class="check small">
        <input
          type="checkbox"
          checked=${dropArtist}
          onChange=${() => {
            const v = !dropArtist;
            setDropArtist(v);
            savePrefs({ ...loadPrefs(), dropArtist: v });
          }}
        />
        Remove artist after “ - ” or “by”
      </label>
    </div>

    ${lines.length > 0 &&
    html`<div class="map">
      <div class="map-head muted">${lines.length} title${lines.length > 1 ? 's' : ''} found · ${songs.length} songs</div>
      ${songs.map((s, k) => {
        const pick = pickFor(s, k);
        const chosen = pick !== '' ? lines[Number(pick)] : null;
        return html`<div class="map-row" key=${s.id}>
          <button class="icon-btn" aria-label=${`Play song ${k + 1}`} onClick=${() => player && player.play(s.start)}>▶</button>
          <div class="map-song">
            <strong>${k + 1}.</strong> ${s.name || html`<span class="muted">unnamed</span>`}
            <div class="muted small">${fmtTime(s.start)} – ${fmtTime(s.end)}</div>
          </div>
          <select
            aria-label=${`Name for song ${k + 1}`}
            value=${pick}
            onChange=${(e) => setPicks({ ...picks, [s.id]: e.currentTarget.value })}
          >
            <option value="">${s.name ? 'Keep current name' : 'Leave unnamed'}</option>
            ${lines.map((l, j) => html`<option value=${String(j)}>${j + 1}. ${l.title}</option>`)}
          </select>
          ${chosen && chosen.fromLibrary && html`<div class="muted small map-note">spelling from your library</div>`}
        </div>`;
      })}
      ${lines.length > songs.length &&
      html`<p class="muted small">${lines.length - songs.length} extra title(s) will show up as name suggestions.</p>`}
    </div>`}

    <div class="row between sticky-actions">
      <button class="btn" onClick=${onClose}>Cancel</button>
      <button class="btn primary" disabled=${!lines.length} onClick=${() => onApply(plan, lines)}>
        ${plan.length ? `Apply ${plan.length} name${plan.length > 1 ? 's' : ''}` : 'Save list for suggestions'}
      </button>
    </div>
  </${Sheet}>`;
}

// ------------------------------------------------------------------ library

export function LibrarySheet({ library, onChange, onClose }) {
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState('');
  const fileRef = useRef(null);
  const items = libraryList(library).filter((i) => !q || normalizeTitle(i.title).includes(normalizeTitle(q)));

  return html`<${Sheet} title="Your song library" onClose=${onClose} wide>
    <p class="muted">
      Every name you give a song is remembered here and offered as a suggestion next time — ranked by how often you use
      it, and nudged up when the tempo or key is close to when you named it before. Suggestions are never applied for you.
    </p>
    <form
      class="row"
      onSubmit=${(e) => {
        e.preventDefault();
        if (adding.trim()) onChange(libraryAdd(library, adding));
        setAdding('');
      }}
    >
      <input class="grow" value=${adding} placeholder="Add a song title" onInput=${(e) => setAdding(e.currentTarget.value)} />
      <button class="btn" type="submit">Add</button>
    </form>
    <input class="search" value=${q} placeholder="Search" aria-label="Search library" onInput=${(e) => setQ(e.currentTarget.value)} />
    <ul class="lib-list">
      ${items.map(
        (it) => html`<li key=${it.key}>
          <div class="grow">
            <div>${it.title}</div>
            <div class="muted small">
              ${it.count ? `named ${it.count}×` : 'added by you'}
              ${it.bpms.length ? ` · ~${Math.round(it.bpms.reduce((a, b) => a + b, 0) / it.bpms.length)} BPM` : ''}
              ${it.keys.length ? ` · ${[...new Set(it.keys)].join(', ')}` : ''}
            </div>
          </div>
          <button class="btn small" onClick=${() => {
            const v = prompt('Rename this title everywhere in the library', it.title);
            if (v && v.trim()) onChange(libraryRename(library, it.key, v));
          }}>Rename</button>
          <button class="btn small" onClick=${() => onChange(libraryHide(library, it.key))}>Remove</button>
        </li>`,
      )}
      ${!items.length && html`<li class="muted">${q ? 'No match.' : 'Empty for now. Name a few songs and they appear here.'}</li>`}
    </ul>
    <div class="row wrap">
      <button class="btn small" onClick=${() =>
        saveBlob(new Blob([JSON.stringify(library, null, 1)], { type: 'application/json' }), 'song-library.json')}>
        Export library
      </button>
      <button class="btn small" onClick=${() => fileRef.current.click()}>Import library…</button>
      <input
        type="file"
        accept="application/json,.json"
        hidden
        ref=${fileRef}
        onChange=${async (e) => {
          const f = e.currentTarget.files[0];
          e.currentTarget.value = '';
          if (!f) return;
          try {
            const other = JSON.parse(await f.text());
            if (!other || typeof other.items !== 'object') throw new Error();
            onChange(mergeLibraries(library, other));
            toast('Library imported');
          } catch {
            toast("That file isn't a song library export");
          }
        }}
      />
    </div>
    <p class="muted small">Use export/import to move your library between your phone and computer.</p>
  </${Sheet}>`;
}
