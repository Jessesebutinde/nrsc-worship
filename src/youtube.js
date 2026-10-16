// YouTube link helpers.

const ID = /^[A-Za-z0-9_-]{11}$/;

export function youtubeId(input) {
  const text = String(input || '').trim();
  if (ID.test(text)) return text;
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, '');
  if (host === 'youtu.be') {
    const id = url.pathname.split('/')[1];
    return ID.test(id) ? id : null;
  }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const v = url.searchParams.get('v');
    if (v && ID.test(v)) return v;
    const m = /^\/(live|shorts|embed|v)\/([A-Za-z0-9_-]{11})/.exec(url.pathname);
    if (m) return m[2];
  }
  return null;
}

export function canonicalUrl(id) {
  return `https://www.youtube.com/watch?v=${id}`;
}
