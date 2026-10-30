// Random-access byte sources: an in-memory array, a File/Blob, or a URL read
// with HTTP Range requests (so cutting one song only downloads that song).

export class BytesSource {
  constructor(u8, name = '') {
    this.u8 = u8;
    this.size = u8.length;
    this.name = name;
  }
  async read(off, len) {
    return this.u8.subarray(off, Math.min(this.size, off + len));
  }
}

export class BlobSource {
  constructor(blob) {
    this.blob = blob;
    this.size = blob.size;
    this.name = blob.name || '';
  }
  async read(off, len) {
    const end = Math.min(this.size, off + len);
    return new Uint8Array(await this.blob.slice(off, end).arrayBuffer());
  }
}

const BLOCK = 64 * 1024;

export class HttpSource {
  constructor(url, { fetchImpl } = {}) {
    this.url = url;
    this.name = url.split('?')[0].split('/').pop() || 'audio';
    this.size = 0;
    this.blocks = new Map();
    this.fetch = fetchImpl || ((...a) => fetch(...a));
    this.whole = null; // BytesSource when the server ignores Range
  }

  /** Reads the first block and learns the file size. */
  async open() {
    const res = await this.fetch(this.url, { headers: { Range: `bytes=0-${BLOCK - 1}` } });
    if (!res.ok) throw new Error(`Audio download failed (HTTP ${res.status})`);
    if (res.status === 206) {
      const buf = new Uint8Array(await res.arrayBuffer());
      // Content-Range is often hidden from cross-origin pages (Supabase
      // storage doesn't expose it); Content-Length on a HEAD always works.
      const m = /\/(\d+)\s*$/.exec(res.headers.get('Content-Range') || '');
      let size = m ? Number(m[1]) : 0;
      if (!size) {
        try {
          const head = await this.fetch(this.url, { method: 'HEAD' });
          size = Number(head.headers.get('Content-Length')) || 0;
        } catch {
          /* fall through */
        }
      }
      if (size < buf.length) return this.openWhole();
      this.size = size;
      this.blocks.set(0, buf);
    } else {
      const buf = new Uint8Array(await res.arrayBuffer());
      this.whole = new BytesSource(buf, this.name);
      this.size = buf.length;
    }
    return this;
  }

  async openWhole() {
    const res = await this.fetch(this.url);
    if (!res.ok) throw new Error(`Audio download failed (HTTP ${res.status})`);
    const buf = new Uint8Array(await res.arrayBuffer());
    this.whole = new BytesSource(buf, this.name);
    this.size = buf.length;
    return this;
  }

  async read(off, len, { onProgress } = {}) {
    if (this.whole) return this.whole.read(off, len);
    const end = Math.min(this.size, off + len);
    if (end <= off) return new Uint8Array(0);
    if (end - off > 4 * BLOCK) return this.fetchRange(off, end, onProgress);
    const first = Math.floor(off / BLOCK);
    const last = Math.floor((end - 1) / BLOCK);
    const out = new Uint8Array(end - off);
    for (let b = first; b <= last; b++) {
      let blk = this.blocks.get(b);
      if (!blk) {
        blk = await this.fetchRange(b * BLOCK, Math.min(this.size, (b + 1) * BLOCK));
        this.blocks.set(b, blk);
      }
      const bs = b * BLOCK;
      const from = Math.max(off, bs);
      const to = Math.min(end, bs + blk.length);
      out.set(blk.subarray(from - bs, to - bs), from - off);
    }
    return out;
  }

  async fetchRange(start, end, onProgress) {
    const res = await this.fetch(this.url, { headers: { Range: `bytes=${start}-${end - 1}` } });
    if (!res.ok) throw new Error(`Audio download failed (HTTP ${res.status})`);
    if (res.status !== 206) {
      // Server sent the whole file: keep it so we never download it twice.
      const buf = new Uint8Array(await readWithProgress(res, this.size, onProgress));
      this.whole = new BytesSource(buf, this.name);
      return buf.subarray(start, end);
    }
    return new Uint8Array(await readWithProgress(res, end - start, onProgress));
  }
}

async function readWithProgress(res, total, onProgress) {
  if (!onProgress || !res.body || !res.body.getReader) return res.arrayBuffer();
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    onProgress(got, total);
  }
  const out = new Uint8Array(got);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out.buffer;
}
