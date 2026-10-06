// songcut_jobs over Supabase's REST API. The browser only ever INSERTs
// (youtube_url, scan_window) and SELECTs; it never updates or deletes.

import { SUPABASE_URL, SUPABASE_ANON_KEY, TABLE } from './config.js';

export const COLUMNS =
  'id,youtube_url,scan_window,status,progress,stage,title,duration_s,audio_url,songs,error,created_at';

const BASE = `${SUPABASE_URL}/rest/v1/${TABLE}`;

function headers(extra = {}) {
  return { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, ...extra };
}

async function request(url, init = {}, fetchImpl = fetch) {
  let res;
  try {
    res = await fetchImpl(url, { ...init, headers: headers(init.headers) });
  } catch {
    throw new Error('Could not reach the job server. Check your internet connection.');
  }
  if (!res.ok) {
    let msg = `Job server error (HTTP ${res.status})`;
    try {
      const body = await res.json();
      if (body && body.message) msg += `: ${body.message}`;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export function normalizeJob(row) {
  if (!row) return row;
  let songs = row.songs;
  if (typeof songs === 'string') {
    try {
      songs = JSON.parse(songs);
    } catch {
      songs = null;
    }
  }
  return { ...row, songs: Array.isArray(songs) ? songs : null };
}

export async function getJob(id, fetchImpl) {
  const rows = await request(`${BASE}?select=${COLUMNS}&id=eq.${encodeURIComponent(id)}`, {}, fetchImpl);
  return rows && rows[0] ? normalizeJob(rows[0]) : null;
}

export async function listReady(limit = 25, fetchImpl) {
  const rows = await request(
    `${BASE}?select=${COLUMNS}&status=eq.ready&order=created_at.desc&limit=${limit}`,
    {},
    fetchImpl,
  );
  return (rows || []).map(normalizeJob);
}

/** Recent jobs for the same video and window (newest first). */
export async function findJobs(videoId, scanWindow, fetchImpl) {
  const q = new URLSearchParams({
    select: COLUMNS,
    youtube_url: `ilike.*${videoId}*`,
    scan_window: `eq.${scanWindow}`,
    order: 'created_at.desc',
    limit: '10',
  });
  const rows = await request(`${BASE}?${q}`, {}, fetchImpl);
  return (rows || []).map(normalizeJob);
}

export async function createJob(youtubeUrl, scanWindow, fetchImpl) {
  const rows = await request(
    BASE,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ youtube_url: youtubeUrl, scan_window: scanWindow }),
    },
    fetchImpl,
  );
  if (rows && rows[0]) return normalizeJob(rows[0]);
  return null;
}

export async function getJobs(ids, fetchImpl) {
  if (!ids.length) return [];
  const list = ids.map((id) => encodeURIComponent(id)).join(',');
  const rows = await request(`${BASE}?select=${COLUMNS}&id=in.(${list})`, {}, fetchImpl);
  return (rows || []).map(normalizeJob);
}
