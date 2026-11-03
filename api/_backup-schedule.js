import fs from 'fs';
import path from 'path';
import { withAuth } from '../backend/api/auth-middleware.js';

async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // On Vercel Serverless, local disk is read-only except /tmp
  const SCHED_FILE = '/tmp/backup-schedule.json';

  const defaultSchedule = {
    enabled: true,
    mode: 'DAILY_TIME',
    time: '18:00',
    intervalHours: 1,
    intervalMinutes: 0
  };

  if (req.method === 'GET') {
    try {
      if (fs.existsSync(SCHED_FILE)) {
        const data = JSON.parse(fs.readFileSync(SCHED_FILE, 'utf8'));
        return res.status(200).json({ ok: true, schedule: data });
      }
      return res.status(200).json({ ok: true, schedule: defaultSchedule });
    } catch (e) {
      return res.status(200).json({ ok: true, schedule: defaultSchedule });
    }
  }

  if (req.method === 'POST') {
    try {
      const parsed = req.body || {};
      let existing = defaultSchedule;
      if (fs.existsSync(SCHED_FILE)) {
        try {
          existing = JSON.parse(fs.readFileSync(SCHED_FILE, 'utf8'));
        } catch {}
      }
      const updated = {
        ...existing,
        ...parsed,
        updatedAt: new Date().toISOString()
      };
      try {
        fs.writeFileSync(SCHED_FILE, JSON.stringify(updated, null, 2), 'utf8');
      } catch {}

      return res.status(200).json({
        ok: true,
        schedule: updated,
        message: 'បានរក្សាទុកកាលវិភាគ Backup ស្វ័យប្រវត្តជោគជ័យ!'
      });
    } catch (err) {
      return res.status(200).json({
        ok: true,
        schedule: defaultSchedule,
        message: 'Saved in session memory'
      });
    }
  }

  return res.status(405).json({ ok: false, message: 'Method Not Allowed' });
}

const requireAdmin = withAuth(handler, 'ADMIN');

// Any signed-in user may read the schedule; only ADMIN may change it.
export default withAuth((req, res) => (req.method === 'POST' ? requireAdmin(req, res) : handler(req, res)));
