// Lyric Slides settings.

export const CHURCH_NAME = 'Namasuba Redeemed';

// Every remote and screen joins this one channel, so nothing needs a code. (A different channel can
// still be used with ?room=NAME on both the remote and the screen links.) Anyone who knows the name
// could send text to the screens over the public relay; change it to something less guessable if
// that ever matters.
export const ROOM = 'NAMASUBA-REDEEMED';

// How the remote reaches the screen when they are not in the same browser.
//
// Out of the box it uses a public MQTT relay (no account needed): the laptop (or phone) and the TV both
// connect to the broker and talk on the ROOM channel above. Nothing but the current slide is sent. Set RELAY_URLS to [] to turn it off (same-computer only).
export const RELAY_URLS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt'];

// Or your own Supabase project (Realtime broadcast + the shared song library). When set, it is
// used instead of the public relay. See supabase/lyric_slides.sql. The anon key is public by
// design; row-level security protects the tables.
export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';
