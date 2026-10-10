// Offline shell for Stage Keys: the app's own files are cached on first visit; sounds are cached by the
// sample library itself (Cache Storage "stage-keys-samples"). Bump VERSION when files change.

const VERSION = 'stage-keys-1';
const SHELL = [
  './',
  './index.html',
  './keys.css',
  './manifest.webmanifest',
  './icon.svg',
  '../vendor/preact.js',
  '../vendor/preact-hooks.js',
  '../vendor/htm.js',
  '../src/ui/h.js',
  '../lyrics/fonts/montserrat-latin.woff2',
  '../lyrics/fonts/montserrat-latin-ext.woff2',
];
const SRC = ['app.js', 'sync.js', 'state.js', 'engine.js', 'fx.js', 'midi.js', 'router.js', 'looper.js', 'presets.js', 'combos.js', 'samples.js', 'banks.js',
  'ui/controls.js', 'ui/perform.js', 'ui/editor.js', 'ui/sounds.js', 'ui/loops.js', 'ui/songs.js', 'ui/settings.js', 'ui/keyboard.js',
  'worklet/engine.js', 'worklet/pitch-shift.js',
  'dsp/util.js', 'dsp/env.js', 'dsp/filter.js', 'dsp/osc.js', 'dsp/programs.js', 'dsp/voice-synth.js', 'dsp/voice-organ.js', 'dsp/voice-string.js', 'dsp/voice-sampler.js', 'dsp/voice-drums.js', 'dsp/loop-detect.js', 'dsp/engine-core.js', 'dsp/pitch-shift.js',
].map((f) => '../src/keys/' + f);

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION).then((c) => Promise.allSettled([...SHELL, ...SRC].map((u) => c.add(u).catch(() => null)))).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('stage-keys-') && k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.includes('/midi-js-soundfonts/')) return; // the sample library caches those itself
  // Network first for our own files (so a deploy shows up), cache when offline.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || caches.match('./index.html'))),
  );
});
