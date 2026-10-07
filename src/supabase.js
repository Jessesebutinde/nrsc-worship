// Songcut jobs over the box job API (local SQLite + filesystem audio).
// The browser only creates jobs and reads status / recent / audio.

import { SONGCUT_API_BASE } from './config.js';

const BASE = `${SONGCUT_API_BASE}/api/jobs`;

async function request(url, init = {}, fetchImpl = fetch) {
  let res;
  try {
    res = await fetchImpl(url, {
      ...init,
      headers: { Accept: 'application/json', ...(init.headers || {}) },
    });
  } catch {
    throw new Error('Could not reach the job server. Check your internet connection.');
  }
  if (!res.ok) {
    let msg = `Job server error (HTTP ${res.status})`;
    try {
      const body = await res.json();
      if (body && body.message) msg += `: ${body.message}`;
      else if (body && body.detail && body.detail.message) msg += `: ${body.detail.message}`;
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
  const row = await request(`${BASE}/${encodeURIComponent(id)}`, {}, fetchImpl);
  return row ? normalizeJob(row) : null;
}

export async function listReady(limit = 25, fetchImpl) {
  const rows = await request(`${BASE}?status=ready&limit=${limit}`, {}, fetchImpl);
  return (rows || []).map(normalizeJob);
}

/** Recent jobs for the same video and window (newest first). */
export async function findJobs(videoId, scanWindow, fetchImpl) {
  const q = new URLSearchParams({
    video_id: videoId,
    scan_window: scanWindow,
    limit: '10',
  });
  const rows = await request(`${BASE}?${q}`, {}, fetchImpl);
  return (rows || []).map(normalizeJob);
}

export async function createJob(youtubeUrl, scanWindow, fetchImpl) {
  const row = await request(
    BASE,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ youtube_url: youtubeUrl, scan_window: scanWindow }),
    },
    fetchImpl,
  );
  return row ? normalizeJob(row) : null;
}

export async function getJobs(ids, fetchImpl) {
  if (!ids.length) return [];
  const rows = await request(`${BASE}?ids=${ids.map(encodeURIComponent).join(',')}`, {}, fetchImpl);
  return (rows || []).map(normalizeJob);
}
