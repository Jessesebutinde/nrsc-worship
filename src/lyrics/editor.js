// Song editor: the slide text on one side, the slide as the TV will show it on the other,
// with length warnings and a proof view of Luganda / English suggestions under the lyrics.

import { html, useState, useEffect, useMemo, useRef } from '../ui/h.js';
import { Fit, Stage } from './stage.js';
import { parseSlides, splitLyrics, splitShort, lintSlides } from './split.js';
import { PRESETS, PRESET_INFO } from './state.js';
import { makeSong } from './library.js';
import { Dictionary, wordsOf } from './spell.js';
import { checkLyrics, applyLyricFix, applyLyricFixes, proofLines, SAFE_KINDS } from './luganda.js';
import { fontsReady, sizer } from './measure.js';

// ------------------------------------------------------------------ dictionary (loaded once)

const LS_IGNORED = 'ls-dict-ignored'; // what "It's right" remembers: words, and keys like "na omwana"
const PROOF_DELAY = 250; // ms after the last key before the proof view catches up
let dictPromise = null;

function readIgnored() {
  try {
    const list = JSON.parse(localStorage.getItem(LS_IGNORED) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

async function wordList(url) {
  try {
    const r = await fetch(url);
    return r.ok ? (await r.text()).split('\n') : [];
  } catch {
    return [];
  }
}

/** The Luganda 1968 Bible and KJV word lists, as the named lists 'lg' and 'en'. */
function loadDictionary() {
  if (!dictPromise) {
    dictPromise = Promise.all([wordList('bibles/lug68/words.txt'), wordList('bibles/kjv/words.txt')]).then(
      ([lg, en]) => new Dictionary().addList('lg', lg).addList('en', en),
    );
  }
  return dictPromise;
}

/** Proof view: the lyrics line by line, each suggestion as a small tag under its word. */
function Proof({ lines, flags, onFix, onFixAll, onIgnore }) {
  const safe = flags.filter((f) => SAFE_KINDS.includes(f.kind));
  const word = (p) => html`<span class=${`pw${p.under ? ` u-${p.under}` : ''}`}>
    <span class="pw-text">${p.text}</span>
    ${p.flags.map(
      (f) => html`<span class=${`tag k-${f.kind}`}>
        <button class="tag-fix" title=${`${f.why} · tap to fix`} onClick=${() => onFix(f)}>${f.label}</button>
        <button class="tag-x" title="It's right: stop suggesting this" aria-label=${`It's right: keep “${f.word.trim()}”`} onClick=${() => onIgnore(f)}>×</button>
      </span>`,
    )}
  </span>`;
  return html`<section class="proof" aria-label="Suggestions">
    <header class="proof-head">
      <b>Suggestions · ${flags.length}</b>
      ${safe.length > 0 &&
      html`<button class="chip proof-all" onClick=${onFixAll} title="Grammar, punctuation and capitals. Spelling stays for you to check.">
        Fix all safe ones · ${safe.length}
      </button>`}
    </header>
    ${flags.length
      ? html`<div class="proof-sub small">
            <span class="muted">Tap a tag to fix it · × if it's right</span>
            <span class="proof-key">
              <i class="k-spelling">spelling</i><i class="k-grammar">grammar</i><i class="k-punctuation">punctuation</i><i class="k-capital">capital</i>
            </span>
          </div>
          <div class="proof-text">
            ${lines.map((line) =>
              line.label
                ? html`<div class="proof-label">${line.text}</div>`
                : line.empty
                  ? html`<div class="proof-gap"></div>`
                  : html`<div class="proof-line">
                      ${line.parts.map((p) =>
                        p.word ? word(p) : html`<span class=${`ps${p.under ? ` u-${p.under}` : ''}`}>${p.text}</span>`,
                      )}
                    </div>`,
            )}
          </div>`
      : html`<small class="muted">No suggestions for these lyrics.</small>`}
  </section>`;
}

/** Which slide (index) the caret is in. */
function slideAtCaret(text, caret) {
  const before = text.slice(0, caret);
  // Count completed slides before the caret: blocks with at least one non-label line.
  return Math.max(0, parseSlides(`${before}x`).length - 1);
}

// ------------------------------------------------------------------ component

export function SongEditor({ song, songs, onSave, onDelete, onClose, onShow }) {
  const [title, setTitle] = useState(song ? song.title : '');
  const [language, setLanguage] = useState(song ? song.language : 'lg');
  const [preset, setPreset] = useState(song ? song.preset : 'worship');
  const [tags, setTags] = useState(song ? (song.tags || []).join(', ') : '');
  const [text, setText] = useState(song ? song.text : '');
  const [cur, setCur] = useState(0);
  const [dict, setDict] = useState(null);
  const [fontsOk, setFontsOk] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [bigWords, setBigWords] = useState(2);
  const [ignored, setIgnored] = useState(readIgnored);
  // The proof view follows the lyrics a moment behind the typing, so typing stays quick.
  const [proofText, setProofText] = useState(text);
  const ta = useRef(null);

  const slides = useMemo(() => parseSlides(text), [text]);
  // Once the font is loaded, lines are measured in it; until then, counted in characters.
  const size = useMemo(() => (fontsOk ? sizer(preset) : null), [fontsOk, preset]);
  const lint = useMemo(() => lintSlides(slides, preset, size), [slides, preset, size]);
  // Words from the user's other songs are taken as right.
  const songWords = useMemo(
    () => new Set(songs.filter((s) => !song || s.id !== song.id).flatMap((s) => wordsOf(s.text))),
    [songs],
  );
  const flags = useMemo(
    () => (dict ? checkLyrics(proofText, dict, { ignored, title, language, known: songWords }) : []),
    [proofText, dict, ignored, title, language, songWords],
  );
  const proof = useMemo(() => proofLines(proofText, flags), [proofText, flags]);

  useEffect(() => {
    loadDictionary().then(setDict);
    fontsReady().then(() => setFontsOk(true));
  }, []);

  useEffect(() => {
    if (text === proofText) return undefined;
    const t = setTimeout(() => setProofText(text), PROOF_DELAY);
    return () => clearTimeout(t);
  }, [text]);

  const index = Math.min(cur, Math.max(0, slides.length - 1));
  const previewState = {
    rev: 1,
    item: slides.length ? { kind: 'song', id: 'preview', title: title || 'Untitled', preset, slides } : null,
    index,
    mode: slides.length ? 'show' : 'logo',
    bg: 'glow',
    calm: true,
  };

  const track = () => {
    const el = ta.current;
    if (el) setCur(slideAtCaret(el.value, el.selectionStart));
  };

  const dirty =
    !song || title !== song.title || text !== song.text || preset !== song.preset || language !== song.language ||
    tags !== (song.tags || []).join(', ');
  const canSave = title.trim() && slides.length;

  const build = () =>
    makeSong({
      id: song ? song.id : undefined,
      title,
      language,
      preset,
      text: text.trim(),
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    });

  const save = () => canSave && onSave(build());

  // Tags were made from proofText; if the lyrics moved on since, catch up first (the tags redraw).
  const edit = (next) => {
    if (next === text) return;
    setText(next);
    setProofText(next);
  };
  const fixOne = (flag) => (text === proofText ? edit(applyLyricFix(text, flag)) : setProofText(text));
  const fixAll = () =>
    text === proofText ? edit(applyLyricFixes(text, flags.filter((f) => SAFE_KINDS.includes(f.kind)))) : setProofText(text);

  const ignore = (flag) => {
    const list = [...new Set([...readIgnored(), flag.key])];
    try {
      localStorage.setItem(LS_IGNORED, JSON.stringify(list));
    } catch {
      // Private window: remembered until the editor closes.
    }
    setIgnored(list);
  };

  const problems = new Map();
  for (const l of lint) problems.set(l.index, [...(problems.get(l.index) || []), l.message]);

  // Underline misspelt words inside each slide card.
  const misspelt = useMemo(() => new Set(flags.filter((f) => f.kind === 'spelling').map((f) => f.word)), [flags]);
  const marked = (line) => {
    if (!misspelt.size) return line;
    return line.split(/(\p{L}+)/u).map((part) => (misspelt.has(part) ? html`<mark class="sp">${part}</mark>` : part));
  };

  return html`<div class="sheet editor" role="dialog" aria-label="Edit song">
    <header class="sheet-head">
      <button class="ghost" onClick=${() => (!dirty || confirm('Discard your changes?')) && onClose()}>Cancel</button>
      <b>${song ? 'Edit song' : 'New song'}</b>
      <button class="primary" disabled=${!canSave} onClick=${save}>Save</button>
    </header>
    <div class="editor-body">
      <div class="editor-left">
        <label class="field"><span>Title</span>
          <input value=${title} onInput=${(e) => setTitle(e.target.value)} placeholder="Song title" />
        </label>
        <div class="row wrap">
          <label class="field grow"><span>Language</span>
            <select value=${language} onChange=${(e) => setLanguage(e.target.value)}>
              <option value="lg">Luganda</option><option value="en">English</option><option value="mixed">Mixed</option>
            </select>
          </label>
          <label class="field grow"><span>Tags</span>
            <input value=${tags} onInput=${(e) => setTags(e.target.value)} placeholder="praise, christmas" />
          </label>
        </div>
        <div class="field"><span>Look</span>
          <div class="seg">
            ${PRESETS.map(
              (p) => html`<button class=${preset === p ? 'on' : ''} onClick=${() => setPreset(p)} title=${PRESET_INFO[p].hint}>
                ${PRESET_INFO[p].name}
              </button>`,
            )}
          </div>
          <small class="muted">${PRESET_INFO[preset].hint}</small>
        </div>
        <label class="field"><span>Lyrics · a blank line between slides, [Chorus] before a section</span>
          <textarea
            ref=${ta}
            value=${text}
            spellcheck=${false}
            onInput=${(e) => {
              setText(e.target.value);
              track();
            }}
            onClick=${track}
            onKeyUp=${track}
            placeholder=${'[Verse 1]\nPaste or type the song here\n\nThen tap Auto-split'}
          ></textarea>
        </label>
        <div class="row wrap">
          <button onClick=${() => setText(splitLyrics(text, preset, size))} disabled=${!text.trim()}>Auto-split into slides</button>
          <span class="row">
            <button onClick=${() => setText(splitShort(text, bigWords))} disabled=${!text.trim()} title="One short burst per slide, as big as the screen allows">Big slides</button>
            <select value=${bigWords} onChange=${(e) => setBigWords(Number(e.target.value))} aria-label="Words per slide">
              <option value="1">1 word</option><option value="2">2 words</option><option value="3">3 words</option>
            </select>
          </span>
          <span class="muted small">${slides.length} slide${slides.length === 1 ? '' : 's'}</span>
        </div>
        ${dict &&
        proofText.trim() &&
        html`<${Proof} lines=${proof} flags=${flags} onFix=${fixOne} onFixAll=${fixAll} onIgnore=${ignore} />`}
      </div>
      <div class="editor-right">
        <div class="preview-wrap">
          <${Fit}><${Stage} state=${previewState} /><//>
        </div>
        <div class="row between">
          <small class="muted">Slide ${slides.length ? index + 1 : 0} of ${slides.length} · as it shows on the TV</small>
          ${song && onShow && html`<button class="chip" onClick=${() => onShow(build(), index)}>Show this slide live</button>`}
        </div>
        <ol class="slide-cards">
          ${slides.map(
            (s, i) => html`<li class=${`slide-card ${i === index ? 'on' : ''} ${problems.has(i) ? 'warn' : ''}`} onClick=${() => setCur(i)}>
              <span class="slide-no">${i + 1}${s.label ? ` · ${s.label}` : ''}</span>
              ${s.lines.map((l) => html`<span class="slide-line">${marked(l)}</span>`)}
              ${(problems.get(i) || []).map((m) => html`<span class="slide-warn">${m}</span>`)}
            </li>`,
          )}
        </ol>
        ${song &&
        html`<div class="danger-zone">
          ${confirmDelete
            ? html`<span>Delete “${song.title}”?</span>
                <button class="danger" onClick=${() => onDelete(song)}>Delete</button>
                <button class="ghost" onClick=${() => setConfirmDelete(false)}>Keep</button>`
            : html`<button class="ghost danger-text" onClick=${() => setConfirmDelete(true)}>Delete song</button>`}
        </div>`}
      </div>
    </div>
  </div>`;
}
