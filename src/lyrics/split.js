// Lyrics text <-> slides.
//
// The slide text format is what the operator edits (and what the "split lyrics" chat prompt produces):
// a blank line between slides, and a [Label] line (or "Chorus:", "Verse 2") before each section.
//
//   [Verse 1]
//   Amazing grace, how sweet the sound
//   that saved a wretch like me
//
//   I once was lost, but now am found,
//   was blind, but now I see

export const PRESET_LIMITS = {
  classic: { target: 22, max: 26 },
  worship: { target: 24, max: 28 },
  praise: { target: 18, max: 22 },
  poster: { target: 24, max: 28 },
  sunshine: { target: 18, max: 22 },
  lines: { target: 18, max: 22 },
  beams: { target: 20, max: 24 },
  banner: { target: 20, max: 24 },
  midnight: { target: 18, max: 22 },
  pixel: { target: 22, max: 26 },
  neon: { target: 16, max: 20 },
  grateful: { target: 16, max: 20 },
  film: { target: 24, max: 28 },
};

/**
 * How lines are sized. By default in characters (the limits above). In the browser the editor passes
 * `size(line)` = rendered width / available width, so a line fits when size <= 1.
 */
function units(preset, size) {
  if (size) return { size, target: 0.82, max: 1 };
  const { target, max } = PRESET_LIMITS[preset] || PRESET_LIMITS.classic;
  return { size: (t) => t.length, target, max };
}

const LABEL_WORDS =
  'verse|v|chorus|ch|pre-?chorus|bridge|tag|outro|intro|refrain|ending|interlude|vamp|coda|ekiddibwamu|olunyiriri';
const LABEL_RE = new RegExp(`^\\s*(?:\\[([^\\]]+)\\]|((?:${LABEL_WORDS})\\s*\\d*[a-z]?)\\s*:?)\\s*$`, 'i');

/** "[Chorus]" / "Chorus:" / "Verse 2" -> the label, else null. */
export function labelOf(line) {
  const m = LABEL_RE.exec(line);
  if (!m) return null;
  const l = (m[1] || m[2]).trim();
  return l.charAt(0).toUpperCase() + l.slice(1);
}

export const isChorus = (label) => /chorus|refrain|ekiddibwamu/i.test(label || '');

/** Slide text -> [{ label, lines }]. Every block between blank lines is one slide. */
export function parseSlides(text) {
  const slides = [];
  let label = '';
  for (const block of String(text || '').replace(/\r/g, '').split(/\n\s*\n/)) {
    const lines = [];
    for (const raw of block.split('\n')) {
      const line = raw.replace(/\s+/g, ' ').trim();
      if (!line) continue;
      const l = labelOf(line);
      if (l && !lines.length) label = l;
      else if (l) {
        // A label in the middle of a block starts a new slide.
        slides.push({ label, lines: lines.splice(0) });
        label = l;
      } else lines.push(line);
    }
    if (lines.length) slides.push({ label, lines });
  }
  return slides;
}

/** Slides -> slide text (a label line only where the section changes). */
export function formatSlides(slides) {
  let last = null;
  return slides
    .map((s) => {
      const head = s.label && s.label !== last ? `[${s.label}]\n` : '';
      last = s.label || last;
      return head + s.lines.join('\n');
    })
    .join('\n\n');
}

