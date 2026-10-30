// The editable song list for one service. Pure functions returning new arrays.

import { uid } from './util.js';
import { displayName, isGenericLabel } from './naming.js';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function parseSections(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s) => ({
      start: num(s.start_s ?? s.start),
      end: num(s.end_s ?? s.end),
      label: String(s.label ?? s.name ?? '').trim() || 'Section',
    }))
    .filter((s) => s.start != null && s.end != null && s.end > s.start);
}

/** Backend (or local analysis) songs -> editable songs. */
export function fromDetected(list, { estimated = false } = {}) {
  return (list || [])
    .filter((s) => num(s.start_s) != null && num(s.end_s) != null)
    .sort((a, b) => a.start_s - b.start_s)
    .map((s) => ({
      id: uid(),
      n: s.n,
      start: s.start_s,
      end: s.end_s,
      detected: { start: s.start_s, end: s.end_s },
      name: '',
      backendLabel: !isGenericLabel(s.label) ? String(s.label) : null,
      confidence: num(s.confidence),
      check: !!s.check,
      note: s.note ? String(s.note) : '',
      medley: !!s.medley,
      medleyAt: Array.isArray(s.medley_at) ? s.medley_at.filter((t) => num(t) != null) : [],
      bpm: num(s.bpm),
      key: s.key ? String(s.key) : null,
      estimated: estimated || !!s.estimated,
      sections: parseSections(s.sections),
      sectionNames: {},
      clips: false,
      selected: true,
    }));
}

export function splitSong(songs, id, t) {
  const i = songs.findIndex((s) => s.id === id);
  if (i < 0) return songs;
  const s = songs[i];
  if (!(t > s.start + 1 && t < s.end - 1)) return songs;
  const a = {
    ...s,
    end: t,
    medley: false,
    medleyAt: s.medleyAt.filter((x) => x < t - 1),
    sections: clipSections(s.sections, s.start, t),
    splitFrom: s.splitFrom || s.id,
    bpm: s.bpm,
  };
  const b = {
    ...s,
    id: uid(),
    name: '',
    start: t,
    medley: false,
    medleyAt: s.medleyAt.filter((x) => x > t + 1),
    sections: clipSections(s.sections, t, s.end),
    splitFrom: s.splitFrom || s.id,
    // Tempo/key were measured on the whole medley; don't pretend they
    // describe the new part.
    bpm: null,
    key: null,
    check: true,
    note: '',
    confidence: null,
    detected: { start: t, end: s.end },
  };
  a.detected = { start: s.detected.start, end: t };
  if (s.medley) {
    // Same caution for the first part.
    a.bpm = null;
    a.key = null;
  }
  return [...songs.slice(0, i), a, b, ...songs.slice(i + 1)];
}

function clipSections(sections, a, b) {
  return sections
    .filter((x) => x.end > a + 0.5 && x.start < b - 0.5)
    .map((x) => ({ ...x, start: Math.max(a, x.start), end: Math.min(b, x.end) }));
}

export function mergeWithNext(songs, id) {
  const i = songs.findIndex((s) => s.id === id);
  if (i < 0 || i + 1 >= songs.length) return songs;
  const a = songs[i];
  const b = songs[i + 1];
  const merged = {
    ...a,
    end: Math.max(a.end, b.end),
    name: a.name || b.name,
    sections: [...a.sections, ...b.sections],
    medleyAt: [...a.medleyAt, ...b.medleyAt],
    detected: { start: a.detected.start, end: b.detected.end },
    bpm: a.bpm === b.bpm ? a.bpm : null,
    key: a.key === b.key ? a.key : null,
    note: [a.note, b.note].filter(Boolean).join('; '),
  };
  return [...songs.slice(0, i), merged, ...songs.slice(i + 2)];
}

export function removeSong(songs, id) {
  return songs.filter((s) => s.id !== id);
}

export function addSong(songs, start, end) {
  const s = {
    id: uid(),
    start,
    end,
    detected: { start, end },
    name: '',
    backendLabel: null,
    confidence: null,
    check: false,
    note: 'added by you',
    medley: false,
    medleyAt: [],
    bpm: null,
    key: null,
    estimated: false,
    sections: [],
    sectionNames: {},
    clips: false,
    selected: true,
  };
  return [...songs, s].sort((a, b) => a.start - b.start);
}

export function updateSong(songs, id, patch) {
  return songs.map((s) => (s.id === id ? { ...s, ...patch } : s));
}

/** Moves one edge, keeping the song at least one second long. */
export function setEdge(songs, id, edge, t, duration) {
  return songs.map((s) => {
    if (s.id !== id) return s;
    if (edge === 'start') return { ...s, start: round1(Math.max(0, Math.min(t, s.end - 1))) };
    return { ...s, end: round1(Math.min(duration ?? Infinity, Math.max(t, s.start + 1))) };
  });
}

function round1(t) {
  return Math.round(t * 1000) / 1000;
}

/**
 * Section clips for export: consecutive sections with the same label are
 * joined, then each gets the song title plus its section name, e.g.
 * "Way Maker - Chorus 2".
 */
export function sectionClips(song, title) {
  const joined = [];
  for (const sec of [...song.sections].sort((a, b) => a.start - b.start)) {
    const last = joined[joined.length - 1];
    if (last && last.label === sec.label && sec.start - last.end < 1) last.end = sec.end;
    else joined.push({ ...sec });
  }
  const clipped = joined
    .map((c) => ({ ...c, start: Math.max(c.start, song.start), end: Math.min(c.end, song.end) }))
    .filter((c) => c.end - c.start >= 3);
  const totals = {};
  for (const c of clipped) {
    const name = sectionName(song, c.label);
    totals[name] = (totals[name] || 0) + 1;
  }
  const counts = {};
  return clipped.map((c) => {
    const name = sectionName(song, c.label);
    counts[name] = (counts[name] || 0) + 1;
    const suffix = totals[name] > 1 ? ` ${counts[name]}` : '';
    return { ...c, name: name + suffix, title: `${title} - ${name}${suffix}` };
  });
}

export function sectionName(song, label) {
  return (song.sectionNames && song.sectionNames[label]) || label;
}

export function sectionLabels(song) {
  return [...new Set(song.sections.map((s) => s.label))].sort();
}

/** Everything export needs, with names resolved and fallbacks applied. */
export function exportPlan(songs) {
  const items = [];
  songs.forEach((s, i) => {
    if (!s.selected) return;
    const title = displayName(s, i);
    items.push({ key: `${s.id}`, songId: s.id, index: i, title, start: s.start, end: s.end, kind: 'song' });
    if (s.clips) {
      for (const c of sectionClips(s, title)) {
        items.push({
          key: `${s.id}:${c.start}:${c.label}`,
          songId: s.id,
          index: i,
          title: c.title,
          start: c.start,
          end: c.end,
          kind: 'section',
        });
      }
    }
  });
  return items;
}
