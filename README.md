This repo holds three church media apps: **SongCut** (below), **[Lyric Slides](#lyric-slides)**, the lyrics and
scripture screen for the hall TV, and **[Stage Keys](#stage-keys)**, the live keyboard rig for the KROSS 2.

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

## This console

**Settings → This console** sets how the laptop's own screen looks; the TV and the stream never change with it.
**Theme**: Midnight (the church purple, the default), Studio (graphite and amber, the least glare in a dark
hall), Daylight (light, for bright rooms and rehearsals) or Kampala (bark brown, terracotta and gold). The ☀ / ☾
button in the header switches to Daylight and back. **Layout** (laptop-wide windows): Console (library, live and
outputs side by side), Focus (a big live picture with Next / Back; the library and the outputs open from slim side
rails, Esc closes them) or Compact (tuned for 1366 × 768: the live picture beside Next / Back, a narrow outputs
column). **Font**: Montserrat, System (the laptop's own) or Serif. The choice is kept on this laptop only.

## Words that use the screen

By default the words **grow to fill the TV**: each slide is measured in the real font and sized as large as fits
(up to 300 px for lyrics, 1.8× for scripture), never smaller than the standard size unless a line would otherwise
be cut off. A lyric slide whose long lines hold it back is re-broken into three or four shorter lines when that
makes the letters clearly bigger. Lyrics show in **capital letters**; scripture keeps sentence case. Both are
switches in Settings → Words. The stream feed keeps its fixed lower-third sizes.

## Looks

A song shows with one of thirteen looks. The first three are the Namasuba standard on the TV background; the
others bring their own moving environment and type, after the lyric videos the team likes:

| Look | Type | Environment |
| --- | --- | --- |
| Worship | Montserrat Medium, mixed case | the TV background |
| Praise | Montserrat ExtraBold capitals | the TV background |
| Classic | Montserrat SemiBold, gold song tag | the TV background |
| Poster | chunky coral capitals (Anton) on a cream band, edge to edge | a grainy stage: warm and cool light, haze, film grain |
| Sunshine | white block capitals with a long shadow, a green diamond behind, the title in spaced caps | sunny woodgrain drifting, a teal corner |
| Lines | light teal capitals, wide spacing | teal line-art curves breathing on navy |
| Beams | glowing cyan capitals | cyan light beams sweeping, scanlines, a lit floor |
| Banner | blue bold capitals on a peach band | a blue-lit stage with a twinkling truss of lights, haze, grain |
| Midnight | white bold capitals | the same blue-lit stage |
| Pixel | retro terminal capitals (VT323) with a soft glow | a dark forest of tree silhouettes, glitch blocks blinking |
| Neon | huge white capitals with a cyan glow, the title in small caps | black with a soft glow low on the screen |
| Grateful | chunky slanted capitals (Archivo Black), coral and white line by line | a grainy black-and-white crowd under a bright stage, coral at the edges |
| Film | tall white capitals (Anton) with a coral rule | dark grey film with a drifting light leak, heavy grain |

Pick a look per song in the editor, or force one for every song with the chips under the live slide (**Song's
own** goes back). The four environments are also in Settings → TV background, so scripture can use them too.
By default a look brings its environment; Settings → Words can keep the TV background under every look instead.
The stream feed ignores looks and keeps its lower third.

Every slide is at most **two lines**. Auto-split cuts where a singer breathes: after a comma or a full stop,
never after a joining word (and, of, the, is, mu, nga, ne…), never before a closing word (forever, amen), and it
keeps repeated pairs ("holy holy") and balanced halves together. Fill mode may re-break a one-line slide into two
when that makes the letters clearly bigger, never into three.

Each look moves like a lyric video, **word by word**: Worship and Classic rise, Praise snaps in, Poster's band wipes
open and each word slams down, Sunshine's words rise from under the shadow while the diamond turns in, Lines
stretches each word in, Beams flickers each word on like a lamp, Banner wipes from the left and the words drop in,
Midnight pops them in, Pixel types them, Neon blurs each word into its glow and keeps the glow breathing, Grateful
slides words in from alternate sides, Film tilts them in and draws its rule. While a slide is up the words sway a
little on their own phases and the block breathes. **How much the words play** (under the live slide and in
Settings → Words) sets the amount: Gentle (short, soft entrances), Lively (the lyric-video motion) or Playful
(words travel further, bounce on arrival, wobble while up, and the light sweeps faster), or Wild (words fly in fast from all over the screen,
spinning, and snap into place). Beside it: **Mixed fonts** (a different font on each word), **Hero word** (the longest
word swells and keeps swelling; with two lines the second line swells and the first takes the accent colour, like
GOD I'M JUST / GRATEFUL), and **Where the words sit** (centre; alternate left, right, centre slide by slide; first
line left and second right; random). All three are also in Settings → Words. Every background has film grain and a soft light sweeping
across every 14 s on top of its own motion. All of it is transforms and opacity on the outputs only; **Calm
mode**, the system's reduced-motion setting and the console's side previews use plain crossfades (the live monitor
shows the word motion over a still background).

For the "two words on the screen" style, the editor's **Big slides** button breaks a song into one short burst
per slide (1, 2 or 3 words; a comma or full stop ends a slide early). With fill mode the burst grows to the
width of the screen.

## Emphasis: tap a word

Under the live slide, **Emphasis** lists every word on the current slide (Luganda and English for scripture).
Pick a pen (gold, coral, teal or white, and **Bend** to slant the word) and tap a word: it changes on the TV
and in the stream's lower third at once. Tapping it again with the same pen takes the mark off; **Clear slide**
and **Clear all** remove them. Marks stay while you step back and forth through the passage and go when a new
song or passage is shown.

## Text size

Under the live slide, **A− / A+** sets the text size for what is up, lyrics and scripture separately: **Smaller,
Standard, Large, Larger, Huge** (tap the size name to go back to Standard). The **+** and **−** keys do the same on
the laptop. Everything stays on the screen, nothing is cut off:

- **Lyrics** already grow to the width of the screen, so Large and up let a long line wrap onto another line at a
  bigger size (Amazing Grace: 127 px at Standard, 153 Large, 178 Larger, 185 Huge), as far as the height allows.
- **Scripture** at the standard size is laid out again for the chosen size: fewer words on each slide, and bigger
  (John 3:16: 113 px at Standard, 142 Large, 154 Larger). In **Scroll** the column is simply scaled. **Many verses**
  is already as large as the screen allows, so it is unchanged; pick fewer verses per screen to go bigger.

## Follow the singer: J and F

While a song is up, tap **J** as each word is sung: that word swells a little and glows in the look's accent colour
on the TV, the words already sung stay bright and the ones still to come wait dimmer. **F** steps back a word. After
the last word of a slide, **J** moves on to the next slide and lights its first word, so you can keep tapping through
the whole song. **U** lights the next whole line at once, which is easier on fast songs. The same keys work on the TV
page (there, double-click toggles fullscreen).

Under the live slide, **Follow the singer** shows where the cursor is (word 3 of 6) with the same moves as buttons
and **Off**; in the Emphasis strip, the **▶ Follow** pen jumps the cursor to the word you tap. Changing slide any
other way (Space, the arrows, a click) starts the new slide with no word lit. In Settings → Words you can pick other
letters (kept on this laptop; Space, B, C, L and V are taken), turn off the dimming, and keep the stream's lower third
plain. Scripture is not followed word by word; it has verse by verse.

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
work. The TV shows the two languages in a serif (Source Serif 4, or Montserrat with the **Sans** switch): the
reference in small caps, the language read aloud large, the other a little smaller below. By default the text **continues
across slides at the same size until it ends**: short verses share a slide (with small verse numbers), and a verse
too long for the look's lines splits at a natural pause, both languages at the same point (23 : 4a, 23 : 4b). Every
slide is measured in the real font at the real size for the look that is up, so nothing ever shrinks or wraps. Turn
**Continue the text** off for one verse per slide.

### Many verses at once

**Verses on screen** in the Scripture tab chooses how much goes up together: **Same size** (the standard: the text
continues across screens at a fixed size), **1 verse**, or **2, 3, 4, 6, 8** verses or the **Whole passage** at once.
With a number or Whole passage, whole verses are kept together and the words take the **largest size that fits the
whole screen** for that much text: Psalm 23 in Luganda fills one screen; "Jesus wept" alone grows to fill it; four
verses in two languages come down to fit. Nothing is ever cut off or runs past the edge. Whole passage shares a long
reading evenly over a few screens (John 3:1-21 in two languages: 5 + 4 + 4 + 4 + 4 verses) so the words stay
readable across the hall. Changing the choice while a passage is up regroups it on the TV at once, on the verse being
read. With **Verse by verse** on, Next lights each verse in turn while the others stay on screen a little dimmer, and
the stream's lower third shows just the verse being read.

**Scroll** (also under Verses on screen) puts the whole passage in one long column at the standard size, each verse
with its translation right under it. **Next** glides the column up so the verse being read sits near the top of the
screen; the verses already read dim and the ones to come wait a little dimmer below. **Back** glides down again. It
always moves verse by verse (even with Verse by verse off), and the stream's lower third shows the verse being read.
Looks made for a card or ribbon (the cards, Scroll, Linen) keep a full-height card behind the column.

### Finding a passage by words or by voice

The Scripture box takes a reference (`Zabbuli 23:1-4`, `Ps 23`, `Yk 3:16`) **or a few words of the verse** in
Luganda or English: "the lord is my shep", "Mukama ye musumba", "faith is the substance". Suggestions appear as you
type, best first, with the reference in both languages and the matching words underlined; **↑ ↓** and **Enter**
pick one, **to end** shows from that verse to the end of the chapter. Old and modern English count as the same
("leads" finds "leadeth", "you" finds "thee"), and the **World English Bible** (modern English, public domain, also
a third built-in version) is always searched too, so "love is patient, love is kind" finds 1 Corinthians 13:4. The
search runs on the laptop; the books start loading in
the background when the Scripture tab opens (most-read first; all 66 in a few seconds on a good connection).

Press the **microphone** and speak: a reference ("Psalm twenty three verse one to four", "John three sixteen",
"first John chapter one verse nine", "Zabbuli amakumi abiri mu ssatu olunyiriri olusooka") appears as **Heard …**
with a Show button; anything else is searched like typed words, so saying a line of the verse brings it up. Turn on
**Put a reference on the screen as soon as it is heard** to skip the click. The mic keeps listening until you switch
it off; the language (English or Luganda) is chosen in the bar while it listens. It uses the browser's own speech
recognition: Chrome and Edge only, and Chrome sends the sound to Google to turn it into text, so it needs the
internet. Luganda recognition depends on the browser offering it.

### Scripture looks

Scripture has 33 looks of its own: 9 **pages** (the words on the environment) and 24 **cards** (the words on a card,
a book or a stone). Under the live slide, **‹ ›** steps through them and **All looks** opens a gallery of live
thumbnails; Settings → Scripture has the same controls. Changing the look lays the passage out again for it and stays
on the verse being read. A look always brings its page; on the keyed stream output the light pages turn their ink
white (cards keep their own colours).

| Pages | |
| --- | --- |
| **Ink & stone** (default) | dark stone, film grain; stacked, gold bar at the left |
| **Parchment** | aged paper; two columns, Luganda left and English right |
| **Manuscript** | book and chapter above, an illuminated drop cap carrying the verse number |
| **Dawn** | sunrise sky; stacked, gold bar |
| **Watercolour** | light wash; dark ink, rust reference (mornings, children, weddings) |
| **Chalk & slate** | green board; centred chalk, an underline between the languages |
| **Kitenge** | woven bands in Ugandan colours top and bottom |
| **Candlelight** | one warm pool of light; centred, italic English (evening, prayer, communion) |
| **Blueprint** | navy ruling and engraved circles; light serif, sans English (youth, conferences) |

| Cards | |
| --- | --- |
| **Linen card** | the language read aloud on a cream card, the other on a band below |
| **Scroll** | one verse big on a parchment ribbon (the memory verse) |
| **Twin cards** | one card per language side by side: Luganda on cream, English on a dark card, each with its own reference |
| **Card stack** | one card per language: Luganda on a large white card, English on a second card tucked below it |
| **Open Bible** | an open book on a desk: Luganda on the left page, English on the right, running heads, red verse numbers |
| **Frosted glass** | a glass card over soft aurora colours |
| **Royal** | a black card in a double gold frame with diamond corners, on velvet |
| **Marble** | white marble with a gold edge under a spotlight |
| **Cathedral** | an arched window card with a gold cross, stained-glass light and rays behind |
| **Starlight** | a midnight card with a gold hairline under a sky of stars |
| **Glory** | a white card with rays of light turning slowly behind it |
| **Jerusalem stone** | a chiselled limestone block on warm sand |
| **Still waters** | a calm teal card over deep water with moving light |
| **Mountain** | a pale card over misty mountains at first light |
| **Refiner's fire** | a charcoal card glowing at its edges, embers rising |
| **Bold** | a white card with a hard black shadow on sunny yellow |
| **Split** | an emerald panel with the book and chapter number, the words beside it |
| **Bookmark** | a page with a crimson ribbon holding the verse number |
| **Tablet** | words carved in a stone tablet at dusk |
| **Epistle** | a letter with a red margin and a wax seal (the letters of the apostles) |
| **Gallery** | a small museum card under a spotlight, the reference as its caption |
| **Aurora edge** | a black card with a glowing colour edge |
| **Papercut** | a paper card over layered paper hills |
| **Lubugo** | cream words on a panel of Ugandan barkcloth |

A card keeps its size from slide to slide and the words sit in its middle, so only the words change.

**The words.** Every verse starts with its number. Each slide's text is in “quotation marks” in the look's accent
colour (the **“Quotes”** switch). A verse that is split across slides ends with … and carries on with … on the next
one; three dots glowing slowly in the corner say the passage goes on. The English is set larger than before (about
four-fifths of the Luganda) and brighter. The TV shows a 2 s **title card** before a passage (book in both languages,
chapter and verses) in the look's type. The lower third on the stream keeps its band, the quotes and the dots, and
takes the serif.

**Motion** (under the live slide): **Gentle** lines rise in turn; **Page turn** turns the old page over from its edge
toward you and lays the new one beneath (the open Bible turns only its right-hand leaf over the spine, and a passage's
title card opens like a book cover); **Typing** writes each word in, one after another (with verse by verse, each new
verse writes itself in); **Reveal** (the default) sweeps a soft edge of light across and leaves the words behind it;
**Slide** comes in from the right and leaves to the left. Calm mode, the console's previews and reduced-motion
settings always crossfade.

**Verse by verse** (on by default): with several verses on a slide, **Next** reveals them one at a time; the verse
being read is full, the ones already read dim, the ones still to come wait unseen in their place, so nothing moves
when they arrive. **Back** retraces, and goes back to the previous slide with all its verses up. The **progress
bar** is a thin line along the bottom of the TV that fills through the passage. The status under the live slide
reads "3/8 · verse 2 of 3" while a slide is being revealed.

Three versions are built in: **Luganda 1968**, the **KJV** and the **World English Bible**. They are stored as one small JSON file per book in
`lyrics/bibles/`, so the remote downloads only the book it needs. Other versions can be imported in Settings (VPL
lines like `PSA 23:1 text`, tab separated, USFM, JSON or Bible XML); an import stays on that device. To rebuild:

```sh
node scripts/build-bible.mjs LugandaBible.xml lyrics/bibles/lug68 --lug68
node scripts/build-bible.mjs eng-kjv_vpl.txt lyrics/bibles/kjv --kjv     # from ebible.org/Scriptures/eng-kjv_vpl.zip
node scripts/build-bible.mjs eng-web_vpl.txt lyrics/bibles/web --kjv     # from ebible.org/Scriptures/eng-web_vpl.zip
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
- **Suggestions** sit under the lyrics as you type: each word that looks wrong gets a small tag showing the fix.
  Tap the tag to fix it, or its **×** if the word is right (it is not suggested again). Amber is spelling
  (`erinya` → `erinnya`, `okuyinba` → `okuyimba`, checked against the Luganda 1968 Bible and the KJV), teal is
  grammar (`na omwana` → `n'omwana`), red is punctuation (`n' essanyu` → `n'essanyu`, spaces around commas), gold
  is a capital on a sacred name (`Katonda`, `Mukama`, `Yesu`). Hover a tag for the reason. **Fix all safe ones**
  applies all but the spelling tags. It would rather miss a mistake than tag a right word: on the Psalms and John
  nearly every verse gets no tag. Words in the title and your other songs count as right.
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
bundles Montserrat, Source Serif 4, Anton, VT323 and Archivo Black (all SIL Open Font License) in `lyrics/fonts/`, so the screen works offline.

```sh
npm start        # serves on http://localhost:8080
npm test         # unit tests (the audio tests use ffmpeg if it's installed)
```

`.github/workflows/pages.yml` runs the tests on every push. On `main` it also publishes the site to the `gh-pages`
branch, which GitHub Pages serves at **https://jessesebutinde.github.io/nrsc-worship/**. You can add the site to your
phone's home screen.

# Stage Keys

A live keyboard rig that runs in the browser. Plug the KORG KROSS 2 (or any USB keyboard) into the laptop, open the
page, and the keys play the computer's sounds: Congolese **sebene** solo and mi-solo guitars and the bass under them,
Elevation / Hillsong worship pads and pianos, Nord-style splits and layers, tonewheel organs with drawbars and Leslie,
Brooklyn-style choir stacks, Billie Eilish / FINNEAS dark sounds, strings, mallets. Phrase **loops** let you play a
pattern once and keep it going under the song, and a **set list** carries a whole rig per song. Live at
**https://jessesebutinde.github.io/nrsc-worship/keys/**. Chrome or Edge (Web MIDI and AudioWorklet).

## The plan, and what is built

The rig is organised like a stage keyboard (Montage / MODX live sets, Nord programs), not like a DAW:

| Idea | How it works here |
| --- | --- |
| **Performance (rig)** | Up to 8 **parts**, each one sound with its own key range (split), velocity range, octave, MIDI channel, fader, pan and effect chain. Parts layer when their ranges overlap. |
| **Sounds** | 114 presets in 14 families, led by the sebene ones, then SA gospel, Naija praise, Afrobeats and Afrobeat, worship pads, keys, organs, choirs, leads, bass, Billie, strings, mallets, kits. Each is a program for the engine plus an effect chain; sampled, synthesised, modelled or stacked; all level-matched. |
| **Combos** | 26 ready rigs, grouped by style. Twelve are band arrangements, two per style: *Spirit of Praise: Praise Break* and *Worship*, *Naija Praise: Lagos* and *Highlife*, *Afrobeats: Lagos* and *Afrobeat: Fela*, *Elevation: Anthem Drive* and *6/8 Anthem*, *Hillsong: Anthem* and *Up-tempo*, *Billie: Soft Pop* and *Whisper Ballad*. The others: *Sebene Rig*, *Sebene Praise*, *Ndombolo Praise*, *Elevation Night*, *Hillsong Sunday*, *Nord: Piano + Pad*, *Gospel B3 + Piano*, *Brooklyn Choir Stack*… one tap loads the lot. |
| **Demos and tips** | Every sound, rig and song has a **▶ Demo** (or **▶ Hear it**) that plays it the way it is meant to be played, in its style, while the on-screen keys light up to show what each hand does, plus a short *How to play* tip. |
| **Song ideas** | Fourteen 2024-25 songs, two per style (Congolese gospel, Spirit of Praise, Nigerian praise, Afrobeats/Afrobeat, Elevation, Hillsong, Billie Eilish): key, tempo, feel, chord sections and the rig to play them on. *Hear it* plays the chorus or vamp on that rig; *Add to set list* keeps it. |
| **Macros** | Four knobs per rig, each driving any number of parameters over a range (reverb mix, filter, pad level, palm mute…). The KROSS 2 tone knobs drive them with no setup. |
| **Loops** | One phrase loop per part, Ableton-session style but MIDI: arm, play the phrase once, stop at the end; it rounds to whole bars and keeps going, quantised to 16ths, phase-locked to the tempo. Mute it for the next song, overdub, or clear. Built-in drum grooves (sebene cavacha, ndombolo, rumba, worship 4/4 and 6/8, pop) are loops on a kit part. |
| **Songs** | The set list: each song keeps its rig, tempo and loops. Next / Previous by button, arrow keys, a learned pedal or a program change from the keyboard. Old notes ring out through a change. |
| **Offline** | The app shell is cached by a service worker; sampled instruments are cached after their first download. *Settings → Download every sound in the set list* prepares a gig. |

### How the sound is made

Everything runs inside one **AudioWorklet** (`src/keys/dsp/`, plain modules that also run in Node for the tests):

- **Synth** (`voice-synth.js`): three oscillators (band-limited saw, square/pulse, triangle, sine, 7-voice super saw),
  noise, a 12/24 dB state-variable filter, two ADSRs, an LFO with tempo sync, unison/detune/spread, poly, mono and
  legato with glide, analogue drift. The worship pads, leads, Moog and 808 basses, Billie's bass.
- **Organ** (`voice-organ.js`): nine tonewheel drawbars with Hammond foldback, 2nd/3rd percussion (single-trigger),
  key click, leakage, and the scanner vibrato/chorus (V1–C3) as a part effect. Drawbars move live. The Leslie is in
  the effect chain.
- **String model** (`voice-string.js`): an extended Karplus-Strong pluck for the **sebene guitars and bass**: a pick
  burst shaped by pick position and brightness rings in a tuned loop with damping and stiffness, through a pickup tone
  and body filter. Mod wheel = palm mute (ghost notes), legato = hammer-ons, pitch bend = slides, optional doubled
  string. Level is compensated across the keyboard so the high sebene register stays strong.
- **Sampler** (`voice-sampler.js`): multisamples from the free MIDI.js soundfont sets (MusyngKite, FluidR3, FatBoy),
  Hermite interpolation, ADSR, optional filter and vibrato, and **crossfade looping** found automatically
  (`loop-detect.js`) so a 3-second choir or string clip holds for as long as the key is down.
- **Layers**: a part can stack two or three sources on one note (modelled pluck + sampled Strat, aahs + oohs + octave
  synth choir) sharing one effect chain.
- **Drums** (`voice-drums.js`): a synthesised kit (kick, snare, rim, hats, clap, congas, cowbell, shaker…) for the
  grooves and loops.
- **Voices**: a 160-voice pool, per-part polyphony with graceful stealing, sustain and half-damper, pitch bend,
  mod wheel, expression, and sample-accurate timed events so loops land exactly on the grid. Each part has a voice
  budget that counts release tails too: past it, the oldest tails fade out in about 0.2 s, so a pad or choir played
  chord after chord never piles up a hundred voices nobody can hear.

Each part then has a native Web Audio **effect chain** (`src/keys/fx.js`): compressor, drive/amp, 3-band EQ with low
cut, chorus/ensemble/flanger/phaser (with the Roland-JC "wet on one side" the soukous players use), tremolo/auto-pan,
a rotary speaker with horn/drum acceleration, a tempo-synced stereo/ping-pong delay, and a send to convolution reverb
from generated impulses (room, plate, hall, cathedral, spring, and a **shimmer** that feeds the tail back an octave up
through a granular pitch shifter). A limiter on the master keeps a big layered chord clean.

An effect that is off is unwired from the graph once its level has faded, and a part with no sound is unwired
altogether, so they cost nothing. Reverbs are shared like a workstation's system reverb: parts asking for the same
(rounded) room send into one convolver, at most three rooms run at once (past that a part joins the closest room),
and a part's send follows its fader.

### The sebene sounds

From the research into how the Kinshasa guitarists get their sound (clean Strat-type single coils, flat-picked single
lines in the top register, a touch of chorus on one side, a short echo, plate or spring reverb; fingered thumb-and-index
bass, dry and punchy, with muted ghost notes):

- **Sebene Solo** (modelled), **Sebene Solo Legato** (hammer-ons), **Sebene Solo (sampled)**, **Sebene Solo Hybrid**
  (model + sample) and **Sebene Mi-Composé** (octave-doubled, Lokassa style). Chain: compressor 3:1 → EQ (low cut
  120 Hz, −2 dB at 300 Hz, +3 dB top) → chorus 0.8 Hz wet on the right → 1/8-note echo (tempo-synced, 20 % feedback)
  → plate 1.4 s. Macro "Echo" rides the delay, macro "Mute" rides the palm mute.
- **Mi-Solo** (warmer, no echo, an octave down), **Rhythm Chop** (palm-muted chatter), **Soukous Clean JC** (for
  arpeggio cells and chords), **Likembe**.
- **Sebene Bass** (modelled, legato, wheel mutes), **Sebene Bass (poly)**, **Sebene Bass (sampled)**, **Sebene Bass
  Hybrid**, **Ndombolo Synth Bass**. Chain: compressor 4:1 → EQ (+3 dB low, +2 dB at 700 Hz, −3 dB top), no reverb.

Tempos of 120–155 bpm with a 16th feel; the *Sebene (cavacha)* groove has the kick on every beat and the snare's
accent pattern, congas, cloche and shaker.

### Band rigs, demos and the song book

The twelve band rigs come from research into how each style is played (sources in `src/keys/songbook.js` and the
grooves' comments): the cavacha snare for sebene; the SA praise bounce and 12/8 worship with a melodic lead bass,
add-9 piano off the beat, Hammond and a mass choir; Lagos praise with the agogo time-line and a talking-drum call,
and Igbo highlife with picked guitar in thirds and sixths; modern Afrobeats with the skipping rim and a sub that
follows the kick, and Tony Allen's Afrobeat pattern under a two-bar Dorian vamp with combo organ, horns and tenor
guitar; Elevation's 8th-note drive, floor-tom build and 6/8 anthems; Hillsong's half-time verse and full chorus;
Billie's dry snaps and long 808. Each rig has an arrangement (`src/keys/guide.js`): what the left hand, the right
hand and each loop part play, so the **demo plays exactly the rig you get**, through the same splits and layers.

- **Sound demos** play on a separate audition part (with a quiet backing part and drums where the sound is a lead,
  bass or rhythm part), so trying a sound never touches the rig. The editor's ▶ plays the demo on the part itself,
  with your edits.
- **Rig and song demos** load the rig and play it through the keys: watch which keys light in which colour.
- **The song book** (`src/keys/songbook.js`) holds chords, keys and tempos only, never lyrics or melodies. Facts that
  come from one source or an automatic chord estimate are marked *check by ear* in the app.

### Phones and Light sound

A phone renders audio on a much slower core than a laptop. Settings → Audio → **Sound engine** has three choices:

| Mode | What it does |
| --- | --- |
| Auto (default) | Light on phones and tablets; Full elsewhere, stepping down by itself if the sound falls behind. |
| Full | Everything, at the device's sample rate. Never steps down. |
| Light | 32 kHz, smaller voice budgets, synth unison stacks thinned to three voices, two reverb rooms. |

The worklet measures its own load and pace (audio time against the clock) about once a second. When it falls behind
for a few seconds, Auto and Light step down a level (Light, then Extra light: two-voice stacks, ten voices a part,
one reverb room, linear sample interpolation) and say so; the step is remembered for the next visit. Levels are
matched across modes and sample rates (the plucked strings normalise their pick noise to the rate), so a sound is
as loud in Light as in Full. Settings shows the mode, rate, voices and load as they are now.

### Level matching

Every sound is trimmed so its demo plays at the same loudness (about -21 dB RMS at fader 0.8, peaks under 0.9), so
switching sounds live never jumps; the trims are in `LEVEL_TRIM_DB` in `src/keys/presets.js`. They were measured by
rendering each demo offline through the real worklet and effect chains with the real samples, each part captured on
its own channels, and correcting until the loudness matched. The band rigs' part volumes were set the same way:
bass and the main keys level, drums a little under, layers and loops well under, the mix peaking below the limiter.
Sampled pianos, Rhodes, guitars, basses and mallets also get darker when played softly (velocity opens a gentle
lowpass), and every sampled or modelled note varies by a few cents and a little level, as a hand does.

## Setting up the KROSS 2

1. Connect the KROSS 2's square **USB B** port to the laptop. It is class-compliant: Windows and macOS see a
   **KROSS2 MIDI** device and a **KROSS2 audio** device without a driver. On Windows 11 24H2 or later do *not* install
   the KORG USB-MIDI driver (uninstall it if present). Windows lets one program hold the MIDI port, so close any DAW
   or Korg editor first.
2. Open the page in Chrome or Edge, press **Start the rig**, and allow MIDI.
3. On the KROSS: **GLOBAL/MEDIA → G-MIDI › BASIC**, untick **Local Control On**, then **FUNCTION › Write Global
   Setting** so it survives power-off. Now the keys play only the computer. Tick it again to layer the KROSS's own
   sounds under the rig.
4. To hear the laptop through the KROSS's outputs and headphones, choose **KROSS2 audio** under *Settings → Audio →
   Output* (Chrome 110+). The KROSS mixes it at its USB audio input.
5. The damper pedal, mod wheel, pitch bend and an expression pedal (assignable pedal → **Expression CC 11**) just work.
   The assignable switch (**Foot Switch CC 82**) can be learned for Next song, rotary slow/fast or a loop. The four
   **TONE** knobs (CC 74, 71, 73, 72) are the four macros. Program changes from the keyboard select songs (switch off in
   Settings if you change programs on the KROSS for its own sounds).

The full guide is under *Settings → KROSS 2 setup guide* in the app.

## Playing

- **Perform** shows the parts: fader with meter, mute, octave, **Edit** (sound, effects, mix & zone), **Change**
  (sound browser), ▶ to hear it. Tap a card to select it; the keyboard strip at the bottom shows every part's range
  as a band (drag a band's end to move a split) and lights the keys as you play. Esc is panic.
- **Demos**: ▶ Demo on any sound or rig, ▶ Hear it on a song idea; a bar at the bottom shows what is playing with
  ■ Stop. Esc stops it too.
- **Sounds**: families on the left, search on top. **Load** replaces the selected part; **+ Layer** adds the sound as
  a new part on the whole keyboard; **+ Left hand** / **+ Right hand** add it on one side of middle C. ★ keeps
  favourites; *Save as my sound* in the editor keeps your tweaks.
- **Loops**: Start the transport (or let the first note start it), arm a part with **● Rec**, play the phrase once
  and press **■ Done** at the end. Play/mute per part, **All loops off**, grooves per kit part, click, quantise,
  count-in. Loops are saved with the song.
- **Songs**: *Save current rig as a song*, reorder, rename, set key and tempo; **Next / Previous** on stage.
  Export/Import carries the whole set list between computers.
- **Settings**: MIDI input, audio output and latency (Normal, Low 5 ms, Lowest, Relaxed), sample quality (memory),
  master and click volume, learned controls, offline download, the typing keyboard (Z–M, Q–P) for trying sounds
  without a keyboard.

Latency on a laptop is the audio buffer plus the output path: around 10–20 ms on macOS, 20–40 ms on Windows with the
default buffer; the *Low* setting asks for the smallest buffer the device allows. A wired output is much lower than
Bluetooth.

## Tests

`npm test` runs the Node tests for the engine (`tests/keys-dsp.test.mjs`: envelopes, filters, band-limited
oscillators, loop detection, timed events, sustain, legato, stealing, layers), the state and presets
(`tests/keys-state.test.mjs`), the looper (`tests/keys-looper.test.mjs`), the sample loader
(`tests/keys-samples.test.mjs`), and what keeps it light enough for a phone (`tests/keys-perf.test.mjs`: shared
reverb rooms, effects unwired when off, voice budgets, light levels at equal loudness, string level at any rate). `npm run smoke` renders every preset through the real worklet in headless Chromium,
then opens the app, loads the Sebene Rig, plays both splits and the groove loop, and takes screenshots (`--shots`).

## Layout

```
keys/                 the page: index.html, keys.css, manifest, icon, sw.js (offline shell)
src/keys/app.js       boot: store, engine, MIDI, router, looper, views
src/keys/state.js     performance / parts / songs / settings, reducer, persistence
src/keys/engine.js    AudioContext, worklet node, part chains, master, click, device choice
src/keys/fx.js        the effect stages and impulse generator
src/keys/samples.js   soundfont download, cache, decode, loop detection → worklet;  banks.js the catalogue
src/keys/midi.js      Web MIDI input + typing keyboard;  router.js zones, channels, pedals, CC learn
src/keys/looper.js    transport, phrase loops, grooves, metronome
src/keys/presets.js   the sound library;  combos.js the rigs;  songbook.js the song ideas
src/keys/guide.js     how each sound and rig is played: demos, arrangements, tips
src/keys/music.js     chords, voicings, progressions;  phrases.js the playing roles;  demo.js the demo player
src/keys/dsp/         the engine (pure modules);  worklet/ the AudioWorklet shells
src/keys/ui/          Preact views: perform, editor, sounds, loops, songs, settings, keyboard, controls
```
