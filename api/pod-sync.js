import statusHandler from '../backend/vercel-handlers/pod-sync-status.js';
import controlHandler from '../backend/vercel-handlers/pod-sync-control.js';

// One function serves both routes to stay within Vercel's serverless function limit.
// /api/pod-sync-status and /api/pod-sync-control are rewritten here (see vercel.json).
export default function handler(req, res) {
  if (req.query?.route === 'control') return controlHandler(req, res);
  return statusHandler(req, res);
}
