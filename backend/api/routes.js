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
import telegramAlertHandler from './telegram-proxy.js';
import { dailySummaryCronHandler } from './daily-distribution-summary.js';
import geminiProxyHandler from './gemini-proxy.js';
import { webhookHandler as telegramBookingWebhook, bookingApiHandler as telegramBookingApi } from './telegram-booking.js';
import { getSyncState, updateSyncState, runServerPodSyncIteration } from './pod-background-sync.js';
import invoiceNumbersHandler from './invoice-numbers.js';
import { verifyAuth, requireRole, optionalAuth } from './auth-middleware.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCHED_FILE = path.resolve(__dirname, '../scripts/backup-schedule.json');

const router = express.Router();

// 1. /api/backup-schedule (GET / POST)
router.get('/backup-schedule', verifyAuth, (req, res) => {
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

router.post('/backup-schedule', verifyAuth, requireRole('ADMIN'), (req, res) => {
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

// 2. /api/backup-postgres (Admin / Accountant)
router.all('/backup-postgres', verifyAuth, requireRole('ADMIN', 'ACCOUNTANT'), async (req, res) => {
  try {
    await backupPostgresHandler(req, res);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ ok: false, message: err.message });
    }
  }
});

// 3. /api/permissions (Self-authenticated: Login is public, mutations require Admin)
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
router.all('/sheet-proxy', optionalAuth, async (req, res) => {
  try {
    await sheetProxyHandler(req, res);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  }
});

// 5. /api/distribution-reports (Protected)
router.all('/distribution-reports', verifyAuth, async (req, res) => {
  try {
    await distributionReportsHandler(req, res);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  }
});

// 6. /api/app-config (Protected)
router.all('/app-config', verifyAuth, async (req, res) => {
  try {
    await appConfigHandler(req, res);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  }
});

// 7. /api/remote-mysql & /api/master-db (Protected)
router.all('/remote-mysql', verifyAuth, async (req, res) => {
  try {
    await remoteMySqlHandler(req, res);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ ok: false, message: err.message });
    }
  }
});

router.all('/master-db', verifyAuth, async (req, res) => {
  try {
    await remoteMySqlHandler(req, res);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ ok: false, message: err.message });
    }
  }
});

// 8. /api/pod-sync-status & /api/pod-sync-control
router.get('/pod-sync-status', verifyAuth, async (_req, res) => {
  try {
    return res.status(200).json({ ok: true, state: getSyncState() });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err?.message });
  }
});

router.post('/pod-sync-control', verifyAuth, requireRole('ADMIN'), async (req, res) => {
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

// 9. /api/telegram-alert
// Scheduler entry for the daily distribution summary (CRON_SECRET-guarded, see daily-distribution-summary.js)
router.get('/telegram-alert', async (req, res) => {
  if (req.query?.cron !== 'daily-summary') return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  await dailySummaryCronHandler(req, res);
});
router.post('/telegram-alert', verifyAuth, async (req, res) => {
  try {
    await telegramAlertHandler(req, res);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: err?.message });
    }
  }
});

// 9b. /api/gemini-proxy (Protected: keeps GEMINI_API_KEY server-side)
router.all('/gemini-proxy', verifyAuth, async (req, res) => {
  try {
    await geminiProxyHandler(req, res);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: { message: err?.message } });
    }
  }
});

// 9c. /api/telegram-booking-webhook (Public: verified by Telegram secret token header)
router.post('/telegram-booking-webhook', async (req, res) => {
  try {
    await telegramBookingWebhook(req, res);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ ok: false, message: err?.message });
    }
  }
});

// 9d. /api/telegram-bookings (Protected: Booking page)
router.all('/telegram-bookings', verifyAuth, async (req, res) => {
  try {
    await telegramBookingApi(req, res);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ ok: false, message: err?.message });
    }
  }
});

// 10. /api/health
// /api/invoice-numbers — printed invoice numbers, stored in this PC's PostgreSQL only (not Hostinger)
router.all('/invoice-numbers', verifyAuth, async (req, res) => {
  try {
    await invoiceNumbersHandler(req, res);
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ ok: false, message: err.message });
  }
});

router.get('/health', (_req, res) => {
  return res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'ialsystems-accounting-backend'
  });
});

export default router;
