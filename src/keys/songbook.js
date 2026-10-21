// Song ideas: two songs that were popular in 2024-2025 for each style, with the facts a keyboard player
// needs (key, tempo, feel, chord sections) and the rig to play them on. Chords and tempos only, never lyrics
// or melodies. Facts marked `check` come from a single source or an automatic chord/tempo estimate:
// confirm them by ear before Sunday.

import { comboById, buildPerformance } from './combos.js';
import { presetById } from './presets.js';
import { partFromPreset } from './state.js';

export const SONG_STYLES = [
  { id: 'sebene', label: 'Congolese gospel (sebene)' },
  { id: 'sagospel', label: 'Spirit of Praise' },
  { id: 'naija', label: 'Nigerian praise' },
  { id: 'afro', label: 'Afrobeats & Afrobeat' },
  { id: 'elevation', label: 'Elevation Worship' },
  { id: 'hillsong', label: 'Hillsong' },
  { id: 'billie', label: 'Billie Eilish' },
];

export const SONGBOOK = [
  // ---- Congolese gospel
  {
    id: 'je-recois',
    style: 'sebene',
    title: 'Je Reçois',
    artist: 'Moïse Mbiye feat. Van Walesa',
    year: 2024,
    key: 'C',
    bpm: 128,
    feel: 'Rumba song part (about 100 bpm) moving into a sebene (about 125-135)',
    combo: 'sebene-praise',
    sections: [
      { name: 'Song (rumba)', bars: ['C', 'Am', 'F', 'G'] },
      { name: 'Sebene vamp', bars: ['C', 'F', 'G', 'F'] },
    ],
    demo: 'Sebene vamp',
    tip: 'Play the song part on piano feel at about 100, then speed up into the sebene vamp: bass left, solo guitar right, mi-solo loop.',
    check: 'Chords and tempo are from an automatic chord estimate; the sebene vamp is the usual Congolese pattern, not confirmed on the recording.',
    sources: ['https://acp.cd/culture/gospel-sortie-de-la-chanson-je-recois-de-moise-mbiye-feat-van-walesa/', 'https://musicinafrica.net/fr/magazine/decouvrez-les-meilleures-chansons-gospel-de-la-rdc-en-2024/'],
  },
  {
    id: 'cest-papa',
    style: 'sebene',
    title: "C'est Papa qui m'a donné",
    artist: 'Daniel Lubams',
    year: 2024,
    key: 'G#m',
    bpm: 132,
    feel: 'Uptempo, Swahili and Lingala',
    combo: 'sebene-rig',
    sections: [
      { name: 'Loop', bars: ['E', 'F#', 'G#m', 'G#m'] },
      { name: 'Sebene vamp', bars: ['E', 'F#', 'G#m', 'F#'] },
    ],
    demo: 'Sebene vamp',
    tip: 'A VI-VII-i loop: keep the bass busy on the roots, the solo guitar high on G#, B and D#.',
    check: 'Key and chords from an automatic estimate (it lists F# major at 158 bpm; the chords point to G# minor). Confirm by ear.',
    sources: ['https://musicinafrica.net/fr/magazine/decouvrez-les-meilleures-chansons-gospel-de-la-rdc-en-2024/'],
  },
  // ---- Spirit of Praise
  {
    id: 'asikho-isikhali',
    style: 'sagospel',
    title: 'Asikho Isikhali (Live)',
    artist: 'Spirit of Praise feat. Dumi Mkokstad',
    year: 2024,
    key: 'F#',
    bpm: 150,
    feel: 'Fast SA gospel praise, long vamps and lifts',
    combo: 'sop-praise',
    sections: [{ name: 'Vamp', bars: ['F#', 'B', 'C#', 'B'] }],
    demo: 'Vamp',
    tip: 'Octaves and add-9 chords off the beat; the bass sings fills on beat 4. Bring the choir up (Macro 2) when the choir answers the leader.',
    check: 'Tempo differs between sources (151 and 158 bpm); chord order is an estimate, with D#m as a passing chord.',
    sources: ['https://en.wikipedia.org/wiki/Spirit_of_Praise', 'https://www.shazam.com/song/1762644998/asikho-isikhali-live-feat-dumi-mkokstad'],
  },
  {
    id: 'nasempini',
    style: 'sagospel',
    title: 'Nasempini',
    artist: 'Kabza De Small & Spirit of Praise feat. Ayanda Ntanzi',
    year: 2024,
    key: 'F',
    bpm: 113,
    feel: 'Amapiano remake of a Spirit of Praise staple: log drum bass, shakers, the choir carries the hook',
    combo: 'sop-praise',
    swap: { 0: 'log-drum' },
    groove: 'amapiano',
    keys: [{ role: 'bass-afrobeats', range: [28, 47] }, { role: 'afro-keys', range: [55, 81] }],
    sections: [{ name: 'Loop', bars: ['F', 'Bb', 'Gm', 'C'] }],
    demo: 'Loop',
    tip: 'The bass part becomes a log drum: short woody notes with slides. Soft piano chords, the choir up (Macro 2), amapiano groove.',
    check: 'Key and tempo from one DJ-pool listing; chords from the original Spirit of Praise 7 version.',
    sources: ['https://tunebat.com/Info/Nasempini-Spirit-Of-Praise-Ayanda-Ntanzi/7EH343G9Kuc7HBlF3wFvvY'],
  },
  // ---- Nigerian praise
  {
    id: 'no-turning-back-ii',
    style: 'naija',
    title: 'No Turning Back II',
    artist: 'Gaise Baba & Lawrence Oyor',
    year: 2025,
    key: 'Eb',
    bpm: 112,
    feel: 'Danceable Afro-gospel praise; it reworks the hymn "I Have Decided to Follow Jesus"',
    combo: 'naija-praise-band',
    swap: { 0: 'afro-sub' },
    groove: 'afrobeats',
    keys: [{ role: 'bass-afrobeats', range: [28, 47] }, { role: 'afro-keys', range: [55, 81] }],
    sections: [{ name: 'Loop', bars: ['Eb', 'Cm', 'Bb', 'Bb'] }],
    demo: 'Loop',
    tip: 'Sub bass following the kick, bright keys chopping the chords, trumpet answers in a loop.',
    check: 'Chords from an automatic estimate; one version moves to C.',
    sources: ['https://www.graphic.com.gh/entertainment/showbiz-news/gospel-hit-no-turning-back-ii-sets-record-as-nigerias-highest-charting-gospel-song.html'],
  },
  {
    id: 'doing-of-the-lord',
    style: 'naija',
    title: 'Doing of the Lord',
    artist: 'Moses Bliss & Nathaniel Bassey',
    year: 2025,
    key: 'B',
    bpm: 125,
    feel: 'Upbeat praise with highlife guitar',
    combo: 'naija-highlife',
    sections: [{ name: 'Loop', bars: ['B', 'E', 'F#', 'G#m7'] }],
    demo: 'Loop',
    tip: 'Walking highlife bass, the picked guitar in thirds and sixths, praise-lead answers above C6.',
    check: 'Tempo differs between sources (125 and 91 bpm); chord order is an estimate.',
    sources: ['https://www.legit.ng/entertainment/music/1634379-moses-bliss-drop-song-nathaniel-bassey-shares-music-cover-release-date/'],
  },
  // ---- Afrobeats and Afrobeat
  {
    id: 'with-you',
    style: 'afro',
    title: 'With You',
    artist: 'Davido feat. Omah Lay',
    year: 2025,
    key: 'C#m',
    bpm: 125,
    feel: 'Afrobeats rooted in Igbo highlife, built on a repeating highlife guitar loop',
    combo: 'afrobeats-lagos',
    swap: { 1: 'highlife-guitar' },
    keys: [{ role: 'bass-afrobeats', range: [28, 47] }, { role: 'highlife-keys', range: [60, 83] }, { role: 'pluck-arp', range: [84, 96] }],
    sections: [{ name: 'Loop', bars: ['A', 'B', 'G#m', 'C#m'] }],
    demo: 'Loop',
    tip: 'Round sub following the kick; the middle zone becomes a highlife guitar for the signature loop (thirds and sixths); marimba touches from C6.',
    check: 'Chord order is an estimate.',
    sources: ['https://en.wikipedia.org/wiki/With_You_(Davido_song)', 'https://songbpm.com/@davido/with-you-feat-omah-lay-c4ugo'],
  },
  {
    id: 'after-24-years',
    style: 'afro',
    title: 'After 24 Years',
    artist: 'Femi Kuti',
    year: 2025,
    key: 'C',
    bpm: 106,
    feel: 'Fela-style Afrobeat: horns, interlocking guitars, Tony Allen kit',
    combo: 'afrobeat-fela',
    sections: [{ name: 'Practice vamp (C Dorian)', bars: ['Cm7', 'Cm7', 'F7', 'F7'] }],
    demo: 'Practice vamp (C Dorian)',
    tip: 'No chord chart exists: practise the style on this two-bar Dorian vamp, then find the real chords by ear.',
    check: 'Key and tempo from one source; the vamp is a practice pattern in the style, not the song\'s chords.',
    sources: ['https://glidemagazine.com/312294/femi-kuti-delivers-new-beats-to-older-tracks-on-commanding-journey-through-life-album-review/'],
  },
  // ---- Elevation Worship
  {
    id: 'i-know-a-name',
    style: 'elevation',
    title: 'I Know a Name',
    artist: 'Elevation Worship & Brandon Lake',
    year: 2025,
    key: 'C',
    bpm: 58,
    feel: '6/8, starts acoustic, builds to a bright refrain',
    combo: 'elevation-68',
    sections: [
      { name: 'Verse', bars: ['C', ['Bb', 'F'], 'C', ['Bb', 'F']] },
      { name: 'Chorus', bars: ['C', 'C', 'Bb', ['Bb', 'F'], 'Bb', ['F', 'C']] },
      { name: 'Bridge', bars: ['C', 'Bb', 'F', 'F'] },
    ],
    demo: 'Chorus',
    tip: 'Rolling 6/8 piano with the pad inside; whole-note sub; toms first, then the full 6/8 kit in the chorus.',
    check: 'Tempo given as 172 eighth notes by one source (about 58 per dotted beat).',
    sources: ['https://www.praisecharts.com/songs/details/86858/i-know-a-name-sheet-music/chords'],
  },
  {
    id: 'god-im-just-grateful',
    style: 'elevation',
    title: "God I'm Just Grateful",
    artist: 'Elevation Worship & Chandler Moore',
    year: 2025,
    key: 'D',
    bpm: 72,
    feel: 'Gospel-tinged, builds through the bridge',
    combo: 'elevation-anthem',
    groove: 'gospel',
    sections: [
      { name: 'Verse', bars: ['Bm', 'G', 'D', 'D/F#', 'Bm', 'G', 'A', 'A'] },
      { name: 'Chorus', bars: [['D', 'Dmaj7'], ['A', 'G'], ['A', 'G'], ['D', 'Dmaj7'], ['A', 'G'], ['D/F#', 'Em']] },
      { name: 'Bridge', bars: [['G', 'A'], 'D/F#', ['Bm', 'A'], 'A'] },
    ],
    demo: 'Chorus',
    tip: 'Gospel feel at 72: the piano drive in 8ths, sub bass, gospel pocket kit. Hammond fits too (try the Gospel B3 + Piano rig).',
    check: 'Tempo listed as 144 by one source (felt at 72).',
    sources: ['https://www.praisecharts.com/songs/details/89208'],
  },
  // ---- Hillsong
  {
    id: 'good-news',
    style: 'hillsong',
    title: 'Good News (Live)',
    artist: 'Hillsong Worship',
    year: 2025,
    key: 'A',
    bpm: 140,
    feel: 'Fast and driving: kit, electric guitars, synth arps over a pad',
    combo: 'hillsong-drive',
    sections: [
      { name: 'Verse', bars: ['A/C#', 'D', 'E', 'F#m'] },
      { name: 'Chorus', bars: ['D', ['E', 'F#m'], ['D', 'A'], 'D', ['E', 'F#m'], ['D', 'A'], 'D', ['A', 'E']] },
      { name: 'Bridge', bars: ['A', ['D/A', 'A'], ['A/C#', 'D'], ['Esus4', 'E']] },
    ],
    demo: 'Chorus',
    tip: 'Driving 8ths in both hands, arp loop on (Macro 1), driving kit.',
    check: 'Tempo from one source.',
    sources: ['https://hillsong.com/music/worship/great-i-am/good-news/chords', 'https://www.praisecharts.com/songs/details/89905/good-news-sheet-music/rhythm-chart'],
  },
  {
    id: 'fighting-for-us',
    style: 'hillsong',
    title: 'Fighting For Us (Live)',
    artist: 'Hillsong Worship',
    year: 2025,
    key: 'E',
    bpm: 74,
    feel: 'Ballad: pad and piano verses, full band chorus',
    combo: 'hillsong-anthem',
    sections: [
      { name: 'Verse', bars: ['E', 'C#m7', 'A', 'A'] },
      { name: 'Chorus', bars: ['E', 'C#m7', 'A', 'C#m7', 'B', 'C#m7', 'A', 'E'] },
      { name: 'Bridge', bars: ['A', 'C#m7', 'Esus4', 'E'] },
    ],
    demo: 'Chorus',
    tip: 'Verse: piano and pad, half-time kit. Chorus: open add-9 chords on the push, strings up (Macro 2), Hillsong chorus kit.',
    sources: ['https://app.worshiponline.com/songs/797-hillsong-worship--fighting-for-us', 'https://www.praisecharts.com/songs/details/88889/fighting-for-us-live-sheet-music'],
  },
  // ---- Billie Eilish
  {
    id: 'birds-of-a-feather',
    style: 'billie',
    title: 'Birds of a Feather',
    artist: 'Billie Eilish',
    year: 2024,
    key: 'D',
    bpm: 105,
    feel: 'Straight 4/4, warm comping, light dry kit, melodic bass',
    combo: 'billie-birds',
    sections: [
      { name: 'Verse', bars: ['D7', 'Bm(add9)', 'Em7', 'A7sus4'] },
      { name: 'Chorus', bars: ['D', 'Bm7', 'Em7', 'A'] },
    ],
    demo: 'Chorus',
    tip: 'Round bass melody, warm 7th chords in the middle, soft and dry; the whistle synth for a high answer.',
    sources: ['https://en.wikipedia.org/wiki/Birds_of_a_Feather_(Billie_Eilish_song)', 'https://www.hooktheory.com/theorytab/view/billie-eilish/birds-of-a-feather'],
  },
  {
    id: 'wildflower',
    style: 'billie',
    title: 'Wildflower',
    artist: 'Billie Eilish',
    year: 2025,
    key: 'F#m',
    bpm: 74,
    feel: 'Gentle folk-pop ballad, guitar-led',
    combo: 'billie-whisper',
    sections: [
      { name: 'Verse', bars: ['D', 'C#m', 'F#m', 'F#m'] },
      { name: 'Chorus', bars: ['Dmaj7', 'E', 'C#7', ['F#m', 'E']] },
    ],
    demo: 'Chorus',
    tip: 'Guitar-led: turn Macro 1 (Guitar) up and play soft chords on every beat; long 808 notes under them.',
    sources: ['https://en.wikipedia.org/wiki/Wildflower_(Billie_Eilish_song)', 'https://www.hooktheory.com/theorytab/view/billie-eilish/wildflower'],
  },
];

const BY_ID = new Map(SONGBOOK.map((s) => [s.id, s]));
export const songById = (id) => BY_ID.get(id) || null;

/** The bars a song's "Hear it" plays: its demo section. */
export const demoBars = (song) => (song.sections.find((x) => x.name === song.demo) || song.sections[0]).bars;

/** The rig for a song: its combo, with any parts swapped for the song, its tempo and groove. */
export function songPerformance(song) {
  const combo = comboById(song.combo);
  const perf = buildPerformance(combo);
  for (const [idx, presetId] of Object.entries(song.swap || {})) {
    const old = perf.parts[Number(idx)];
    const preset = presetById(presetId);
    if (!old || !preset) continue;
    perf.parts[Number(idx)] = partFromPreset(preset, { keyLow: old.keyLow, keyHigh: old.keyHigh, volume: old.volume, enabled: old.enabled, color: old.color, octave: preset.octave || 0 });
  }
  perf.name = song.title;
  perf.tempo = song.bpm;
  if (song.groove) perf.groove = song.groove;
  perf.notes = song.sections.map((s) => `${s.name}: ${s.bars.map((b) => (Array.isArray(b) ? b.join(' ') : b)).join(' | ')}`).join('\n');
  return perf;
}
