import { getSyncState } from '../backend/api/pod-background-sync.js';
import { withAuth } from '../backend/api/auth-middleware.js';

async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }
  try {
    // Vercel functions are stateless and cannot run the 24/7 worker; the browser
    // performs the sync itself, so tell it not to take `enabled` from this state.
    return res.status(200).json({ ok: true, serverless: true, state: getSyncState() });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err?.message });
  }
}

export default withAuth(handler);
