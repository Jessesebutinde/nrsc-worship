// One shared <audio> element for the editor, plus a tiny time store so only
// the parts of the page that show the playhead re-render while playing.

import { useEffect, useState } from './h.js';

export function createPlayer(src) {
  const audio = new Audio();
  audio.preload = 'metadata';
  audio.src = src;
  const listeners = new Set();
  let stopAt = null;
  let raf = 0;
  let lastEmit = 0;

  const emit = () => {
    for (const l of listeners) l();
  };
  const tick = () => {
    raf = 0;
    if (stopAt != null && audio.currentTime >= stopAt) {
      audio.pause();
      audio.currentTime = stopAt;
      stopAt = null;
    }
    const now = performance.now();
    if (now - lastEmit > 90 || audio.paused) {
      lastEmit = now;
      emit();
    }
    if (!audio.paused) raf = requestAnimationFrame(tick);
  };
  const kick = () => {
    if (!raf) raf = requestAnimationFrame(tick);
  };
  for (const ev of ['play', 'pause', 'seeked', 'loadedmetadata', 'ended', 'waiting', 'playing', 'error']) {
    audio.addEventListener(ev, () => {
      emit();
      kick();
    });
  }

  return {
    audio,
    get time() {
      return audio.currentTime || 0;
    },
    get playing() {
      return !audio.paused;
    },
    get error() {
      return audio.error;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    seek(t) {
      stopAt = null;
      audio.currentTime = Math.max(0, t);
      emit();
    },
    async play(from, until) {
      if (from != null) audio.currentTime = Math.max(0, from);
      stopAt = until ?? null;
      try {
        await audio.play();
      } catch {
        /* blocked or interrupted; the UI shows the paused state */
      }
      kick();
    },
    pause() {
      stopAt = null;
      audio.pause();
    },
    toggle() {
      if (audio.paused) this.play();
      else this.pause();
    },
    destroy() {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      listeners.clear();
      if (raf) cancelAnimationFrame(raf);
    },
  };
}

/** Re-renders the calling component whenever the player state changes. */
export function usePlayerState(player) {
  const [, force] = useState(0);
  useEffect(() => (player ? player.subscribe(() => force((n) => n + 1)) : undefined), [player]);
  return player ? { time: player.time, playing: player.playing } : { time: 0, playing: false };
}
