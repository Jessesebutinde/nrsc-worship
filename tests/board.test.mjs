import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOARD_THEMES,
  BOARD_ENV,
  NODE_KINDS,
  NODE_SIZE,
  newBoard,
  addNode,
  updateNode,
  removeNode,
  moveNode,
  connect,
  edgePoints,
  visibleCount,
  boardItem,
} from '../src/lyrics/board.js';
import { emptyState, reduce, stepsOf, slideWords } from '../src/lyrics/state.js';
import { frameOf } from '../src/lyrics/stage.js';

const rect = (n) => ({ l: n.x - n.w / 2, r: n.x + n.w / 2, t: n.y - n.h / 2, b: n.y + n.h / 2 });
const overlap = (a, b) => {
  const p = rect(a);
  const q = rect(b);
  return p.l < q.r && q.l < p.r && p.t < q.b && q.t < p.b;
};
const fill = (b, n, kind = 'box') => {
  for (let i = 0; i < n; i++) b = addNode(b, kind, { text: `n${i}` });
  return b;
};

// ------------------------------------------------------------------ the model

test('a new board and its themes', () => {
  const b = newBoard('Grace');
  assert.match(b.id, /^b-/);
  assert.equal(b.title, 'Grace');
  assert.equal(b.theme, 'slate');
  assert.deepEqual(b.nodes, []);
  assert.deepEqual(b.edges, []);
  assert.equal(newBoard().title, 'Sermon');
  for (const t of Object.keys(BOARD_THEMES)) assert.ok(BOARD_ENV[t], `${t} has an environment`);
  for (const k of Object.keys(NODE_KINDS)) assert.equal(NODE_SIZE[k].length, 2, `${k} has a size`);
});

test('addNode: defaults, never mutates, flows left to right then top to bottom without overlapping', () => {
  const b0 = newBoard();
  const b1 = addNode(b0, 'box', { text: 'Hello' });
  assert.equal(b0.nodes.length, 0, 'the old board is untouched');
  assert.equal(b1.nodes.length, 1);
  const n = b1.nodes[0];
  assert.match(n.id, /^n-/);
  assert.equal(n.kind, 'box');
  assert.deepEqual([n.w, n.h], NODE_SIZE.box);
  assert.equal(n.text, 'Hello');
  assert.equal(n.sub, '');
  assert.equal(n.src, '');
  assert.equal(n.color, 'white');
  assert.equal(n.size, 'm');

  const b = fill(b0, 9);
  const xs = b.nodes.map((m) => m.x);
  const ys = b.nodes.map((m) => m.y);
  // Three columns, three rows.
  assert.deepEqual(xs.slice(0, 3), xs.slice(3, 6));
  assert.deepEqual(xs.slice(0, 3), xs.slice(6, 9));
  assert.ok(xs[0] < xs[1] && xs[1] < xs[2], 'left to right');
  assert.ok(ys[0] === ys[1] && ys[1] === ys[2], 'the first row is one row');
  assert.ok(ys[0] < ys[3] && ys[3] < ys[6], 'top to bottom');
  // Inside the canvas, under the title band.
  for (const m of b.nodes) {
    const r = rect(m);
    assert.ok(r.l >= 96 && r.r <= 1824 && r.t >= 150 && r.b <= 1026, `${m.text} inside the area`);
  }
  for (let i = 0; i < b.nodes.length; i++)
    for (let j = i + 1; j < b.nodes.length; j++) assert.ok(!overlap(b.nodes[i], b.nodes[j]), `${i} and ${j} do not overlap`);
});

test('addNode: a cell taken by a bigger node is skipped; the full grid cascades from the centre', () => {
  // A picture is taller than a row: the cell under it is not free for another picture.
  let b = addNode(newBoard(), 'picture');
  b = addNode(b, 'picture');
  b = addNode(b, 'picture');
  b = addNode(b, 'picture');
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) assert.ok(!overlap(b.nodes[i], b.nodes[j]));
  assert.ok(b.nodes[3].y > b.nodes[0].y + 380, 'the fourth picture skips the row it would overlap');

  b = fill(newBoard(), 11);
  assert.deepEqual([b.nodes[9].x, b.nodes[9].y], [960, 540], 'the tenth sits at the centre');
  assert.deepEqual([b.nodes[10].x, b.nodes[10].y], [1000, 580], 'the eleventh 40 px further');

  // Explicit coordinates are kept.
  const c = addNode(newBoard(), 'pill', { x: 300, y: 700, color: 'gold', size: 'l' });
  assert.deepEqual([c.nodes[0].x, c.nodes[0].y, c.nodes[0].color, c.nodes[0].size], [300, 700, 'gold', 'l']);
});

test('addNode with from draws an arrow from that node; an unknown from draws none', () => {
  let b = addNode(newBoard(), 'box', { text: 'A' });
  const a = b.nodes[0].id;
  b = addNode(b, 'pill', { text: 'B' }, { from: a });
  assert.equal(b.edges.length, 1);
  assert.deepEqual(b.edges[0], { from: a, to: b.nodes[1].id, style: 'arrow', label: '' });
  const c = addNode(b, 'box', {}, { from: 'nope' });
  assert.equal(c.edges.length, 1);
});

