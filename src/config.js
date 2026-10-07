// Songcut job API runs on Jesse's box (Cloudflare tunnel). No Supabase.
// If Find songs / Recent break with network errors, the tunnel URL may have
// rotated — update SONGCUT_API_BASE from /workspace/songcut/public-api-url.txt
// on the box and redeploy.
export const SONGCUT_API_BASE = 'https://procedure-labour-asp-smaller.trycloudflare.com';

export const WINDOWS = [
  { value: '40', label: 'First 40 min', seconds: 40 * 60 },
  { value: '60', label: 'First 60 min', seconds: 60 * 60 },
  { value: 'full', label: 'Full service', seconds: Infinity },
];
