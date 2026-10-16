// Finds songs in audio on this device (used when the computer can't help,
// e.g. the YouTube job failed and you picked a local file).

import { FeatureExtractor } from './features.js';
import { detectSongs } from './detect.js';

const RATE = 11025;
const CHUNK = 60;

export async function analyzeMedia(media, { limit = Infinity, onProgress, signal } = {}) {
  const duration = Math.min(media.duration, limit);
  let fx = null;
  for (let t = 0; t < duration; t += CHUNK) {
    if (signal && signal.aborted) throw new Error('Cancelled');
    const pcm = await media.readPcm(Math.max(0, t - 1), Math.min(duration, t + CHUNK + 1), RATE);
    if (!fx) fx = new FeatureExtractor({ sampleRate: pcm.sampleRate, duration });
    fx.push(pcm.data, pcm.startTime);
    if (onProgress) onProgress(Math.min(1, (t + CHUNK) / duration));
    // Let the page breathe between chunks.
    await new Promise((r) => setTimeout(r, 0));
  }
  if (!fx) return [];
  return detectSongs(fx.finish(), { windowEnd: duration, fileEnd: media.duration });
}
