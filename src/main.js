import { html, render, useState, useEffect, useMemo, useRef } from './ui/h.js';
import { ProgressBar, toast } from './ui/common.js';
import { Editor } from './ui/editor.js';
import { WINDOWS } from './config.js';
import { youtubeId, canonicalUrl } from './youtube.js';
import { createJob, findJobs, getJob, getJobs, listReady } from './supabase.js';
import {
  loadPrefs,
  savePrefs,
  loadEdits,
  loadRecentCache,
  saveRecentCache,
  loadMyJobs,
  rememberMyJob,
  storageWorks,
} from './store.js';
import { HttpSource, BlobSource } from './media/source.js';
import { openMedia } from './media/media.js';
import { decodeAudio } from './media/decode.js';
import { analyzeMedia } from './analysis/local.js';
import { fmtDate, fmtTime } from './util.js';

const ACTIVE = new Set(['queued', 'downloading', 'analyzing']);
const windowLabel = (w) => (WINDOWS.find((x) => x.value === w) || { label: w }).label;

// A picked local file survives navigation (not a refresh) through this.
let pendingFile = null;

// ------------------------------------------------------------------ routing

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = h.split('?');
  const parts = path.split('/').filter(Boolean);
  return { name: parts[0] || 'home', id: parts[1] ? decodeURIComponent(parts[1]) : null, query: new URLSearchParams(query) };
}

export function go(hash) {
  if (location.hash !== hash) location.hash = hash;
}

