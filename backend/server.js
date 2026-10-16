import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';

import app from './app.js';
import { initServerPodSync } from './api/pod-background-sync.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from backend/.env
dotenv.config({ path: path.resolve(__dirname, '.env') });

const server = http.createServer(app);

// ==========================================
// Background Auto-Backup Scheduler
// ==========================================
let lastAutoRunTime = 0;
let lastDailyRunDate = '';

let autoBackupInterval = null;

function startAutoBackupScheduler() {
  const schedFile = path.resolve(__dirname, 'scripts/backup-schedule.json');

  const checkAndRunAutoBackup = async () => {
    try {
      if (!fs.existsSync(schedFile)) return;
      const config = JSON.parse(fs.readFileSync(schedFile, 'utf8'));
      if (config.enabled === false) return;

      const now = new Date();
      const currentHour = now.getHours();
      const currentMin = now.getMinutes();
      const todayDateStr = now.toISOString().slice(0, 10);

      let shouldRun = false;
      if (config.mode === 'INTERVAL') {
        const totalMinutes = ((parseInt(config.intervalHours, 10) || 0) * 60) + (parseInt(config.intervalMinutes, 10) || 0);
        const intervalMs = Math.max(totalMinutes, 1) * 60 * 1000;
        const lastRun = config.lastBackupAt ? new Date(config.lastBackupAt).getTime() : 0;
        const effectiveLast = Math.max(lastRun, lastAutoRunTime);
        if (Date.now() - effectiveLast >= intervalMs) {
          shouldRun = true;
        }
      } else {
        // DAILY_TIME mode (default)
        const targetTimeStr = config.time || '18:00';
        const [tH, tM] = targetTimeStr.split(':').map((n) => parseInt(n, 10) || 0);
        const isMatch = (currentHour === tH && currentMin === tM) ||
          (currentHour > tH && lastDailyRunDate !== todayDateStr && (!config.lastBackupAt || !config.lastBackupAt.startsWith(todayDateStr)));
        if (isMatch && lastDailyRunDate !== todayDateStr && Date.now() - lastAutoRunTime > 10 * 60 * 1000) {
          shouldRun = true;
        }
      }

      if (shouldRun) {
        lastAutoRunTime = Date.now();
        lastDailyRunDate = todayDateStr;
        console.log(`[Auto-Backup] 🚀 កំពុងដំណើរការ Backup ស្វ័យប្រវត្តិតាមកាលវិភាគ (${now.toLocaleTimeString('km-KH')})...`);
        const scriptPath = path.resolve(__dirname, 'scripts/backup-to-postgres.js');
        exec(`node "${scriptPath}"`, { cwd: __dirname }, (err, stdout, stderr) => {
          if (err) {
            console.error('[Auto-Backup] ❌ កំហុសពេល Backup:', err.message);
          } else {
            console.log('[Auto-Backup] ✓ បានបញ្ចប់ការ Backup ស្វ័យប្រវត្តិចូល Database ជោគជ័យ!');
            try {
              config.lastBackupAt = new Date().toISOString();
              fs.writeFileSync(schedFile, JSON.stringify(config, null, 2), 'utf8');
            } catch {}
          }
        });
      }
    } catch (e) {
      // ignore check error
    }
  };

  autoBackupInterval = setInterval(checkAndRunAutoBackup, 45000);
}

// Start listeners and background workers
const PORT = parseInt(process.env.PORT || '5000', 10);
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`[Backend Server] 🚀 Server running at http://${HOST}:${PORT}`);
  console.log(`[Backend Server] 📡 API endpoints available at http://${HOST}:${PORT}/api`);

  // Start background workers
  try {
    initServerPodSync(server);
    console.log('[Backend Server] ✓ POD background auto-sync initialized');
  } catch (err) {
    console.warn('[Backend Server] Notice initializing POD sync:', err.message);
  }

  startAutoBackupScheduler();
  console.log('[Backend Server] ✓ Auto-backup scheduler initialized');
});

// ==========================================
// Graceful Shutdown Handling (Zero-Downtime / Container Friendly)
// ==========================================
let isShuttingDown = false;

async function handleGracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n[Backend Server] 🛑 Received ${signal}. Starting graceful shutdown...`);

  // 1. Clear background timers
  if (autoBackupInterval) {
    clearInterval(autoBackupInterval);
  }

  // 2. Stop accepting new connections
  server.close(async (err) => {
    if (err) {
      console.error('[Backend Server] Error during server close:', err);
    } else {
      console.log('[Backend Server] ✓ HTTP connections drained and closed.');
    }

    // 3. Close open database pools if initialized
    try {
      if (globalThis.__ial_mysql_pool) {
        await globalThis.__ial_mysql_pool.end();
        console.log('[Backend Server] ✓ MySQL connection pool closed.');
      }
    } catch (dbErr) {
      console.warn('[Backend Server] Notice closing MySQL pool:', dbErr.message);
    }

    console.log('[Backend Server] 👋 Graceful shutdown completed. Exiting process.');
    process.exit(0);
  });

  // Force exit after 10 seconds timeout if sockets don't drain
  setTimeout(() => {
    console.error('[Backend Server] ⚠️ Forced shutdown due to timeout (10s).');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));
