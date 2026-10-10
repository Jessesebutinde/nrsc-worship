This repo holds two church media apps: **SongCut** (below) and **[Lyric Slides](#lyric-slides)**, the lyrics and
scripture screen for the hall TV.

# SongCut

A phone-friendly web app that cuts the worship songs out of a church service recording.

1. Paste the service's YouTube link and choose how much to scan (first 40 min, first 60 min or the full service).
2. Your computer (the SongCut worker) downloads the audio and finds the songs. The app only creates the job and shows
   its progress. If that video and window were already done, the result opens instantly.
3. Listen, fix the cut points, split medleys and name the songs.
4. Export the selected songs as separate audio files, plus a list of times and names.

## Using it

- **Getting around.** The player bar has skip buttons for ±30 s, ±1 min and ±2 min, plus ±10 s around the play
  button. Tap the timeline to jump anywhere. On a computer, Space plays or pauses, ←/→ skip 30 s, and Shift+←/→ skip
  2 min. In **Name all**, +30s, +1m and +2m skip ahead within the current song.
- **Fixing cuts.** Tap **Fix cuts** on a song to nudge the start and end (±0.2 s, ±1 s or ±5 s), type a time, set
  either one to the playhead, or tap the waveform around the cut. **▶ Hear the end** plays the last seconds and stops
  exactly at the cut.
- **Medleys.** Inside **Fix cuts**, tap **Split at 9:49** to split at a point the backend suggested (from `medley_at`).
  You can also pause where the next song begins and tap **Split at playhead**. The new part is never named for you.
  Use **⋯ → Join with next song** to undo a wrong split.
- **Naming** (nothing is ever renamed unless you choose it):
  - Tap a song's name to type it. Suggestions appear underneath: tap one, or use ↑/↓ and Enter (Tab takes the top
    one). A "✓ saved" confirmation pops up, and every rename can be undone from the toast.
  - **Name all** walks through every song: it plays each one, you type a name and press Enter for the next.
  - **Paste setlist** takes a list straight from WhatsApp or another chat. It strips numbering, emoji, chat
    timestamps, keys like "(Key of G)" and, if you want, the artist. It then shows which title goes to which song
    before you tap **Apply**.
  - **Song library** remembers every name you use. Suggestions are ranked by how often you used a name, and moved up
    when the tempo or key is close to when you used it before. That's only a hint and is never applied
    automatically. You can export and import the library to move it between your phone and computer.
  - Section clips (chorus, verse, and so on) take the song title: "Way Maker - Chorus 2". Empty names become
    "Song N". File names come from the titles, e.g. `03 - Way Maker.m4a`.
- **Export.** Pick a preset (the size estimate updates live), or choose **Custom**:
  - **Original**: an exact copy of the audio, with no quality loss. It's instant.
  - **MP3**: 64–320 kbps. Plays everywhere. Encoded on your device by LAME, which runs in a Web Worker.
  - **AAC (.m4a)**: 64–256 kbps, using the browser's own encoder where it has one (Chrome or Edge on Windows, Mac or
    Android).
  - **Opus**: 24–160 kbps. The smallest files for the quality, and good for WhatsApp. Uses the browser's encoder.
  - **FLAC**: lossless, at about half the size of WAV.
  - **WAV**: uncompressed.
  - Optional **mono**, and **numbered** file names.

  Each file shows a meter with its stage (Downloading, Decoding, Encoding) and a percentage. An overall meter shows
  the time left, and there's a Cancel button. You can then **Save** each file, **Download ZIP**, or **Share…**.
  **Times & names (.txt)** and **Copy list** give you the setlist with times. If you rename a song after exporting,
  only the file's small tag header is rebuilt. Nothing is cut or encoded again.
- **Saving.** Names, cut changes and splits are saved on this device, so a refresh doesn't lose them.
- **When a job fails,** the app shows the error. You can then pick a local audio or video file, and the songs are found
  in the browser on your device. Nothing is uploaded. You can also start this from the home page.

