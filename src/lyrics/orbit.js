// /lyrics/ — Orbit: the floating console (Settings → This console → Layout → Orbit; the classic
// console stays a click away). The live picture sits in the middle; around it the orbs float,
// waiting: Scripture (books, chapters and verses laid out like a calendar), Songs, Pictures, Google
// (a companion window; pictures drag or paste straight in), the Sermon board (a diagram drawn while
// the preacher speaks) and Looks. Touch an orb and it opens into a panel; close it and it floats
// back. While a passage is up, everything else slips to the bottom edge and the reading takes the
// room: the chapter's verses as tiles, the one being read lit.

import { html, useState, useEffect, useRef, useLayoutEffect } from '../ui/h.js';
import { Fit, Stage } from './stage.js';
import { stepsOf, mediaItem, SCRIPTURE_INFO, scriptureLookOf, PRESET_INFO, lookOf } from './state.js';
import { BOOKS, parseRef, formatRef, bookByCode } from './books.js';
import { loadChapter, loadBook, passageItem, versionById } from './bible.js';
import { locateVerse, verseAt, peekOf, matchBooks, BOOK_GROUPS, perScreenOf } from './calendar.js';
import { scriptureFit, fontsReady } from './measure.js';
import { idbGet } from './idb.js';
import { myMedia, addMediaFiles, addMediaUrl, onMediaChange, droppedPicture, dataUrlToFile, googleUrl } from './media.js';
import { newBoard, addNode, updateNode, removeNode, moveNode, connect, boardItem, BOARD_THEMES, NODE_KINDS, NODE_COLORS, NODE_SIZE } from './board.js';

const LS_BOARDS = 'ls-boards';
const LS_RECENT_REFS = 'ls-recent-refs';
const LS_GOOGLE = 'ls-google-kind';

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

const PER_SCREEN_LABELS = [
  ['auto', 'Same size'],
  ['verse', '1 verse'],
  ['one', '1 verse, full'],
  ['solo', '1 language at a time'],
  [2, '2'],
  [3, '3'],
  [4, '4'],
  [6, '6'],
  [8, '8'],
  ['all', 'Whole passage'],
  ['scroll', 'Scroll'],
];

/** A reference for the recent list, Luganda name only: "Zabbuli 23 : 1-4". */
const refLabel = (ref) => formatRef(ref.book, ref.chapter, ref.from == null ? null : ref.to && ref.to !== ref.from ? `${ref.from}-${ref.to}` : ref.from, { lg: true, en: false });

// The version whose chapter count and verses the tiles show: the one on top, unless it is an
// online Bible (not downloaded whole), then the KJV's numbering.
const countsVersion = (prefs) => {
  const v = versionById(prefs.primary);
  return v && !v.online ? prefs.primary : 'kjv';
};

// ------------------------------------------------------------------ icons

const icon = (d) => html`<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICON = {
  scripture: () => icon(html`<path d="M12 6.5C9 4.6 6 4.4 3 5.4v13.2c3-1 6-.8 9 1.1 3-1.9 6-2.1 9-1.1V5.4c-3-1-6-.8-9 1.1z" /><path d="M12 6.5v13.2" />`),
  songs: () => icon(html`<path d="M9 18V6l11-2v12" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" />`),
  pictures: () => icon(html`<rect x="3" y="4.5" width="18" height="15" rx="2" /><circle cx="9" cy="10" r="1.8" /><path d="M21 15.5l-5-5-9.5 9" />`),
  search: () => icon(html`<circle cx="10.5" cy="10.5" r="6.5" /><path d="M20 20l-4.6-4.6" /><path d="M10.5 7.5a3 3 0 1 0 3 3h-3" />`),
  board: () => icon(html`<rect x="3" y="4" width="7" height="5" rx="1.2" /><rect x="14" y="4" width="7" height="5" rx="1.2" /><rect x="8.5" y="15" width="7" height="5" rx="1.2" /><path d="M6.5 9v2.5h11V9M12 11.5V15" />`),
  looks: () => icon(html`<path d="M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4z" /><path d="M5 17l.9 2.1L8 20l-2.1.9L5 23l-.9-2.1L2 20l2.1-.9z" /><path d="M19 15l.6 1.4 1.4.6-1.4.6L19 19l-.6-1.4-1.4-.6 1.4-.6z" />`),
  settings: () => icon(html`<path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" />`),
  tv: () => icon(html`<rect x="3" y="4.5" width="18" height="12" rx="2" /><path d="M8.5 20.5h7M12 16.5v4" />`),
  close: () => icon(html`<path d="M6 6l12 12M18 6L6 18" />`),
};

// The orbs: where they float (at, % of the space), where they go while a passage is read (dock),
// how long one drift takes (d, s) and an offset so they never move in step (delay, s).
const ORBS = [
  { id: 'scripture', label: 'Scripture', hint: 'Books, chapters and verses laid out like a calendar', color: '#e3b75a', at: [12, 26], dock: [7, 94], d: 10, delay: -2 },
  { id: 'songs', label: 'Songs', hint: 'The song library', color: '#b48cff', at: [8, 52], dock: [19, 94], d: 12, delay: -5 },
  { id: 'pictures', label: 'Pictures', hint: 'Pictures and video, full screen or beside the words', color: '#7fd6ff', at: [13, 78], dock: [31, 94], d: 11, delay: -8 },
  { id: 'search', label: 'Google', hint: 'Search Google in a window beside the console; drag or paste a picture in', color: '#6fd28f', at: [88, 26], dock: [57, 94], d: 10.5, delay: -4 },
  { id: 'board', label: 'Sermon board', hint: 'Draw the sermon as it develops: points, arrows, pictures and verses', color: '#ff8a65', at: [92, 52], dock: [69, 94], d: 13, delay: -7 },
  { id: 'looks', label: 'Looks', hint: 'How the words look on the TV', color: '#f6c945', at: [87, 78], dock: [81, 94], d: 9.5, delay: -1 },
  { id: 'settings', label: 'Settings', color: '#a49cb2', small: true, at: [41, 94], dock: [91, 94], d: 14, delay: -3 },
  { id: 'tv', label: 'TV', hint: 'Put the picture on the TV and the stream', color: '#a49cb2', small: true, at: [59, 94], dock: [97, 94], d: 12.5, delay: -6 },
];
const orbOf = (id) => ORBS.find((o) => o.id === id);

