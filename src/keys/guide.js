// How every sound and rig is meant to be played: a demo (what the demo player plays, in which style)
// and a short tip. The demos use original progressions and parts written in each style; songs from the
// song book use their own chords. Pure data plus two builders, so the tests can check every entry.

import { timeline } from './music.js';
import { phrase } from './phrases.js';
import { expandGroove } from './looper.js';

// ------------------------------------------------------------------ styles: tempo, progression, groove

export const STYLES = {
  sebene: { bpm: 132, bars: ['E', 'A', 'E', 'B'], groove: 'sebene' },
  ndombolo: { bpm: 128, bars: ['A', 'D', 'A', 'E'], groove: 'ndombolo' },
  rumba: { bpm: 100, bars: ['A', 'D', 'E', 'D'], groove: 'rumba' },
  worship: { bpm: 72, bars: ['G', 'D/F#', 'Em7', 'Cadd9'] },
  anthem: { bpm: 128, bars: ['D', 'A/C#', 'Bm7', 'G'], groove: 'worship44' },
  gospel: { bpm: 92, bars: ['Dbmaj7', 'Eb/Db', 'Cm7', 'Fm9'], groove: 'pop' },
  organ: { bpm: 100, bars: ['Bb', 'Eb/Bb', 'Bb', 'F7'], groove: 'pop' },
  choir: { bpm: 70, bars: ['Ab', 'Fm7', 'Db', 'Eb'] },
  hymn: { bpm: 76, bars: ['F', 'Bb/F', 'F', 'C'] },
  billie: { bpm: 84, bars: ['Dm7', 'Bbmaj7', 'Fmaj7', 'C'], groove: 'billie-half' },
  pop: { bpm: 110, bars: ['C', 'G', 'Am', 'F'], groove: 'pop' },
  ballad: { bpm: 76, bars: ['C', 'Am7', 'Fmaj7', 'G'] },
  // band styles (original progressions written in each style)
  'sa-praise': { bpm: 124, bars: ['F', ['Gm7', 'Am7'], 'Bb', 'C'], groove: 'sa-praise' },
  'sa-worship': { bpm: 66, bars: ['Db', 'Gb/Db', 'Bbm7', 'Ab/C'], groove: 'sa-worship' },
  naija: { bpm: 128, bars: ['G', 'C', 'D', 'C'], groove: 'naija-praise' },
  highlife: { bpm: 118, bars: ['C', 'F', 'G', 'C'], groove: 'highlife' },
  afrobeats: { bpm: 104, bars: ['Am9', 'Dm9', 'Gsus4', 'Cmaj9'], groove: 'afrobeats' },
  afrobeat: { bpm: 112, bars: ['Dm7', 'Dm7', 'G7', 'G7'], groove: 'afrobeat' },
  elevation: { bpm: 130, bars: ['G', 'D', 'Em', 'C'], groove: 'elevation' },
  elevation68: { bpm: 70, bars: ['C', 'G/B', 'Am7', 'F'], groove: 'elevation68' },
  hillsong: { bpm: 72, bars: ['D', 'A/C#', 'Bm7', 'G'], groove: 'hillsong' },
  'hillsong-drive': { bpm: 138, bars: ['A', 'E', 'F#m', 'D'], groove: 'elevation' },
  'billie-pop': { bpm: 105, bars: ['Fmaj7', 'Dm7', 'Gm7', 'C'], groove: 'billie-pop' },
  'billie-half': { bpm: 74, bars: ['Gm', 'Ebmaj7', 'Bb', 'F'], groove: 'billie-half' },
};

/** The kit a style's demos and rigs use. */
export const KIT_FOR_STYLE = {
  sebene: 'sebene-kit',
  ndombolo: 'sebene-kit',
  rumba: 'sebene-kit',
  'sa-praise': 'afro-kit',
  naija: 'afro-kit',
  highlife: 'afro-kit',
  afrobeats: 'afro-kit',
  afrobeat: 'afro-kit',
  billie: 'pop-kit',
  'billie-pop': 'pop-kit',
  'billie-half': 'pop-kit',
};

/** How many bars a demo plays: enough to hear the part settle, never more than about 15 seconds. */
const demoBars = (bpm, beatsPerBar = 4) => (bpm >= 100 ? 8 : 4) * (4 / beatsPerBar);

function fill(bars, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(bars[i % bars.length]);
  return out;
}

// ------------------------------------------------------------------ sounds

// role: what the sound plays (see phrases.js); bed: a quiet backing part under it; groove: drums under it
// (false for none; default the style's groove when the role is rhythmic).
const BED_PAD = { preset: 'warm-bed', role: 'pad', volume: 0.35 };
const BED_PIANO = { preset: 'worship-grand', role: 'piano-ballad', volume: 0.4 };
const BED_BASS = { preset: 'sebene-bass', role: 'bass-sebene', volume: 0.55 };
const BED_GOSPEL_BASS = { preset: 'moog-bass', role: 'bass-gospel', volume: 0.4 };

