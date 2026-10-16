// The calendar of verses (the Orbit console): where a verse sits in a passage that is up, the
// words a tile shows, which books a few typed letters mean. Pure, so it runs in the tests.

import { BOOKS, normName } from './books.js';
import { PER_SCREEN } from './bible.js';

/** Where verse v is in a passage item: { index, sub } (its slide, its place on it), or null. */
export function locateVerse(item, v) {
  if (!item || !Array.isArray(item.slides)) return null;
  for (let i = 0; i < item.slides.length; i++) {
    const segs = item.slides[i].verses || [];
    for (let j = 0; j < segs.length; j++) if (segs[j].verse === v && (!segs[j].part || segs[j].part === 'a')) return { index: i, sub: j };
  }
  return null;
}

/** The verse being read: the slide's segment under the reveal cursor (or its first). */
export function verseAt(item, index, sub) {
  const slide = item && item.slides && item.slides[index];
  const segs = (slide && slide.verses) || [];
  if (!segs.length) return item ? item.v1 || 0 : 0;
  return segs[Math.max(0, Math.min(sub || 0, segs.length - 1))].verse;
}

/** The first few words of a verse, for a tile. */
export const peekOf = (t, n = 3) =>
  String(t || '')
    .replace(/^\d+\s+/, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, n)
    .join(' ');

export const BOOK_GROUPS = [
  ['Old Testament · Endagaano Enkadde', 1, 39],
  ['New Testament · Endagaano Empya', 40, 66],
];

/** The books whose name (English, Luganda, short form or alias) starts with or contains the typed text. */
export function matchBooks(q) {
  const f = normName(q || '');
  if (!f) return BOOKS;
  return BOOKS.filter(
    (b) =>
      normName(b.en).includes(f) ||
      normName(b.lg).includes(f) ||
      normName(b.lgShort).startsWith(f) ||
      (b.extra && b.extra.split('|').some((x) => x && normName(x).startsWith(f))),
  );
}

/** The per-screen choice from the console's prefs (as the Scripture tab reads it). */
export const perScreenOf = (prefs) => (PER_SCREEN.includes(prefs.perScreen) ? prefs.perScreen : prefs.perVerse ? 'verse' : 'auto');

