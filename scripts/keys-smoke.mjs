// Renders every Stage Keys preset through the real AudioWorklet in headless Chromium and checks the
// output is sane (sound, no NaN, no runaway level). Also opens the app, starts the rig, loads a combo
// and plays notes through the router, then takes screenshots.
//
//   node scripts/keys-smoke.mjs            # needs Playwright's Chromium (PLAYWRIGHT_BROWSERS_PATH)
//   node scripts/keys-smoke.mjs --shots    # also writes screenshots to /tmp/stage-keys-shots

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = process.env.SHOT_DIR || '/tmp/stage-keys-shots';

async function loadPlaywright() {
  for (const spec of ['playwright', process.env.PLAYWRIGHT_PATH, '/opt/node22/lib/node_modules/playwright/index.mjs']) {
    if (!spec) continue;
    try {
      return await import(spec);
    } catch {
      /* next */
    }
  }
  throw new Error('playwright not found: npm i -g playwright or set PLAYWRIGHT_PATH');
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const file = path.join(ROOT, p);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.statusCode = 404;
        res.end('not found');
        return;
      }
      res.setHeader('content-type', TYPES[path.extname(file)] || 'application/octet-stream');
      res.end(fs.readFileSync(file));
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const RENDER_PAGE = `<!doctype html><html><body><script type="module">
import { PRESETS } from '/src/keys/presets.js';
import { generateImpulse } from '/src/keys/fx.js';
window.renderPreset = async (id, opts = {}) => {
  const preset = PRESETS.find((p) => p.id === id);
  const sr = 48000, secs = opts.secs || 1.6;
  const ctx = new OfflineAudioContext(2, Math.round(sr * secs), sr);
  await ctx.audioWorklet.addModule('/src/keys/worklet/engine.js');
  const node = new AudioWorkletNode(ctx, 'stage-engine', { numberOfInputs: 0, numberOfOutputs: 8, outputChannelCount: new Array(8).fill(2), processorOptions: { parts: 8 } });
  const { PartChain } = await import('/src/keys/fx.js');
  const chain = new PartChain(ctx, { shimmer: false });
  node.connect(chain.input, 0);
  chain.output.connect(ctx.destination);
  chain.set(preset.fx, 120);
  // sampler presets get a synthetic bank so they can be rendered too
  const prog = preset.prog;
  const layers = prog.type === 'layer' ? prog.layers : [prog];
  for (const l of layers) if (l.type === 'sampler') {
    const len = sr * 2; const L = new Float32Array(len); const R = new Float32Array(len);
    for (let i = 0; i < len; i++) { const t = i / sr; const v = (2 * ((t * 220) % 1) - 1) * 0.3 * Math.min(1, t * 100) * Math.exp(-t * 0.5); L[i] = v; R[i] = v; }
    node.port.postMessage({ t: 'bankStart', id: l.bank });
    node.port.postMessage({ t: 'bankNote', id: l.bank, note: 57, L, R, rate: sr, loopStart: Math.round(sr * 0.5), loopEnd: Math.round(sr * 0.5 + Math.round(sr / 220) * 150), loopAuto: true }, [L.buffer, R.buffer]);
    node.port.postMessage({ t: 'bankDone', id: l.bank });
  }
  node.port.postMessage({ t: 'program', part: 0, prog });
  const notes = prog.type === 'drums' ? [36, 38, 42, 46, 56, 63] : opts.notes || [48, 55, 60, 64, 67];
  const on = 0.05, off = Math.min(secs - 0.4, 0.9);
  notes.forEach((n, k) => {
    node.port.postMessage({ t: 'note', part: 0, note: n, vel: 100, on: true, time: on + k * 0.01 });
    node.port.postMessage({ t: 'note', part: 0, note: n, vel: 0, on: false, time: off });
  });
  node.port.postMessage({ t: 'cc', part: 0, cc: 1, value: 60, time: 0.5 });
  // an offline context renders faster than messages travel: wait until the worklet has everything
  await new Promise((resolve) => { node.port.onmessage = (e) => e.data.t === 'pong' && resolve(); node.port.postMessage({ t: 'ping' }); });
  const buf = await ctx.startRendering();
  const l = buf.getChannelData(0), r = buf.getChannelData(1);
  let s = 0, peak = 0, nan = 0, tail = 0;
  const tailFrom = Math.round((secs - 0.15) * sr);
  for (let i = 0; i < l.length; i++) { const a = l[i], b = r[i]; if (Number.isNaN(a) || Number.isNaN(b)) nan++; s += a * a + b * b; const m = Math.max(Math.abs(a), Math.abs(b)); if (m > peak) peak = m; if (i >= tailFrom) tail += a * a; }
  return { id, name: preset.name, type: prog.type, rms: Math.sqrt(s / (2 * l.length)), peak, nan, tailRms: Math.sqrt(tail / (l.length - tailFrom)) };
};
window.renderIr = () => { const ir = generateImpulse({ type: 'hall', decay: 3, damp: 0.5, sr: 48000 }); return ir.L.length; };
window.ready = true;
</script></body></html>`;

