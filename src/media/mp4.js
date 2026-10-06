// MP4/M4A audio: read the sample table (plain or fragmented files) and write
// new .m4a files that contain a time range of the original AAC frames.
// Nothing is re-encoded, so a cut keeps the original quality and is instant.

import { fourcc, u16, u24, u32, u64, i32, Writer, te } from './bytes.js';

function* boxes(u8, start = 0, end = u8.length) {
  let off = start;
  while (off + 8 <= end) {
    let size = u32(u8, off);
    const type = fourcc(u8, off + 4);
    let hdr = 8;
    if (size === 1) {
      size = u64(u8, off + 8);
      hdr = 16;
    } else if (size === 0) {
      size = end - off;
    }
    if (size < hdr || off + size > end) return;
    yield { type, start: off, body: off + hdr, end: off + size };
    off += size;
  }
}

function child(u8, box, type) {
  for (const b of boxes(u8, box.body, box.end)) if (b.type === type) return b;
  return null;
}

function path(u8, box, ...types) {
  let b = box;
  for (const t of types) {
    b = b && child(u8, b, t);
  }
  return b;
}

/** Walks top-level boxes of a source without loading the media data. */
async function topLevel(source) {
  const out = [];
  let off = 0;
  while (off + 8 <= source.size) {
    const h = await source.read(off, 16);
    let size = u32(h, 0);
    const type = fourcc(h, 4);
    let hdr = 8;
    if (size === 1) {
      size = u64(h, 8);
      hdr = 16;
    } else if (size === 0) size = source.size - off;
    if (size < hdr) break;
    out.push({ type, start: off, body: off + hdr, end: Math.min(off + size, source.size) });
    off += size;
  }
  return out;
}

export async function isMp4(source) {
  const h = await source.read(0, 12);
  return h.length >= 12 && fourcc(h, 4) === 'ftyp';
}

/**
 * Parses the first audio track. Returns sample positions and times.
 * Times are presentation times in seconds (edit-list priming removed), the
 * same clock an <audio> element uses.
 */