export const SOUND_GUIDE = {
  // sebene
  'sebene-solo': { style: 'sebene', role: 'sebene-lead', bed: BED_BASS, tip: 'Right hand above C4: single notes in fast 16ths, cells of three or four chord tones that change shape each beat. Mod wheel up for palm-muted ghost notes; bend up a semitone into a held note.' },
  'sebene-solo-legato': { style: 'sebene', role: 'sebene-lead', bed: BED_BASS, tip: 'One note at a time: hold a note and play the next one before letting go for a hammer-on, so runs flow like a real picked line. Lift between notes to re-pick.' },
  'sebene-solo-sampled': { style: 'sebene', role: 'sebene-lead', bed: BED_BASS, tip: 'The sampled Strat: keep the line high (E5 to E6) and light; vary velocity so the accents on the beat stand out.' },
  'sebene-solo-hybrid': { style: 'sebene', role: 'sebene-lead', bed: BED_BASS, tip: 'The fullest lead: model for the pick, sample for the body. Play the same 16th-note cells; the Echo macro adds the 1/8 delay for the big sebene.' },
  'sebene-octave': { style: 'sebene', role: 'sebene-lead', bed: BED_BASS, tip: 'Each note sounds with its octave (the mi-composé string). Play the top line a little lower than usual, around C4 to C5, so the octave does not get shrill.' },
  'mi-solo': { style: 'sebene', role: 'mi-solo', bed: BED_BASS, tip: 'The answering guitar: pairs of 16ths on the off-beats in the middle register, chord tones a third apart. Leave the beat to the solo guitar.' },
  'mi-solo-sampled': { style: 'sebene', role: 'mi-solo', bed: BED_BASS, tip: 'Same part as Mi-Solo, rounder. Good for recording into a loop while you play the solo live.' },
  'rhythm-chop': { style: 'sebene', role: 'rhythm-chop', bed: BED_BASS, tip: 'Muted single notes on the off-beats: root, root, then the fifth at the end of each beat. Short and even; it is a drum more than a melody.' },
  'rhythm-muted-sampled': { style: 'sebene', role: 'rhythm-chop', bed: BED_BASS, tip: 'Sampled muted guitar for the chatter part: keep notes short, between C4 and G4.' },
  'soukous-jc': { style: 'rumba', role: 'pluck-arp', bed: { preset: 'finger-bass', role: 'bass-rumba', volume: 0.5 }, tip: 'Clean chorus guitar for slower rumba: broken chords in 8ths, up through the chord and back.' },
  'sebene-bass': { style: 'sebene', role: 'bass-sebene', bed: BED_PAD, tip: 'Left hand below C3: root on the beat, octave and fifth in between, a chromatic step into the next chord. Mod wheel mutes for ghost notes; play legato for slides.' },
  'sebene-bass-poly': { style: 'sebene', role: 'bass-sebene', bed: BED_PAD, tip: 'Polyphonic bass: you can hold root and fifth together for a fuller vamp.' },
  'sebene-bass-sampled': { style: 'sebene', role: 'bass-sebene', bed: BED_PAD, tip: 'Sampled finger bass with a short release, so 16th-note bubbling stays tight.' },
  'sebene-bass-hybrid': { style: 'sebene', role: 'bass-sebene', bed: BED_PAD, tip: 'Modelled pluck on top of the sampled bass: more definition in a loud hall.' },
  'ndombolo-synth-bass': { style: 'ndombolo', role: 'bass-sebene', bed: BED_PAD, tip: 'Modern Kinshasa synth bass: legato with a quick glide, so slides between roots sound like a bassist.' },
  likembe: { style: 'sebene', role: 'likembe', bed: BED_BASS, tip: 'Thumb piano ostinato: a short repeating cell of chord tones, both hands alternating, for intros.' },
  // pads
  'oceans-pad': { style: 'worship', role: 'pad', bed: BED_PIANO, tip: 'Hold whole-note chords in the middle (G3 to G4) and let them overlap; push the mod wheel up to open the filter in the chorus.' },
  'shimmer-pad': { style: 'worship', role: 'pad', bed: BED_PIANO, tip: 'Play fewer notes than you think: two or three, high. The shimmer adds the octave above on its own.' },
  'swell-pad': { style: 'worship', role: 'pad', tip: 'Press early: it takes four seconds to arrive. Ideal under prayer or before the last chorus.' },
  'glass-pad': { style: 'worship', role: 'pad', bed: BED_PIANO, tip: 'Bright bed for verses; hold chords and let the slow filter move by itself.' },
  'warm-analog-pad': { style: 'worship', role: 'pad', bed: BED_PIANO, tip: 'Sits under a piano all night. Keep the volume about a third of the piano.' },
  'choir-pad': { style: 'worship', role: 'pad', tip: 'Vowel pad: hold three-note chords around middle C.' },
  'halo-pad': { style: 'worship', role: 'pad', range: [62, 84], tip: 'High and airy: play above C4 only, for a bridge lift.' },
  'dark-drone': { style: 'worship', role: 'drone', tip: 'Hold one low root (and its fifth) for minutes. Change it only when the key changes.' },
  'air-pad': { style: 'worship', role: 'pad', range: [64, 86], bed: BED_PIANO, tip: 'Texture above the band: play high, leave it on, never in the way.' },
  'pulse-pad': { style: 'anthem', role: 'pad', groove: 'worship44', tip: 'The tremolo is locked to the tempo: hold chords and the pad pulses in 8ths. Tap the tempo first.' },
  'strings-pad': { style: 'worship', role: 'strings', tip: 'Slow strings: root in the left hand, close chord in the right, change with the chords.' },
  // keys
  'worship-grand': { style: 'worship', role: 'piano-worship', tip: 'Left hand root and octave, fifth on beat 3. Right hand: the chord on 1, then its top notes in 8ths. Light touch; the echo adds the space.' },
  'ambient-piano': { style: 'worship', role: 'piano-ambient', tip: 'Few notes, far apart: 1, 5, 9 and 3 rising, one every beat and a half; the dotted-eighth echo fills the rest.' },
  'felt-piano': { style: 'ballad', role: 'piano-ballad', tip: 'Soft and close: play gently (velocity shapes the tone), low chords held, a single top note answering.' },
  'gospel-grand': { style: 'gospel', role: 'piano-gospel', bed: BED_GOSPEL_BASS, tip: 'Left hand octaves with a chromatic walk into each chord; right hand four-note voicings with the 7th and 9th, hit on the syncopations.' },
  'trem-rhodes': { style: 'worship', role: 'ep-comp', tip: 'Rootless chords (3rd, 7th, 9th) in the middle, left hand root: let the tremolo breathe on held chords.' },
  'chorus-rhodes': { style: 'gospel', role: 'ep-comp', bed: BED_GOSPEL_BASS, tip: 'Neo-soul comping: short syncopated chords with the 7th and 9th, left hand on the root.' },
  wurli: { style: 'pop', role: 'ep-comp', tip: 'Bark comes from velocity: dig in on accents, soft in between.' },
  'lofi-keys': { style: 'billie', role: 'ep-comp', tip: 'Dark and wobbly: play slowly and softly; the tape wobble does the rest.' },
  clav: { style: 'pop', role: 'stabs', groove: 'pop', tip: 'Short, funky stabs on the 16th-note syncopations. Keep notes very short.' },
  'nord-piano-pad': { style: 'worship', role: 'piano-worship', tip: 'Piano with the pad inside it: play as a piano, the pad holds the chord for you.' },
  // organs
  'gospel-full': { style: 'organ', role: 'organ-gospel', tip: 'All drawbars, fast Leslie: hold chords, re-strike on the "and" of 2 and push on the "and" of 4. Left hand holds the root.' },
  'gospel-shout': { style: 'organ', role: 'organ-gospel', tip: 'Classic shout organ: same comping, with glissandos into the chorus. Use a pedal (learned to Rotary) to switch slow and fast.' },
  'worship-organ-soft': { style: 'worship', role: 'organ-hold', bed: BED_PIANO, tip: 'Soft organ under a piano: hold chords, slow Leslie, never louder than the piano.' },
  'jazz-organ': { style: 'organ', role: 'organ-gospel', tip: 'Percussion clicks on the first note of a phrase only: lift your hand between phrases.' },
  'rock-organ': { style: 'pop', role: 'organ-gospel', tip: 'Driven organ: chords held, Leslie fast for the loud parts.' },
  'hammond-pad': { style: 'worship', role: 'organ-hold', tip: 'An organ used as a pad: hold, change chords slowly.' },
  'church-pipe': { style: 'hymn', role: 'strings', tip: 'Play hymns legato: hold each note until the next one sounds, left hand on the bass line.' },
  // choirs
  'brooklyn-choir': { style: 'choir', role: 'choir', tip: 'Three-note chords around middle C, held; move voices by the smallest step. The octave-up layer comes in slower.' },
  'gospel-oohs': { style: 'choir', role: 'choir', bed: BED_PIANO, tip: 'Soft backing oohs: hold chords under a piano or a solo singer.' },
  'choir-aahs': { style: 'choir', role: 'choir', tip: 'Classic aahs: keep the chords close and in the middle register.' },
  'cathedral-choir': { style: 'hymn', role: 'choir', tip: 'Long and slow: the 9-second hall needs space between chords.' },
  'vocal-pad': { style: 'worship', role: 'pad', tip: 'Held chords with shimmer: two or three notes, high.' },
  // leads and synths
  'prophet-lead': { style: 'anthem', role: 'lead', bed: BED_PAD, groove: 'worship44', tip: 'One note at a time, legato for the glide; mod wheel adds vibrato on long notes.' },
  'verby-saw': { style: 'anthem', role: 'lead', bed: BED_PAD, groove: 'worship44', tip: 'Slow melodic line drowned in reverb: long notes, small steps.' },
  'pulse-pluck': { style: 'anthem', role: 'pluck-arp', bed: BED_PAD, groove: 'worship44', tip: 'Play steady 8ths: the dotted-eighth echo turns them into a 16th-note arpeggio.' },
  'glass-bells': { style: 'worship', role: 'bells', bed: BED_PAD, tip: 'Sparse high notes over the band; leave space for the echoes.' },
  'super-saw': { style: 'pop', role: 'pad', bed: { preset: 'moog-bass', role: 'bass-8ths', volume: 0.45 }, groove: 'pop', tip: 'Big chords for the last chorus: three or four notes, held or pumped in 8ths.' },
  'square-lead': { style: 'billie', role: 'lead', bed: BED_PAD, groove: 'worship44', tip: 'Mono hook: short notes, legato slides between them.' },
  'synth-brass': { style: 'pop', role: 'stabs', bed: BED_PAD, groove: 'pop', tip: 'Stabs on the syncopations; velocity opens the filter.' },
  'juno-poly': { style: 'pop', role: 'stabs', bed: BED_PAD, groove: 'pop', tip: '80s chord synth: stabs or held chords with chorus.' },
  'sampled-saw-lead': { style: 'anthem', role: 'lead', bed: BED_PAD, groove: 'worship44', tip: 'Simple melodic lead, legato.' },
  // bass
  'finger-bass': { style: 'pop', role: 'bass-pop', bed: BED_PAD, tip: 'Left hand below E3: root on the beat, octave and fifth to move.' },
  'pick-bass': { style: 'anthem', role: 'bass-8ths', bed: BED_PAD, groove: 'worship44', tip: 'Driving 8ths on the root under an anthem.' },
  fretless: { style: 'ballad', role: 'bass-ballad', bed: BED_PIANO, tip: 'Long notes and slides (play legato); mod wheel for vibrato.' },
  'slap-bass': { style: 'gospel', role: 'bass-gospel', bed: BED_PAD, groove: 'pop', tip: 'Velocity is the slap: hard on the accents, soft ghost notes between.' },
  'moog-bass': { style: 'pop', role: 'bass-8ths', bed: BED_PAD, tip: 'Mono synth bass: 8ths on the root, legato glides between chords.' },
  'sub-808': { style: 'billie', role: 'bass-808', bed: BED_PAD, groove: 'worship44', tip: 'Long low notes you feel more than hear; play legato to slide up to the next one.' },
  // billie
  'bad-guy-bass': { style: 'billie', role: 'bass-pop', bed: BED_PAD, groove: 'worship44', tip: 'Short dirty bass notes on the beat with octave jumps; keep the right hand quiet.' },
  'ocean-air-pad': { style: 'billie', role: 'pad', bed: BED_PIANO, tip: 'Airy vocal bed: hold two or three high notes.' },
  'intimate-piano': { style: 'billie', role: 'piano-ballad', tip: 'Soft low chords and a single answering note; play quietly, velocity shapes the tone.' },
  'bellyache-pluck': { style: 'billie', role: 'pluck-arp', bed: BED_PAD, groove: 'worship44', tip: 'Nylon guitar arpeggios in 8ths, close to the mic.' },
  'dark-hook-lead': { style: 'billie', role: 'lead', bed: BED_PAD, groove: 'worship44', tip: 'Nasal mono hook: short phrases, glide between notes.' },
  'vinyl-choir': { style: 'billie', role: 'choir', tip: 'Lo-fi choir: hold chords, low and soft.' },
  // strings and orchestral
  'string-ensemble': { style: 'ballad', role: 'strings', tip: 'Root low in the left hand, close chord in the right; change exactly with the chords.' },
  'gospel-strings': { style: 'gospel', role: 'strings', tip: 'Fast-attack strings that keep up with gospel changes: hold chords, re-strike on pushes.' },
  'octave-strings': { style: 'worship', role: 'strings', tip: 'Big and cinematic: hold chords; the octave layer swells in.' },
  pizzicato: { style: 'pop', role: 'pluck-arp', bed: BED_PAD, tip: 'Plucked strings: short notes in 8ths through the chord.' },
  harp: { style: 'worship', role: 'arp16', tip: 'Quick arpeggios up through the chord, a glissando feel.' },
  'brass-section': { style: 'gospel', role: 'horns', bed: BED_GOSPEL_BASS, groove: 'pop', tip: 'Punchy unison riffs and stabs, short and together.' },
  // mallets
  vibes: { style: 'ballad', role: 'mallet', tip: 'Two-hand broken chords in 8ths; the motor adds the shimmer.' },
  marimba: { style: 'pop', role: 'mallet', groove: 'pop', tip: 'Broken chords in 8ths, light touch.' },
  'music-box': { style: 'worship', role: 'bells', tip: 'A few high notes, slow, with lots of space.' },
  celesta: { style: 'worship', role: 'bells', tip: 'High melodic touches over pads.' },
  glock: { style: 'pop', role: 'bells', tip: 'Short high doubling of a melody.' },
  tubular: { style: 'hymn', role: 'bells', range: [60, 84], tip: 'Single bell notes at the start of a phrase.' },
  // SA gospel (Spirit of Praise)
  'sa-gospel-piano': { style: 'sa-praise', role: 'piano-sa', bed: { preset: 'sa-lead-bass', role: 'bass-sa', volume: 0.5 }, tip: 'Left hand octaves on the beat; right hand add-9 chords on the off-beats (the "and" of 1, 2, 3 and 4). Walk the chords up step by step into the chorus: 1, 2, 3, 4, 5.' },
  'sa-praise-organ': { style: 'sa-praise', role: 'organ-gospel', bed: { preset: 'sa-lead-bass', role: 'bass-sa', volume: 0.5 }, tip: 'Hold chords under the piano and choir; glissando up into a new section; fast Leslie (pedal) for the shout.' },
  'sa-worship-organ': { style: 'sa-worship', role: 'organ-hold', bed: BED_PIANO, tip: 'A slow swelling bed: hold the chord, use the expression pedal to swell between the singer\'s lines.' },
  'sa-mass-choir': { style: 'sa-worship', role: 'choir', tip: 'Three-note chords, held and moved by step; let the choir answer the lead singer rather than play with them.' },
  'sa-lead-bass': { style: 'sa-praise', role: 'bass-sa', bed: BED_PAD, tip: 'A singing bass: root, octave jump, sixth, a fill on beat 4 into the next chord. Play legato so the slides glide.' },
  // Nigerian praise
  'naija-praise-keys': { style: 'naija', role: 'highlife-keys', bed: { preset: 'finger-bass', role: 'bass-naija', volume: 0.5 }, tip: 'Highlife lines in thirds and sixths with the right hand, lilting 16ths; hold a chord in the left hand under the call-and-response.' },
  'naija-organ-stabs': { style: 'naija', role: 'stabs', bed: { preset: 'finger-bass', role: 'bass-naija', volume: 0.5 }, tip: 'Short organ stabs for the shout moments; lift your hand between them so the percussion clicks again.' },
  'highlife-guitar': { style: 'highlife', role: 'highlife-keys', bed: { preset: 'finger-bass', role: 'bass-highlife', volume: 0.5 }, tip: 'Two notes at a time, a third or sixth apart, picked in a lilting 16th pattern high on the neck (C4 to C6).' },
  'naija-trumpet': { style: 'naija', role: 'horns', bed: { preset: 'finger-bass', role: 'bass-naija', volume: 0.5 }, tip: 'Short punchy riffs that answer the singer; record one into a loop for the whole song.' },
  'naija-synth-lead': { style: 'naija', role: 'lead', bed: BED_PAD, groove: 'naija-praise', tip: 'The praise lead: legato lines with slides, vibrato comes in on held notes.' },
  // Afrobeats and Afrobeat
  'afro-sub': { style: 'afrobeats', role: 'bass-afrobeats', bed: { preset: 'afro-ep', role: 'afro-keys', volume: 0.35 }, tip: 'Follow the kick: root on 1, again just after, a move on beat 3. Play legato to slide between notes.' },
  'log-drum': { style: 'afrobeats', role: 'bass-afrobeats', bed: { preset: 'afro-ep', role: 'afro-keys', volume: 0.35 }, groove: 'amapiano', tip: 'Short woody notes with slides between them; the amapiano bass melody. Leave space between hits.' },
  'afro-ep': { style: 'afrobeats', role: 'afro-keys', bed: { preset: 'afro-sub', role: 'bass-afrobeats', volume: 0.45 }, tip: 'Chop the chords: short 7th and 9th voicings on a syncopated rhythm, never held.' },
  'afro-marimba': { style: 'afrobeats', role: 'pluck-arp', range: [67, 91], bed: { preset: 'afro-sub', role: 'bass-afrobeats', volume: 0.45 }, tip: 'A short repeated hook high up; the dotted echo makes it bounce.' },
  'afro-sax': { style: 'afrobeats', role: 'lead', bed: { preset: 'afro-ep', role: 'afro-keys', volume: 0.35 }, tip: 'A short hook between vocal lines: few notes, slides, then rest.' },
  'fela-organ': { style: 'afrobeat', role: 'organ-stabs', bed: { preset: 'fela-bass', role: 'bass-fela', volume: 0.5 }, tip: 'Short Dorian stabs on the off-beats; leave the beat to the bass and the drums. Solo on top later.' },
  'fela-horns': { style: 'afrobeat', role: 'horns', bed: { preset: 'fela-bass', role: 'bass-fela', volume: 0.5 }, tip: 'Unison riffs with the octave, punched short; the riff repeats every two bars.' },
  'fela-bass': { style: 'afrobeat', role: 'bass-fela', bed: { preset: 'fela-organ', role: 'organ-stabs', volume: 0.35 }, tip: 'The vamp: the same two bars for minutes, short muted notes, root, fifth and flat seventh.' },
  'tenor-guitar': { style: 'afrobeat', role: 'rhythm-chop', bed: { preset: 'fela-bass', role: 'bass-fela', volume: 0.5 }, tip: 'A muted single-note ostinato locked to the hi-hat; never changes.' },
  // Elevation and Hillsong
  'elevation-keys': { style: 'elevation', role: 'piano-drive', bed: { preset: 'anthem-sub', role: 'bass-8ths', volume: 0.5 }, tip: 'In builds: the chord plus its top note an octave up in steady 8ths. In verses: hold chords and let the pad carry it.' },
  'anthem-sub': { style: 'elevation', role: 'bass-8ths', bed: BED_PAD, tip: 'Whole notes in verses; 8ths on the root in the build and the chorus.' },
  'elevation-arp': { style: 'elevation', role: 'arp16', bed: BED_PAD, tip: 'Hold a chord and play its notes in 16ths, or record a bar into a loop and leave it running through the build.' },
  'swell-guitar': { style: 'hillsong', role: 'bells', range: [64, 86], bed: BED_PAD, tip: 'Single notes or two-note chords: it swells in slowly, the echoes and shimmer fill the space.' },
  'hillsong-piano': { style: 'hillsong', role: 'piano-anthem', tip: 'Left hand root and octave held; right hand open add-9 chords on a pushing rhythm.' },
  // Billie
  'birds-bass': { style: 'billie-pop', role: 'bass-pop', bed: BED_PAD, tip: 'A melodic bass line under soft chords: root on the beat, octave and fifth to move.' },
  'pumping-piano': { style: 'billie-half', role: 'piano-pump', tip: 'Soft chords on every beat; the tremolo dips them like a side-chained piano. Play quietly.' },
  'whistle-synth': { style: 'billie-pop', role: 'lead', range: [72, 91], bed: BED_PAD, tip: 'A high whistling answer line: few notes, legato.' },
  'folk-acoustic': { style: 'ballad', role: 'pluck-arp', range: [52, 76], tip: 'Picked chords in 8ths, close and dry; good for verses.' },
  // drums
  'afro-kit': { style: 'naija', role: 'drums', groove: 'naija-praise', bed: { preset: 'finger-bass', role: 'bass-naija', volume: 0.45 }, tip: 'Pick a groove for it in Loops: Naija praise, highlife, Afrobeats, Afrobeat, amapiano or SA gospel praise.' },
  'pop-kit': { style: 'billie-pop', role: 'drums', groove: 'billie-pop', bed: { preset: 'birds-bass', role: 'bass-pop', volume: 0.45 }, tip: 'Pick Billie pop or Billie half-time in Loops; the snap sits on 2 and 4.' },
  // drums
  'sebene-kit': { style: 'sebene', role: 'drums', groove: 'sebene', bed: BED_BASS, tip: 'Not played from the keys: open Loops and pick a groove for it, or record your own pattern into its loop.' },
  'worship-kit': { style: 'anthem', role: 'drums', groove: 'worship44', bed: { preset: 'pick-bass', role: 'bass-8ths', volume: 0.45 }, tip: 'Pick a groove for it in Loops; start it with the first chorus.' },
};

