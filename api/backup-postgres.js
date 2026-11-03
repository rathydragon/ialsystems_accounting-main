import backupHandler from '../backend/api/backup-postgres.js';
import scheduleHandler from './_backup-schedule.js';
import { withAuth } from '../backend/api/auth-middleware.js';

const protectedBackup = withAuth(backupHandler, 'ADMIN', 'ACCOUNTANT');

// One function serves both routes to stay within Vercel's serverless function limit.
// /api/backup-schedule is rewritten here with ?route=schedule (see vercel.json).
export default function handler(req, res) {
  if (req.query?.route === 'schedule') return scheduleHandler(req, res);
  return protectedBackup(req, res);
}
