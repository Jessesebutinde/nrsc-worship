// The letters that follow the singer word by word (per laptop): J next word, F previous word,
// U next line by default. Shared by the console and the TV page.

export const FOLLOW_KEYS = { next: 'j', prev: 'f', line: 'u' };
export const FOLLOW_KEY_NAMES = { prev: 'Previous word', next: 'Next word', line: 'Next line' };
const LS_KEYS = 'ls-keys';
// Keys the app already uses: slides (Space, arrows, Page keys, Enter), Black (B, .), Clear (C),
// Logo (L), and the TV page's background video (V).
export const RESERVED = new Set([' ', 'b', 'c', 'l', 'v', '.']);

/** A usable key: one letter or digit, not already taken. */
export const validKey = (k) => typeof k === 'string' && /^[a-z0-9]$/.test(k) && !RESERVED.has(k);

/** The keys chosen on this laptop (any invalid or clashing choice falls back to the default). */
export function readFollowKeys() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(LS_KEYS)) || {};
  } catch {
    saved = {};
  }
  const out = { ...FOLLOW_KEYS };
  for (const k of Object.keys(FOLLOW_KEYS)) if (validKey(saved[k])) out[k] = saved[k];
  return new Set(Object.values(out)).size === 3 ? out : { ...FOLLOW_KEYS };
}

export function saveFollowKeys(keys) {
  try {
    localStorage.setItem(LS_KEYS, JSON.stringify(keys));
  } catch {
    /* private window: the defaults stay */
  }
  // Anything showing the letters redraws.
  if (typeof dispatchEvent === 'function' && typeof Event === 'function') dispatchEvent(new Event('ls-keys'));
}

/** The follow command for a key press, or null. */
export function followCommand(key, keys = readFollowKeys()) {
  const k = String(key || '').toLowerCase();
  if (k === keys.next) return { type: 'word', dir: 1 };
  if (k === keys.prev) return { type: 'word', dir: -1 };
  if (k === keys.line) return { type: 'word', dir: 1, unit: 'line' };
  return null;
}