test('updateNode, moveNode (clamped to the canvas) and removeNode (with its edges)', () => {
  let b = fill(newBoard(), 3);
  const [a, c, d] = b.nodes.map((n) => n.id);
  const u = updateNode(b, c, { text: 'Changed', color: 'teal' });
  assert.equal(u.nodes[1].text, 'Changed');
  assert.equal(u.nodes[1].color, 'teal');
  assert.equal(b.nodes[1].text, 'n1', 'the old board keeps its text');
  assert.notEqual(u.nodes[1], b.nodes[1]);
  assert.equal(u.nodes[0], b.nodes[0], 'other nodes are the same objects');

  let m = moveNode(b, a, 1000, 600);
  assert.deepEqual([m.nodes[0].x, m.nodes[0].y], [1000, 600]);
  m = moveNode(b, a, -500, -500);
  assert.deepEqual([m.nodes[0].x, m.nodes[0].y], [260, 85], 'held at the top left');
  m = moveNode(b, a, 5000, 5000);
  assert.deepEqual([m.nodes[0].x, m.nodes[0].y], [1920 - 260, 1080 - 85], 'held at the bottom right');
  assert.equal(moveNode(b, 'nope', 1, 1), b, 'an unknown node: the same board');

  b = connect(b, a, c);
  b = connect(b, c, d);
  b = connect(b, a, d);
  assert.equal(b.edges.length, 3);
  const r = removeNode(b, c);
  assert.deepEqual(r.nodes.map((n) => n.id), [a, d]);
  assert.deepEqual(r.edges.map((e) => `${e.from}>${e.to}`), [`${a}>${d}`], 'the edges that touched it go too');
});

test('connect toggles an edge and ignores a node to itself or unknown ids', () => {
  let b = fill(newBoard(), 2);
  const [a, c] = b.nodes.map((n) => n.id);
  assert.equal(connect(b, a, a), b, 'to itself');
  assert.equal(connect(b, a, 'nope'), b, 'unknown');
  assert.equal(connect(b, 'nope', c), b, 'unknown');
  b = connect(b, a, c, 'dash');
  assert.deepEqual(b.edges, [{ from: a, to: c, style: 'dash', label: '' }]);
  const again = connect(b, c, a);
  assert.deepEqual(again.edges, [], 'the same pair the other way round takes the edge off');
  const back = connect(again, c, a);
  assert.deepEqual(back.edges, [{ from: c, to: a, style: 'arrow', label: '' }]);
});

test('edgePoints clips the line at each border: rectangles and circles', () => {
  const a = { kind: 'box', x: 400, y: 300, w: 520, h: 170 };
  const b = { kind: 'box', x: 1200, y: 300, w: 520, h: 170 };
  assert.deepEqual(edgePoints(a, b), { x1: a.x + a.w / 2, y1: 300, x2: b.x - b.w / 2, y2: 300 });
  // One above the other: clipped at the top and bottom edges.
  const c = { kind: 'note', x: 400, y: 800, w: 420, h: 240 };
  assert.deepEqual(edgePoints(a, c), { x1: 400, y1: a.y + a.h / 2, x2: 400, y2: c.y - c.h / 2 });
  // A circle: its radius along the line.
  const o = { kind: 'circle', x: 400, y: 800, w: 260, h: 260 };
  const p = edgePoints(o, { kind: 'circle', x: 400, y: 200, w: 260, h: 260 });
  assert.deepEqual(p, { x1: 400, y1: 670, x2: 400, y2: 330 });
  const q = edgePoints(o, { kind: 'circle', x: 700, y: 400, w: 260, h: 260 });
  assert.ok(Math.abs(Math.hypot(q.x1 - 400, q.y1 - 800) - 130) < 1e-9, 'starts on the circle');
  assert.ok(Math.abs(Math.hypot(q.x2 - 700, q.y2 - 400) - 130) < 1e-9, 'ends on the other circle');
  // Diagonal to a box: leaves through the nearer side.
  const d = edgePoints(a, { kind: 'box', x: 1200, y: 900, w: 520, h: 170 });
  assert.ok(Math.abs(d.y1 - (a.y + a.h / 2)) < 1e-9, 'leaves a through the bottom');
  assert.ok(d.x1 > a.x && d.x1 < a.x + a.w / 2);
  // The same centre: the centres.
  assert.deepEqual(edgePoints(a, { ...a }), { x1: 400, y1: 300, x2: 400, y2: 300 });
});

