// Export: cut each selected song once, then build files on demand so a
// rename only re-wraps the already-cut audio (no re-cutting).

import { html, useState } from './h.js';
import { ProgressBar, saveBlob, toast } from './common.js';
import { exportPlan } from '../songs.js';
import { songFileBase } from '../naming.js';
import { zipParts } from '../media/zip.js';
import { fmtTime, fmtBytes } from '../util.js';

const clipKey = (it) => `${it.start.toFixed(3)}|${it.end.toFixed(3)}`;

export function listText(plan, serviceTitle, link) {
  const rows = plan.map((it) => {
    const num = String(it.index + 1).padStart(2, '0');
    return `${num}  ${it.title}  —  ${fmtTime(it.start)}–${fmtTime(it.end)} (${fmtTime(it.end - it.start)})`;
  });
  return [serviceTitle, link, '', ...rows].filter((l, i) => l || i > 1).join('\n') + '\n';
}

export function ExportPanel({ songs, media, mediaError, cuts, serviceTitle, link, exported, onExported }) {
  const [busy, setBusy] = useState(null); // { done, total, label }
  const [, bump] = useState(0);
  const plan = exportPlan(songs);
  const ext = media ? media.ext : 'm4a';
  const total = plan.length;
  const songTotal = plan.filter((p) => p.kind === 'song').length;
  const fileName = (it) => `${songFileBase(it.index, it.title)}.${ext}`;
  const cutReady = (it) => cuts.has(clipKey(it));
  const allCut = total > 0 && plan.every(cutReady);

  const prevNames = new Map((exported?.items || []).map((x) => [x.key, x]));
  const renamed = plan.filter((it) => {
    const p = prevNames.get(it.key);
    return p && p.name !== fileName(it) && p.start === it.start && p.end === it.end;
  });

  async function cutAll(items) {
    if (!media) return false;
    const todo = items.filter((it) => !cutReady(it));
    let i = 0;
    for (const it of todo) {
      i++;
      setBusy({ done: i - 1, total: todo.length, label: `Cutting ${i} of ${todo.length}: ${it.title}` });
      try {
        const clip = await media.extract(it.start, it.end, {
          onProgress: (got, all) =>
            setBusy({ done: i - 1 + got / all, total: todo.length, label: `Cutting ${i} of ${todo.length}: ${it.title}` }),
        });
        cuts.set(clipKey(it), clip);
      } catch (e) {
        setBusy(null);
        toast(`Couldn't cut "${it.title}": ${e.message}`);
        return false;
      }
    }
    setBusy(null);
    bump((n) => n + 1);
    return true;
  }

  function buildParts(it) {
    return media.mux(cuts.get(clipKey(it)), {
      title: it.title,
      track: it.index + 1,
      total: songs.length,
      album: serviceTitle || undefined,
    });
  }

  function buildFile(it) {
    return new File(buildParts(it), fileName(it), { type: media.mime });
  }

  function record(items) {
    onExported({
      at: Date.now(),
      items: plan.map((it) => {
        const done = items.includes(it);
        const prev = prevNames.get(it.key);
        return done ? { key: it.key, name: fileName(it), start: it.start, end: it.end } : prev;
      }).filter(Boolean),
    });
  }

  async function saveEach(items) {
    if (!(await cutAll(items))) return;
    for (let k = 0; k < items.length; k++) {
      saveBlob(buildFile(items[k]), fileName(items[k]));
      // Browsers drop rapid-fire downloads; space them out.
      if (k < items.length - 1) await new Promise((r) => setTimeout(r, 700));
    }
    record(items);
  }

  async function saveZip() {
    if (!(await cutAll(plan))) return;
    setBusy({ done: 0, total: 1, label: 'Making the ZIP…', indeterminate: true });
    await new Promise((r) => setTimeout(r, 30));
    const files = [];
    for (const it of plan) files.push({ name: fileName(it), parts: buildParts(it) });
    files.push({ name: 'Times and names.txt', parts: [new TextEncoder().encode(listText(plan, serviceTitle, link))] });
    const zip = new Blob(zipParts(files), { type: 'application/zip' });
    setBusy(null);
    saveBlob(zip, `${(serviceTitle || 'Service songs').replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 80).trim()}.zip`);
    record(plan);
  }

  async function share() {
    if (!(await cutAll(plan))) return;
    const files = plan.map(buildFile);
    try {
      await navigator.share({ files, title: serviceTitle || 'Songs' });
      record(plan);
    } catch (e) {
      if (e.name !== 'AbortError') toast("Sharing didn't work here — use Save or ZIP");
    }
  }

  const canShare = (() => {
    try {
      return !!(navigator.canShare && media && navigator.canShare({ files: [new File([], `a.${ext}`, { type: media.mime })] }));
    } catch {
      return false;
    }
  })();

  return html`
    <section class="card export" aria-labelledby="export-h">
      <h2 id="export-h">Export</h2>
      ${mediaError &&
      html`<p class="error">The audio couldn't be opened for cutting: ${mediaError}</p>`}
      ${!media && !mediaError && html`<p class="muted">Getting the audio ready…</p>`}
      ${media &&
      html`<p class="muted small">
        ${media.lossless
          ? `Files are cut straight from the original ${ext.toUpperCase()} — same quality, no re-encoding.`
          : 'This file type is exported as WAV (uncompressed, larger files).'}
      </p>`}

      ${total === 0
        ? html`<p class="muted">Tick at least one song to export.</p>`
        : html`<ul class="file-list">
            ${plan.map(
              (it) => html`<li key=${it.key} class=${it.kind}>
                <span class="fname">${fileName(it)}</span>
                <span class="muted small">${fmtTime(it.end - it.start)}${cutReady(it) ? ` · ${fmtBytes(cuts.get(clipKey(it)).bytes)}` : ''}</span>
                ${media &&
                html`<button class="btn small" disabled=${!!busy} onClick=${() => saveEach([it])}>Save</button>`}
              </li>`,
            )}
          </ul>`}

      ${renamed.length > 0 &&
      html`<div class="notice">
        <strong>${renamed.length} name${renamed.length > 1 ? 's' : ''} changed since you last downloaded.</strong>
        ${renamed.every(cutReady) ? ' The audio is already cut — this only renames.' : ''}
        <div class="row wrap">
          <button class="btn primary small" disabled=${!!busy || !media} onClick=${() => saveEach(renamed)}>
            Download renamed file${renamed.length > 1 ? 's' : ''}
          </button>
        </div>
      </div>`}

      ${busy && html`<div class="busy"><${ProgressBar} value=${(busy.done / busy.total) * 100} indeterminate=${busy.indeterminate} /><div class="muted small">${busy.label}</div></div>`}

      <div class="row wrap export-actions">
        <button class="btn primary" disabled=${!media || !total || !!busy} onClick=${() => saveEach(plan)}>
          Save ${total} file${total === 1 ? '' : 's'}
        </button>
        <button class="btn" disabled=${!media || !total || !!busy} onClick=${saveZip}>Download as ZIP</button>
        ${canShare && html`<button class="btn" disabled=${!total || !!busy} onClick=${share}>Share…</button>`}
      </div>
      <div class="row wrap">
        <button class="btn small" disabled=${!total} onClick=${() =>
          saveBlob(new Blob([listText(plan, serviceTitle, link)], { type: 'text/plain' }), 'Times and names.txt')}>
          Times & names (.txt)
        </button>
        <button class="btn small" disabled=${!total} onClick=${async () => {
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
          allCut ? 'Cut and ready — renaming now only changes file names.' : '',
          'On a phone, ZIP or Share is easiest.',
          exported ? `Last downloaded ${new Date(exported.at).toLocaleString()}.` : '',
        ]
          .filter(Boolean)
          .join(' ')}
      </p>
    </section>
  `;
}
