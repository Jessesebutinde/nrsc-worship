// The sermon board: a diagram the operator builds while the preacher speaks (boxes, pills, circles,
// sticky notes, pictures, verse cards, with arrows between them). Every function here returns a new
// board and never changes the one it was given, so the console can keep an undo history and the
// screen can tell a change by identity. Positions are on the 1920x1080 canvas; x, y are a node's
// centre. Runs in node too (no browser globals), so the model is tested without a screen.

const W = 1920;
const H = 1080;

export const BOARD_THEMES = { slate: 'Slate', paper: 'Paper', night: 'Night', chalk: 'Chalkboard' };
// The TV environment each theme uses (existing backgrounds in stage.js BgLayer).
export const BOARD_ENV = { slate: 'stone', paper: 'parchment', night: 'night', chalk: 'slate' };
export const NODE_KINDS = { box: 'Box', pill: 'Pill', circle: 'Circle', note: 'Note', picture: 'Picture', verse: 'Verse' };
export const NODE_COLORS = { white: '#ffffff', gold: '#e3b75a', coral: '#ff6b5e', teal: '#35e0d0', sky: '#7fb8ff', ink: '#1a1620' };
// [w, h] px on the canvas.
export const NODE_SIZE = { box: [520, 170], pill: [460, 120], circle: [260, 260], note: [420, 240], picture: [560, 380], verse: [620, 260] };
// Base font px by node.size (the screen shrinks it to fit the node).
export const TEXT_SIZES = { s: 34, m: 44, l: 60 };

// Auto-placement: a 3 x 3 grid under the title band, filled left to right, then top to bottom.
const AREA = { x1: 96, x2: 1824, y1: 150, y2: 1026 };
const COLS = 3;
const ROWS = 3;
const CELLS = [];
for (let r = 0; r < ROWS; r++)
  for (let c = 0; c < COLS; c++)
    CELLS.push({
      x: AREA.x1 + ((AREA.x2 - AREA.x1) / COLS) * (c + 0.5),
      y: AREA.y1 + ((AREA.y2 - AREA.y1) / ROWS) * (r + 0.5),
    });
// Once the grid is full, new nodes cascade from the canvas centre, each 40 px further down and right.
const CASCADE = 40;

const rid = (p) => `${p}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;

const rectOf = (n) => ({ l: n.x - n.w / 2, r: n.x + n.w / 2, t: n.y - n.h / 2, b: n.y + n.h / 2 });
const overlaps = (a, b) => {
  const p = rectOf(a);
  const q = rectOf(b);
  return p.l < q.r && q.l < p.r && p.t < q.b && q.t < p.b;
};

export function newBoard(title = 'Sermon') {
  return { id: rid('b'), title, theme: 'slate', nodes: [], edges: [], created: Date.now() };
}

/** Where a new node of this size goes: the first free grid cell, else the cascade from the centre. */
function place(nodes, w, h) {
  for (const c of CELLS) {
    const cand = { x: c.x, y: c.y, w, h };
    if (!nodes.some((n) => overlaps(cand, n))) return { x: c.x, y: c.y };
  }
  // The nodes already on the cascade line tell how far along it the next one goes.
  const k = nodes.filter((n) => n.x >= W / 2 && n.x - W / 2 === n.y - H / 2 && (n.x - W / 2) % CASCADE === 0).length;
  return { x: W / 2 + k * CASCADE, y: H / 2 + k * CASCADE };
}

/**
 * A new board with a node of `kind` appended. `props` override the defaults (text, colour, size,
 * an explicit x / y); without x and y the node takes the first free grid cell. `from` (a node id)
 * also draws an arrow from that node to the new one.
 */
export function addNode(board, kind, props = {}, { from = null } = {}) {
  const [w, h] = NODE_SIZE[kind] || NODE_SIZE.box;
  const size = { w: props.w || w, h: props.h || h };
  const at = props.x != null && props.y != null ? { x: props.x, y: props.y } : place(board.nodes, size.w, size.h);
  const node = { id: rid('n'), kind, ...at, ...size, text: '', sub: '', src: '', color: 'white', size: 'm', ...props };
  const edges = from && board.nodes.some((n) => n.id === from) ? [...board.edges, { from, to: node.id, style: 'arrow', label: '' }] : board.edges;
  return { ...board, nodes: [...board.nodes, node], edges };
}

export function updateNode(board, id, patch) {
  return { ...board, nodes: board.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) };
}

/** Takes the node off the board, and every edge that touched it. */
export function removeNode(board, id) {
  return {
    ...board,
    nodes: board.nodes.filter((n) => n.id !== id),
    edges: board.edges.filter((e) => e.from !== id && e.to !== id),
  };
}

/** Moves a node's centre, keeping the whole node on the canvas. */
export function moveNode(board, id, x, y) {
  const n = board.nodes.find((m) => m.id === id);
  if (!n) return board;
  const cx = Math.max(n.w / 2, Math.min(W - n.w / 2, x));
  const cy = Math.max(n.h / 2, Math.min(H - n.h / 2, y));
  return updateNode(board, id, { x: cx, y: cy });
}

/**
 * Joins two nodes, or parts them: an edge between the same two nodes (either way round) is taken
 * off instead, so tapping the pair again undoes the arrow. A node to itself, or an unknown id,
 * changes nothing.
 */
export function connect(board, from, to, style = 'arrow') {
  if (from === to) return board;
  const has = (id) => board.nodes.some((n) => n.id === id);
  if (!has(from) || !has(to)) return board;
  const same = (e) => (e.from === from && e.to === to) || (e.from === to && e.to === from);
  if (board.edges.some(same)) return { ...board, edges: board.edges.filter((e) => !same(e)) };
  return { ...board, edges: [...board.edges, { from, to, style, label: '' }] };
}

// How far along the centre-to-centre line (unit length = the full distance) a node's border is.
function border(n, dx, dy) {
  const len = Math.hypot(dx, dy);
  if (!len) return 0;
  if (n.kind === 'circle') return n.w / 2 / len;
  const tx = dx ? n.w / 2 / Math.abs(dx) : Infinity;
  const ty = dy ? n.h / 2 / Math.abs(dy) : Infinity;
  return Math.min(tx, ty);
}

/** The segment from a to b, clipped at each node's border, so an arrow starts and ends at the edges. */
export function edgePoints(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const ta = border(a, dx, dy);
  const tb = border(b, -dx, -dy);
  return { x1: a.x + dx * ta, y1: a.y + dy * ta, x2: b.x - dx * tb, y2: b.y - dy * tb };
}

/** How many nodes are up: all of them with reveal off, else those built up to step `sub`. */
export function visibleCount(board, sub, reveal) {
  const n = board && board.nodes ? board.nodes.length : 0;
  if (!n) return 0;
  return reveal === false ? n : Math.min(n, (sub || 0) + 1);
}

/** The board as a screen item: one slide, so the console's slide list and count work. */
export function boardItem(board) {
  return {
    kind: 'board',
    id: board.id,
    title: board.title,
    theme: board.theme,
    nodes: board.nodes,
    edges: board.edges,
    slides: [{ label: board.title }],
  };
}