test('visibleCount and the board item', () => {
  const b = fill(newBoard('Hope'), 4);
  assert.equal(visibleCount(b, 0, true), 1);
  assert.equal(visibleCount(b, 2, true), 3);
  assert.equal(visibleCount(b, 99, true), 4);
  assert.equal(visibleCount(b, undefined, true), 1);
  assert.equal(visibleCount(b, 0, false), 4, 'reveal off: everything');
  assert.equal(visibleCount(newBoard(), 3, true), 0);
  assert.equal(visibleCount(newBoard(), 0, false), 0);

  const it = boardItem(b);
  assert.deepEqual(Object.keys(it).sort(), ['edges', 'id', 'kind', 'nodes', 'slides', 'theme', 'title'].sort());
  assert.equal(it.kind, 'board');
  assert.equal(it.id, b.id);
  assert.equal(it.title, 'Hope');
  assert.equal(it.theme, 'slate');
  assert.equal(it.nodes, b.nodes);
  assert.equal(it.edges, b.edges);
  assert.deepEqual(it.slides, [{ label: 'Hope' }], 'one slide, so the console counts it');
  assert.deepEqual(slideWords(it, it.slides[0]), [], 'no words to mark on a board');
});

// ------------------------------------------------------------------ on the screen

test("reducer 'board': the latest node is up, index 0, mode show, marks kept", () => {
  const b = fill(newBoard(), 3);
  let s = { ...emptyState(), mode: 'logo', marks: { 'x:0': { 'l:1': { c: 'gold', b: false } } }, index: 2 };
  s = reduce(s, { type: 'board', item: boardItem(b) }, 'r');
  assert.equal(s.item.kind, 'board');
  assert.equal(s.index, 0);
  assert.equal(s.mode, 'show');
  assert.equal(s.sub, 2, 'the last node');
  assert.equal(s.wc, null);
  assert.deepEqual(s.marks, { 'x:0': { 'l:1': { c: 'gold', b: false } } }, 'marks stay');
  assert.equal(s.rev, 1);

  // The editor adds a node while the board is live: it appears at once.
  const b4 = addNode(b, 'pill');
  s = reduce(s, { type: 'board', item: boardItem(b4) }, 'r');
  assert.equal(s.sub, 3);
  // `sub` given: stepped back to that node, clamped.
  assert.equal(reduce(s, { type: 'board', item: boardItem(b4), sub: 1 }, 'r').sub, 1);
  assert.equal(reduce(s, { type: 'board', item: boardItem(b4), sub: 99 }, 'r').sub, 3);
  assert.equal(reduce(s, { type: 'board', item: boardItem(b4), sub: -5 }, 'r').sub, 0);
  assert.equal(reduce(s, { type: 'board', item: boardItem(newBoard()) }, 'r').sub, 0, 'an empty board');
});

test("'item' with a board starts at the first node (a replay); Next steps node by node and stops at the end", () => {
  const it = boardItem(fill(newBoard(), 3));
  let s = reduce(emptyState(), { type: 'item', item: it }, 'r');
  assert.equal(s.sub, 0);
  assert.equal(s.index, 0);
  assert.equal(stepsOf(s), 3);
  const seen = [];
  for (let i = 0; i < 4; i++) seen.push((s = reduce(s, { type: 'next' }, 'r')).sub);
  assert.deepEqual(seen, [1, 2, 2, 2], 'stops on the last node');
  assert.equal(s.index, 0, 'never past the one slide');
  s = reduce(s, { type: 'prev' }, 'r');
  assert.equal(s.sub, 1);
  s = reduce(s, { type: 'prev' }, 'r');
  s = reduce(s, { type: 'prev' }, 'r');
  assert.equal(s.sub, 0, 'and not before the first');
  assert.equal(s.index, 0);
  // From the logo, Next brings the board back first.
  s = reduce(s, { type: 'mode', mode: 'logo' }, 'r');
  s = reduce(s, { type: 'next' }, 'r');
  assert.equal(s.mode, 'show');
  assert.equal(s.sub, 0);
});

test('reveal off: one step, everything up', () => {
  const it = boardItem(fill(newBoard(), 5));
  let s = reduce({ ...emptyState(), reveal: false }, { type: 'item', item: it }, 'r');
  assert.equal(stepsOf(s), 1);
  s = reduce(s, { type: 'next' }, 'r');
  assert.equal(s.sub, 0, 'nothing to step through');
  assert.equal(visibleCount(it, s.sub, s.reveal !== false), 5);
  assert.equal(stepsOf({ ...emptyState(), item: boardItem(newBoard()) }), 1, 'an empty board is one step');
});

test('frameOf: one frame for the whole board, whatever node is up', () => {
  const it = boardItem(fill(newBoard(), 3));
  const s = reduce(emptyState(), { type: 'board', item: it }, 'r');
  const f = frameOf(s, { out: 'tv' });
  assert.deepEqual(f, { key: `${it.id}:board`, kind: 'board', preset: 'board' });
  assert.deepEqual(frameOf(reduce(s, { type: 'prev' }, 'r'), { out: 'tv' }), f, 'stepping back keeps the frame');
  assert.deepEqual(frameOf(s, { titleFor: it.id, out: 'tv' }), f, 'no title card for a board');
  assert.equal(frameOf(s, { out: 'stream' }).kind, 'board', 'on the stream too');
  assert.equal(frameOf({ ...s, mode: 'black' }).kind, 'none');
});
