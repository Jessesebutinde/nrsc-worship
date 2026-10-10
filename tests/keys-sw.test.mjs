import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const SW = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'keys', 'sw.js');

/** Runs sw.js in a sandbox with a fake Cache Storage and returns the listeners it registered. */
function load(cacheNames) {
  const deleted = [];
  const listeners = {};
  const self = {
    addEventListener: (type, fn) => (listeners[type] = fn),
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };
  const caches = {
    keys: async () => cacheNames,
    delete: async (name) => {
      deleted.push(name);
      return true;
    },
    open: async () => ({ add: async () => {}, put: async () => {} }),
    match: async () => undefined,
  };
  vm.runInNewContext(fs.readFileSync(SW, 'utf8'), { self, caches, location: { origin: 'https://example.test' }, URL, fetch: async () => ({ ok: false }) });
  return { listeners, deleted };
}

test('a new release drops its old app-shell caches but never the downloaded sounds', async () => {
  const { listeners, deleted } = load(['stage-keys-shell-0', 'stage-keys-shell-1', 'stage-keys-samples', 'lyric-slides']);
  let done;
  listeners.activate({ waitUntil: (p) => (done = p) });
  await done;
  assert.deepEqual(deleted, ['stage-keys-shell-0']);
});

test('the deploy can stamp the shell cache version', () => {
  const src = fs.readFileSync(SW, 'utf8');
  assert.ok(src.includes("PREFIX + '1'"), 'the workflow replaces this exact text with the commit');
  const workflow = fs.readFileSync(path.join(path.dirname(SW), '..', '.github', 'workflows', 'pages.yml'), 'utf8');
  assert.ok(workflow.includes(`s/PREFIX + '1'/`), 'the workflow stamps it');
});
