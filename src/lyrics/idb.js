// A tiny IndexedDB key-value store (Bible text and the screen's background video are too big for localStorage).

const DB = 'lyric-slides';
const STORES = ['bible', 'files'];
let dbp = null;

function open() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbp;
}

function run(store, mode, fn) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        tx.oncomplete = () => resolve(req && req.result);
        tx.onerror = () => reject(tx.error);
      }),
  );
}

export const idbGet = (store, key) => run(store, 'readonly', (s) => s.get(key));
export const idbSet = (store, key, value) => run(store, 'readwrite', (s) => s.put(value, key));
export const idbDel = (store, key) => run(store, 'readwrite', (s) => s.delete(key));
