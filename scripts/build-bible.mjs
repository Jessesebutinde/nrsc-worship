// Turns an eBible "VPL" text file (lines like "PSA 23:1 text") into one small
// JSON file per book: lyrics/bibles/<id>/<book number>.json = [[verse 1, verse 2, ...], ...chapters].
//
//   node scripts/build-bible.mjs LugandaBible.xml lyrics/bibles/lug68 --lug68
//   node scripts/build-bible.mjs eng-kjv_vpl.txt lyrics/bibles/kjv --kjv
//
// Any format the in-app import reads works (VPL, tab separated, USFM, JSON, XML).
// --kjv drops the paragraph marks (¶) and the [brackets] the KJV uses for added words.
// --lug68 repairs the source file's stray markup: seven verses in Amos that lost the name "Amosi",
//   and a ">" inside a word (Exodus 5:14).
// Books outside the 66 (the Apocrypha) are skipped. Also writes words.txt for spelling suggestions.

import fs from 'node:fs';
import path from 'node:path';
import { parseBibleText } from '../src/lyrics/bible.js';
import { wordsOf } from '../src/lyrics/spell.js';

const [src, out, ...flags] = process.argv.slice(2);
if (!src || !out) {
  console.error('usage: node scripts/build-bible.mjs <vpl.txt> <out dir> [--kjv]');
  process.exit(1);
}
const fixes = [];
if (flags.includes('--kjv')) fixes.push((t) => t.replace(/¶\s*/g, '').replace(/[[\]]/g, ''));
if (flags.includes('--lug68'))
  fixes.push((t) => t.replace(/\s*<\/h2>i\b/g, ' Amosi').replace(/(\p{L})>(\p{L})/gu, '$1$2'));
const books = parseBibleText(fs.readFileSync(src, 'utf8'), {
  clean: (t) => fixes.reduce((s, f) => f(s), t).replace(/\s+/g, ' ').trim(),
});
fs.mkdirSync(out, { recursive: true });
let verses = 0;
for (const [n, chapters] of books) {
  fs.writeFileSync(path.join(out, `${n}.json`), JSON.stringify(chapters));
  verses += chapters.reduce((a, c) => a + c.length, 0);
}
// Word list for the editor's spelling suggestions, most frequent first.
const counts = new Map();
for (const chapters of books.values())
  for (const ch of chapters) for (const v of ch) for (const w of wordsOf(v)) counts.set(w, (counts.get(w) || 0) + 1);
const words = [...counts].sort((a, b) => b[1] - a[1]).map(([w]) => w);
fs.writeFileSync(path.join(out, 'words.txt'), words.join('\n'));
console.log(`${books.size} books, ${verses} verses, ${words.length} words -> ${out}`);