function useRoute() {
  const [route, setRoute] = useState(parseHash);
  useEffect(() => {
    const on = () => {
      setRoute(parseHash());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

function App() {
  const route = useRoute();
  let page;
  if (route.name === 'job' && route.id) page = html`<${JobPage} key=${route.id} id=${route.id} />`;
  else if (route.name === 'local') page = html`<${LocalPage} window=${route.query.get('window') || loadPrefs().window} />`;
  else page = html`<${Home} />`;
  return html`
    <div class="app">
      <nav class="topbar">
        <a href="#/" class="brand" aria-label="SongCut home"><span class="logo" aria-hidden="true">♪</span> SongCut</a>
        ${route.name !== 'home' && html`<a href="#/" class="back">‹ All services</a>`}
      </nav>
      <main>${page}</main>
    </div>
  `;
}

// --------------------------------------------------------------------- home

function Home() {
  const [url, setUrl] = useState('');
  const [win, setWin] = useState(() => loadPrefs().window);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [recent, setRecent] = useState(() => loadRecentCache());
  const [recentErr, setRecentErr] = useState(null);
  const [active, setActive] = useState([]);
  const fileRef = useRef(null);

  useEffect(() => {
    listReady(25)
      .then((rows) => {
        setRecent(rows);
        saveRecentCache(rows.map(({ songs, ...r }) => ({ ...r, songCount: (songs || []).length })));
        setRecentErr(null);
      })
      .catch((e) => setRecentErr(e.message));
    const mine = loadMyJobs();
    if (mine.length) {
      getJobs(mine.slice(0, 10))
        .then((rows) => setActive(rows.filter((r) => ACTIVE.has(r.status))))
        .catch(() => {});
    }
  }, []);

  async function start(e) {
    e.preventDefault();
    setErr(null);
    const id = youtubeId(url);
    if (!id) {
      setErr("That doesn't look like a YouTube link. Paste the link to the service video or live stream.");
      return;
    }
    savePrefs({ ...loadPrefs(), window: win });
    setBusy(true);
    try {
      // Same video and window already done (or running)? Open it instead.
      let existing = [];
      try {
        existing = (await findJobs(id, win)).filter((r) => youtubeId(r.youtube_url) === id);
      } catch {
        /* lookup is only a shortcut */
      }
      const ready = existing.find((r) => r.status === 'ready' && r.audio_url);
      if (ready) {
        toast('Already done — opened instantly');
        go(`#/job/${ready.id}`);
        return;
      }
      const running = existing.find((r) => ACTIVE.has(r.status) && Date.now() - new Date(r.created_at) < 3 * 3600e3);
      if (running) {
        toast('Already in progress');
        go(`#/job/${running.id}`);
        return;
      }
      const job = await createJob(canonicalUrl(id), win);
      let jobId = job && job.id;
      if (!jobId) {
        const again = (await findJobs(id, win)).filter((r) => youtubeId(r.youtube_url) === id);
        jobId = again[0] && again[0].id;
      }
      if (!jobId) throw new Error('The job was created but could not be found. Refresh and check Recent.');
      rememberMyJob(jobId);
      go(`#/job/${jobId}`);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }

  return html`
    <section class="card hero">
      <h1>Cut the worship songs from a service</h1>
      <form onSubmit=${start} class="new-job">
        <label for="yt" class="label">YouTube link</label>
        <div class="row">
          <input
            id="yt"
            class="grow"
            type="url"
            inputmode="url"
            autocomplete="off"
            placeholder="https://www.youtube.com/live/…"
            value=${url}
            onInput=${(e) => setUrl(e.currentTarget.value)}
          />
          ${navigator.clipboard &&
          navigator.clipboard.readText &&
          html`<button type="button" class="btn" onClick=${async () => {
            try {
              setUrl((await navigator.clipboard.readText()).trim());
            } catch {
              toast('Paste blocked — long-press the box and choose Paste');
            }
          }}>Paste</button>`}
        </div>
        <div class="label">How much of the service to scan</div>
        <div class="seg" role="radiogroup" aria-label="Scan window">
          ${WINDOWS.map(
            (w) => html`<button
              type="button"
              role="radio"
              aria-checked=${win === w.value}
              class=${win === w.value ? 'on' : ''}
              onClick=${() => setWin(w.value)}
            >
              ${w.label}
            </button>`,
          )}
        </div>
        ${err && html`<p class="error">${err}</p>`}
        <button class="btn primary wide" type="submit" disabled=${busy || !url.trim()}>
          ${busy ? 'Starting…' : 'Find the songs'}
        </button>
        <p class="muted small">
          Your computer does the downloading, so it needs to be on with the SongCut worker running. About a minute for 40
          minutes of service. Services you've done before open instantly.
        </p>
      </form>
    </section>

    ${active.length > 0 &&
    html`<section class="card">
      <h2>In progress</h2>
      <ul class="recent">
        ${active.map(
          (j) => html`<li key=${j.id}>
            <a href=${`#/job/${j.id}`}>
              <div class="r-title">${j.title || j.youtube_url}</div>
              <div class="muted small">${j.stage || j.status} · ${Math.round(j.progress || 0)}%</div>
            </a>
          </li>`,
        )}
      </ul>
    </section>`}

    <section class="card">
      <h2>Recent services</h2>
      ${recentErr && html`<p class="muted small">Couldn't refresh (${recentErr}). Showing what this device remembers.</p>`}
      ${!recent.length && !recentErr && html`<p class="muted">Finished services will show up here.</p>`}
      <ul class="recent">
        ${recent.map((j) => {
          const edits = loadEdits(j.id);
          const count = j.songs ? j.songs.length : j.songCount;
          const named = edits && edits.songs ? edits.songs.filter((s) => s.name).length : 0;
          const total = edits && edits.songs ? edits.songs.length : count;
          return html`<li key=${j.id}>
            <a href=${`#/job/${j.id}`}>
              <div class="r-title">${j.title || j.youtube_url}</div>
              <div class="muted small">
                ${fmtDate(j.created_at)} · ${windowLabel(j.scan_window)} · ${total ?? '?'} song${total === 1 ? '' : 's'}
                ${named ? html` · <span class="ok">${named} named</span>` : ''}
              </div>
            </a>
          </li>`;
        })}
      </ul>
    </section>

    <section class="card subtle">
      <h2>Have the audio already?</h2>
      <p class="muted">Pick an audio or video file and the songs are found right here on this device — no computer needed.</p>
      <button class="btn" onClick=${() => fileRef.current.click()}>Choose a file…</button>
      <${FileInput} inputRef=${fileRef} onFile=${(f) => {
        pendingFile = f;
        go(`#/local?window=${win}`);
      }} />
    </section>
    ${!storageWorks() &&
    html`<p class="error small">This browser is blocking storage, so names won't be remembered after a refresh.</p>`}
  `;
}

function FileInput({ inputRef, onFile }) {
  return html`<input
    type="file"
    hidden
    ref=${inputRef}
    accept="audio/*,video/*,.m4a,.mp3,.wav,.aac,.webm,.ogg,.opus,.flac,.mp4,.mov"
    onChange=${(e) => {
      const f = e.currentTarget.files[0];
      e.currentTarget.value = '';
      if (f) onFile(f);
    }}
  />`;
}

// ---------------------------------------------------------------------- job

function JobPage({ id }) {
  const [job, setJob] = useState(null);
  const [err, setErr] = useState(null);
  const [lastChange, setLastChange] = useState(Date.now());
  const sig = useRef('');
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let alive = true;
    let timer = 0;
    const poll = async () => {
      try {
        const j = await getJob(id);
        if (!alive) return;
        if (!j) {
          setErr('This job was not found.');
          return;
        }
        setErr(null);
        const s = `${j.status}|${j.progress}|${j.stage}`;
        if (s !== sig.current) {
          sig.current = s;
          setLastChange(Date.now());
        }
        setJob(j);
        if (ACTIVE.has(j.status)) timer = setTimeout(poll, document.hidden ? 6000 : 2000);
      } catch (e) {
        if (!alive) return;
        setErr(e.message);
        timer = setTimeout(poll, 5000);
      }
    };
    poll();
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      alive = false;
      clearTimeout(timer);
      clearInterval(clock);
    };
  }, [id]);

  const loadMedia = useMemo(() => {
    if (!job || job.status !== 'ready' || !job.audio_url) return null;
    const url = job.audio_url;
    return () => new HttpSource(url).open().then((src) => openMedia(src, { decode: decodeAudio }));
  }, [job && job.status, job && job.audio_url]);

  if (!job) {
    return html`<section class="card">
      ${err ? html`<p class="error">${err}</p>` : html`<p class="muted">Loading…</p>`}
    </section>`;
  }

  if (job.status === 'ready' && job.audio_url) {
    return html`<${Editor}
      key=${job.id}
      jobKey=${job.id}
      title=${job.title}
      link=${job.youtube_url}
      subtitle=${`${windowLabel(job.scan_window)} · ${fmtDate(job.created_at)}`}
      audioSrc=${job.audio_url}
      loadMedia=${loadMedia}
      detected=${job.songs || []}
      duration=${job.duration_s}
    />`;
  }

  if (job.status === 'failed' || job.status === 'ready') {
    return html`<${FailedView} job=${job} />`;
  }

  return html`<${ProgressView} job=${job} err=${err} stalled=${now - lastChange} />`;
}

const STEPS = [
  ['queued', 'Waiting for your computer'],
  ['downloading', 'Downloading the audio'],
  ['analyzing', 'Finding the songs'],
  ['ready', 'Ready'],
];

function ProgressView({ job, err, stalled }) {
  const idx = STEPS.findIndex(([s]) => s === job.status);
  return html`
    <section class="card">
      <h1 class="svc-title">${job.title || 'New service'}</h1>
      <div class="muted small">${windowLabel(job.scan_window)} · <a href=${job.youtube_url} target="_blank" rel="noopener">${job.youtube_url}</a></div>
      <ol class="steps">
        ${STEPS.map(
          ([s, label], i) => html`<li class=${i < idx ? 'done' : i === idx ? 'now' : ''}>
            <span class="step-dot">${i < idx ? '✓' : i + 1}</span>${label}
          </li>`,
        )}
      </ol>
      <${ProgressBar} value=${job.progress || 0} indeterminate=${job.status === 'queued'} />
      <p class="stage">${job.stage || '…'} ${job.status !== 'queued' ? html`<span class="muted">· ${Math.round(job.progress || 0)}%</span>` : ''}</p>
      ${job.status === 'queued' &&
      stalled > 25000 &&
      html`<div class="notice">
        <strong>Your computer hasn't picked this up yet.</strong> Make sure it's switched on, awake and the SongCut worker
        is running. The job starts as soon as it is — you can leave this page open or come back later.
      </div>`}
      ${job.status !== 'queued' &&
      stalled > 150000 &&
      html`<div class="notice">
        No progress for ${fmtTime(stalled / 1000)}. If your computer went to sleep, wake it up — the job carries on.
      </div>`}
      ${err && html`<p class="muted small">Can't reach the job server right now (${err}). Retrying…</p>`}
      <p class="muted small">You can close this page; the job keeps running on your computer and shows up under Recent.</p>
    </section>
  `;
}

function FailedView({ job }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const noAudio = job.status === 'ready';
  return html`
    <section class="card">
      <h1 class="svc-title">${job.title || 'This service'}</h1>
      <div class="error-box">
        <strong>${noAudio ? 'The job finished without audio.' : "Couldn't get the songs from YouTube."}</strong>
        <p>${job.error || 'No reason was given.'}</p>
      </div>
      <p>You can pick the service audio (or video) from this device instead. The songs are found right here; nothing is uploaded.</p>
      <div class="row wrap">
        <button class="btn primary" onClick=${() => fileRef.current.click()}>Use a local audio file…</button>
        <button class="btn" disabled=${busy} onClick=${async () => {
          setBusy(true);
          try {
            const j = await createJob(job.youtube_url, job.scan_window);
            if (j && j.id) {
              rememberMyJob(j.id);
              go(`#/job/${j.id}`);
            }
          } catch (e) {
            toast(e.message);
          } finally {
            setBusy(false);
          }
        }}>Try YouTube again</button>
      </div>
      <${FileInput} inputRef=${fileRef} onFile=${(f) => {
        pendingFile = f;
        go(`#/local?window=${job.scan_window}`);
      }} />
      <p class="muted small">Tip: if the stream was still live or is private, wait until it's public and finished, then try again.</p>
    </section>
  `;
}

// -------------------------------------------------------------- local file

function LocalPage({ window: initialWindow }) {
  const [file, setFile] = useState(pendingFile);
  const [win, setWin] = useState(initialWindow || '40');
  const [phase, setPhase] = useState(null); // {label, value}
  const [result, setResult] = useState(null); // {media, songs, key, url}
  const [err, setErr] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    pendingFile = null;
    if (!file) return;
    const ac = new AbortController();
    let url = null;
    (async () => {
      setErr(null);
      setResult(null);
      const key = `local:${file.name}:${file.size}:${file.lastModified}:${win}`;
      try {
        setPhase({ label: 'Opening the file…', value: 0 });
        const media = await openMedia(new BlobSource(file), {
          decode: decodeAudio,
          onProgress: (got, all) => setPhase({ label: 'Reading the file…', value: (got / all) * 100 }),
        });
        const limit = (WINDOWS.find((w) => w.value === win) || WINDOWS[0]).seconds;
        let songs = [];
        if (!loadEdits(key)) {
          songs = await analyzeMedia(media, {
            limit,
            signal: ac.signal,
            onProgress: (p) => setPhase({ label: 'Finding the songs…', value: p * 100 }),
          });
        }
        url = URL.createObjectURL(file);
        setResult({ media, songs, key, url, duration: Math.min(media.duration, limit) });
        setPhase(null);
      } catch (e) {
        if (!ac.signal.aborted) {
          setErr(e.message || String(e));
          setPhase(null);
        }
      }
    })();
    return () => {
      ac.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [file, win]);

  const loadMedia = useMemo(() => (result ? () => Promise.resolve(result.media) : null), [result]);

  if (result) {
    return html`<${Editor}
      key=${result.key}
      jobKey=${result.key}
      title=${file.name.replace(/\.[^.]+$/, '')}
      subtitle=${`Local file · ${windowLabel(win)} · found on this device`}
      audioSrc=${result.url}
      loadMedia=${loadMedia}
      detected=${result.songs}
      duration=${result.duration}
      estimated=${true}
    />`;
  }

  return html`
    <section class="card">
      <h1>Find songs in a local file</h1>
      <div class="label">How much to scan</div>
      <div class="seg" role="radiogroup" aria-label="Scan window">
        ${WINDOWS.map(
          (w) => html`<button type="button" role="radio" aria-checked=${win === w.value} class=${win === w.value ? 'on' : ''}
            disabled=${!!phase} onClick=${() => setWin(w.value)}>${w.label}</button>`,
        )}
      </div>
      ${file && html`<p><strong>${file.name}</strong> <span class="muted">(${(file.size / 1048576).toFixed(1)} MB)</span></p>`}
      ${phase && html`<div class="busy"><${ProgressBar} value=${phase.value} /><p class="muted small">${phase.label}</p></div>`}
      ${err && html`<p class="error">${err}</p>`}
      ${!phase &&
      html`<button class="btn primary" onClick=${() => fileRef.current.click()}>${file ? 'Choose another file…' : 'Choose a file…'}</button>`}
      <${FileInput} inputRef=${fileRef} onFile=${setFile} />
      <p class="muted small">
        M4A, MP3 and WAV are cut without re-encoding. Other formats (WebM, OGG…) work too but are decoded first, which
        needs more memory — better on a computer than a phone for long files.
      </p>
    </section>
  `;
}

render(html`<${App} />`, document.getElementById('app'));
