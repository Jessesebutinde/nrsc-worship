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

- Table `public.songcut_jobs` through Supabase's REST API with the public anon key (`src/config.js`).
- The browser only **INSERTs** `{ youtube_url, scan_window }` (`'40' | '60' | 'full'`) and **SELECTs** rows. It never
  updates or deletes.
- A song name only appears as a suggestion if the backend sends a real `label` (not "Song 1"). Fingerprint matches are
  never shown unless the backend sends them.
- Your Supabase storage doesn't expose `Content-Range` to browsers, so the app reads the file size from a `HEAD`
  request.

## Running and deploying

There's no build step: it's static HTML plus ES modules, with Preact and htm vendored in `vendor/`.

```sh
npm start        # serves on http://localhost:8080
npm test         # unit tests (the audio tests use ffmpeg if it's installed)
```

`.github/workflows/pages.yml` runs the tests on every push. On `main` it also publishes the site to the `gh-pages`
branch, which GitHub Pages serves at **https://jessesebutinde.github.io/nrsc-worship/**. You can add the site to your
phone's home screen.
