// Browser audio decoding through Web Audio. Decoding at a low sample rate
// keeps memory small for waveforms and song finding.

export async function decodeAudio(bytes, sampleRate = 44100) {
  const Ctx = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  if (!Ctx) throw new Error('This browser cannot decode audio');
  let ctx;
  try {
    ctx = new Ctx(1, 1, sampleRate);
  } catch {
    // Older Safari only accepts 22050 Hz and up.
    ctx = new Ctx(1, 1, Math.max(22050, sampleRate));
  }
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const buf = await new Promise((resolve, reject) => {
    const p = ctx.decodeAudioData(ab, resolve, (e) => reject(e || new Error('Could not decode this audio')));
    if (p && p.then) p.then(resolve, reject);
  });
  const channels = [];
  for (let i = 0; i < buf.numberOfChannels; i++) channels.push(buf.getChannelData(i));
  return { sampleRate: buf.sampleRate, channels };
}