## How the cutting works

The worker stores AAC audio in `.m4a` files. The app reads the file's sample table with HTTP Range requests and copies
the AAC frames for each song into a new `.m4a`, adding an edit list so the cut lands on the exact sample. Nothing is
re-encoded, so quality is unchanged, cutting is instant, and a song only downloads its own few MB. Titles, track
numbers and the service name are written into each file's tags.

| Source                     | Exported as | Cut accuracy             |
| -------------------------- | ----------- | ------------------------ |
| M4A / MP4 (AAC), fragmented too | `.m4a`  | sample-exact             |
| MP3                        | `.mp3`      | frame (≈26 ms; never cuts early) |
| WAV                        | `.wav`      | sample-exact             |
| anything else (WebM, OGG…) | `.wav`      | decoded in the browser first (uses more memory) |

Song finding for local files (`src/analysis`) decodes the audio in 60-second chunks at 11 kHz. It looks for talking and
silence, for quiet dips that line up with a change of harmony, and estimates tempo and key. On two real 40-minute
services its boundaries came within a few seconds to about 30 s of the backend's, and its tempos within 1 BPM. Results
are marked as estimates (`~117 BPM`). It never invents song titles or fingerprint matches.

## Backend contract

- Jobs live on Jesse's box computer (SQLite + local audio), exposed as a public HTTPS API via a Cloudflare tunnel.
  Base URL is `SONGCUT_API_BASE` in `src/config.js` (also written on the box to `/workspace/songcut/public-api-url.txt`).
- The browser only **POSTs** `{ youtube_url, scan_window }` (`'40' | '60' | 'full'`) to `/api/jobs` and **GETs** job
  status / Recent. It never updates or deletes.
- Audio is served from `/audio/...` on the same API host. The app may `HEAD` the file for size when `Content-Range`
  is hidden cross-origin.
- A song name only appears as a suggestion if the backend sends a real `label` (not "Song 1"). Fingerprint matches are
  never shown unless the backend sends them.
- If the Cloudflare quick-tunnel URL rotates, update `SONGCUT_API_BASE` and push to `main` (Pages redeploys).

# Lyric Slides

Lyrics and scripture on the 86″ hall TV, in the Namasuba screen style: big, calm and readable from the back of the
hall. It has two pages:

- **Screen** (`lyrics/screen.html`): open it fullscreen in Chrome on the hall PC. It draws a fixed 1920×1080 picture
  and scales it to any resolution. It shows no controls, keeps the PC awake, and comes back by itself after a refresh
  or a dropped connection.
- **Remote** (`lyrics/`): phone-first. Pick a song or a passage, tap a slide or swipe the preview, and use **Clear**,
  **Black** and **Logo**.

Live at **https://jessesebutinde.github.io/nrsc-worship/lyrics/** (remote) and `…/lyrics/screen.html` (screen).

## Sunday setup

1. On the hall PC open `screen.html` and press **F** for fullscreen. A six-letter code shows in the corner.
2. On the remote enter that code. To run everything from one laptop, tap **Open a screen window** instead, drag the
   window to the TV and press **F**.
3. The screen's keyboard works too: Space or → next, ← back, **B** black, **C** clear, **L** logo, **V** pick a
   background video file on that PC.

Without a cloud project, the remote and the screen must be in the same browser on one computer (they talk through a
`BroadcastChannel`). To drive the hall PC from a phone, create a Supabase project, run `supabase/lyric_slides.sql`,
and put the URL and anon key in `src/lyrics/config.js`. The two pages then also talk through Supabase Realtime
broadcast on a channel named after the code. The remote keeps your last change and sends it when the connection
comes back. The media team signs in with an emailed link (add their emails to `lyric_team`) to share one song
library. Otherwise songs are kept on each device and move between devices with **Export songs** and **Import songs**.

## Songs

