import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import backupPostgresHandler from './backup-postgres.js';
import permissionsHandler from './permissions.js';
import sheetProxyHandler from './sheet-proxy.js';
import distributionReportsHandler from './distribution-reports.js';
import appConfigHandler from './app-config.js';
import remoteMySqlHandler from './remote-mysql.js';
import { getSyncState, updateSyncState, runServerPodSyncIteration } from './pod-background-sync.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCHED_FILE = path.resolve(__dirname, '../scripts/backup-schedule.json');

const router = express.Router();

// 1. /api/backup-schedule (GET / POST)
router.get('/backup-schedule', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  try {
    if (fs.existsSync(SCHED_FILE)) {
      const data = JSON.parse(fs.readFileSync(SCHED_FILE, 'utf8'));
      return res.status(200).json({ ok: true, schedule: data });
    }
    return res.status(200).json({
      ok: true,
      schedule: { enabled: true, mode: 'DAILY_TIME', time: '18:00', intervalHours: 1, intervalMinutes: 0 }
    });
  } catch (e) {
    return res.status(500).json({ ok: false, message: e.message });
  }
});

router.post('/backup-schedule', (req, res) => {
  try {
    const parsed = req.body || {};
    let existing = { enabled: true, mode: 'DAILY_TIME', time: '18:00', intervalHours: 1, intervalMinutes: 0 };
    if (fs.existsSync(SCHED_FILE)) {
      try { existing = JSON.parse(fs.readFileSync(SCHED_FILE, 'utf8')); } catch {}
    }
    const updated = {
      ...existing,
      ...parsed,
      updatedAt: new Date().toISOString()
    };
    fs.writeFileSync(SCHED_FILE, JSON.stringify(updated, null, 2), 'utf8');
    return res.status(200).json({
      ok: true,
      schedule: updated,
      message: 'បានរក្សាទុកកាលវិភាគ Backup ស្វ័យប្រវត្តជោគជ័យ!'
    });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
});

// 2. /api/backup-postgres
router.all('/backup-postgres', async (req, res) => {
  try {
    await backupPostgresHandler(req, res);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ ok: false, message: err.message });
    }
  }
});

// 3. /api/permissions
router.all('/permissions', async (req, res) => {
  try {
    await permissionsHandler(req, res);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  }
});

// 4. /api/sheet-proxy
router.all('/sheet-proxy', async (req, res) => {
  try {
    await sheetProxyHandler(req, res);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  }
});

// 5. /api/distribution-reports
router.all('/distribution-reports', async (req, res) => {
  try {
    await distributionReportsHandler(req, res);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  }
});

// 6. /api/app-config
router.all('/app-config', async (req, res) => {
  try {
    await appConfigHandler(req, res);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  }
});

// 7. /api/remote-mysql & /api/master-db
router.all('/remote-mysql', async (req, res) => {
  try {
    await remoteMySqlHandler(req, res);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ ok: false, message: err.message });
    }
  }
});

router.all('/master-db', async (req, res) => {
  try {
    await remoteMySqlHandler(req, res);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ ok: false, message: err.message });
    }
  }
});

// 8. /api/pod-sync-status & /api/pod-sync-control
router.get('/pod-sync-status', async (_req, res) => {
  try {
    return res.status(200).json({ ok: true, state: getSyncState() });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err?.message });
  }
});

router.post('/pod-sync-control', async (req, res) => {
  try {
    const parsed = req.body || {};
    if (parsed.action === 'toggle') {
      updateSyncState({ enabled: Boolean(parsed.enabled) });
    } else if (parsed.action === 'trigger_now') {
      runServerPodSyncIteration();
    } else if (parsed.action === 'set_interval') {
      updateSyncState({ intervalSeconds: Math.max(10, parseInt(parsed.intervalSeconds, 10) || 15) });
    } else if (parsed.action === 'reset_id') {
      updateSyncState({ lastSyncedId: parseInt(parsed.id, 10) || 0 });
    }
    return res.status(200).json({ ok: true, state: getSyncState() });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err?.message });
  }
});

// 9. /api/health
router.get('/health', (_req, res) => {
  return res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'ialsystems-accounting-backend'
  });
});

export default router;
