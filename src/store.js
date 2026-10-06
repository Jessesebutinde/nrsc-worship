// Everything the app remembers lives in localStorage on this device.
// Every access is wrapped: private windows or blocked storage must not
// break the app, they only mean nothing is remembered.

import { emptyLibrary } from './naming.js';

const P = 'songcut.v1.';

function read(key, fallback) {
  try {
    const v = localStorage.getItem(P + key);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(P + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function remove(key) {
  try {
    localStorage.removeItem(P + key);
  } catch {
    /* ignore */
  }
}

export function storageWorks() {
  try {
    localStorage.setItem(P + 'probe', '1');
    localStorage.removeItem(P + 'probe');
    return true;
  } catch {
    return false;
  }
}

// Per-service edits (names, cut points, splits, setlist, export record).
export const loadEdits = (jobKey) => read(`job.${jobKey}`, null);
export const saveEdits = (jobKey, edits) => write(`job.${jobKey}`, { ...edits, savedAt: Date.now() });
export const clearEdits = (jobKey) => remove(`job.${jobKey}`);

export const loadLibrary = () => {
  const lib = read('library', null);
  return lib && lib.items ? lib : emptyLibrary();
};
export const saveLibrary = (lib) => write('library', lib);

export const loadPrefs = () => ({ window: '40', dropArtist: true, ...read('prefs', {}) });
export const savePrefs = (prefs) => write('prefs', prefs);

// Ready jobs seen on this device (shown when offline) and jobs started here.
export const loadRecentCache = () => read('recent', []);
export const saveRecentCache = (rows) => write('recent', rows.slice(0, 30));

export const loadMyJobs = () => read('mine', []);
export function rememberMyJob(id) {
  const ids = loadMyJobs().filter((x) => x !== id);
  ids.unshift(id);
  write('mine', ids.slice(0, 20));
}
