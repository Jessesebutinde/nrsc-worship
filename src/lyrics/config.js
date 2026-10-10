// Lyric Slides settings.

export const CHURCH_NAME = 'Namasuba Redeemed';

// How the remote reaches the screen when they are not in the same browser.
//
// Out of the box it uses a public MQTT relay (no account needed): the phone and the TV both
// connect to the broker and talk through the room code. Anyone who knows the six-letter code
// could send text to the screen, and nothing but the current slide is sent, so this is fine
// for lyrics. Set RELAY_URLS to [] to turn it off (same-computer only).
export const RELAY_URLS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt'];

// Or your own Supabase project (Realtime broadcast + the shared song library). When set, it is
// used instead of the public relay. See supabase/lyric_slides.sql. The anon key is public by
// design; row-level security protects the tables.
export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';
