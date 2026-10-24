import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
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
// Every 5 minutes, run the backup script with --if-due: the script reads the schedule
// (scripts/backup-schedule.js) and backs up only when it is time. Windows Task Scheduler and
// the app use the same check, and a database lock stops two backups running at once.
// ==========================================
let autoBackupInterval = null;
let autoBackupRunning = false;

function startAutoBackupScheduler() {
  const scriptPath = path.resolve(__dirname, 'scripts/backup-to-postgres.js');
  const check = () => {
    if (autoBackupRunning) return;
    autoBackupRunning = true;
    exec(`node "${scriptPath}" --if-due`, { cwd: __dirname, windowsHide: true, timeout: 30 * 60000 }, (err, stdout) => {
      autoBackupRunning = false;
      const out = String(stdout || '');
      if (err) console.error('[Auto-Backup] ❌ Backup error:', err.message);
      else if (!out.includes('Not due')) console.log('[Auto-Backup] ✓ Backup finished:', (out.match(/Done[^\n]*/) || [''])[0]);
    });
  };
  setTimeout(check, 60000);
  autoBackupInterval = setInterval(check, 5 * 60000);
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