export async function parseMp4(source) {
  const top = await topLevel(source);
  const moovBox = top.find((b) => b.type === 'moov');
  if (!moovBox) throw new Error('This MP4 file has no "moov" header');
  const moov = await source.read(moovBox.start, moovBox.end - moovBox.start);
  const root = { body: 0, end: moov.length };
  const mv = { ...child(moov, root, 'moov') };

  let track = null;
  for (const t of boxes(moov, mv.body, mv.end)) {
    if (t.type !== 'trak') continue;
    const hdlr = path(moov, t, 'mdia', 'hdlr');
    if (hdlr && fourcc(moov, hdlr.body + 8) === 'soun') {
      track = t;
      break;
    }
  }
  if (!track) throw new Error('No audio track found in this file');

  const tkhd = child(moov, track, 'tkhd');
  const trackId = u32(moov, tkhd.body + (moov[tkhd.body] === 1 ? 20 : 12));
  const mdhd = path(moov, track, 'mdia', 'mdhd');
  const v1 = moov[mdhd.body] === 1;
  const timescale = u32(moov, mdhd.body + (v1 ? 20 : 12));

  let mediaTime = 0;
  const elst = path(moov, track, 'edts', 'elst');
  if (elst) {
    const ev = moov[elst.body];
    const n = u32(moov, elst.body + 4);
    let p = elst.body + 8;
    for (let i = 0; i < n; i++) {
      const mt = ev === 1 ? u64(moov, p + 8) : i32(moov, p + 4);
      p += ev === 1 ? 20 : 12;
      if (mt >= 0 && mt < 2 ** 52) {
        mediaTime = mt;
        break;
      }
    }
  }

  const stbl = path(moov, track, 'mdia', 'minf', 'stbl');
  const stsd = child(moov, stbl, 'stsd');
  const stsdBytes = moov.slice(stsd.start, stsd.end);
  const entry = stsd.body + 8;
  const codec = fourcc(moov, entry + 4);
  const channels = u16(moov, entry + 8 + 16);
  let sampleRate = u32(moov, entry + 8 + 24) >>> 16;
  if (!sampleRate) sampleRate = timescale;

  let offsets = [];
  let sizes = [];
  let dts = [];

  const stsz = child(moov, stbl, 'stsz');
  const sampleCount = stsz ? u32(moov, stsz.body + 8) : 0;
  if (sampleCount > 0) {
    // Plain (non-fragmented) file.
    const fixed = u32(moov, stsz.body + 4);
    sizes = new Uint32Array(sampleCount);
    for (let i = 0; i < sampleCount; i++) sizes[i] = fixed || u32(moov, stsz.body + 12 + i * 4);

    dts = new Float64Array(sampleCount + 1);
    const stts = child(moov, stbl, 'stts');
    let si = 0;
    let t = 0;
    const ne = u32(moov, stts.body + 4);
    for (let e = 0; e < ne && si < sampleCount; e++) {
      const cnt = u32(moov, stts.body + 8 + e * 8);
      const delta = u32(moov, stts.body + 12 + e * 8);
      for (let k = 0; k < cnt && si < sampleCount; k++) {
        dts[si++] = t;
        t += delta;
      }
    }
    while (si <= sampleCount) dts[si++] = t;

    const co = child(moov, stbl, 'stco') || child(moov, stbl, 'co64');
    const big = co.type === 'co64';
    const nChunks = u32(moov, co.body + 4);
    const chunkOff = new Float64Array(nChunks);
    for (let c = 0; c < nChunks; c++) {
      chunkOff[c] = big ? u64(moov, co.body + 8 + c * 8) : u32(moov, co.body + 8 + c * 4);
    }
    const stsc = child(moov, stbl, 'stsc');
    const nsc = u32(moov, stsc.body + 4);
    const runs = [];
    for (let e = 0; e < nsc; e++) {
      runs.push({
        first: u32(moov, stsc.body + 8 + e * 12) - 1,
        per: u32(moov, stsc.body + 12 + e * 12),
      });
    }
    offsets = new Float64Array(sampleCount);
    let s = 0;
    for (let r = 0; r < runs.length; r++) {
      const lastChunk = r + 1 < runs.length ? runs[r + 1].first : nChunks;
      for (let c = runs[r].first; c < lastChunk && s < sampleCount; c++) {
        let o = chunkOff[c];
        for (let k = 0; k < runs[r].per && s < sampleCount; k++) {
          offsets[s] = o;
          o += sizes[s];
          s++;
        }
      }
    }
  } else {
    // Fragmented file (e.g. a raw YouTube DASH download).
    const trex = { dur: 0, size: 0 };
    const mvex = child(moov, mv, 'mvex');
    if (mvex) {
      for (const b of boxes(moov, mvex.body, mvex.end)) {
        if (b.type === 'trex' && u32(moov, b.body + 4) === trackId) {
          trex.dur = u32(moov, b.body + 12);
          trex.size = u32(moov, b.body + 16);
        }
      }
    }
    const O = [];
    const S = [];
    const D = [];
    let t = 0;
    for (const mf of top) {
      if (mf.type !== 'moof') continue;
      const moof = await source.read(mf.start, mf.end - mf.start);
      const mroot = child(moof, { body: 0, end: moof.length }, 'moof');
      for (const traf of boxes(moof, mroot.body, mroot.end)) {
        if (traf.type !== 'traf') continue;
        const tfhd = child(moof, traf, 'tfhd');
        const fl = u24(moof, tfhd.body + 1);
        if (u32(moof, tfhd.body + 4) !== trackId) continue;
        let p = tfhd.body + 8;
        let base = mf.start;
        if (fl & 0x1) {
          base = u64(moof, p);
          p += 8;
        }
        if (fl & 0x2) p += 4;
        let defDur = trex.dur;
        let defSize = trex.size;
        if (fl & 0x8) {
          defDur = u32(moof, p);
          p += 4;
        }
        if (fl & 0x10) {
          defSize = u32(moof, p);
          p += 4;
        }
        const tfdt = child(moof, traf, 'tfdt');
        if (tfdt) t = moof[tfdt.body] === 1 ? u64(moof, tfdt.body + 4) : u32(moof, tfdt.body + 4);
        for (const trun of boxes(moof, traf.body, traf.end)) {
          if (trun.type !== 'trun') continue;
          const tf = u24(moof, trun.body + 1);
          const n = u32(moof, trun.body + 4);
          let q = trun.body + 8;
          let dataOff = base;
          if (tf & 0x1) {
            dataOff = base + i32(moof, q);
            q += 4;
          }
          if (tf & 0x4) q += 4;
          for (let i = 0; i < n; i++) {
            let d = defDur;
            let sz = defSize;
            if (tf & 0x100) {
              d = u32(moof, q);
              q += 4;
            }
            if (tf & 0x200) {
              sz = u32(moof, q);
              q += 4;
            }
            if (tf & 0x400) q += 4;
            if (tf & 0x800) q += 4;
            O.push(dataOff);
            S.push(sz);
            D.push(t);
            dataOff += sz;
            t += d;
          }
          base = dataOff;
        }
      }
    }
    if (!O.length) throw new Error('No audio frames found in this MP4 file');
    offsets = Float64Array.from(O);
    sizes = Uint32Array.from(S);
    dts = Float64Array.from([...D, t]);
  }

  const n = sizes.length;
  return {
    kind: 'mp4',
    codec,
    timescale,
    sampleRate,
    channels,
    mediaTime,
    stsdBytes,
    offsets,
    sizes,
    dts,
    count: n,
    duration: (dts[n] - mediaTime) / timescale,
  };
}