/** A soft synth pad used under lead and bass demos. Not in the sound list. */
export const BED_PROGRAMS = {
  'warm-bed': {
    prog: {
      type: 'synth',
      osc: [{ wave: 'saw', level: 0.5, unison: 3, detune: 0.25, spread: 0.7 }, { wave: 'tri', level: 0.5 }],
      filter: { type: 'lp', slope: 24, cutoff: 1400, res: 0.05, key: 0.3 },
      env: { a: 0.4, d: 0.5, s: 0.9, r: 1.2 },
      level: 0.35,
    },
    fx: { mod: { on: true, type: 'chorus', rate: 0.3, depth: 0.3, mix: 0.3 }, reverb: { on: true, type: 'hall', decay: 3, mix: 0.3 } },
  },
};

// ------------------------------------------------------------------ rigs

// keys: what each hand plays on the keyboard (low..high, notes outside min/max dropped); loops: parts that
// are not played from the keys (index -> role); the combo's own groove plays on its drum part.
export const RIG_GUIDE = {
  'sebene-rig': {
    style: 'sebene',
    keys: [{ role: 'bass-sebene', range: [28, 47] }, { role: 'sebene-lead', range: [64, 88] }],
    tip: 'Left hand below C3 plays the bass, right hand above it the solo guitar. Start the drums from Loops (or the Loops box on Perform), then play the bass and the lead together; record the bass into a loop to free your left hand.',
  },
  'sebene-praise': {
    style: 'sebene',
    keys: [{ role: 'bass-sebene', range: [28, 47] }, { role: 'sebene-lead', range: [64, 88] }],
    loops: { 2: 'mi-solo' },
    tip: 'Record the mi-solo first: arm part 3 in Loops, play its answering line once, press Done. Then play bass and solo over it with the drums.',
  },
  'ndombolo-praise': {
    style: 'ndombolo',
    keys: [{ role: 'bass-sebene', range: [28, 47] }, { role: 'sebene-lead', range: [60, 80] }],
    tip: 'Synth bass on the left, the octave lead on the right (keep it around C4 to C5). Four-on-the-floor kit from Loops.',
  },
  'rumba-rig': {
    style: 'rumba',
    keys: [{ role: 'bass-rumba', range: [28, 47] }, { role: 'pluck-arp', range: [60, 84] }],
    tip: 'Slow rumba: bass on 1 and the "and" of 2, guitar arpeggios in 8ths on the right.',
  },
  'elevation-night': {
    style: 'worship',
    keys: [{ role: 'piano-worship', range: [36, 71] }, { role: 'bells', range: [76, 91] }],
    tip: 'Play piano with both hands; the pad follows every note. Notes from C5 up also ring the shimmer: touch a high note at the end of a phrase. Macro 1 brings the pad up for the chorus.',
  },
  'hillsong-sunday': {
    style: 'worship',
    keys: [{ role: 'ep-comp', range: [36, 70] }, { role: 'lead', range: [72, 86] }],
    tip: 'Below C5: Rhodes with strings inside it, comp chords. From C5 up: the Prophet lead for a melody line.',
  },
  'ambient-worship': {
    style: 'worship',
    keys: [{ role: 'piano-ambient', range: [36, 83] }, { role: 'bells', range: [85, 96] }],
    tip: 'Sparse piano with the shimmer pad inside it; the top octave (from C6) adds glass bells.',
  },
  'nord-piano-pad': {
    style: 'worship',
    keys: [{ role: 'piano-worship', range: [36, 81] }],
    tip: 'One layer, both hands: play piano and turn Macro 1 (Morph) to fade the pad in and the piano down.',
  },
  'nord-split': {
    style: 'gospel',
    keys: [{ role: 'bass-gospel', range: [28, 52] }, { role: 'ep-comp', range: [36, 79], min: 53 }],
    tip: 'Bass up to E3 in the left hand, Rhodes from F3 in the right: comp short syncopated chords.',
  },
  'gospel-b3-piano': {
    style: 'gospel',
    keys: [{ role: 'piano-gospel', range: [31, 82] }],
    tip: 'Piano and organ together: play gospel piano; Macro 1 fades the organ in for the shout.',
  },
  'brooklyn-stack': {
    style: 'choir',
    keys: [{ role: 'strings', range: [43, 79] }],
    tip: 'Hold chords: choir, strings and a little pipe organ move together. Keep the voicings close.',
  },
  'billie-dark': {
    style: 'billie',
    keys: [{ role: 'bass-pop', range: [28, 52] }, { role: 'piano-ballad', range: [33, 74], min: 53 }],
    tip: 'Dirty bass up to E3; lo-fi keys with the air pad from F3. Play soft and sparse.',
  },
  'synth-pop': {
    style: 'pop',
    keys: [{ role: 'bass-8ths', range: [28, 47] }, { role: 'pad', range: [55, 79] }, { role: 'pluck-arp', range: [84, 96] }],
    tip: 'Moog bass under C3, super-saw chords in the middle, the pluck from C6.',
  },
  hymn: {
    style: 'hymn',
    keys: [{ role: 'strings', range: [41, 79] }],
    tip: 'Pipe organ everywhere, the choir joins from G3 up: play hymn chords legato.',
  },
  // band rigs, two per style
  'sop-praise': {
    style: 'sa-praise',
    keys: [{ role: 'bass-sa', range: [28, 47] }, { role: 'piano-sa', range: [48, 84] }],
    tip: 'Left hand: the singing bass with fills on beat 4. Right hand: octaves and add-9 chords off the beat; organ and choir sound inside the piano (Macro 1 Organ, Macro 2 Choir). Start the SA praise groove from Loops.',
  },
  'sop-worship': {
    style: 'sa-worship',
    keys: [{ role: 'bass-whole', range: [28, 47] }, { role: 'piano-68', range: [48, 84] }],
    tip: 'Slow 12/8: long bass notes (slide into them), rolling triplets in the right hand; bring the choir up with Macro 1 for the second chorus.',
  },
  'naija-praise-band': {
    style: 'naija',
    keys: [{ role: 'bass-naija', range: [28, 47] }, { role: 'highlife-keys', range: [60, 84] }],
    loops: { 3: 'horns' },
    tip: 'Bouncing bass in the left hand; highlife thirds and sixths in the right. Record a trumpet riff into part 4\'s loop, then raise Macro 1 for organ stabs at the shout.',
  },
  'naija-highlife': {
    style: 'highlife',
    keys: [{ role: 'bass-highlife', range: [28, 47] }, { role: 'highlife-keys', range: [60, 83] }, { role: 'lead', range: [84, 96] }],
    tip: 'Walking highlife bass left; picked guitar in the middle; the praise lead above C6 for answers to the singer.',
  },
  'afrobeats-lagos': {
    style: 'afrobeats',
    keys: [{ role: 'bass-afrobeats', range: [28, 47] }, { role: 'afro-keys', range: [55, 81] }, { role: 'pluck-arp', range: [84, 96] }],
    loops: { 3: 'lead' },
    tip: 'Sub bass follows the kick; chop 7th and 9th chords in the middle; the marimba hook from C6. Raise Macro 1 for the sax loop.',
  },
  'afrobeat-fela': {
    style: 'afrobeat',
    keys: [{ role: 'bass-fela', range: [28, 47] }, { role: 'organ-stabs', range: [57, 77] }],
    loops: { 2: 'horns', 3: 'rhythm-chop' },
    tip: 'One two-bar vamp for a long time: bass riff left, organ stabs right. Record the horn riff and the tenor guitar into their loops; Macro 1 brings the horns in.',
  },
  'elevation-anthem': {
    style: 'elevation',
    keys: [{ role: 'bass-8ths', range: [28, 47] }, { role: 'piano-drive', range: [55, 84] }],
    loops: { 2: 'arp16' },
    tip: 'Verse: hold chords. Build: 8th-note sub and the octave piano in 8ths, start the arp loop (Macro 1), switch the kit from Elevation build to Elevation drive for the chorus.',
  },
  'elevation-68': {
    style: 'elevation68',
    keys: [{ role: 'bass-whole', range: [28, 47] }, { role: 'piano-68', range: [48, 83] }, { role: 'bells', range: [86, 96] }],
    tip: 'Whole notes in the bass; rolling 6/8 triplets in the right hand; a single high note from C6 swells the guitar. Macro 1 adds shimmer.',
  },
  'hillsong-anthem': {
    style: 'hillsong',
    keys: [{ role: 'bass-anthem', range: [28, 47] }, { role: 'piano-anthem', range: [48, 84] }],
    tip: 'Verse: piano and pad only (half-time kit). Chorus: open add-9 chords on the push, strings up with Macro 2, full Hillsong chorus kit.',
  },
  'hillsong-drive': {
    style: 'hillsong-drive',
    keys: [{ role: 'bass-8ths', range: [28, 47] }, { role: 'piano-drive', range: [55, 84] }],
    loops: { 3: 'arp16' },
    tip: 'Driving 8ths in both hands, the air pad inside the piano, the arp loop on top (Macro 1).',
  },
  'billie-birds': {
    style: 'billie-pop',
    keys: [{ role: 'bass-pop', range: [28, 52] }, { role: 'ep-comp', range: [36, 79], min: 53 }, { role: 'lead', range: [84, 96] }],
    tip: 'Melodic bass up to E3; warm 7th chords in the middle; the whistle synth above C6. Keep everything soft and dry.',
  },
  'billie-whisper': {
    style: 'billie-half',
    keys: [{ role: 'bass-808', range: [28, 47] }, { role: 'piano-pump', range: [48, 72] }],
    tip: 'Long 808 notes in the left hand (legato slides); soft chords on every beat in the right, pumping. Macro 1 brings in the acoustic guitar, Macro 2 the air pad.',
  },
};

