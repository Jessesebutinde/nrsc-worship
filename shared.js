// Logic shared by the pages (<script src="shared.js">) and the API (import '../shared.js').
// Sets globalThis.NRSCWorship. No dependencies, no DOM.
(function (root) {
  'use strict';

  var SESSIONS = { praise: 'Praise', worship: 'Worship' };
  var SESSION_HINT = { praise: 'upbeat / fast', worship: 'slower tempo' };
  var LANGUAGES = { luganda: 'Luganda', english: 'English', both: 'Luganda & English' };
  var LIMITS = { title: 200, title_alt: 200, lyrics: 20000, notes: 2000, key: 12, theme: 60, theme_desc: 300, leader: 80, set_title: 120 };

  function str(v) { return v == null ? '' : String(v).replace(/\r\n?/g, '\n'); }
  function trim(v) { return str(v).trim(); }
  function nkey(s) { return trim(s).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ''); }

  function normSession(v) {
    var s = trim(v).toLowerCase();
    if (/^(praise|p|fast|upbeat|up-?tempo|high)$/.test(s)) return 'praise';
    if (/^(worship|w|slow|slower|low)$/.test(s)) return 'worship';
    return null;
  }

  function normLanguage(v) {
    var s = trim(v).toLowerCase().replace(/\s+/g, ' ');
    if (/^(luganda|lg|lug|ganda)$/.test(s)) return 'luganda';
    if (/^(english|en|eng)$/.test(s)) return 'english';
    if (/^(both|bilingual|mixed|lg ?[\/&+,] ?en|luganda ?(and|&|\/|\+|,) ?english|english ?(and|&|\/|\+|,) ?luganda)$/.test(s)) return 'both';
    return null;
  }

  // "g" → "G", "bb" → "Bb", "f#m" → "F#m". Free text such as "Capo 2" is kept as typed.
  function normKey(v) {
    var s = trim(v).slice(0, LIMITS.key);
    if (!s) return null;
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // Accepts youtube.com / youtu.be / music.youtube.com links, returns a clean https URL.
  function normYouTube(v) {
    var s = trim(v);
    if (!s) return { url: null };
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
    var m = s.match(/^https?:\/\/(?:www\.|m\.|music\.)?(youtube\.com|youtu\.be)\/(\S*)$/i);
    if (!m) return { error: 'Paste a YouTube link (youtube.com or youtu.be).' };
    return { url: 'https://' + (m[1].toLowerCase() === 'youtu.be' ? 'youtu.be' : 'www.youtube.com') + '/' + m[2] };
  }

  // Clean and check a song. Returns { song, errors: {field: message}, warnings: [] }.
  // `opts.lenient` (bulk import): a missing session becomes Praise with a warning.
  function validateSong(raw, opts) {
    raw = raw || {};
    opts = opts || {};
    var errors = {};
    var warnings = [];
    var song = {
      title: trim(raw.title).replace(/\s+/g, ' '),
      title_alt: trim(raw.title_alt).replace(/\s+/g, ' ') || null,
      lyrics_luganda: trim(raw.lyrics_luganda) || null,
      lyrics_english: trim(raw.lyrics_english) || null,
      song_key: normKey(raw.song_key),
      notes: trim(raw.notes) || null,
      language: null, session: null, tempo_bpm: null, youtube_url: null,
    };
    if (!song.title) errors.title = 'Give the song a title.';
    else if (song.title.length > LIMITS.title) errors.title = 'Title is too long (max ' + LIMITS.title + ' characters).';
    if (song.title_alt && song.title_alt.length > LIMITS.title_alt) errors.title_alt = 'Other title is too long.';
    if ((song.lyrics_luganda || '').length > LIMITS.lyrics || (song.lyrics_english || '').length > LIMITS.lyrics) errors.lyrics = 'Lyrics are too long.';
    if ((song.notes || '').length > LIMITS.notes) errors.notes = 'Notes are too long.';

    var lang = normLanguage(raw.language);
    if (!lang && trim(raw.language)) errors.language = 'Language must be Luganda, English or both.';
    if (!lang) lang = song.lyrics_luganda && song.lyrics_english ? 'both' : song.lyrics_english && !song.lyrics_luganda ? 'english' : 'luganda';
    song.language = lang;

    var session = normSession(raw.session);
    if (!session) {
      if (trim(raw.session)) errors.session = 'Session must be Praise or Worship.';
      else if (opts.lenient) { session = 'praise'; warnings.push('No session given — saved as Praise. Change it if it is a slower Worship song.'); }
      else errors.session = 'Choose Praise or Worship.';
    }
    song.session = session;

    var tempo = trim(raw.tempo_bpm);
    if (tempo) {
      var n = Number(tempo.replace(/\s*bpm$/i, ''));
      if (!Number.isInteger(n) || n < 30 || n > 260) errors.tempo_bpm = 'Tempo should be a whole number between 30 and 260 (BPM).';
      else song.tempo_bpm = n;
    }

    var yt = normYouTube(raw.youtube_url);
    if (yt.error) errors.youtube_url = yt.error; else song.youtube_url = yt.url;

    if (!song.lyrics_luganda && !song.lyrics_english) warnings.push('No lyrics yet.');
    return { song: song, errors: errors, warnings: warnings };
  }

  function validateTheme(raw) {
    var name = trim(raw && raw.name).replace(/\s+/g, ' ');
    var description = trim(raw && raw.description) || null;
    var errors = {};
    if (!name) errors.name = 'Give the theme a name.';
    else if (name.length > LIMITS.theme) errors.name = 'Name is too long (max ' + LIMITS.theme + ').';
    if (description && description.length > LIMITS.theme_desc) errors.description = 'Description is too long.';
    return { theme: { name: name, description: description }, errors: errors };
  }

  // ------------------------------------------------------------ bulk import

  // RFC 4180 CSV: quoted fields, "" escapes, newlines inside quotes, CRLF.
  function parseCSV(text, delim) {
    text = str(text);
    delim = delim || detectDelimiter(text.split('\n')[0] || '');
    var rows = [], row = [], field = '', i = 0, q = false;
    while (i < text.length) {
      var c = text[i];
      if (q) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          q = false; i++; continue;
        }
        field += c; i++; continue;
      }
      if (c === '"' && field === '') { q = true; i++; continue; }
      if (c === delim) { row.push(field); field = ''; i++; continue; }
      if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
      field += c; i++;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (f) { return trim(f) !== ''; }); });
  }

  function detectDelimiter(line) {
    var counts = { ',': 0, ';': 0, '\t': 0 };
    var q = false;
    for (var i = 0; i < line.length; i++) {
      if (line[i] === '"') q = !q;
      else if (!q && counts.hasOwnProperty(line[i])) counts[line[i]]++;
    }
    return counts['\t'] >= counts[','] && counts['\t'] >= counts[';'] && counts['\t'] > 0 ? '\t'
      : counts[';'] > counts[','] ? ';' : ',';
  }

  var HEADER_ALIASES = {
    title: ['title', 'name', 'song', 'songtitle', 'song_title'],
    title_alt: ['titlealt', 'alttitle', 'othertitle', 'alternatetitle', 'englishtitle', 'lugandatitle', 'title2'],
    language: ['language', 'lang', 'languages'],
    session: ['session', 'type', 'category', 'section', 'praiseorworship', 'praiseworship'],
    song_key: ['songkey', 'key', 'musicalkey'],
    tempo_bpm: ['tempobpm', 'tempo', 'bpm'],
    youtube_url: ['youtubeurl', 'youtube', 'link', 'video', 'url', 'youtubelink'],
    themes: ['themes', 'theme', 'tags'],
    lyrics_luganda: ['lyricsluganda', 'luganda', 'lugandalyrics', 'lyricslg'],
    lyrics_english: ['lyricsenglish', 'english', 'englishlyrics', 'lyricsen'],
    lyrics: ['lyrics', 'words', 'text'],
    notes: ['notes', 'note', 'comments', 'comment'],
  };
  function headerField(h) {
    var k = nkey(h);
    for (var f in HEADER_ALIASES) if (HEADER_ALIASES[f].indexOf(k) !== -1) return f;
    return null;
  }

  function looksLikeCSV(text) {
    var first = trim(str(text).split('\n')[0] || '');
    var d = detectDelimiter(first);
    if (first.indexOf(d) === -1) return false;
    var cols = parseCSV(first, d)[0] || [];
    return cols.some(function (c) { return headerField(c) === 'title'; });
  }

  // Pasted text: songs separated by a line of --- ; "Field: value" lines at the top of
  // each block; lyrics under [Luganda] / [English] (or plain, matched to the language).
  var TEXT_FIELDS = {
    title: 'title', name: 'title', song: 'title',
    alt: 'title_alt', alttitle: 'title_alt', othertitle: 'title_alt', titlealt: 'title_alt', englishtitle: 'title_alt',
    language: 'language', lang: 'language',
    session: 'session', type: 'session',
    key: 'song_key', songkey: 'song_key',
    tempo: 'tempo_bpm', bpm: 'tempo_bpm',
    youtube: 'youtube_url', link: 'youtube_url', video: 'youtube_url',
    themes: 'themes', theme: 'themes', tags: 'themes',
    notes: 'notes', note: 'notes',
  };

  function parseTextBlocks(text) {
    var blocks = [], cur = [];
    str(text).split('\n').forEach(function (line) {
      if (/^\s*(?:-{3,}|={3,})\s*$/.test(line)) { blocks.push(cur.join('\n')); cur = []; }
      else cur.push(line);
    });
    blocks.push(cur.join('\n'));
    var out = [];
    blocks.forEach(function (block) {
      if (!trim(block)) return;
      var lines = block.split('\n');
      var rec = {};
      var lyrics = { luganda: [], english: [], plain: [] };
      var target = null;
      var inHeader = true;
      lines.forEach(function (line) {
        var t = trim(line);
        var sec = t.match(/^\[?\s*(luganda|english)(?:\s+lyrics)?\s*\]?\s*:?$/i);
        if (sec && (/^\[/.test(t) || /:$/.test(t))) {
          target = sec[1].toLowerCase(); inHeader = false; return;
        }
        if (inHeader) {
          if (!t) { if (rec.title) inHeader = false; return; }
          var m = t.match(/^([A-Za-z][A-Za-z _-]{0,20}):\s*(.*)$/);
          var f = m && TEXT_FIELDS[nkey(m[1])];
          if (f) { rec[f] = m[2]; return; }
          if (!rec.title) { rec.title = t; return; }
          inHeader = false;
        }
        (target ? lyrics[target] : lyrics.plain).push(line);
      });
      var join = function (a) { return trim(a.join('\n').replace(/\n{3,}/g, '\n\n')); };
      rec.lyrics_luganda = join(lyrics.luganda);
      rec.lyrics_english = join(lyrics.english);
      rec.lyrics = join(lyrics.plain);
      out.push(rec);
    });
    return out;
  }

  // Theme names → ids, case/punctuation-insensitive ("praise and victory" = "Praise & Victory").
  function themeResolver(themes) {
    var map = {};
    (themes || []).forEach(function (t) { map[nkey(t.name)] = t; });
    return function (names) {
      var ids = [], unknown = [];
      names.forEach(function (n) {
        var t = map[nkey(n)];
        if (t) { if (ids.indexOf(t.id) === -1) ids.push(t.id); } else unknown.push(trim(n));
      });
      return { ids: ids, unknown: unknown };
    };
  }

  // Parse CSV or pasted text into checked rows:
  // { format, rows: [{ n, song, theme_ids, errors: [], warnings: [] }] }
  function parseImport(text, themes) {
    var format = looksLikeCSV(text) ? 'csv' : 'text';
    var records = [];
    if (format === 'csv') {
      var rows = parseCSV(text);
      var fields = rows[0].map(headerField);
      rows.slice(1).forEach(function (cells) {
        var rec = {};
        fields.forEach(function (f, i) { if (f && cells[i] != null && trim(cells[i])) rec[f] = cells[i]; });
        records.push(rec);
      });
    } else {
      records = parseTextBlocks(text);
    }
    var resolve = themeResolver(themes);
    var seen = {};
    var out = records.map(function (rec, idx) {
      // Plain "lyrics" go to the part that matches the song's language.
      if (trim(rec.lyrics)) {
        var lang = normLanguage(rec.language);
        if (lang === 'english' && !trim(rec.lyrics_english)) rec.lyrics_english = rec.lyrics;
        else if (!trim(rec.lyrics_luganda)) rec.lyrics_luganda = rec.lyrics;
        else if (!trim(rec.lyrics_english)) rec.lyrics_english = rec.lyrics;
      }
      var v = validateSong(rec, { lenient: true });
      var errors = Object.keys(v.errors).map(function (k) { return v.errors[k]; });
      var warnings = v.warnings.slice();
      var names = trim(rec.themes) ? rec.themes.split(/[;,|\/]/).map(trim).filter(Boolean) : [];
      var t = resolve(names);
      if (t.unknown.length) warnings.push('Unknown theme' + (t.unknown.length > 1 ? 's' : '') + ': ' + t.unknown.join(', ') + ' (not linked — add it under Themes first).');
      var key = v.song.title.toLowerCase();
      if (key && seen[key]) errors.push('Same title as song ' + seen[key] + ' in this import.');
      else if (key) seen[key] = idx + 1;
      return { n: idx + 1, song: v.song, theme_ids: t.ids, errors: errors, warnings: warnings };
    });
    return { format: format, rows: out };
  }

  // ------------------------------------------------------------ dates & set lists

  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function parseIsoDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str(iso));
    return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
  }
  function isoDate(d) { return d.toISOString().slice(0, 10); }

  // "2026-10-04" → "Sunday 4 October 2026"
  function formatDate(iso, short) {
    var d = parseIsoDate(iso);
    if (!d) return '';
    var day = DAYS[d.getUTCDay()], month = MONTHS[d.getUTCMonth()];
    return short ? day.slice(0, 3) + ' ' + d.getUTCDate() + ' ' + month.slice(0, 3)
      : day + ' ' + d.getUTCDate() + ' ' + month + ' ' + d.getUTCFullYear();
  }

  // The coming Sunday in Kampala (today, if today is Sunday).
  function nextSunday(now) {
    var t = new Date((now ? now.getTime() : Date.now()) + 3 * 3600 * 1000); // UTC+3
    var d = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
    d.setUTCDate(d.getUTCDate() + ((7 - d.getUTCDay()) % 7));
    return isoDate(d);
  }

  function daysBetween(a, b) {
    var x = parseIsoDate(a), y = parseIsoDate(b);
    return x && y ? Math.round((y - x) / 86400000) : null;
  }

  // Songs matching the theme, split by session. Songs not sung recently come first.
  // usage: { "<song_id>": "YYYY-MM-DD" (last used) }
  function suggestSongs(songs, themeId, usage, serviceDate, excludeIds) {
    usage = usage || {};
    var exclude = {};
    (excludeIds || []).forEach(function (id) { exclude[id] = true; });
    var out = { praise: [], worship: [] };
    (songs || []).forEach(function (s) {
      if (exclude[s.id]) return;
      if (themeId && (s.theme_ids || []).indexOf(Number(themeId)) === -1) return;
      var last = usage[s.id] || null;
      var ago = last && serviceDate ? daysBetween(last, serviceDate) : null;
      var item = { song: s, last_used: last, days_ago: ago, recent: ago !== null && ago >= 0 && ago < 21 };
      (out[s.session] || out.praise).push(item);
    });
    var order = function (a, b) {
      if (a.recent !== b.recent) return a.recent ? 1 : -1;
      if ((a.last_used || '') !== (b.last_used || '')) return (a.last_used || '') < (b.last_used || '') ? -1 : 1;
      return a.song.title.localeCompare(b.song.title);
    };
    out.praise.sort(order);
    out.worship.sort(order);
    return out;
  }

  // The WhatsApp message for a set list: date, theme, then the songs in order.
  function shareText(set, link) {
    var lines = ['🎶 *NRSC Worship — ' + formatDate(set.service_date) + '*'];
    if (set.title) lines.push(set.title);
    if (set.theme && set.theme.name) lines.push('Theme: *' + set.theme.name + '*');
    if (set.leader_name) lines.push('Leading: ' + set.leader_name);
    ['praise', 'worship'].forEach(function (sec) {
      var items = (set.items || []).filter(function (i) { return i.section === sec; });
      if (!items.length) return;
      lines.push('', '*' + SESSIONS[sec].toUpperCase() + '*');
      items.forEach(function (i, n) { lines.push((n + 1) + '. ' + i.song.title); });
    });
    if (link) lines.push('', link);
    return lines.join('\n');
  }

  function whatsappUrl(text) {
    return 'https://wa.me/?text=' + encodeURIComponent(text);
  }

  // Library filters. language 'luganda' also matches bilingual songs, likewise 'english'.
  function matchesFilters(song, f) {
    f = f || {};
    if (f.session && song.session !== f.session) return false;
    if (f.theme && (song.theme_ids || []).indexOf(Number(f.theme)) === -1) return false;
    if (f.language) {
      if (f.language === 'both' && song.language !== 'both') return false;
      if (f.language !== 'both' && song.language !== f.language && song.language !== 'both') return false;
    }
    if (f.text) {
      var q = f.text.toLowerCase();
      if ((song.title || '').toLowerCase().indexOf(q) === -1 && (song.title_alt || '').toLowerCase().indexOf(q) === -1) return false;
    }
    return true;
  }

  root.NRSCWorship = {
    SESSIONS: SESSIONS, SESSION_HINT: SESSION_HINT, LANGUAGES: LANGUAGES, LIMITS: LIMITS,
    normSession: normSession, normLanguage: normLanguage, normKey: normKey, normYouTube: normYouTube,
    validateSong: validateSong, validateTheme: validateTheme,
    parseCSV: parseCSV, parseImport: parseImport,
    formatDate: formatDate, nextSunday: nextSunday, daysBetween: daysBetween,
    suggestSongs: suggestSongs, shareText: shareText, whatsappUrl: whatsappUrl, matchesFilters: matchesFilters,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
