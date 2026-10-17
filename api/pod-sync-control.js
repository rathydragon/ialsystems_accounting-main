import { getSyncState, updateSyncState, runServerPodSyncIteration } from '../backend/api/pod-background-sync.js';
import { withAuth } from '../backend/api/auth-middleware.js';

async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }
  try {
    const parsed = req.body || {};
    if (parsed.action === 'toggle') {
      updateSyncState({ enabled: Boolean(parsed.enabled) });
    } else if (parsed.action === 'trigger_now') {
      // Serverless functions freeze after responding, so the run must finish first
      await runServerPodSyncIteration();
    } else if (parsed.action === 'set_interval') {
      updateSyncState({ intervalSeconds: Math.max(10, parseInt(parsed.intervalSeconds, 10) || 15) });
    } else if (parsed.action === 'reset_id') {
      updateSyncState({ lastSyncedId: parseInt(parsed.id, 10) || 0 });
    }
    return res.status(200).json({ ok: true, state: getSyncState() });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err?.message });
  }
}

export default withAuth(handler, 'ADMIN');
