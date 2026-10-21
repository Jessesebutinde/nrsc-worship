// Measures slide lines in the real font at the real size, so the editor can warn before
// a line wraps on the TV (sizes never shrink to fit).

const SIZES = {
  classic: { weight: 600, size: 140, spacing: 0, upper: false },
  worship: { weight: 500, size: 130, spacing: -0.005, upper: false },
  praise: { weight: 800, size: 125, spacing: 0.02, upper: true },
  poster: { weight: 400, size: 200, spacing: 0.01, upper: true, family: 'Anton' },
  sunshine: { weight: 900, size: 150, spacing: 0.06, upper: true },
  lines: { weight: 300, size: 120, spacing: 0.14, upper: true },
  beams: { weight: 500, size: 140, spacing: 0.08, upper: true },
  banner: { weight: 700, size: 150, spacing: -0.02, upper: true },
  midnight: { weight: 800, size: 150, spacing: -0.02, upper: true },
  pixel: { weight: 400, size: 200, spacing: 0.04, upper: true, family: 'VT323' },
  neon: { weight: 900, size: 160, spacing: -0.01, upper: true },
  grateful: { weight: 400, size: 150, spacing: 0.02, upper: true, family: 'Archivo Black' },
  film: { weight: 400, size: 200, spacing: 0.01, upper: true, family: 'Anton' },
};
export const LINE_WIDTH = 1920 - 2 * 96; // inside the 5% safe area

let ctx = null;
let ready = null;

/** Resolves once Montserrat is loaded (measuring with a fallback font would be wrong). */
export function fontsReady() {
  if (!ready) {
    ready = Promise.all(
      [
        ...[300, 500, 600, 800, 900].map((w) => document.fonts.load(`${w} 100px Montserrat`, 'AaŋŊ')),
        document.fonts.load('400 100px Anton', 'Aa'),
        document.fonts.load('400 100px VT323', 'Aa'),
        document.fonts.load("400 100px 'Archivo Black'", 'Aa'),
        document.fonts.load("400 100px 'Source Serif 4'", 'AaŋŊ'),
        document.fonts.load("600 100px 'Source Serif 4'", 'AaŋŊ'),
        document.fonts.load("italic 400 100px 'Source Serif 4'", 'Aa'),
      ],
    ).catch(() => null);
  }
  return ready;
}

export function lineWidth(text, preset = 'worship') {
  const s = SIZES[preset] || SIZES.worship;
  if (!ctx) ctx = document.createElement('canvas').getContext('2d');
  ctx.font = `${s.weight} ${s.size}px ${s.family || 'Montserrat'}`;
  const t = s.upper ? text.toUpperCase() : text;
  return ctx.measureText(t).width + s.spacing * s.size * t.length;
}

/** Line size for the splitter: 1 = exactly the width inside the safe area. */
export const sizer = (preset) => (text) => lineWidth(text, preset) / LINE_WIDTH;

