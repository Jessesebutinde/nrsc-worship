// Export: choose a format (original copy, MP3, AAC, Opus, FLAC, WAV),
// watch every file get cut/encoded with live meters, then save, ZIP or
// share. Encoded audio is kept apart from its tags, so renaming after
// export only rebuilds a tiny header — no re-cutting or re-encoding.

import { html, useState, useEffect, useRef } from './h.js';
import { Meter, saveBlob, toast, AnimatedNumber } from './common.js';
import { exportPlan } from '../songs.js';
import { songFileBase, sanitizeFilename } from '../naming.js';
import { zipPartsAsync } from '../media/zip.js';
import { fmtTime, fmtBytes } from '../util.js';
import { loadPrefs, savePrefs } from '../store.js';
import {
  FORMATS,
  PRESETS,
  formatSupport,
  settingsKey,
  extFor,
  estimateBytes,
  encodeItem,
  cancelEncoding,
} from '../encode/encode.js';

const clipKey = (it) => `${it.start.toFixed(3)}|${it.end.toFixed(3)}`;

export function listText(plan, serviceTitle, link) {
  const rows = plan.map((it) => {
    const num = String(it.index + 1).padStart(2, '0');
    return `${num}  ${it.title}  —  ${fmtTime(it.start)}–${fmtTime(it.end)} (${fmtTime(it.end - it.start)})`;
  });
  return [serviceTitle, link, '', ...rows].filter((l, i) => l || i > 1).join('\n') + '\n';
}

const STAGE = { wait: 'Waiting', download: 'Downloading', decode: 'Decoding', encode: 'Encoding', done: 'Ready', error: 'Failed' };

function defaultSettings() {
  return { format: 'original', bitrate: 192, mono: false, numbered: true, ...(loadPrefs().export || {}) };
}

const resolvePreset = (p, support) => (support && p.fallback && !support[p.settings.format] ? p.fallback : p.settings);

