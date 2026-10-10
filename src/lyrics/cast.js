// Getting the picture onto the TV and the ATEM from the operator's laptop:
// - Google Cast (Chromecast, Google TV, Android TV) through the Presentation API;
// - any display attached to the laptop (HDMI, or a wireless display joined with Windows+K or AirPlay),
//   placed with the Window Management API when the browser has it.

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

export const canPlaceWindows = () => typeof window !== 'undefined' && 'getScreenDetails' in window;

/** 'granted' | 'prompt' | 'denied' | 'unsupported' for the window-management permission. */
export async function displayPermission() {
  if (!canPlaceWindows()) return 'unsupported';
  try {
    const p = await navigator.permissions.query({ name: 'window-management' });
    return p.state;
  } catch {
    return 'prompt';
  }
}

function describe(s, i) {
  return {
    id: `${s.label || 'display'}@${s.availLeft},${s.availTop}`,
    label: s.label || `Display ${i + 1}`,
    left: s.availLeft,
    top: s.availTop,
    width: s.availWidth,
    height: s.availHeight,
    internal: Boolean(s.isInternal),
  };
}

/**
 * The displays other than the one this window is on: [{ id, label, left, top, width, height }].
 * Asks for the window-management permission when it has not been granted. [] when not available.
 * `onChange` is called again whenever displays are plugged in or removed.
 */
export async function extraDisplays(onChange) {
  if (!canPlaceWindows()) return [];
  try {
    const d = await window.getScreenDetails();
    const list = () => d.screens.filter((s) => s !== d.currentScreen).map(describe);
    if (onChange) d.onscreenschange = () => onChange(list());
    return list();
  } catch {
    return [];
  }
}

/**
 * Opens `url` filling `display`. Must be called straight from a click (no await before it), or the
 * browser opens a plain window instead of a fullscreen one. Returns the window, or null if blocked.
 */
export function openOn(url, name, display) {
  if (display) {
    return window.open(
      url,
      name,
      `popup,fullscreen,left=${display.left},top=${display.top},width=${display.width},height=${display.height}`,
    );
  }
  return window.open(url, name, 'popup,width=1280,height=720');
}

/** Which of `displays` a window we opened is on (by its position), or null if it is closed. */
export function displayOf(win, displays) {
  try {
    if (!win || win.closed) return null;
    const x = win.screenX + win.outerWidth / 2;
    const y = win.screenY + win.outerHeight / 2;
    return displays.find((d) => x >= d.left && x < d.left + d.width && y >= d.top && y < d.top + d.height) || null;
  } catch {
    return null;
  }
}

/** "windows" | "mac" | "chromeos" | "other": for the wireless-display steps. */
export function platform() {
  const p = ((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || navigator.userAgent || '').toLowerCase();
  if (p.includes('win')) return 'windows';
  if (p.includes('mac')) return 'mac';
  if (p.includes('cros') || p.includes('chrome os')) return 'chromeos';
  return 'other';
}
