# NRSC Worship

A mobile-first web app for the worship team of **Namasuba Redeemed Society Church** (Kampala). Phase 1 covers:
- the **song database**: Luganda and English lyrics, themes, Praise or Worship, key and YouTube link;
- a simple **set-list builder** that suggests songs for Sunday's theme, with a team page and a *Share to WhatsApp* button.

It's built like [nrsc-ideas](https://github.com/Jessesebutinde/nrsc-ideas):
- static HTML pages, with no build step;
- Vercel serverless functions in `api/`;
- Supabase Postgres, used only from the server with the service key;
- a PIN-protected admin.

## Screens

| Page | Who | What |
|---|---|---|
| `/` | everyone | Song library: search titles **and lyrics**, filter by theme, Praise/Worship and language |
| `/song.html?id=…` | everyone | Lyrics with Luganda / English tabs, big adjustable text, key, YouTube link, "keep screen on" |
| `/sets.html` | everyone | Coming-up and past set lists |
| `/set.html?id=…` | everyone | One service's set list, with **Share to WhatsApp** (date, theme, songs in order) and Copy |
| `/admin.html` | admin PIN | Add/edit songs, bulk import, set-list builder, themes manager, setup check |

**Built for slow connections and Android phones**
- **Small and cacheable:** the pages are plain HTML. The CSS and JS are shared, small files that phones cache.
- **No lyrics in the library list:** the list doesn't include lyrics, so it stays small. Lyrics load only when a song is opened.
- **Instant on repeat visits:** each page shows the copy saved on the phone straight away, then refreshes it.
- **Offline:** songs you've opened work offline at church, through the service worker. The page says when it's showing a saved copy.
- **Fast reads:** public data is cached for 15 seconds at Vercel's edge.
- **Android-friendly controls:** drag-to-reorder uses touch events (Android ignores HTML drag-and-drop), and ↑ ↓ buttons are there too.

## Setup (about 10 minutes)