/** Index of the sample whose presentation interval contains time t. */
function sampleAt(info, t) {
  const target = t * info.timescale + info.mediaTime;
  let lo = 0;
  let hi = info.count - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (info.dts[mid] <= target) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Reads the AAC frames covering [t0, t1). One extra frame is kept before t0
 * so the decoder has the overlap it needs; the edit list hides it again.
 */
export async function extractMp4(source, info, t0, t1, opts = {}) {
  t0 = Math.max(0, t0);
  t1 = Math.min(info.duration, t1);
  const a = Math.max(0, sampleAt(info, t0) - 1);
  const b = Math.min(info.count - 1, sampleAt(info, Math.max(t0, t1 - 1e-6)));
  const parts = [];
  let runStart = info.offsets[a];
  let runEnd = runStart;
  const flush = async () => {
    if (runEnd > runStart) parts.push(await source.read(runStart, runEnd - runStart, opts));
  };
  for (let i = a; i <= b; i++) {
    if (info.offsets[i] !== runEnd) {
      await flush();
      runStart = info.offsets[i];
      runEnd = runStart;
    }
    runEnd += info.sizes[i];
  }
  await flush();
  return {
    kind: 'mp4',
    t0,
    t1,
    first: a,
    last: b,
    parts,
    bytes: parts.reduce((s, p) => s + p.length, 0),
    // Presentation time of the first decoded sample of this clip.
    startTime: (info.dts[a] - info.mediaTime) / info.timescale,
  };
}

function box(type, ...payload) {
  let len = 8;
  for (const p of payload) len += p.length;
  const w = new Writer(len);
  w.u32(len);
  // Box types are Latin-1 (iTunes uses 0xA9 for "©").
  for (let i = 0; i < 4; i++) w.u8(type.charCodeAt(i));
  for (const p of payload) w.bytes(p);
  return w.done();
}

function full(type, version, flags, ...payload) {
  const h = new Writer(4).u8(version).u8(flags >> 16).u16(flags & 0xffff).done();
  return box(type, h, ...payload);
}

const MATRIX = [0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000];

function ilstText(type, text) {
  const data = full('data', 0, 1, new Uint8Array(4), te.encode(text));
  return box(type, data);
}

function metadata({ title, track, total, album }) {
  const items = [];
  if (title) items.push(ilstText('©nam', title));
  if (album) items.push(ilstText('©alb', album));
  if (track) {
    const v = new Writer(8).u16(0).u16(track).u16(total || 0).u16(0).done();
    items.push(box('trkn', full('data', 0, 0, new Uint8Array(4), v)));
  }
  if (!items.length) return new Uint8Array(0);
  const hdlr = full(
    'hdlr',
    0,
    0,
    new Writer(25).u32(0).str('mdir').str('appl').u32(0).u32(0).u8(0).done(),
  );
  return box('udta', full('meta', 0, 0, hdlr, box('ilst', ...items)));
}

/**
 * Builds an .m4a file from an extracted clip. With trim=false the clip is
 * written without an edit list (used for decoding previews).
 */
export function muxMp4(info, clip, { meta = {}, trim = true } = {}) {
  const n = clip.last - clip.first + 1;
  const ts = info.timescale;
  const base = info.dts[clip.first];
  const mediaDur = info.dts[clip.last + 1] - base;

  const stts = new Writer();
  const runs = [];
  for (let i = clip.first; i <= clip.last; i++) {
    const d = info.dts[i + 1] - info.dts[i];
    const r = runs[runs.length - 1];
    if (r && r[1] === d) r[0]++;
    else runs.push([1, d]);
  }
  stts.u32(runs.length);
  for (const [c, d] of runs) stts.u32(c).u32(d);

  const stsz = new Writer(8 + 4 * n).u32(0).u32(n);
  for (let i = clip.first; i <= clip.last; i++) stsz.u32(info.sizes[i]);

  let presentDur = mediaDur;
  let edts = new Uint8Array(0);
  if (trim) {
    const startMedia = Math.max(0, Math.round(clip.t0 * ts + info.mediaTime - base));
    presentDur = Math.max(1, Math.min(mediaDur - startMedia, Math.round((clip.t1 - clip.t0) * ts)));
    const e = new Writer(16).u32(1).u32(presentDur).u32(startMedia).u16(1).u16(0).done();
    edts = box('edts', full('elst', 0, 0, e));
  }

  const build = (chunkOffset) => {
    const stbl = box(
      'stbl',
      info.stsdBytes,
      full('stts', 0, 0, stts.done()),
      full('stsc', 0, 0, new Writer(16).u32(1).u32(1).u32(n).u32(1).done()),
      full('stsz', 0, 0, stsz.done()),
      full('stco', 0, 0, new Writer(8).u32(1).u32(chunkOffset).done()),
    );
    const dinf = box('dinf', full('dref', 0, 0, new Writer(4).u32(1).done(), full('url ', 0, 1)));
    const minf = box('minf', full('smhd', 0, 0, new Uint8Array(4)), dinf, stbl);
    const hdlr = full(
      'hdlr',
      0,
      0,
      new Writer(25).u32(0).str('soun').zeros(12).str('SoundHandler').u8(0).done(),
    );
    const mdhd = full(
      'mdhd',
      0,
      0,
      new Writer(20).u32(0).u32(0).u32(ts).u32(mediaDur).u16(0x55c4).u16(0).done(),
    );
    const tkhdW = new Writer(80).u32(0).u32(0).u32(1).u32(0).u32(presentDur).zeros(8);
    tkhdW.u16(0).u16(0).u16(0x0100).u16(0);
    for (const m of MATRIX) tkhdW.u32(m);
    tkhdW.u32(0).u32(0);
    const trak = box(
      'trak',
      full('tkhd', 0, 3, tkhdW.done()),
      edts,
      box('mdia', mdhd, hdlr, minf),
    );
    const mvhdW = new Writer(96).u32(0).u32(0).u32(ts).u32(presentDur).u32(0x00010000).u16(0x0100);
    mvhdW.zeros(10);
    for (const m of MATRIX) mvhdW.u32(m);
    mvhdW.zeros(24).u32(2);
    return box('moov', full('mvhd', 0, 0, mvhdW.done()), trak, metadata(meta));
  };

  const ftyp = box('ftyp', te.encode('M4A '), new Uint8Array(4), te.encode('M4A isommp42'));
  const probe = build(0);
  const moov = build(ftyp.length + probe.length + 8);
  const mdatHdr = new Writer(8).u32(8 + clip.bytes).str('mdat').done();
  return [ftyp, moov, mdatHdr, ...clip.parts];
}
