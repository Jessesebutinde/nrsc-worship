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
  ink: { w: 1557, p: [600, 92, 3], s: [400, 64, 3] },
  parchment: { w: 760, p: [600, 80, 5], s: [400, 60, 5] },
  manuscript: { w: 1440, p: [600, 86, 3], s: [400, 56, 3], cap: 330 },
  linen: { w: 1440, p: [600, 96, 4], s: [400, 44, 3], sw: 1300 },
  dawn: { w: 1557, p: [600, 92, 3], s: [400, 64, 3] },
  water: { w: 1640, p: [600, 92, 3], s: [400, 60, 3] },
  chalk: { w: 1600, p: [400, 92, 3], s: [400, 60, 3] },
  kitenge: { w: 1564, p: [600, 88, 3], s: [400, 60, 3] },
  candle: { w: 1440, p: [600, 92, 3], s: [400, 60, 3] },
  blueprint: { w: 1240, p: [400, 92, 3], s: [400, 52, 3], sSans: true },
  scroll: { w: 1520, p: [600, 100, 3], s: [400, 60, 2] },
};
export const SERIF = "'Source Serif 4'";
function textWidth(text, weight, size, family = 'Montserrat') {
  if (!ctx) ctx = document.createElement('canvas').getContext('2d');
  ctx.font = `${weight} ${size}px ${family}`;
  return ctx.measureText(text).width;
}
export function scriptureFit(look = 'ink', font = 'serif') {
  const f = SCRIP_FIT[look] || SCRIP_FIT.ink;
  const fam = font === 'sans' ? 'Montserrat' : SERIF;
  const sFam = f.sSans ? 'Montserrat' : fam;
  // A drop cap takes the first letters' room on the first lines.
  const pw = f.w - (f.cap || 0);
  return {
    primary: { width: (t) => textWidth(t, f.p[0], f.p[1], fam) / pw, lines: f.p[2] },
    secondary: { width: (t) => textWidth(t, f.s[0], f.s[1], sFam) / (f.sw || f.w), lines: f.s[2] },
  };
}