export function ExportPanel({ songs, media, mediaError, cuts, serviceTitle, link, exported, onExported }) {
  const [settings, setSettingsState] = useState(defaultSettings);
  const [support, setSupport] = useState(null);
  const [custom, setCustom] = useState(false);
  const [run, setRun] = useState(null); // { total, started, label, zip }
  const [prog, setProg] = useState({}); // key -> { f, stage, error }
  const [, bump] = useState(0);
  const abort = useRef(null);
  const results = cuts; // shared cache that outlives re-renders

  useEffect(() => {
    formatSupport().then((s) => {
      setSupport(s);
      // A saved choice this browser can't make falls back to the original.
      setSettingsState((cur) => (s[cur.format] ? cur : { ...cur, format: 'original' }));
    });
  }, []);

  // Re-render every second while running so the time left keeps moving.
  useEffect(() => {
    if (!run) return;
    const t = setInterval(() => bump((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [!!run]);

  const setSettings = (patch) => {
    const next = { ...settings, ...patch };
    const f = FORMATS[next.format];
    if (f.bitrates && !f.bitrates.includes(next.bitrate)) next.bitrate = f.bitrate;
    setSettingsState(next);
    savePrefs({ ...loadPrefs(), export: next });
  };

  const plan = exportPlan(songs);
  const sk = settingsKey(settings);
  const ext = extFor(settings, media);
  const total = plan.length;
  const songTotal = plan.filter((p) => p.kind === 'song').length;
  const resultKey = (it) => `${sk}|${clipKey(it)}`;
  const ready = (it) => results.has(resultKey(it));
  const allReady = total > 0 && plan.every(ready);

  const baseName = (it) => {
    if (settings.numbered) return songFileBase(it.index, it.title);
    return sanitizeFilename(it.title) || `Song ${it.index + 1}`;
  };
  const fileName = (it) => `${baseName(it)}.${ext}`;

  const totalSeconds = plan.reduce((s, it) => s + (it.end - it.start), 0);
  const estTotal = plan.reduce(
    (s, it) => s + (ready(it) ? results.get(resultKey(it)).bytes : estimateBytes(settings, it.end - it.start, media)),
    0,
  );

  const prevNames = new Map((exported?.items || []).map((x) => [x.key, x]));
  const renamed = plan.filter((it) => {
    const p = prevNames.get(it.key);
    return p && p.name !== fileName(it) && p.start === it.start && p.end === it.end && (p.sk || 'original') === sk;
  });

  async function prepare(items) {
    if (!media) return false;
    const todo = items.filter((it) => !ready(it));
    if (!todo.length) return true;
    const ac = new AbortController();
    abort.current = ac;
    const state = {};
    for (const it of todo) state[it.key] = { f: 0, stage: 'wait' };
    setProg({ ...state });
    setRun({ total: todo.length, started: Date.now() });
    const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent || '');
    const lanes = settings.format === 'original' || mobile ? 1 : 2;
    let next = 0;
    let failed = null;
    let last = 0;
    const update = (key, f, stage) => {
      state[key] = { f, stage };
      const now = performance.now();
      if (now - last > 80 || stage === 'done') {
        last = now;
        setProg({ ...state });
      }
    };
    const lane = async () => {
      while (next < todo.length && !failed && !ac.signal.aborted) {
        const it = todo[next++];
        try {
          const result = await encodeItem({
            media,
            start: it.start,
            end: it.end,
            settings,
            signal: ac.signal,
            getCut: async (onP) => {
              const ck = `cut|${clipKey(it)}`;
              if (results.has(ck)) return results.get(ck);
              const clip = await media.extract(it.start, it.end, { onProgress: onP });
              results.set(ck, clip);
              return clip;
            },
            onProgress: (f, stage) => update(it.key, f, stage),
          });
          results.set(resultKey(it), result);
          update(it.key, 1, 'done');
        } catch (e) {
          if (!ac.signal.aborted) {
            failed = e;
            state[it.key] = { f: 0, stage: 'error', error: e.message };
            setProg({ ...state });
          }
        }
      }
    };
    await Promise.all(Array.from({ length: lanes }, lane));
    abort.current = null;
    setRun(null);
    bump((n) => n + 1);
    if (ac.signal.aborted) {
      toast('Stopped');
      return false;
    }
    if (failed) {
      toast(`Couldn't make the files: ${failed.message}`);
      return false;
    }
    return true;
  }

  function cancel() {
    if (abort.current) abort.current.abort();
    cancelEncoding();
  }

  const meta = (it) => ({ title: it.title, track: it.index + 1, total: songs.length, album: serviceTitle || undefined });
  const buildParts = (it) => results.get(resultKey(it)).parts(meta(it));
  const buildFile = (it) => new File(buildParts(it), fileName(it), { type: results.get(resultKey(it)).mime });

  function record(items) {
    onExported({
      at: Date.now(),
      items: plan
        .map((it) => (items.includes(it) ? { key: it.key, name: fileName(it), start: it.start, end: it.end, sk } : prevNames.get(it.key)))
        .filter(Boolean),
    });
  }

  async function saveEach(items) {
    if (!(await prepare(items))) return;
    for (let k = 0; k < items.length; k++) {
      saveBlob(buildFile(items[k]), fileName(items[k]));
      if (k < items.length - 1) await new Promise((r) => setTimeout(r, 700));
    }
    record(items);
    celebrate(items.length);
  }

  async function saveZip() {
    if (!(await prepare(plan))) return;
    setRun({ total: 1, started: Date.now(), label: 'Packing the ZIP', zip: 0 });
    const files = plan.map((it) => ({ name: fileName(it), parts: buildParts(it) }));
    files.push({ name: 'Times and names.txt', parts: [new TextEncoder().encode(listText(plan, serviceTitle, link))] });
    const parts = await zipPartsAsync(files, (f) => setRun((r) => r && { ...r, zip: f }));
    setRun(null);
    saveBlob(new Blob(parts, { type: 'application/zip' }), `${sanitizeFilename(serviceTitle || 'Service songs').slice(0, 80)}.zip`);
    record(plan);
    celebrate(plan.length);
  }

  async function share() {
    if (!(await prepare(plan))) return;
    try {
      await navigator.share({ files: plan.map(buildFile), title: serviceTitle || 'Songs' });
      record(plan);
    } catch (e) {
      if (e.name !== 'AbortError') toast("Sharing didn't work here — use Save or ZIP");
    }
  }

  const canShare = (() => {
    try {
      const mime = settings.format === 'original' ? media && media.mime : FORMATS[settings.format].mime;
      return !!(navigator.canShare && media && navigator.canShare({ files: [new File([], `a.${ext}`, { type: mime })] }));
    } catch {
      return false;
    }
  })();

  // Overall meter.
  const keys = Object.keys(prog);
  const overall = run ? (run.zip != null ? run.zip : keys.reduce((s, k) => s + prog[k].f, 0) / Math.max(1, keys.length)) : 0;
  const elapsed = run ? (Date.now() - run.started) / 1000 : 0;
  const eta = run && overall > 0.04 && elapsed > 2 ? (elapsed / overall) * (1 - overall) : null;
  const doneCount = keys.filter((k) => prog[k].stage === 'done').length;
  const busy = !!run;

  const presetActive = (p) => !custom && settingsKey({ ...settings, ...resolvePreset(p, support) }) === sk;
  const applyPreset = (p) => {
    setCustom(false);
    setSettings({ mono: false, ...resolvePreset(p, support) });
  };
  const fmt = FORMATS[settings.format];

  return html`
    <section class="card export" aria-labelledby="export-h">
      <div class="export-head">
        <h2 id="export-h">Export</h2>
        <div class="est" title="Estimated total size">
          ${total ? html`≈ <${AnimatedNumber} value=${estTotal} format=${fmtBytes} />` : ''}
        </div>
      </div>
      ${mediaError && html`<p class="error">The audio couldn't be opened: ${mediaError}</p>`}

      <div class="presets" role="radiogroup" aria-label="Quality">
        ${PRESETS.map((p) => {
          const s = resolvePreset(p, support);
          const est = estimateBytes({ ...settings, ...s }, totalSeconds, media);
          return html`<button
            role="radio"
            aria-checked=${presetActive(p)}
            class=${'preset' + (presetActive(p) ? ' on' : '')}
            disabled=${busy || (support && !support[s.format])}
            onClick=${() => applyPreset(p)}
          >
            <span class="p-label">${p.label}</span>
            <span class="p-sub">${s.sub || p.sub}</span>
            <span class="p-size">${total ? fmtBytes(est) : ''}</span>
          </button>`;
        })}
        <button class=${'preset' + (custom ? ' on' : '')} role="radio" aria-checked=${custom} disabled=${busy} onClick=${() => setCustom(!custom)}>
          <span class="p-label">Custom</span>
          <span class="p-sub">${custom ? `${fmt.label}${fmt.bitrates ? ` ${settings.bitrate}k` : ''}${settings.mono ? ' mono' : ''}` : 'format & bitrate'}</span>
          <span class="p-size">⚙</span>
        </button>
      </div>

      ${custom &&
      html`<div class="custom">
        <div class="opt-label">Format</div>
        <div class="chips">
          ${Object.entries(FORMATS).map(
            ([k, f]) => html`<button
              class=${'chip pick' + (settings.format === k ? ' on' : '')}
              disabled=${busy || (support && !support[k])}
              title=${support && !support[k] ? 'Not available in this browser' : f.note}
              onClick=${() => setSettings({ format: k })}
            >
              ${f.label}<small>.${k === 'original' ? (media ? media.ext : 'm4a') : f.ext}</small>
            </button>`,
          )}
        </div>
        <p class="muted small">
          ${fmt.note}.${support && (!support.aac || !support.opus) ? ' Greyed-out formats need a newer browser (e.g. Chrome or Edge).' : ''}
        </p>
        ${fmt.bitrates &&
        html`<div class="opt-label">Bitrate <span class="muted small">— lower means smaller files</span></div>
          <div class="chips">
            ${fmt.bitrates.map(
              (b) => html`<button class=${'chip pick' + (settings.bitrate === b ? ' on' : '')} disabled=${busy} onClick=${() => setSettings({ bitrate: b })}>
                ${b}<small>kbps</small>
              </button>`,
            )}
          </div>`}
        ${settings.format !== 'original' &&
        html`<label class="switch">
          <input type="checkbox" checked=${settings.mono} disabled=${busy} onChange=${() => setSettings({ mono: !settings.mono })} />
          <span class="track"><span class="thumb"></span></span>
          <span>Mono <span class="muted small">(smaller; fine for phones and speakers)</span></span>
        </label>`}
      </div>`}

      <label class="switch">
        <input type="checkbox" checked=${settings.numbered} onChange=${() => setSettings({ numbered: !settings.numbered })} />
        <span class="track"><span class="thumb"></span></span>
        <span>Number the files <span class="muted small">(${settings.numbered ? '01 - Way Maker' : 'Way Maker'}.${ext})</span></span>
      </label>

      ${total === 0
        ? html`<p class="muted">Tick at least one song to export.</p>`
        : html`<ul class="file-list">
            ${plan.map((it, i) => {
              const p = prog[it.key];
              const isReady = ready(it);
              const stage = isReady ? 'done' : p ? p.stage : null;
              const size = isReady ? results.get(resultKey(it)).bytes : estimateBytes(settings, it.end - it.start, media);
              return html`<li key=${it.key} class=${it.kind + (stage ? ` st-${stage}` : '')} style=${{ '--i': i }}>
                <div class="f-main">
                  <span class="fname">${fileName(it)}</span>
                  <span class="muted small">
                    ${fmtTime(it.end - it.start)} · ${isReady ? '' : '≈'}${fmtBytes(size)}
                    ${stage && stage !== 'done' ? html` · <span class=${'stage-pill ' + stage}>${STAGE[stage]}${p && p.f > 0 && stage !== 'error' ? ` ${Math.round(p.f * 100)}%` : ''}</span>` : ''}
                    ${stage === 'error' && p.error ? html` <span class="error">${p.error}</span>` : ''}
                  </span>
                  ${p && stage !== 'done' && stage !== 'error' && html`<${Meter} value=${p.f * 100} small active=${stage !== 'wait'} />`}
                </div>
                <button
                  class=${'btn small' + (isReady ? ' save-btn' : '')}
                  disabled=${busy || !media}
                  onClick=${() => saveEach([it])}
                  aria-label=${`Save ${fileName(it)}`}
                >
                  ${isReady && html`<span class="tick">✓</span>`} Save
                </button>
              </li>`;
            })}
          </ul>`}

      ${run &&
      html`<div class="overall" aria-live="polite">
        <div class="overall-top">
          <strong>${run.label || (settings.format === 'original' ? 'Cutting' : `Encoding ${fmt.label}`)}</strong>
          <span class="pct"><${AnimatedNumber} value=${Math.round(overall * 100)} />%</span>
        </div>
        <${Meter} value=${overall * 100} active />
        <div class="muted small overall-sub">
          <span>
            ${run.zip == null ? `${doneCount} of ${run.total} file${run.total === 1 ? '' : 's'} ready` : 'Almost there…'}
            ${eta != null ? ` · about ${fmtTime(Math.ceil(eta))} left` : ''}
          </span>
          ${run.zip == null && html`<button class="link-btn danger" onClick=${cancel}>Cancel</button>`}
        </div>
      </div>`}

      ${renamed.length > 0 &&
      !busy &&
      html`<div class="notice pop">
        <strong>${renamed.length} name${renamed.length > 1 ? 's' : ''} changed since you last downloaded.</strong>
        ${renamed.every(ready) ? ' The audio is ready — this only renames the files.' : ''}
        <div class="row wrap">
          <button class="btn primary small" disabled=${!media} onClick=${() => saveEach(renamed)}>
            Download renamed file${renamed.length > 1 ? 's' : ''}
          </button>
        </div>
      </div>`}

      <div class="row wrap export-actions">
        <button class="btn primary" disabled=${!media || !total || busy} onClick=${() => saveEach(plan)}>
          Save ${total} file${total === 1 ? '' : 's'}
        </button>
        <button class="btn" disabled=${!media || !total || busy} onClick=${saveZip}>Download ZIP</button>
        ${canShare && html`<button class="btn" disabled=${!total || busy} onClick=${share}>Share…</button>`}
      </div>
      <div class="row wrap">
        <button class="btn small ghost" disabled=${!total} onClick=${() =>
          saveBlob(new Blob([listText(plan, serviceTitle, link)], { type: 'text/plain' }), 'Times and names.txt')}>
          Times & names (.txt)
        </button>
        <button class="btn small ghost" disabled=${!total} onClick=${async () => {
          try {
            await navigator.clipboard.writeText(listText(plan, serviceTitle, link));
            toast('List copied');
          } catch {
            toast("Couldn't copy here");
          }
        }}>Copy list</button>
      </div>
      <p class="muted small">
        ${[
          `${songTotal} song${songTotal === 1 ? '' : 's'}${total > songTotal ? ` + ${total - songTotal} section clips` : ''}.`,
          settings.format === 'original' ? '' : 'Encoding happens on this device — keep the page open.',
          allReady ? 'Ready — renaming now only changes file names.' : '',
          exported ? `Last downloaded ${new Date(exported.at).toLocaleString()}.` : '',
        ]
          .filter(Boolean)
          .join(' ')}
      </p>
    </section>
  `;
}

function celebrate(n) {
  toast(`🎉 ${n} file${n === 1 ? '' : 's'} saved`);
}
