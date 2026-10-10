// Wireless outputs from the browser: Google Cast (Chromecast, Google TV, Android TV) through the
// Presentation API, and the computer's own second display through the Window Management API.

export const canCast = () => typeof PresentationRequest !== 'undefined';

/**
 * Opens `url` on a Cast device picked by the user (Chrome shows its device list).
 * Resolves with the PresentationConnection; messages on it are JSON strings.
 */
export async function castTo(url) {
  if (!canCast()) throw new Error('Casting needs Google Chrome.');
  const req = new PresentationRequest([url]);
  const conn = await req.start();
  return conn;
}

/** On the presented (receiver) page: calls `onConnection` for each controller that connects. */
export function receiveCast(onConnection) {
  const r = navigator.presentation && navigator.presentation.receiver;
  if (!r) return false;
  r.connectionList.then((list) => {
    list.connections.forEach(onConnection);
    list.onconnectionavailable = (e) => onConnection(e.connection);
  });
  return true;
}

/** The displays attached to this computer (needs the window-management permission). */
export async function otherScreens() {
  if (!window.getScreenDetails) return [];
  try {
    const d = await window.getScreenDetails();
    return d.screens.filter((s) => !s.isPrimary || d.screens.length === 1);
  } catch {
    return [];
  }
}

/**
 * Opens `url` as a fullscreen window on another display when the browser allows it,
 * otherwise as a plain popup the user drags to the TV.
 */
export async function openOnScreen(url, name = 'lyric-screen') {
  const screens = await otherScreens();
  const s = screens[0];
  if (s) {
    const w = window.open(url, name, `popup,fullscreen,left=${s.availLeft},top=${s.availTop},width=${s.availWidth},height=${s.availHeight}`);
    return { window: w, placed: true, label: s.label || 'second display' };
  }
  return { window: window.open(url, name, 'popup,width=1280,height=720'), placed: false };
}
