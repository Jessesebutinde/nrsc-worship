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
// Little words a line shouldn't end on: they belong to the word after them (English and Luganda).
const WEAK = new Set(
  (
    'a an and the to of my in on for that with as at by or but your our his her its their nor so yet is are was am be ' +
    'ne na mu ku nga ya wa ba ye ka ki gwa kya lya bya za era naye nti oba'
  ).split(' '),
);
// Words a line shouldn't start with: they close the phrase before them.
const TAIL = new Set('too also again forever ever amen'.split(' '));
const norm = (w) => w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');

/** Pairs of neighbouring words that repeat in the text ("holy holy", "alle alle"): kept together. */
function repeatedPairs(words) {
  const seen = new Map();
  const out = new Set();
  for (let i = 0; i + 1 < words.length; i++) {
    const k = `${norm(words[i])} ${norm(words[i + 1])}`;
    if (seen.has(k)) {
      out.add(i);
      out.add(seen.get(k));
    } else seen.set(k, i);
  }
  return out;
}

/**
 * Best places to break a run of words into pieces, scored like a lyric editor would cut them:
 * - pieces close to `target` and balanced with each other, none over `max` (a lone long word excepted);
 * - a break after a comma or a full stop is good, after a little joining word (and, of, the, mu, nga) bad;
 * - a repeated pair of words ("holy holy") and a closing word ("forever", "amen") stay with their phrase.
 * With `parts`, exactly that many pieces. Words are never split.
 */
function breakWords(words, { target, max = Infinity, parts = 0, size = (t) => t.length }) {
  const n = words.length;
  const pairs = repeatedPairs(words);
  const len = (i, j) => size(words.slice(i, j).join(' '));
  const cost = (i, j) => {
    const L = len(i, j);
    if (L > max && j - i > 1) return Infinity;
    const dev = (L - target) / target;
    let c = dev * dev * 10;
    if (j < n) {
      const last = norm(words[j - 1]);
      if (PAUSE.test(words[j - 1])) c -= STRONG.test(words[j - 1]) ? 3.5 : 3;
      if (WEAK.has(last)) c += 4;
      if (TAIL.has(norm(words[j]))) c += 3;
      if (pairs.has(j - 1)) c += 3;
      // "Holy, holy, holy" style runs: break between repeats only at a pause.
      if (norm(words[j]) === last && !PAUSE.test(words[j - 1])) c += 2;
    }
    if (L < target * 0.4) c += 2;
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
    // Two balanced pieces beat two lopsided ones: a small extra cost for unequal halves.
    for (let q = 2; q <= maxParts; q++) {
      if (best[q][n] === Infinity) continue;
      let j = n;
      const lens = [];
      for (let r = q; r > 0; r--) {
        const i = from[r][j];
        lens.push(len(i, j));
        j = i;
      }
      const spread = (Math.max(...lens) - Math.min(...lens)) / target;
      best[q][n] += spread * spread * 2;
    }
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

export const MAX_LINES = 2;

function slideFits(lines, { size, max }) {
  return lines.length <= MAX_LINES && lines.every((l) => size(l) <= max);
}

/**
 * Pasted lyrics -> slide text: never more than 2 lines per slide, lines kept near `target` characters
 * and never over `max`, cut where a singer breathes (see breakWords), words never split.
 * Slides that already fit are left exactly as they are, so running it twice changes nothing.
 * `size` measures a line (see units()); without it, lengths are in characters.
 */
export function splitLyrics(text, preset = 'classic', size = null) {
  const u = units(preset, size);
  const out = [];
  for (const slide of parseSlides(text)) {
    if (slideFits(slide.lines, u)) {
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
    if (s.lines.length > MAX_LINES) out.push({ index, message: `${s.lines.length} lines (max ${MAX_LINES})` });
    const long = s.lines.filter((l) => measure(l) > max);
    if (long.length)
      out.push({
        index,
        message: size ? `“${long[0]}” is too wide and will wrap on the TV` : `Line over ${max} characters: “${long[0]}”`,
      });
  });
  return out;
}