async function main() {
  const { chromium } = await loadPlaywright();
  const { server, port } = await serve();
  const base = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const errors = [];
  let failed = 0;
  try {
    // ---- 1. every preset through the worklet
    const page = await browser.newPage();
    page.on('pageerror', (e) => errors.push('render page: ' + e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push('render console: ' + m.text()));
    await page.route(`${base}/__render`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: RENDER_PAGE }));
    await page.goto(`${base}/__render`);
    await page.waitForFunction(() => window.ready);
    const { PRESETS } = await import(path.join(ROOT, 'src/keys/presets.js'));
    const rows = [];
    for (const p of PRESETS) {
      const r = await page.evaluate((id) => window.renderPreset(id), p.id);
      rows.push(r);
      const silent = r.rms < 0.003;
      const bad = r.nan > 0 || silent || r.peak > 2.5;
      if (bad) failed++;
      console.log(`${bad ? 'FAIL' : ' ok '} ${r.id.padEnd(24)} ${r.type.padEnd(8)} rms ${r.rms.toFixed(3)} peak ${r.peak.toFixed(2)} tail ${r.tailRms.toExponential(1)}${r.nan ? ' NaN!' : ''}${silent ? ' SILENT' : ''}`);
    }
    const loud = rows.filter((r) => r.type !== 'drums').map((r) => r.rms);
    console.log(`\n${rows.length} presets, ${failed} failed; rms min ${Math.min(...loud).toFixed(3)} max ${Math.max(...loud).toFixed(3)}`);
    await page.close();

    // ---- 2. the app itself
    const appCtx = await browser.newContext({ viewport: { width: 1360, height: 850 } });
    await appCtx.grantPermissions(['midi'], { origin: base });
    const app = await appCtx.newPage();
    app.on('pageerror', (e) => errors.push('app: ' + e.message));
    app.on('console', (m) => m.type() === 'error' && errors.push('app console: ' + m.text()));
    await app.goto(`${base}/keys/`);
    await app.getByRole('button', { name: /Start the rig/ }).click();
    await app.waitForFunction(() => window.stageKeys && window.stageKeys.engine.ready, null, { timeout: 20000 });
    const info = await app.evaluate(async () => {
      const sk = window.stageKeys;
      const { COMBOS } = await import('/src/keys/combos.js');
      sk.actions.loadCombo(COMBOS[0]);
      await new Promise((r) => setTimeout(r, 300));
      // play a bass note left, a lead note right, hold them a bit
      sk.router.handle({ type: 'noteon', ch: 1, note: 40, vel: 100, time: 0 });
      sk.router.handle({ type: 'noteon', ch: 1, note: 76, vel: 110, time: 0 });
      sk.router.handle({ type: 'cc', ch: 1, cc: 64, value: 127, time: 0 });
      // the meters hold peaks briefly: watch them while the notes sound and keep the loudest reading
      const lv = { parts: new Float32Array(8), master: 0 };
      for (let k = 0; k < 14; k++) {
        await new Promise((r) => setTimeout(r, 50));
        const now = sk.engine.levels();
        now.parts.forEach((v, i) => (lv.parts[i] = Math.max(lv.parts[i], v)));
        lv.master = Math.max(lv.master, now.master);
      }
      sk.router.handle({ type: 'noteoff', ch: 1, note: 40, vel: 0, time: 0 });
      sk.router.handle({ type: 'noteoff', ch: 1, note: 76, vel: 0, time: 0 });
      sk.router.handle({ type: 'cc', ch: 1, cc: 64, value: 0, time: 0 });
      // groove loop
      const di = sk.store.get().performance.parts.findIndex((p) => p.prog.type === 'drums');
      sk.looper.play(di);
      const lv2 = { parts: new Float32Array(8) };
      for (let k = 0; k < 24; k++) {
        await new Promise((r) => setTimeout(r, 50));
        const now = sk.engine.levels();
        now.parts.forEach((v, i) => (lv2.parts[i] = Math.max(lv2.parts[i], v)));
      }
      sk.looper.muteAll();
      return { parts: sk.store.get().performance.parts.map((p) => p.name), bass: lv.parts[0], lead: lv.parts[1], drums: lv2.parts[di], master: lv.master, voices: sk.engine.voices, state: sk.engine.ctx.state, latency: sk.engine.latency(), midi: sk.midi.access ? 'granted' : sk.midi.error || 'pending' };
    });
    console.log('app:', JSON.stringify(info));
    if (!(info.bass > 0.01 && info.lead > 0.01)) {
      failed++;
      console.log('FAIL: the app did not produce sound on both split parts');
    }
    if (!(info.drums > 0.01)) {
      failed++;
      console.log('FAIL: the groove loop did not sound');
    }
    if (SHOTS) {
      fs.mkdirSync(SHOT_DIR, { recursive: true });
      await app.screenshot({ path: path.join(SHOT_DIR, 'perform.png') });
      for (const view of ['sounds', 'loops', 'songs', 'settings']) {
        await app.evaluate((v) => window.stageKeys.store.dispatch({ type: 'ui/patch', patch: { view: v } }), view);
        await app.waitForTimeout(250);
        await app.screenshot({ path: path.join(SHOT_DIR, `${view}.png`) });
      }
      await app.evaluate(() => window.stageKeys.store.dispatch({ type: 'ui/patch', patch: { view: 'perform', editor: 'sound', selectedPart: 1 } }));
      await app.waitForTimeout(250);
      await app.screenshot({ path: path.join(SHOT_DIR, 'editor.png') });
      await app.evaluate(() => window.stageKeys.store.dispatch({ type: 'ui/patch', patch: { editor: 'fx' } }));
      await app.waitForTimeout(250);
      await app.screenshot({ path: path.join(SHOT_DIR, 'editor-fx.png') });
      await app.setViewportSize({ width: 400, height: 820 });
      await app.evaluate(() => window.stageKeys.store.dispatch({ type: 'ui/patch', patch: { editor: null } }));
      await app.waitForTimeout(250);
      await app.screenshot({ path: path.join(SHOT_DIR, 'phone.png') });
      console.log('screenshots in', SHOT_DIR);
    }
    await app.close();
  } finally {
    await browser.close();
    server.close();
  }
  if (errors.length) {
    console.log('\nBrowser errors:');
    for (const e of errors) console.log('  ' + e);
  }
  if (failed || errors.length) {
    console.log(`\nSMOKE FAILED (${failed} failures, ${errors.length} errors)`);
    process.exit(1);
  }
  console.log('\nSMOKE OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