// Scripture on the TV. Each look sets where its text sits: the width of the block (in output
// pixels), and for each language the weight, size and the lines allowed; the number before a
// verse is counted as text. `sans` measures the same layout in Montserrat (the Serif / Sans switch).
export const SCRIP_FIT = {
  ink: { w: 1557, p: [600, 92, 3], s: [400, 74, 3] },
  parchment: { w: 760, p: [600, 80, 5], s: [400, 68, 5] },
  manuscript: { w: 1440, p: [600, 86, 3], s: [400, 66, 3], cap: 330 },
  linen: { w: 1440, p: [600, 96, 4], s: [400, 56, 3], sw: 1300 },
  dawn: { w: 1557, p: [600, 92, 3], s: [400, 74, 3] },
  water: { w: 1640, p: [600, 92, 3], s: [400, 70, 3] },
  chalk: { w: 1600, p: [400, 92, 3], s: [400, 70, 3] },
  kitenge: { w: 1564, p: [600, 88, 3], s: [400, 70, 3] },
  candle: { w: 1440, p: [600, 92, 3], s: [400, 70, 3] },
  blueprint: { w: 1240, p: [400, 92, 3], s: [400, 62, 3], sSans: true },
  scroll: { w: 1520, p: [600, 100, 3], s: [400, 70, 2] },
  // Cards: w = the text width inside the card (sw: inside the second card).
  twin: { w: 704, p: [600, 76, 5], s: [400, 64, 6] },
  stack: { w: 1330, p: [600, 88, 3], s: [400, 66, 3], sw: 1170 },
  bible: { w: 650, p: [600, 70, 6], s: [400, 60, 7] },
  card: { w: 1330, p: [600, 88, 3], s: [400, 70, 3] },
  royal: { w: 1290, p: [600, 86, 3], s: [400, 68, 3] },
  cathedral: { w: 1050, p: [600, 78, 3], s: [400, 60, 3] },
  tablet: { w: 1050, p: [600, 80, 3], s: [400, 62, 3] },
  split: { w: 1090, p: [600, 80, 4], s: [400, 64, 3] },
  bookmark: { w: 1210, p: [600, 88, 3], s: [400, 70, 3] },
  epistle: { w: 1230, p: [600, 86, 3], s: [400, 68, 3] },
  gallery: { w: 990, p: [600, 72, 4], s: [400, 58, 4] },
};
// Single-card looks without their own measurements use the standard card.
const CARD_LOOKS = ['glass', 'marble', 'starlight', 'glory', 'limestone', 'waters', 'mountain', 'fire', 'bold', 'aurora', 'papercut', 'lubugo'];
for (const k of CARD_LOOKS) SCRIP_FIT[k] = SCRIP_FIT.card;
export const SERIF = "'Source Serif 4'";
function textWidth(text, weight, size, family = 'Montserrat') {
  if (!ctx) ctx = document.createElement('canvas').getContext('2d');
  ctx.font = `${weight} ${size}px ${family}`;
  return ctx.measureText(text).width;
}
// A slimmer margin: the block spans 1840 px (slim) or 1896 px (none) instead of the safe area's
// 1728; every look's own column grows by the same share (capped at the full span).
const SPANS = { look: 1728, slim: 1840, none: 1896 };
export function scriptureFit(look = 'ink', font = 'serif', size = 1, { balance = 1, wide = false, margin = null } = {}) {
  const k = Number(size) > 0.5 && Number(size) < 3 ? Number(size) : 1;
  const b = Number(balance) > 0.3 && Number(balance) < 2 ? Number(balance) : 1;
  const f0 = SCRIP_FIT[look] || SCRIP_FIT.ink;
  const span = SPANS[margin] || (wide ? SPANS.slim : SPANS.look);
  const grow = span / SPANS.look;
  const f = span === SPANS.look ? f0 : { ...f0, w: Math.min(span, Math.round(f0.w * grow)), sw: f0.sw ? Math.min(span, Math.round(f0.sw * grow)) : f0.sw };
  const fam = font === 'sans' ? 'Montserrat' : SERIF;
  const sFam = f.sSans ? 'Montserrat' : fam;
  // A drop cap takes the first letters' room on the first lines.
  const pw = f.w - (f.cap || 0);
  // Room for the quotation marks and the dots of a verse that goes on. Bigger text: each line is
  // k times taller, so a screen holds that many fewer lines (else the screen only shrinks it back).
  // The language below gives up a line first (floor), the one on top last (round), so the steps
  // between the sizes stay distinct.
  const lk = (n, round) => (k > 1 ? Math.max(1, round ? Math.round(n / k) : Math.floor(n / k)) : n);
  return {
    primary: { width: (t) => (textWidth(`“…${t}…”`, f.p[0], f.p[1], fam) * k) / pw, lines: lk(f.p[2], true) },
    secondary: { width: (t) => (textWidth(`“…${t}…”`, f.s[0], f.s[1], sFam) * k * b) / (f.sw || f.w), lines: b > 1 ? Math.max(k > 1 ? 1 : 2, Math.round(lk(f.s[2], false) / b)) : lk(f.s[2], false) },
  };
}
