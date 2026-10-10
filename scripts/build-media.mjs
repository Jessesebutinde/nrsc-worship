// Lists the pictures and videos in lyrics/media/ as lyrics/media/index.json, which the remote reads.
// Run after adding files: npm run media (the deploy workflow runs it too).

import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2] || 'lyrics/media';
const TYPES = {
  '.jpg': 'image', '.jpeg': 'image', '.png': 'image', '.webp': 'image', '.gif': 'image', '.svg': 'image', '.avif': 'image',
  '.mp4': 'video', '.webm': 'video', '.m4v': 'video', '.mov': 'video', '.ogv': 'video',
};

const items = fs
  .readdirSync(dir)
  .filter((f) => TYPES[path.extname(f).toLowerCase()])
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  .map((f) => ({
    file: f,
    type: TYPES[path.extname(f).toLowerCase()],
    title: path.basename(f, path.extname(f)).replace(/[-_]+/g, ' ').trim(),
    size: fs.statSync(path.join(dir, f)).size,
  }));

fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify(items, null, 1));
console.log(`${items.length} media files -> ${path.join(dir, 'index.json')}`);