const PAUSE = /[,;:.!?)]["”’]?$/;
const STRONG = /[.;:!?]["”’]?$/;
// Little words a line shouldn't end on (English and Luganda).
const WEAK = new Set(
  'a an and the to of my in on for that with as at by or but your our his her ne na mu ku nga ya wa ba ye ka ki gwa kya lya bya za'.split(' '),
);

/**
 * Best places to break a run of words into pieces: pieces close to `target` characters, none over `max`
 * (unless a single word is longer), breaks after punctuation preferred, very short pieces avoided.
 * With `parts`, exactly that many pieces. Words are never split.
 */
function breakWords(words, { target, max = Infinity, parts = 0, size = (t) => t.length }) {
  const n = words.length;
  const len = (i, j) => size(words.slice(i, j).join(' '));
  const cost = (i, j) => {
    const L = len(i, j);
    if (L > max && j - i > 1) return Infinity;
    const dev = (L - target) / target;
    let c = dev * dev * 10;
    if (j < n && PAUSE.test(words[j - 1])) c -= STRONG.test(words[j - 1]) ? 3.5 : 3;
    if (L < target * 0.4) c += 2;
    if (j < n && WEAK.has(words[j - 1].toLowerCase())) c += 2;
    return c;
  };
  const maxParts = parts || n;
  // best[p][j]: cheapest way to cover words[0..j) with p pieces.
  const best = [[0, ...Array(n).fill(Infinity)]];
  const from = [[]];
  for (let p = 1; p <= maxParts; p++) {
    best.push(Array(n + 1).fill(Infinity));
    from.push(Array(n + 1).fill(-1));
    for (let j = 1; j <= n; j++)
      for (let i = p - 1; i < j; i++) {
        if (best[p - 1][i] === Infinity) continue;
        const c = best[p - 1][i] + cost(i, j);
        if (c < best[p][j]) {
          best[p][j] = c;
          from[p][j] = i;
        }
      }
  }
  let p = parts;
  if (!p) {
    p = 1;
    for (let q = 2; q <= maxParts; q++) if (best[q][n] < best[p][n]) p = q;
  }
  if (best[p][n] === Infinity) return null;
  const out = [];
  for (let j = n; p > 0; p--) {
    const i = from[p][j];
    out.unshift(words.slice(i, j).join(' '));
    j = i;
  }
  return out;
}

/** Splits text into `parts` pieces of similar length, preferring breaks after punctuation. Never splits a word. */
export function splitAtPauses(text, parts) {
  const words = String(text).split(/\s+/).filter(Boolean);
  if (parts <= 1 || words.length < 2) return [words.join(' ')];
  parts = Math.min(parts, words.length);
  return breakWords(words, { target: words.join(' ').length / parts, parts });
}

/** One sung line -> screen lines no longer than `max` (a single word longer than that stays whole). */
export function wrapLine(line, { target = 22, max = 26, size = (t) => t.length } = {}) {
  const t = line.replace(/\s+/g, ' ').trim();
  if (size(t) <= max) return [t];
  return breakWords(t.split(' '), { target, max, size }) || t.split(' ');
}

function slideFits(lines, label, { size, max }) {
  const maxLines = isChorus(label) ? 3 : 2;
  return lines.length <= maxLines && lines.every((l) => size(l) <= max);
}

/**
 * Pasted lyrics -> slide text: 2 lines per slide (a chorus may keep 3 rather than leave one line alone),
 * lines kept near `target` characters and never over `max`, words never split.
 * Slides that already fit are left exactly as they are, so running it twice changes nothing.
 * `size` measures a line (see units()); without it, lengths are in characters.
 */
export function splitLyrics(text, preset = 'classic', size = null) {
  const u = units(preset, size);
  const out = [];
  for (const slide of parseSlides(text)) {
    if (slideFits(slide.lines, slide.label, u)) {
      out.push(slide);
      continue;
    }
    // Each sung line becomes one or more screen lines; a slide never ends mid-line if it can be helped.
    let cur = [];
    const flush = () => cur.length && out.push({ label: slide.label, lines: cur.splice(0) });
    for (const sung of slide.lines) {
      let pieces = wrapLine(sung, u);
      // 3 or 5 screen lines would leave one alone on a slide: try one more break.
      if (pieces.length >= 3 && pieces.length % 2) {
        const even = breakWords(sung.trim().split(/\s+/), { ...u, parts: pieces.length + 1 });
        if (even && even.every((p) => u.size(p) <= u.max)) pieces = even;
      }
      if (cur.length + pieces.length <= 2) {
        cur.push(...pieces);
        continue;
      }
      flush();
      for (let i = 0; i < pieces.length; i += 2) {
        if (cur.length) flush();
        cur.push(...pieces.slice(i, i + 2));
      }
    }
    // A chorus may keep a lone last line on the slide before rather than show it on its own.
    const prev = out[out.length - 1];
    if (cur.length === 1 && isChorus(slide.label) && prev && prev.label === slide.label && prev.lines.length === 2)
      prev.lines.push(...cur.splice(0));
    flush();
  }
  return formatSlides(out);
}

/**
 * Big slides: a short burst of up to `words` words per slide, one line each ("ALLE ALLE" / "ALLELUIA").
 * A comma, full stop or other pause ends a slide early. Labels are kept.
 */
export function splitShort(text, words = 2) {
  const out = [];
  for (const slide of parseSlides(text)) {
    let cur = [];
    const flush = () => cur.length && out.push({ label: slide.label, lines: [cur.splice(0).join(' ')] });
    for (const w of slide.lines.join(' ').split(/\s+/).filter(Boolean)) {
      cur.push(w);
      if (cur.length >= words || /[,;:.!?]["”’)]?$/.test(w)) flush();
    }
    flush();
  }
  return formatSlides(out);
}

/** Problems the operator should see: [{ index, message }]. */
export function lintSlides(slides, preset = 'classic', size = null) {
  const { max, size: measure } = units(preset, size);
  const out = [];
  slides.forEach((s, index) => {
    const maxLines = isChorus(s.label) ? 3 : 2;
    if (s.lines.length > maxLines)
      out.push({ index, message: `${s.lines.length} lines (max ${maxLines}${maxLines === 2 ? ', 3 for a chorus' : ''})` });
    const long = s.lines.filter((l) => measure(l) > max);
    if (long.length)
      out.push({
        index,
        message: size ? `“${long[0]}” is too wide and will wrap on the TV` : `Line over ${max} characters: “${long[0]}”`,
      });
  });
  return out;
}