### 1. Supabase
1. Create a project at [supabase.com](https://supabase.com). You can reuse the nrsc-ideas project; the table names don't clash.
2. Open **SQL Editor** → **New query**, paste the whole of [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql), and click **Run**.
   - This creates the tables, adds the nine starting themes, and sets up the database functions the app calls.
   - It's safe to run again.
3. Open **Project Settings → API** and copy:
   - the **Project URL** (e.g. `https://abcd1234.supabase.co`);
   - the **service_role** key (under "Project API keys", click Reveal). Use this one, not the anon key.

### 2. Vercel
1. **Add New → Project**, import `Jessesebutinde/nrsc-worship`, and set the framework preset to **Other**. No build command is needed.
2. Under **Environment Variables**, add:

| Name | Value |
|---|---|
| `SUPABASE_URL` | the Project URL from step 1 |
| `SUPABASE_SERVICE_KEY` | the service_role key from step 1 (server-only, never shown in the page) |
| `ADMIN_PIN` | any word or number for admins, e.g. `Mukama2026`. Letters are allowed and it's case-sensitive |

3. Click **Deploy**. Open `https://<your-app>.vercel.app/api/health`: every check should say ✓.

If something is missing, every page says so in plain words, for example "The database isn't set up yet. In Supabase open SQL Editor…". `/api/health` and *Admin → Setup check* list all the checks.

### 3. Add songs
- Open `/admin.html`, enter the PIN, then use **Add song** (one at a time) or **Import** (many at once). See *Bulk import* below.
- Build a set list under **Set lists → New set list**. Save it, then press **Share to WhatsApp**.

## Bulk import

On *Admin → Import*, paste text or choose a file. **Check before importing** shows every song with ✅ / ⚠️ / ❌ and what will happen. Only then does **Import now** save anything.
- Songs with problems are left out.
- Songs whose title is already in the library are either left alone or updated with the imported details (adds themes, fills in lyrics). You choose which.

**CSV** (from Excel / Google Sheets → Download → CSV). The first row holds the column names. Commas, semicolons or tabs all work, and lyrics can span several lines inside quotes. The import page has a downloadable template.

```
title,title_alt,language,session,song_key,tempo_bpm,youtube_url,themes,lyrics_luganda,lyrics_english,notes
"Tukutendereza Yesu","We praise you Jesus",both,praise,G,,https://youtu.be/…,"Glory of God; Praise & Victory","Tukutendereza Yesu…","We praise you Jesus…",
```

Only `title` is required. Loose names work too: `key`, `bpm`, `luganda`, `english`, `lyrics`, `type`…
- `session` is praise/fast/upbeat or worship/slow. If it's missing, the song is saved as Praise, with a warning.
- `language` is luganda/lg, english/en, or both. If it's missing, it's worked out from which lyrics are filled in.
- `themes` must match existing theme names; separate them with `;`. Unknown names are reported, not created.

**Pasted text** — songs separated by a line of `---`:

```
Tukutendereza Yesu
Alt: We praise you Jesus
Session: Praise
Key: G
Themes: Glory of God, Praise & Victory

[Luganda]
Tukutendereza Yesu
Yesu Omwana gw'endiga

[English]
We praise you Jesus
---
Mwoyo Mutukuvu
Session: Worship
…
```

## Set-list builder

1. Pick the date (defaults to the coming Sunday, Kampala time) and Sunday's theme.
2. The app suggests that theme's songs, split into **Praise** (upbeat) and **Worship** (slower). Songs sung in the last three weeks go to the bottom and are marked "sung 14 days ago".
3. Tap **+ Add**. You can also search any song and add it to either section.
4. Reorder with the ⠿ handle (drag) or ↑ ↓, then **Save**. The server confirms it, then gives you the WhatsApp button and the team page link.

The WhatsApp message looks like:

```
🎶 *NRSC Worship — Sunday 4 October 2026*
Theme: *Glory of God*
Leading: Ruth

*PRAISE*
1. To God Be the Glory
2. Tukutendereza Yesu

*WORSHIP*
1. Mwoyo Mutukuvu
2. Holy, Holy, Holy

https://<your-app>.vercel.app/set.html?id=1
```

## How it's built

- `index.html`, `song.html`, `sets.html`, `set.html`, `admin.html`: the pages, each with its own small inline script.
- `shared.js`: logic shared by the pages and the API.
  - The import parser (CSV + pasted text) and song and theme validation.
  - Song suggestions, the WhatsApp text and date helpers.
  - The server loads it with `import '../shared.js'`, the same pattern as `classify.js` in nrsc-ideas.
- `ui.js`: page helpers for API calls with clear error messages, the saved-copy-then-refresh pattern, the header and toasts. `app.css` holds the styles (nrsc-ideas' purple and gold, light and dark).
- `sw.js`: offline cache. `manifest.webmanifest`: lets people "Add to Home screen".
- `api/`:
  - `_lib.js` has the Supabase call and plain-language setup errors.
  - The public endpoints are `songs.js`, `themes.js`, `sets.js` and `health.js`.
  - `admin.js` handles everything that changes data and needs `x-admin-pin`.
- `supabase/migrations/0001_init.sql`: the tables plus database functions.
  - Saving a song and its themes, or a set list and its songs, happens in one step.
  - Tables have row-level security with no public policies, and the functions can only be called with the service key.

### API

| Call | Returns |
|---|---|
| `GET /api/songs` | all songs for the library (no lyrics) |
| `GET /api/songs?q=text` | title + lyrics search: `[{ id, match, snippet }]` |
| `GET /api/songs?id=12` | one song with lyrics and themes |
| `GET /api/themes` | themes with song counts |
| `GET /api/sets` / `?id=5` | set lists / one set list with its songs |
| `GET /api/health` | setup checklist |
| `GET /api/admin` (PIN) | PIN check + when each song was last used |
| `POST /api/admin` (PIN) | `{ action }`: `song.save`, `song.delete`, `import.preview`, `import.commit`, `theme.save`, `theme.delete`, `set.save`, `set.delete` |

Errors are `{ error: code, message }`, where `message` is written for people, and form errors add `fields`. The setup codes are `no_db`, `no_tables`, `bad_key`, `db_unreachable` and `no_pin`.

## Develop and test

```bash
npm install          # only dev tools: PGlite (Postgres in WebAssembly) for tests and the demo
npm test             # shared logic + every API endpoint against the real SQL migration
npm run demo         # http://localhost:3000 with example songs, admin PIN "demo" — no accounts needed
npm run dev          # same, but against your Supabase (reads .env, see .env.example)
```

The API tests run the real handlers against the real `0001_init.sql`. They use `test/fake-supabase.mjs`, which answers Supabase's function calls from PGlite.
