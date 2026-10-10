// Measures slide lines in the real font at the real size, so the editor can warn before
// a line wraps on the TV (sizes never shrink to fit).

const SIZES = {
  classic: { weight: 600, size: 140, spacing: 0, upper: false },
  worship: { weight: 500, size: 130, spacing: -0.005, upper: false },
  praise: { weight: 800, size: 125, spacing: 0.02, upper: true },
};
export const LINE_WIDTH = 1920 - 2 * 96; // inside the 5% safe area

let ctx = null;
let ready = null;

/** Resolves once Montserrat is loaded (measuring with a fallback font would be wrong). */
export function fontsReady() {
  if (!ready) {
    ready = Promise.all(
      [500, 600, 800].map((w) => document.fonts.load(`${w} 100px Montserrat`, 'AaŋŊ')),
    ).catch(() => null);
  }
  return ready;
}

export function lineWidth(text, preset = 'worship') {
  const s = SIZES[preset] || SIZES.worship;
  if (!ctx) ctx = document.createElement('canvas').getContext('2d');
  ctx.font = `${s.weight} ${s.size}px Montserrat`;
  const t = s.upper ? text.toUpperCase() : text;
  return ctx.measureText(t).width + s.spacing * s.size * t.length;
}

/** Line size for the splitter: 1 = exactly the width inside the safe area. */
export const sizer = (preset) => (text) => lineWidth(text, preset) / LINE_WIDTH;
