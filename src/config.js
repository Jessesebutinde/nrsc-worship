// The anon key is public by design: row-level security on songcut_jobs only
// lets the browser insert (youtube_url, scan_window) and read rows.
export const SUPABASE_URL = 'https://fftlbnialgifdcxxkkxv.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZmdGxibmlhbGdpZmRjeHhra3h2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzNTE0NDgsImV4cCI6MjEwNTkyNzQ0OH0.z-KN1EdMO3kbbG_kQRM9qolk1PSXDXu8lhmX1PEoFLY';
export const TABLE = 'songcut_jobs';

export const WINDOWS = [
  { value: '40', label: 'First 40 min', seconds: 40 * 60 },
  { value: '60', label: 'First 60 min', seconds: 60 * 60 },
  { value: 'full', label: 'Full service', seconds: Infinity },
];
