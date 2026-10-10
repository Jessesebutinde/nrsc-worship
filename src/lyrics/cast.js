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

/**
 * The displays other than the laptop's own screen: [{ label, left, top, width, height }].
 * Asks for the window-management permission the first time. [] when not available.
 */
export async function extraDisplays() {
  if (!canPlaceWindows()) return [];
  try {
    const d = await window.getScreenDetails();
    const list = d.screens.length > 1 ? d.screens.filter((s) => s !== d.currentScreen && !s.isInternal) : [];
    const others = list.length ? list : d.screens.filter((s) => s !== d.currentScreen);
    return others.map((s, i) => ({
      label: s.label || `Display ${i + 2}`,
      left: s.availLeft,
      top: s.availTop,
      width: s.availWidth,
      height: s.availHeight,
    }));
  } catch {
    return [];
  }
}

/** Opens `url` filling `display` (from extraDisplays), or as a window to drag when there is none. */
export function openOn(url, name, display) {
  if (display) {
    const w = window.open(
      url,
      name,
      `popup,fullscreen,left=${display.left},top=${display.top},width=${display.width},height=${display.height}`,
    );
    return { window: w, placed: true, label: display.label };
  }
  return { window: window.open(url, name, 'popup,width=1280,height=720'), placed: false };
}

/** "windows" | "mac" | "chromeos" | "other": for the wireless-display steps. */
export function platform() {
  const p = ((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || navigator.userAgent || '').toLowerCase();
  if (p.includes('win')) return 'windows';
  if (p.includes('mac')) return 'mac';
  if (p.includes('cros') || p.includes('chrome os')) return 'chromeos';
  return 'other';
}