// ------------------------------------------------------------------ the console

export function Orbit({ state, act, info, prefs, setPrefs, setUi, showItem, setLook, relayout, panes, onOutputs, toast, sheets, keysHint }) {
  const [open, setOpen] = useState(null);
  const [closing, setClosing] = useState(false);
  const item = state.item;
  const reading = Boolean(item && item.kind === 'scripture' && item.book && state.mode === 'show');
  const connected = info.peers.screen > 0 || info.ports > 0;

  const close = () => {
    setClosing(true);
    setTimeout(() => {
      setOpen(null);
      setClosing(false);
    }, 230);
  };
  const openOrb = (orb, e) => {
    if (orb.id === 'tv') return onOutputs();
    if (open && open.id === orb.id) return close();
    const r = e.currentTarget.getBoundingClientRect();
    setClosing(false);
    setOpen({ id: orb.id, x: r.left + r.width / 2, y: r.top + r.height / 2 });
    return null;
  };
  useEffect(() => {
    if (!open) return undefined;
    const k = (e) => {
      if (e.key === 'Escape' && !e.defaultPrevented) close();
    };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [open]);
  // The Songs panel's "Share them with your other laptops" opens Settings, where the sharing card is.
  useEffect(() => {
    const go = () => setOpen({ id: 'settings', x: innerWidth * 0.41, y: innerHeight * 0.9 });
    addEventListener('ls-open-settings', go);
    return () => removeEventListener('ls-open-settings', go);
  }, []);
  // Something picked from a library orb goes to the TV: the orb's job is done, it pops back.
  const itemId = item && item.id;
  useEffect(() => {
    if (open && ['scripture', 'songs', 'pictures'].includes(open.id) && itemId) close();
  }, [itemId]);

  // A passage picked from the calendar, laid out for the look that is up (as the Scripture tab does it).
  const showRef = async (ref) => {
    try {
      const ok = await Promise.race([fontsReady(), new Promise((res) => setTimeout(() => res(null), 3000))]);
      const fit =
        ok !== null && document.fonts && document.fonts.check('600 92px Montserrat')
          ? scriptureFit(scriptureLookOf(state), state.sFont, state.sSize, { balance: state.sBalance, wide: Boolean(state.sWide) })
          : undefined;
      const it = await passageItem({ ref, primaryId: prefs.primary, secondaryId: prefs.secondary, perScreen: perScreenOf(prefs), fit });
      showItem(it);
      const label = refLabel(ref);
      write(LS_RECENT_REFS, [label, ...read(LS_RECENT_REFS, []).filter((x) => x.toLowerCase() !== label.toLowerCase())].slice(0, 8));
    } catch (e) {
      toast(e.message);
    }
  };
  // A verse of the passage already up: straight to it, no new layout.
  const jumpTo = (v) => {
    const at = locateVerse(item, v);
    if (at) act({ type: 'set', patch: { index: at.index, sub: at.sub } });
  };

  const panel =
    open &&
    {
      scripture: () => html`<${ScripturePanel} prefs=${prefs} state=${state} showRef=${showRef} jumpTo=${jumpTo} classic=${panes.scripture} />`,
      songs: () => panes.songs,
      pictures: () => panes.media,
      search: () => html`<${SearchOrb} showItem=${showItem} act=${act} state=${state} toast=${toast} />`,
      board: () => html`<${BoardPanel} state=${state} act=${act} prefs=${prefs} toast=${toast} />`,
      looks: () => panes.looks,
      settings: () => panes.settings,
    }[open.id];

  return html`<div class=${`app orbit ${reading ? 'reading' : ''} ${open ? 'has-panel' : ''}`}>
    <header class="orbit-top">
      <div class="brand"><span class="cross">✝</span> Lyric Slides <span class="orbit-tag">Orbit</span></div>
      <span class="muted small keys">${keysHint}</span>
      <div class="row top-end">
        <button class="ghost small" onClick=${() => setUi({ layout: 'console' })} title="Back to the classic console (also in Settings → This console → Layout)">Classic</button>
        <button class=${`pill ${connected ? 'ok' : 'warn'}`} onClick=${onOutputs}>${connected ? 'TV ✓' : 'Show on TV'}${info.pending ? ' · waiting' : ''}</button>
      </div>
    </header>
    <div class="orbit-space">
      <div class="orbit-centre">
        <div class="orbit-preview">
          <${Fit}><${Stage} state=${state} still="bg" /><//>
          <span class="preview-tag">${state.mode === 'show' ? 'LIVE' : state.mode.toUpperCase()}</span>
        </div>
        <div class="orbit-nav">
          <button class="big" onClick=${() => act({ type: 'prev' })} aria-label="Previous">‹ Back</button>
          <button class="big primary" onClick=${() => act({ type: 'next' })} aria-label="Next">Next ›</button>
          <span class="orbit-modes">
            ${['clear', 'black', 'logo'].map((m) => html`<button class=${`mode ${state.mode === m ? 'on' : ''}`} onClick=${() => act({ type: 'mode', mode: m })}>${m[0].toUpperCase() + m.slice(1)}</button>`)}
          </span>
        </div>
        <${LiveHead} state=${state} act=${act} />
      </div>
      ${reading && html`<${ReadingPanel} state=${state} act=${act} prefs=${prefs} setPrefs=${setPrefs} showRef=${showRef} jumpTo=${jumpTo} setLook=${setLook} relayout=${relayout} />`}
      ${ORBS.map(
        (o) => html`<button
          key=${o.id}
          class=${`orb orb-${o.id} ${o.small ? 'small' : ''} ${open && open.id === o.id ? 'active' : ''}`}
          style=${`--ax:${o.at[0]};--ay:${o.at[1]};--dx:${o.dock[0]};--dy:${o.dock[1]};--d:${o.d}s;--delay:${o.delay}s;--orb:${o.color}`}
          title=${o.hint || o.label}
          aria-label=${o.label}
          onClick=${(e) => openOrb(o, e)}
        >
          <span class="orb-core">${ICON[o.id]()}</span>
          <span class="orb-label">${o.label}</span>
          ${o.id === 'scripture' && reading && html`<span class="orb-badge">${item.title.split(' · ')[0]}</span>`}
        </button>`,
      )}
      ${open && html`<${OrbPanel} orb=${orbOf(open.id)} from=${open} closing=${closing} onClose=${close}>${panel()}<//>`}
    </div>
    ${sheets}
  </div>`;
}

/** The panel an orb opens into: it grows out of the orb and shrinks back into it. */
function OrbPanel({ orb, from, closing, onClose, children }) {
  const el = useRef(null);
  useLayoutEffect(() => {
    const r = el.current.getBoundingClientRect();
    el.current.style.transformOrigin = `${from.x - r.left}px ${from.y - r.top}px`;
  }, [from.x, from.y]);
  return html`<div class=${`orbit-scrim ${closing ? 'closing' : ''}`} onClick=${onClose}></div>
    <section class=${`orbit-panel panel-${orb.id} ${closing ? 'closing' : ''}`} ref=${el} style=${`--orb:${orb.color}`} role="dialog" aria-label=${orb.label}>
      <header class="orbit-panel-head">
        <span class="orb-mini">${ICON[orb.id]()}</span>
        <b>${orb.label}</b>
        ${orb.hint && html`<span class="muted small">${orb.hint}</span>`}
        <button class="icon-btn" onClick=${onClose} aria-label="Close" title="Close (Esc)">${ICON.close()}</button>
      </header>
      <div class="orbit-panel-body">${children}</div>
    </section>`;
}

/** What is up: its title, where we are in it, and (songs, pictures) its slides to jump to. */
function LiveHead({ state, act }) {
  const it = state.item;
  if (!it) return html`<p class="orbit-empty">Nothing on the screen yet. Touch an orb.</p>`;
  const steps = stepsOf(state);
  const kindLabel = it.kind === 'scripture' ? it.versions.join(' + ') : it.kind === 'song' ? PRESET_INFO[lookOf(state, it)].name : it.kind === 'board' ? 'Sermon board' : it.kind === 'media' ? 'Pictures' : '';
  const status = `${(state.index || 0) + 1}/${it.slides.length}${steps > 1 ? ` · ${it.kind === 'board' ? 'point' : 'verse'} ${(state.sub || 0) + 1} of ${steps}` : ''}`;
  return html`<div class="orbit-head">
    <b>${it.title}</b> <span class="muted small">${kindLabel} · ${status}</span>
    ${(it.kind === 'song' || it.kind === 'media') &&
    it.slides.length > 1 &&
    html`<ol class="orbit-slides">
      ${it.slides.map(
        (s, i) => html`<li class=${i === state.index ? 'on' : ''} onClick=${() => act({ type: 'goto', index: i })}>
          <i>${i + 1}</i>${it.kind === 'song' ? `${s.label ? `${s.label} · ` : ''}${s.lines[0] || ''}` : s.title}
        </li>`,
      )}
    </ol>`}
  </div>`;
}

// ------------------------------------------------------------------ the chapter and its verses

function useChapterCount(versionId, n) {
  const [c, setC] = useState(0);
  useEffect(() => {
    let on = true;
    setC(0);
    if (!n) return undefined;
    loadBook(versionId, n)
      .then((b) => on && setC(b ? b.length : 0))
      .catch(() => on && setC(0));
    return () => {
      on = false;
    };
  }, [versionId, n]);
  return c;
}

function useVerses(versionId, n, chapter) {
  const [v, setV] = useState([]);
  useEffect(() => {
    let on = true;
    setV([]);
    if (!n || !chapter) return undefined;
    loadChapter(versionId, n, chapter)
      .then((vs) => on && setV(vs || []))
      .catch(() => on && setV([]));
    return () => {
      on = false;
    };
  }, [versionId, n, chapter]);
  return v;
}

/**
 * The verses of a chapter as tiles in rows of seven, like the dates of a month: number and first
 * words on each, the whole verse under the grid as the pointer rests on one. `range` marks the
 * verses up on the TV, `cur` the one being read, `anchor` the first verse of a range being picked.
 */
function VerseGrid({ verses, range = null, cur = 0, anchor = null, onPick }) {
  const [peek, setPeek] = useState(null);
  if (!verses.length) return html`<p class="muted small orbit-loading">Loading the chapter…</p>`;
  const inRange = (v) => range && range[0] != null && v >= range[0] && v <= (range[1] || range[0]);
  return html`<div class="vgrid-wrap">
    <ol class="vgrid" onMouseLeave=${() => setPeek(null)}>
      ${verses.map((t, i) => {
        const v = i + 1;
        return html`<li key=${v} style=${`--i:${i}`}>
          <button
            class=${`vt ${inRange(v) ? 'live' : ''} ${v === cur ? 'cur' : ''} ${v === anchor ? 'anchor' : ''}`}
            onClick=${(e) => onPick(v, e)}
            onMouseEnter=${() => setPeek(v)}
            onFocus=${() => setPeek(v)}
            aria-label=${`Verse ${v}`}
          >
            <b>${v}</b><span>${peekOf(t)}</span>
          </button>
        </li>`;
      })}
    </ol>
    <p class="vpeek" aria-live="polite">
      ${peek
        ? html`<b>${peek}</b> ${verses[peek - 1] || ''}`
        : html`<span class="muted">Touch a verse and it goes to the TV. Shift-touch another for a range.</span>`}
    </p>
  </div>`;
}

/** Range picking shared by the panels: null = off, 0 = waiting for the first verse, n = from verse n. */
const rangeLabel = (anchor) => (anchor === 0 ? 'Touch the first verse…' : anchor ? `From ${anchor}: touch the last` : 'Range');

/** The reading panel: the live chapter's tiles, the range and look controls, Done. */
function ReadingPanel({ state, act, prefs, setPrefs, showRef, jumpTo, setLook, relayout }) {
  const it = state.item;
  const book = bookByCode(it.book.code);
  const cur = verseAt(it, state.index, state.sub);
  const verses = useVerses(prefs.primary, book.n, it.chapter);
  const chapters = useChapterCount(countsVersion(prefs), book.n);
  const [anchor, setAnchor] = useState(null);
  const pick = (v, e) => {
    if (anchor === 0) return setAnchor(v);
    if (e.shiftKey || anchor) {
      const a = anchor || it.v1;
      setAnchor(null);
      return showRef({ book, chapter: it.chapter, from: Math.min(a, v), to: Math.max(a, v) });
    }
    if (v >= it.v1 && v <= it.v2 && locateVerse(it, v)) return jumpTo(v);
    return showRef({ book, chapter: it.chapter, from: v, to: v });
  };
  return html`<aside class="orbit-read">
    <header class="orbit-read-head">
      <div><span class="muted small">Reading</span><b>${it.title}</b></div>
      <span class="muted small">${it.versions.join(' + ')}</span>
    </header>
    <${VerseGrid} verses=${verses} range=${[it.v1, it.v2]} cur=${cur} anchor=${anchor} onPick=${pick} />
    <div class="row wrap orbit-read-tools">
      <button class=${`chip ${anchor != null ? 'on' : ''}`} onClick=${() => setAnchor(anchor != null ? null : 0)}>${rangeLabel(anchor)}</button>
      <button class="chip" onClick=${() => showRef({ book, chapter: it.chapter, from: cur, to: null })}>To the end</button>
      <button class="chip" onClick=${() => showRef({ book, chapter: it.chapter, from: null, to: null })}>Whole chapter</button>
      ${it.chapter > 1 && html`<button class="chip" onClick=${() => showRef({ book, chapter: it.chapter - 1, from: null, to: null })}>‹ Ch. ${it.chapter - 1}</button>`}
      ${chapters > it.chapter && html`<button class="chip" onClick=${() => showRef({ book, chapter: it.chapter + 1, from: null, to: null })}>Ch. ${it.chapter + 1} ›</button>`}
    </div>
    <div class="orbit-read-row">
      <span class="muted small">On screen</span>
      <span class="seg per-screen">
        ${PER_SCREEN_LABELS.map(
          ([k, l]) => html`<button
            class=${perScreenOf(prefs) === k ? 'on' : ''}
            onClick=${() => {
              setPrefs({ ...prefs, perScreen: k, perVerse: k === 'verse' });
              relayout(k);
            }}
          >
            ${l}
          </button>`,
        )}
      </span>
    </div>
    <div class="orbit-read-row">
      <span class="muted small">Look</span>
      <span class="orbit-looks">
        ${Object.entries(SCRIPTURE_INFO).map(
          ([k, v]) => html`<button class=${`look-dot ${scriptureLookOf(state) === k ? 'on' : ''}`} style=${`--s1:${v.sw[0]};--s2:${v.sw[1]}`} title=${v.name} aria-label=${v.name} onClick=${() => setLook({ sLook: k })}></button>`,
        )}
      </span>
    </div>
    <div class="row orbit-read-end">
      <button class="ghost" onClick=${() => act({ type: 'mode', mode: 'clear' })}>Done reading</button>
    </div>
  </aside>`;
}

/** The Scripture orb: the calendar, or the classic box (type a reference, say it, or search by words). */
function ScripturePanel({ prefs, state, showRef, jumpTo, classic }) {
  const [tab, setTab] = useState('calendar');
  return html`<div class="scrip-panel">
    <nav class="seg panel-tabs" role="tablist">
      <button class=${tab === 'calendar' ? 'on' : ''} onClick=${() => setTab('calendar')}>Calendar</button>
      <button class=${tab === 'classic' ? 'on' : ''} onClick=${() => setTab('classic')}>Type, say or search</button>
    </nav>
    ${tab === 'calendar' ? html`<${VersePicker} prefs=${prefs} state=${state} showRef=${showRef} jumpTo=${jumpTo} />` : classic}
  </div>`;
}

/** Books → chapters → verses, every one a tile waiting to be touched. */
function VersePicker({ prefs, state, showRef, jumpTo }) {
  const live = state.item && state.item.kind === 'scripture' && state.item.book ? state.item : null;
  const liveBook = live ? bookByCode(live.book.code) : null;
  const [book, setBook] = useState(liveBook ? liveBook.n : null);
  const [chapter, setChapter] = useState(live ? live.chapter : null);
  const [q, setQ] = useState('');
  const [anchor, setAnchor] = useState(null);
  const chapters = useChapterCount(countsVersion(prefs), book);
  const verses = useVerses(prefs.primary, book, chapter);
  const recent = read(LS_RECENT_REFS, []);
  const typed = parseRef(q);
  const books = matchBooks(q);
  const bk = book ? BOOKS[book - 1] : null;
  const liveHere = Boolean(live && liveBook.n === book && live.chapter === chapter);
  const go = (e) => {
    e.preventDefault();
    if (typed) {
      showRef(typed);
      setQ('');
    } else if (books.length === 1) {
      setBook(books[0].n);
      setChapter(null);
      setQ('');
    }
  };
  const pick = (v, e) => {
    if (anchor === 0) return setAnchor(v);
    if (e.shiftKey || anchor) {
      const a = anchor || (liveHere ? live.v1 : v);
      setAnchor(null);
      return showRef({ book: bk, chapter, from: Math.min(a, v), to: Math.max(a, v) });
    }
    if (liveHere && v >= live.v1 && v <= live.v2 && locateVerse(live, v)) return jumpTo(v);
    return showRef({ book: bk, chapter, from: v, to: v });
  };
  return html`<div class="vpicker">
    <form class="row vp-search" onSubmit=${go}>
      <input class="grow" value=${q} onInput=${(e) => setQ(e.target.value)} placeholder="Find a book… or type Zabbuli 23:1-4 and press Enter" aria-label="Find a book or type a reference" />
      ${typed && html`<button class="primary">Show ${refLabel(typed)}</button>`}
    </form>
    <nav class="vp-crumbs">
      <button
        class=${`chip ${!book ? 'on' : ''}`}
        onClick=${() => {
          setBook(null);
          setChapter(null);
        }}
      >
        Books
      </button>
      ${bk && html`<span>›</span><button class=${`chip ${book && !chapter ? 'on' : ''}`} onClick=${() => setChapter(null)}>${bk.lg} · ${bk.en}</button>`}
      ${chapter && html`<span>›</span><span class="chip on">Chapter ${chapter}</span>`}
    </nav>
    ${!book &&
    html`<div class="vp-books">
      ${recent.length > 0 &&
      !q &&
      html`<div class="vp-recent">
        <span class="muted small">Recent</span>
        ${recent.map(
          (r) => html`<button
            class="chip"
            onClick=${() => {
              const ref = parseRef(r);
              if (ref) showRef(ref);
            }}
          >
            ${r}
          </button>`,
        )}
      </div>`}
      ${BOOK_GROUPS.map(([name, a, z]) => {
        const list = books.filter((b) => b.n >= a && b.n <= z);
        return list.length
          ? html`<h3 class="vp-group">${name}</h3>
              <ol class="bgrid">
                ${list.map(
                  (b, i) => html`<li style=${`--i:${i}`}>
                    <button
                      class=${`bt ${liveBook && liveBook.n === b.n ? 'live' : ''}`}
                      onClick=${() => {
                        setBook(b.n);
                        setChapter(null);
                      }}
                    >
                      <b>${b.lgShort}</b><span>${b.en}</span>
                    </button>
                  </li>`,
                )}
              </ol>`
          : null;
      })}
      ${!books.length && html`<p class="muted small">No book is called that. Try the English or Luganda name.</p>`}
    </div>`}
    ${book &&
    !chapter &&
    html`<div class="vp-chapters">
      ${!chapters
        ? html`<p class="muted small orbit-loading">Loading…</p>`
        : html`<ol class="cgrid">
            ${Array.from(
              { length: chapters },
              (_, i) => html`<li style=${`--i:${i}`}>
                <button
                  class=${`ct ${liveBook && liveBook.n === book && live.chapter === i + 1 ? 'live' : ''}`}
                  title="Touch for its verses; Shift-touch to put the whole chapter up"
                  onClick=${(e) => (e.shiftKey ? showRef({ book: bk, chapter: i + 1, from: null, to: null }) : setChapter(i + 1))}
                >
                  ${i + 1}
                </button>
              </li>`,
            )}
          </ol>
          <p class="muted small">Touch a chapter for its verses; Shift-touch puts the whole chapter up.</p>`}
    </div>`}
    ${book &&
    chapter &&
    html`<div class="vp-verses">
      <${VerseGrid} verses=${verses} range=${liveHere ? [live.v1, live.v2] : null} cur=${liveHere ? verseAt(live, state.index, state.sub) : 0} anchor=${anchor} onPick=${pick} />
      <div class="row wrap orbit-read-tools">
        <button class=${`chip ${anchor != null ? 'on' : ''}`} onClick=${() => setAnchor(anchor != null ? null : 0)}>${rangeLabel(anchor)}</button>
        <button class="chip" onClick=${() => showRef({ book: bk, chapter, from: null, to: null })}>Whole chapter</button>
        ${liveHere && html`<button class="chip" onClick=${() => showRef({ book: bk, chapter, from: verseAt(live, state.index, state.sub), to: null })}>To the end</button>`}
        ${chapter > 1 && html`<button class="chip" onClick=${() => setChapter(chapter - 1)}>‹ Ch. ${chapter - 1}</button>`}
        ${chapters > chapter && html`<button class="chip" onClick=${() => setChapter(chapter + 1)}>Ch. ${chapter + 1} ›</button>`}
      </div>
    </div>`}
  </div>`;
}

// ------------------------------------------------------------------ Google

/** A picture's address for an <img>: files kept on this device come out of IndexedDB. */
const urlCache = new Map();
function useThumb(src) {
  const [url, setUrl] = useState(() => (src.startsWith('idb:') ? urlCache.get(src) || '' : src));
  useEffect(() => {
    if (!src.startsWith('idb:')) {
      setUrl(src);
      return;
    }
    if (urlCache.has(src)) {
      setUrl(urlCache.get(src));
      return;
    }
    idbGet('files', src.slice(4))
      .then((blob) => {
        if (!blob) return;
        const u = URL.createObjectURL(blob);
        urlCache.set(src, u);
        setUrl(u);
      })
      .catch(() => {});
  }, [src]);
  return url;
}
const Thumb = ({ m }) => {
  const url = useThumb(m.src);
  return m.type === 'video' ? html`<span class="thumb video">▶</span>` : html`<img class="thumb" src=${url} alt="" loading="lazy" />`;
};

/** Google in a window of its own beside the console; every search goes to the same window. */
function openCompanion(url, toast) {
  const w = Math.max(640, Math.round(screen.availWidth * 0.46));
  const h = screen.availHeight;
  const win = window.open(url, 'ls-google', `popup=yes,width=${w},height=${h},left=${Math.max(0, screen.availWidth - w)},top=0`);
  if (!win) {
    toast('The browser blocked the Google window: allow pop-ups for this site');
    return null;
  }
  try {
    win.focus();
  } catch {
    /* another window */
  }
  return win;
}

function SearchOrb({ showItem, act, state, toast }) {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState(() => (read(LS_GOOGLE, 'images') === 'web' ? 'web' : 'images'));
  const [over, setOver] = useState(false);
  const [mine, setMine] = useState(() => myMedia().slice(-8).reverse());
  useEffect(() => onMediaChange(() => setMine(myMedia().slice(-8).reverse())), []);
  const search = (k = kind) => {
    if (!q.trim()) return;
    write(LS_GOOGLE, k);
    setKind(k);
    openCompanion(googleUrl(q, k), toast);
  };
  const qRef = useRef(q);
  qRef.current = q;
  const take = async (got) => {
    if (!got) {
      toast('Nothing usable: drag the picture itself (not the page), or copy the image and paste');
      return;
    }
    const name = qRef.current.trim();
    try {
      if (got.files) {
        const { added, tooBig } = await addMediaFiles(got.files, name ? { title: name } : {});
        tooBig.forEach((n) => toast(`${n} is too big to keep`));
        if (added.length) toast(`Added ${added.length === 1 ? added[0].title : `${added.length} pictures`}`);
      } else if (got.url.startsWith('data:')) {
        const f = await dataUrlToFile(got.url, name || 'picture');
        const { added, tooBig } = await addMediaFiles([f], { title: name || 'Picture' });
        if (tooBig.length) toast('That picture is too big to keep');
        if (added.length) toast(`Added ${added[0].title}`);
      } else {
        const m = addMediaUrl(got.url, name ? { title: name } : {});
        if (m) toast(`Added ${m.title}`);
      }
    } catch (e) {
      toast(e.message);
    }
  };
  // Copy image in the Google window, Ctrl+V anywhere here.
  useEffect(() => {
    const onPaste = (e) => {
      const got = droppedPicture(e.clipboardData);
      if (!got) return;
      if (got.url && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
      e.preventDefault();
      take(got);
    };
    addEventListener('paste', onPaste);
    return () => removeEventListener('paste', onPaste);
  }, []);
  const beside = (m) => {
    const same = state.illustration && state.illustration.src === m.src;
    act({ type: 'set', patch: { illustration: same ? null : { src: m.src, type: m.type, title: m.title, size: (state.illustration && state.illustration.size) || 'half' } } });
    toast(same ? 'Taken off the TV' : `${m.title} is beside the words on the TV`);
  };
  return html`<div class="gorb">
    <form
      class="row gorb-search"
      onSubmit=${(e) => {
        e.preventDefault();
        search();
      }}
    >
      <input class="grow" value=${q} onInput=${(e) => setQ(e.target.value)} placeholder="Search Google… e.g. prodigal son painting" aria-label="Search Google" autofocus />
      <span class="seg">
        <button type="button" class=${kind === 'images' ? 'on' : ''} onClick=${() => search('images')}>Pictures</button>
        <button type="button" class=${kind === 'web' ? 'on' : ''} onClick=${() => search('web')}>Web</button>
      </span>
    </form>
    <p class="muted small">Google opens in its own window beside the console (it will not sit inside another site); every search goes to that same window. Add a word like <i>painting</i>, <i>illustration</i> or <i>drawing</i> for sermon pictures.</p>
    <div
      class=${`dropzone ${over ? 'over' : ''}`}
      onDragOver=${(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave=${() => setOver(false)}
      onDrop=${(e) => {
        e.preventDefault();
        setOver(false);
        take(droppedPicture(e.dataTransfer));
      }}
    >
      <b>Drop a picture here</b>
      <span>Drag it across from the Google window, or right-click it there, <i>Copy image</i>, then press Ctrl+V here.</span>
    </div>
    ${mine.length > 0 &&
    html`<h3 class="sec-head">Just added <span class="muted small">also in Pictures</span></h3>
      <ul class="gorb-strip">
        ${mine.map(
          (m) => html`<li key=${m.id}>
            <${Thumb} m=${m} />
            <span class="gorb-title">${m.title}</span>
            <span class="row">
              <button class="chip" onClick=${() => showItem(mediaItem(m))}>Show</button>
              <button class=${`chip ${state.illustration && state.illustration.src === m.src ? 'on' : ''}`} onClick=${() => beside(m)}>Beside the words</button>
            </span>
          </li>`,
        )}
      </ul>`}
  </div>`;
}

// ------------------------------------------------------------------ the sermon board

function useFolderMedia() {
  const [list, setList] = useState([]);
  useEffect(() => {
    fetch('media/index.json')
      .then((r) => (r.ok ? r.json() : []))
      .then((l) => setList(l.map((f) => ({ id: `f:${f.file}`, title: f.title, type: f.type, src: `media/${f.file}` }))))
      .catch(() => setList([]));
  }, []);
  return list;
}

/**
 * The board editor. The canvas is the TV picture itself (the same Stage the TV draws) under a
 * transparent layer of handles: drag a point to move it, touch it to edit it on the right. While
 * the board is up on the TV, every change goes there as it is made.
 */
function BoardPanel({ state, act, prefs, toast }) {
  const [store, setStore] = useState(() => {
    const s = read(LS_BOARDS, null);
    return s && Array.isArray(s.boards) ? s : { boards: [], current: null };
  });
  const board = store.boards.find((b) => b.id === store.current) || null;
  const [sel, setSel] = useState(null);
  const [linkFrom, setLinkFrom] = useState(null);
  const [chain, setChain] = useState(true);
  const [tool, setTool] = useState(null);
  const [draft, setDraft] = useState(null);
  const [renaming, setRenaming] = useState(false);
  const [vref, setVref] = useState('');
  const [vlang, setVlang] = useState('primary');
  const folder = useFolderMedia();
  const [mine, setMine] = useState(myMedia);
  useEffect(() => onMediaChange(() => setMine(myMedia())), []);
  const live = Boolean(board && state.item && state.item.kind === 'board' && state.item.id === board.id && state.mode === 'show');
  const shown = draft || board;
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const timer = useRef(null);
  const textRef = useRef(null);

  const send = (b, sub) => act({ type: 'board', item: boardItem(b), ...(sub != null ? { sub } : {}) });
  const saveStore = (st) => {
    write(LS_BOARDS, st);
    setStore(st);
  };
  // Every edit is kept here; while the board is up it also goes to the TV (typing is sent a beat later).
  const commit = (next, { sendNow = true } = {}) => {
    setDraft(null);
    saveStore({ ...store, boards: store.boards.map((b) => (b.id === next.id ? next : b)) });
    if (!live) return;
    clearTimeout(timer.current);
    if (sendNow) send(next);
    else timer.current = setTimeout(() => send(next), 350);
  };
  const create = () => {
    const b = newBoard(`Sermon ${new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`);
    saveStore({ boards: [...store.boards, b], current: b.id });
    setSel(null);
  };
  const remove = () => {
    if (!board) return;
    saveStore({ boards: store.boards.filter((b) => b.id !== board.id), current: (store.boards.find((b) => b.id !== board.id) || {}).id || null });
    setSel(null);
    if (live) act({ type: 'mode', mode: 'clear' });
  };
  const add = (kind, props = {}) => {
    if (!board) return;
    const last = board.nodes[board.nodes.length - 1];
    const next = addNode(board, kind, props, { from: chain && last ? last.id : null });
    commit(next);
    setSel(next.nodes[next.nodes.length - 1].id);
    setTool(null);
    setTimeout(() => textRef.current && textRef.current.focus(), 50);
  };
  const addVerse = async () => {
    const ref = parseRef(vref);
    if (!ref) {
      toast('Type a reference like Yokaana 3:16');
      return;
    }
    const vid = vlang === 'secondary' && prefs.secondary ? prefs.secondary : prefs.primary;
    const v = versionById(vid);
    try {
      const ch = await loadChapter(vid, ref.book.n, ref.chapter);
      const from = Math.min(ref.from || 1, ch.length);
      const to = Math.min(ref.to || from, from + 3, ch.length);
      const text = ch
        .slice(from - 1, to)
        .map((t, i) => (to > from ? `${from + i} ` : '') + t)
        .join(' ');
      if (!text.trim()) {
        toast('That verse is not in this version');
        return;
      }
      add('verse', { sub: formatRef(ref.book, ref.chapter, to > from ? `${from}-${to}` : `${from}`, { lg: Boolean(v && v.lang === 'lg'), en: !v || v.lang !== 'lg' }), text });
      setVref('');
    } catch (e) {
      toast(e.message);
    }
  };
  const node = shown && sel ? shown.nodes.find((n) => n.id === sel) : null;
  const patch = (p, now = false) => commit(updateNode(board, sel, p), { sendNow: now });
  const order = (dir) => {
    const i = board.nodes.findIndex((n) => n.id === sel);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= board.nodes.length) return;
    const nodes = [...board.nodes];
    [nodes[i], nodes[j]] = [nodes[j], nodes[i]];
    commit({ ...board, nodes });
  };

  // Dragging on the canvas, in the TV's 1920 × 1080 coordinates.
  const canvas = useRef(null);
  const drag = useRef(null);
  const toStage = (e) => {
    const r = canvas.current.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * 1920, ((e.clientY - r.top) / r.height) * 1080];
  };
  const onDown = (n, e) => {
    e.preventDefault();
    if (linkFrom) {
      if (linkFrom !== n.id) commit(connect(board, linkFrom, n.id));
      setLinkFrom(null);
      return;
    }
    setSel(n.id);
    const [sx, sy] = toStage(e);
    drag.current = { id: n.id, dx: n.x - sx, dy: n.y - sy, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const [sx, sy] = toStage(e);
    d.moved = true;
    setDraft(moveNode(shownRef.current, d.id, sx + d.dx, sy + d.dy));
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d && d.moved) commit(shownRef.current);
  };
  useEffect(() => {
    const k = (e) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel && board && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) {
        e.preventDefault();
        commit(removeNode(board, sel));
        setSel(null);
      }
    };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [sel, board, live]);

  if (!board)
    return html`<div class="bd-empty">
      <p>A sermon board is a diagram you draw while the preacher speaks: a point, an arrow to the next, a picture, a verse. Each point pops onto the TV as you add it, so the hall sees the message take shape.</p>
      <button class="primary" onClick=${create}>New board</button>
      ${store.boards.length > 0 && html`<p class="muted small">Or open one: ${store.boards.map((b) => html`<button class="chip" onClick=${() => saveStore({ ...store, current: b.id })}>${b.title}</button>`)}</p>`}
    </div>`;

  const preview = { ...state, item: boardItem(shown), mode: 'show', index: 0, sub: Math.max(0, shown.nodes.length - 1), reveal: true, illustration: null, marks: {}, wc: null };
  const pictures = [...folder, ...mine].filter((m) => m.type === 'image');
  return html`<div class="bd">
    <div class="bd-main">
      <div class="bd-head row wrap">
        ${renaming
          ? html`<form
              class="row"
              onSubmit=${(e) => {
                e.preventDefault();
                setRenaming(false);
              }}
            >
              <input value=${board.title} onInput=${(e) => commit({ ...board, title: e.target.value }, { sendNow: false })} aria-label="Board title" autofocus />
              <button>Done</button>
            </form>`
          : html`<select value=${board.id} onChange=${(e) => saveStore({ ...store, current: e.target.value })} aria-label="Board">
                ${store.boards.map((b) => html`<option value=${b.id}>${b.title}</option>`)}
              </select>
              <button class="ghost small" onClick=${create}>New</button>
              <button class="ghost small" onClick=${() => setRenaming(true)}>Rename</button>
              <button class="ghost small" onClick=${remove}>Delete</button>`}
        <span class="grow"></span>
        ${live
          ? html`<span class="pill ok">Live · changes go to the TV as you make them</span>
              <button class="ghost small" onClick=${() => send(board, 0)} title="Back to the first point; Next brings the others one by one">Replay</button>
              <button class="ghost small" onClick=${() => act({ type: 'mode', mode: 'clear' })}>Take down</button>`
          : html`<button class="primary" onClick=${() => send(board)} disabled=${!board.nodes.length}>Show on TV</button>`}
      </div>
      <div class="bd-tools row wrap">
        <span class="seg">
          ${['box', 'pill', 'circle', 'note'].map((k) => html`<button onClick=${() => add(k)}>+ ${NODE_KINDS[k]}</button>`)}
          <button class=${tool === 'picture' ? 'on' : ''} onClick=${() => setTool(tool === 'picture' ? null : 'picture')}>+ Picture</button>
          <button class=${tool === 'verse' ? 'on' : ''} onClick=${() => setTool(tool === 'verse' ? null : 'verse')}>+ Verse</button>
        </span>
        <label class="toggle compact" title="Each new point gets an arrow from the one before"><input type="checkbox" checked=${chain} onChange=${(e) => setChain(e.target.checked)} /><span>Chain</span></label>
        <span class="seg" role="group" aria-label="Board look">
          ${Object.entries(BOARD_THEMES).map(([k, l]) => html`<button class=${board.theme === k ? 'on' : ''} onClick=${() => commit({ ...board, theme: k })}>${l}</button>`)}
        </span>
      </div>
      ${tool === 'picture' &&
      html`<div class="bd-pick">
        ${!pictures.length && html`<p class="muted small">No pictures yet: add some in Pictures, or drop them into the Google orb.</p>`}
        <ul class="bd-pics">
          ${pictures.map((m) => html`<li key=${m.id}><button onClick=${() => add('picture', { src: m.src })} title=${m.title}><${Thumb} m=${m} /></button></li>`)}
        </ul>
      </div>`}
      ${tool === 'verse' &&
      html`<form
        class="bd-pick row wrap"
        onSubmit=${(e) => {
          e.preventDefault();
          addVerse();
        }}
      >
        <input class="grow" value=${vref} onInput=${(e) => setVref(e.target.value)} placeholder="Yokaana 3:16, Psalm 23:1-3 (up to 4 verses)" aria-label="Verse reference" autofocus />
        <select value=${vlang} onChange=${(e) => setVlang(e.target.value)} aria-label="Version">
          <option value="primary">${(versionById(prefs.primary) || {}).label || 'On top'}</option>
          ${prefs.secondary && html`<option value="secondary">${(versionById(prefs.secondary) || {}).label || 'Below'}</option>`}
        </select>
        <button class="primary">Add verse</button>
      </form>`}
      <div class="bd-canvas" ref=${canvas}>
        <${Fit}><${Stage} state=${preview} still="bg" /><//>
        <div class="bd-overlay" onPointerMove=${onMove} onPointerUp=${onUp} onPointerCancel=${onUp}>
          ${shown.nodes.map(
            (n) => html`<div
              key=${n.id}
              class=${`bd-h ${sel === n.id ? 'sel' : ''} ${linkFrom === n.id ? 'from' : ''} ${linkFrom && linkFrom !== n.id ? 'target' : ''}`}
              style=${`left:${((n.x - n.w / 2) / 1920) * 100}%;top:${((n.y - n.h / 2) / 1080) * 100}%;width:${(n.w / 1920) * 100}%;height:${(n.h / 1080) * 100}%`}
              title=${n.text || NODE_KINDS[n.kind]}
              onPointerDown=${(e) => onDown(n, e)}
              onDblClick=${() => textRef.current && textRef.current.focus()}
            ></div>`,
          )}
        </div>
      </div>
      <p class="muted small">${linkFrom ? 'Touch the point the arrow should go to (the same pair again takes the arrow away).' : 'Drag a point to move it. Touch one to edit it. Next and Back on the TV step through the points in the order they were added.'}</p>
    </div>
    <aside class="bd-side">
      ${node
        ? html`<h3 class="sec-head">${NODE_KINDS[node.kind]} <span class="muted small">${board.nodes.indexOf(node) + 1} of ${board.nodes.length}</span></h3>
            ${node.kind !== 'picture' &&
            html`<label class="field"><span>${node.kind === 'verse' ? 'Reference' : 'Small line above'}</span><input value=${node.sub} onInput=${(e) => patch({ sub: e.target.value })} /></label>`}
            <label class="field"><span>${node.kind === 'picture' ? 'Caption' : 'Text'}</span><textarea ref=${textRef} rows="4" value=${node.text} onInput=${(e) => patch({ text: e.target.value })}></textarea></label>
            ${node.kind !== 'picture' &&
            node.kind !== 'verse' &&
            html`<div class="field">
              <span>Shape</span>
              <span class="seg">${['box', 'pill', 'circle', 'note'].map((k) => html`<button class=${node.kind === k ? 'on' : ''} onClick=${() => patch({ kind: k, w: NODE_SIZE[k][0], h: NODE_SIZE[k][1] }, true)}>${NODE_KINDS[k]}</button>`)}</span>
            </div>`}
            <div class="field">
              <span>Colour</span>
              <span class="bd-colors">${Object.entries(NODE_COLORS).map(([k, c]) => html`<button class=${`sw ${node.color === k ? 'on' : ''}`} style=${`--c:${c}`} title=${k} aria-label=${k} onClick=${() => patch({ color: k }, true)}></button>`)}</span>
            </div>
            <div class="field">
              <span>Size</span>
              <span class="row wrap">
                <span class="seg">${[['s', 'Small'], ['m', 'Medium'], ['l', 'Large']].map(([k, l]) => html`<button class=${node.size === k ? 'on' : ''} onClick=${() => patch({ size: k }, true)}>${l}</button>`)}</span>
                <span class="seg">${[[0.8, '−'], [1.25, '+']].map(([f, l]) => html`<button title="Box size" onClick=${() => patch({ w: Math.round(node.w * f), h: Math.round(node.h * f) }, true)}>${l}</button>`)}</span>
              </span>
            </div>
            <div class="row wrap">
              <button class=${`chip ${linkFrom === sel ? 'on' : ''}`} onClick=${() => setLinkFrom(linkFrom === sel ? null : sel)}>${linkFrom === sel ? 'Now touch the other point' : 'Arrow to…'}</button>
              <button class="chip" onClick=${() => order(-1)} title="Earlier in the order the points appear">Earlier</button>
              <button class="chip" onClick=${() => order(1)}>Later</button>
              <button
                class="chip danger"
                onClick=${() => {
                  commit(removeNode(board, sel));
                  setSel(null);
                }}
              >
                Delete
              </button>
            </div>`
        : html`<p class="muted small">Touch a point to edit it; drag to move it. Add points with the buttons above; while <b>Chain</b> is on each new point gets an arrow from the last.</p>
            ${board.nodes.length > 0 &&
            html`<ol class="bd-list">
              ${board.nodes.map((n) => html`<li><button class="chip" onClick=${() => setSel(n.id)}>${board.nodes.indexOf(n) + 1} · ${n.text || n.sub || NODE_KINDS[n.kind]}</button></li>`)}
            </ol>`}`}
    </aside>
  </div>`;
}