- In the editor, type or paste the lyrics. Put a blank line between slides and a label like `[Chorus]` before each
  section. **Auto-split** makes 2-line slides (3 only in a chorus) of about 22 characters per line. It breaks where a
  singer breathes (after commas, never on "and", "the", "mu", "nga"…) and never splits a word. Slides that already fit
  are left alone.
- The preview shows the slide under the cursor exactly as the TV will. A slide is flagged if a line would wrap on the
  TV (measured in the real font at the real size) or has too many lines. Sizes never shrink to fit.
- **Spelling** underlines words not found in the Luganda 1968 Bible, the KJV or your other songs, and offers a
  one-tap fix. **It's right** teaches it a word.
- Each song has a look:

| Look | Style | Text | Position | Change |
| --- | --- | --- | --- | --- |
| Worship (default) | Hillsong-style | Montserrat 500, 130 px, mixed case | centre 74% down; title top-right on slide 1 | 400 ms crossfade |
| Praise | Elevation-style | Montserrat 800, 125 px, CAPS | centre 70% down; no title | 200 ms fade |
| Classic | Namasuba | Montserrat 600, 140 px | dead centre; gold song tag | fade + 24 px rise, 70 ms stagger |

A new song opens with a 2-second title card (title and "Namasuba Redeemed"). Backgrounds: **Glow** (slow purple and
gold), **Bokeh**, **Light leaks**, **Video loop** (a URL, or press V on the screen PC), and **Key**. Key is pure black
with a dark band at the bottom, for luma keying over the live camera in the ATEM Mini Pro. **Calm mode** (and the
system's reduced-motion setting) turns everything into plain crossfades.

## Scripture

Type `Zabbuli 23:1-4`, `Psalm 23`, `Yk 3:16` or `1 Yokaana 1:9`. Luganda and English book names and short forms all
work. The screen stacks the two languages: the reference in gold caps, the Luganda text large, and the English
smaller and dimmed below, with a thin gold bar at the left. It shows one verse per slide. A verse too long for 3 lines
splits into 2a / 2b at a natural pause, with both languages split at the same point.

Two versions are built in: **Luganda 1968** and the **KJV** (public domain). They are stored as one small JSON file
per book in `lyrics/bibles/`, so the remote downloads only the book it needs. Other versions can be imported in
Settings (VPL lines like `PSA 23:1 text`, tab separated, USFM, JSON or Bible XML). An imported version stays on that
device. To rebuild a built-in one:

```sh
node scripts/build-bible.mjs LugandaBible.xml lyrics/bibles/lug68 --lug68
node scripts/build-bible.mjs eng-kjv_vpl.txt lyrics/bibles/kjv --kjv     # from ebible.org/Scriptures/eng-kjv_vpl.zip
```

`--lug68` repairs stray markup in the source file: seven verses in Amos had lost the name "Amosi", and Exodus 5:14
had a `>` inside a word. The 1968 text is © United Bible Societies 1968, British and Foreign Bible Society, and The
Bible Society of Uganda.

## Livestream

- `screen.html?room=CODE&mode=lowerthird`: 64 px subtitles on a dark band in the bottom third, with a transparent
  background. Use it as an OBS Browser Source (1920×1080).
- `screen.html?room=CODE&transparent=1`: the full layout with no background.

**Settings** has copy buttons for these links.

# Running and deploying

There's no build step: it's static HTML plus ES modules, with Preact and htm vendored in `vendor/`. Lyric Slides
bundles Montserrat (SIL Open Font License) in `lyrics/fonts/`, so the screen works offline.

```sh
npm start        # serves on http://localhost:8080
npm test         # unit tests (the audio tests use ffmpeg if it's installed)
```

`.github/workflows/pages.yml` runs the tests on every push. On `main` it also publishes the site to the `gh-pages`
branch, which GitHub Pages serves at **https://jessesebutinde.github.io/nrsc-worship/**. You can add the site to your
phone's home screen.
