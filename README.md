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

Lyrics, scripture, pictures and video on the 86″ hall TV and on the livestream, in the Namasuba screen style: big,
calm and readable from the back of the hall. Live at **https://jessesebutinde.github.io/nrsc-worship/lyrics/**.

## Sunday on the laptop

On a laptop the remote is a console: songs, scripture and media on the left, the live slide with **Next** /
**Back** in the middle, and what the **TV** and the **stream** show on the right. Keys: Space or → next, ← back,
**B** black, **C** clear, **L** logo.

1. Open the link in Chrome or Edge. There is no code or password: the console opens straight away.
2. Plug the laptop's **HDMI into the ATEM** and join the **TV as a wireless display** (Windows: **Windows + K**,
   pick the TV, **Extend**; Mac: **Screen Mirroring**, pick the TV, **Use As Separate Display**). Set both to
   *extend*, not mirror.
3. The first time, click **Allow the browser to see your displays** in the right column. The console then names a
   display for each output (it reads the names: "ATEM" or "HDMI" goes to the stream, "TV" or "wireless" to the TV)
   and remembers the choice. Change either with its **on** list, or **⇄ Swap TV and ATEM**.
4. Click **TV picture** and **Stream feed**. Each window arrives fullscreen on its display and shows a big
   **TV** or **STREAM FEED** badge for five seconds, so a mix-up is obvious at once. The two are never confused:
   the TV window is always the TV layout and the stream window always the stream layout, whichever display
   they land on.

A window that cannot arrive fullscreen (an older browser, or a window dragged by hand) goes fullscreen on the
first click. Both outputs follow the laptop directly, so nothing depends on the internet. A phone can join as a
second remote (**More ways** → scan the QR code); that one goes through the relay. On a narrow window or a phone
the remote shows tabs instead of columns, with the same buttons under **Show on TV**.

## Words that use the screen

By default the words **grow to fill the TV**: each slide is measured in the real font and sized as large as fits
(up to 300 px for lyrics, 1.8× for scripture), never smaller than the standard size unless a line would otherwise
be cut off. A lyric slide whose long lines hold it back is re-broken into three or four shorter lines when that
makes the letters clearly bigger. Lyrics show in **capital letters**; scripture keeps sentence case. Both are
switches in Settings → Words. The stream feed keeps its fixed lower-third sizes.

## Looks

A song shows with one of seven looks. The first three are the Namasuba standard on the TV background; the other
four bring their own moving environment and type, after the lyric videos the team likes:

| Look | Type | Environment |
| --- | --- | --- |
| Worship | Montserrat Medium, mixed case | the TV background |
| Praise | Montserrat ExtraBold capitals | the TV background |
| Classic | Montserrat SemiBold, gold song tag | the TV background |
| Poster | chunky coral capitals (Anton) on a cream band, edge to edge | a grainy stage: warm and cool light, haze, film grain |
| Sunshine | white block capitals with a long shadow, a green diamond behind, the title in spaced caps | sunny woodgrain drifting, a teal corner |
| Lines | light teal capitals, wide spacing | teal line-art curves breathing on navy |
| Beams | glowing cyan capitals | cyan light beams sweeping, scanlines, a lit floor |

Pick a look per song in the editor, or force one for every song with the chips under the live slide (**Song's
own** goes back). The four environments are also in Settings → TV background, so scripture can use them too.
By default a look brings its environment; Settings → Words can keep the TV background under every look instead.
The stream feed ignores looks and keeps its lower third.

For the "two words on the screen" style, the editor's **Big slides** button breaks a song into one short burst
per slide (1, 2 or 3 words; a comma or full stop ends a slide early). With fill mode the burst grows to the
width of the screen.

## Emphasis: tap a word

Under the live slide, **Emphasis** lists every word on the current slide (Luganda and English for scripture).
Pick a pen (gold, coral, teal or white, and **Bend** to slant the word) and tap a word: it changes on the TV
and in the stream's lower third at once. Tapping it again with the same pen takes the mark off; **Clear slide**
and **Clear all** remove them. Marks stay while you step back and forth through the passage and go when a new
song or passage is shown.

## Light on the laptop

The console's three previews are still pictures: no environment motion, no blur. Motion runs only on the TV and
stream windows, where it is rendered on the graphics chip (transforms only; the light beams are blurred at a
quarter of the size and scaled up). **Calm mode** in Settings turns motion off on the outputs as well.

## Illustrations beside the words

In **Media**, **Beside the words** puts a picture or video next to the lyrics or scripture on the TV: a map, a
drawing, a photo. The words move left and the picture takes a **Small**, **Half** or **Large** panel on the right
(the controls sit above the slide list in Live, with **Remove**). The stream feed never shows it; the ATEM keeps
the words only.

## The stream feed (ATEM / Blackmagic)

**Open the stream feed** on the sheet gives a second picture made for the switcher: by default **lower thirds on
black**, so the ATEM keys it over the live camera (the gold reference tab, the verse, and the English below it;
lyrics centred). Set it up once in ATEM Software Control: HDMI from that display into a spare input, **Upstream
Key 1 → Luma**, fill and key source both that input, clip about 10%, gain about 50%, then **KEY 1** on air. The
steps are also on the sheet. In Settings the feed can switch to the **full-screen** layout, or show the TV's
background instead of black. OBS gets a transparent browser-source link.