// ------------------------------------------------------------------ builders

/**
 * The demo for one sound: tracks for 'main' (the sound), 'bed' and 'drums', in keyboard notes and beats.
 * Returns { bpm, beats, tracks: [{ part: 'main'|'bed'|'drums', events, light, preset? }] }.
 */
export function soundDemo(presetId, { bpm: bpmOver } = {}) {
  const g = SOUND_GUIDE[presetId];
  if (!g) return null;
  const st = STYLES[g.style] || STYLES.worship;
  const bpm = bpmOver || st.bpm;
  const bars = demoBars(bpm);
  const tl = timeline(fill(st.bars, bars));
  const beats = bars * 4;
  const tracks = [];
  if (g.role !== 'drums') tracks.push({ part: 'main', events: phrase(g.role, { tl, range: g.range }), light: true });
  if (g.bed) tracks.push({ part: 'bed', preset: g.bed.preset, volume: g.bed.volume, events: phrase(g.bed.role, { tl, seed: 3 }), light: false });
  const groove = g.groove === false ? null : g.groove || (isRhythmic(g.role) ? st.groove : null);
  if (groove || g.role === 'drums') tracks.push({ part: 'drums', events: expandGroove(groove || st.groove, bars), light: false });
  return { bpm, beats, tracks };
}