## Scripture

Type `Zabbuli 23:1-4`, `Psalm 23`, `Yk 3:16` or `1 Yokaana 1:9`; Luganda and English book names and short forms all
work. The TV stacks the two languages: reference in gold caps, Luganda large, English smaller and dimmed below, a
thin gold bar at the left. By default the text **continues across slides at the same size until it ends**: short
verses share a slide (with small verse numbers), and a verse too long for three lines splits at a natural pause,
both languages at the same point (23 : 4a, 23 : 4b). Every slide is measured in the real font at the real size, so
nothing ever shrinks or wraps. Turn **Continue the text** off for one verse per slide.

Two versions are built in: **Luganda 1968** and the **KJV**. They are stored as one small JSON file per book in
`lyrics/bibles/`, so the remote downloads only the book it needs. Other versions can be imported in Settings (VPL
lines like `PSA 23:1 text`, tab separated, USFM, JSON or Bible XML); an import stays on that device. To rebuild:

```sh
node scripts/build-bible.mjs LugandaBible.xml lyrics/bibles/lug68 --lug68
node scripts/build-bible.mjs eng-kjv_vpl.txt lyrics/bibles/kjv --kjv     # from ebible.org/Scriptures/eng-kjv_vpl.zip
```

`--lug68` repairs stray markup in the source file (seven verses in Amos had lost the name "Amosi"; Exodus 5:14 had
a `>` inside a word). The 1968 text is © United Bible Societies 1968, British and Foreign Bible Society, and The
Bible Society of Uganda.

## Pictures and video

The **Media** tab shows two sets:

- **In the app's folder**: anything in `lyrics/media/` on GitHub. Add files there (jpg, png, webp, svg, mp4,
  webm…), run `npm run media` (the deploy does it too), and every remote sees them.
- **On this device**: files added from the phone or laptop (kept in the browser), or pasted links. Files added
  here reach only screens open in the same browser; use the folder or a link for a TV on another device.

Tap a picture or video to show it, or **Select several** for a set you step through. Each item goes to
**TV + stream**, **TV only** or **Stream only**, so a video can play in the hall while the stream keeps the camera,
or the other way round. Videos play with sound; **Loop video** repeats one.

## Songs

- In the editor, type or paste the lyrics. Put a blank line between slides and a label like `[Chorus]` before each
  section. **Auto-split** makes 2-line slides (3 only in a chorus), breaking where a singer breathes (after commas,
  never on "and", "the", "mu", "nga"…) and never inside a word. Slides that already fit are left alone.
- The preview shows the slide under the cursor exactly as the TV will. A slide is flagged if a line would wrap on
  the TV (measured in the real font) or has too many lines. Sizes never shrink to fit.
- **Spelling** underlines words not found in the Luganda 1968 Bible, the KJV or your other songs, and offers a
  one-tap fix. **It's right** teaches it a word.
- Each song has a look:

| Look | Style | Text | Position | Change |
| --- | --- | --- | --- | --- |
| Worship (default) | Hillsong-style | Montserrat 500, 130 px, mixed case | centre 74% down; title top-right on slide 1 | 400 ms crossfade |
| Praise | Elevation-style | Montserrat 800, 125 px, CAPS | centre 70% down; no title | 200 ms fade |
| Classic | Namasuba | Montserrat 600, 140 px | dead centre; gold song tag | fade + 24 px rise, 70 ms stagger |

A new song opens with a 2-second title card. TV backgrounds: **Glow** (slow purple and gold), **Bokeh**, **Light
leaks**, **Video loop** (a link, or press V on the screen PC) and **Key** (black, for keying the TV picture itself).
**Calm mode** and the system's reduced-motion setting turn everything into plain crossfades.

Songs are kept on each device and move between devices with **Export songs** / **Import songs**. With a Supabase
project in `src/lyrics/config.js` (run `supabase/lyric_slides.sql`), the media team signs in with an emailed link
and shares one library, and the project's Realtime replaces the public relay.

## How the relay works

`src/lyrics/config.js` lists public MQTT brokers (EMQX, then HiveMQ as a fallback). The remote and every screen
subscribe to one fixed channel, `nrsc/lyric-slides/<ROOM>` (`ROOM` in `config.js`), so nobody types a code. The
state is published as a retained message, so a late screen gets it immediately. Anyone who knows the channel name
could push text to the screens, and nothing but the current slide travels. To keep a session separate, add
`?room=NAME` to both the remote and the screen links. Set `RELAY_URLS` to `[]` to keep everything inside one browser. The relay was built to
the MQTT 3.1.1 spec and tested against a fake broker; the live brokers could not be reached from the build
sandbox, so the first real test is yours.

# Running and deploying

There's no build step: it's static HTML plus ES modules, with Preact and htm vendored in `vendor/`. Lyric Slides
bundles Montserrat and Anton (both SIL Open Font License) in `lyrics/fonts/`, so the screen works offline.

```sh
npm start        # serves on http://localhost:8080
npm test         # unit tests (the audio tests use ffmpeg if it's installed)
```

`.github/workflows/pages.yml` runs the tests on every push. On `main` it also publishes the site to the `gh-pages`
branch, which GitHub Pages serves at **https://jessesebutinde.github.io/nrsc-worship/**. You can add the site to your
phone's home screen.