const isRhythmic = (role) => /^(bass-|sebene|mi-solo|rhythm|likembe|skank|stabs|afro|horns)/.test(role);

/**
 * The demo for a rig on its performance (parts by index), optionally on a song's chords and tempo.
 * Returns { bpm, beats, tracks: [{ kind: 'keys'|'part', part?, shift?, events }] }.
 */
export function rigDemo(comboId, perf, { bars: songBars, bpm: songBpm, groove: songGroove, keys: songKeys } = {}) {
  const g = RIG_GUIDE[comboId];
  if (!g) return null;
  const st = STYLES[g.style] || STYLES.worship;
  const bpm = songBpm || g.bpm || st.bpm;
  // a song plays its whole section (up to 8 bars); a fast short loop is played twice
  const n = songBars ? (bpm >= 100 ? 8 : Math.max(4, Math.min(8, songBars.length))) : demoBars(bpm);
  const tl = timeline(fill(songBars || g.bars || st.bars, n));
  const tracks = [];
  for (const k of songKeys || g.keys) {
    let events = phrase(k.role, { tl, range: k.range, seed: 11 });
    if (k.min != null) events = events.filter((e) => e.note >= k.min);
    if (k.max != null) events = events.filter((e) => e.note <= k.max);
    tracks.push({ kind: 'keys', events });
  }
  for (const [idx, role] of Object.entries(g.loops || {})) {
    const p = perf.parts[Number(idx)];
    if (p) tracks.push({ kind: 'part', part: Number(idx), shift: (p.octave || 0) * 12 + (p.transpose || 0), events: phrase(role, { tl, seed: 5 }) });
  }
  const kit = perf.parts.findIndex((p) => p.prog && p.prog.type === 'drums');
  const groove = songGroove || perf.groove || g.groove || st.groove;
  if (kit >= 0 && groove) tracks.push({ kind: 'part', part: kit, shift: 0, events: expandGroove(groove, n) });
  return { bpm, beats: n * 4, tracks };
}
