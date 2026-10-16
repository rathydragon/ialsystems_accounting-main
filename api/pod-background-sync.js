import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getGoogleSheetMaxId,
  getPodNewDeliveredRecords,
  syncPodBatchToGoogleSheets
} from './remote-mysql.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATE_FILE = path.resolve(__dirname, '../scripts/pod-sync-state.json');

// Default sync state
let syncState = {
  enabled: true,
  intervalSeconds: 15,
  lastSyncedId: 0,
  lastSyncedAt: null,
  lastSyncedCount: 0,
  isSyncing: false,
  lastError: null,
  totalSyncedAllTime: 0
};

// Load saved state from file if exists
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      syncState = { ...syncState, ...data, isSyncing: false };
    }
  } catch (err) {
    console.warn('[Server POD Sync] Could not load state file, using defaults:', err.message);
  }
}

// Save state to file
function saveState() {
  try {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(syncState, null, 2), 'utf8');
  } catch (err) {
    console.warn('[Server POD Sync] Could not save state file:', err.message);
  }
}

let syncIntervalTimer = null;

/**
 * ⚡ Single sync iteration to find and push new Delivered shipments to Google Sheets
 */
export async function runServerPodSyncIteration() {
  if (!syncState.enabled || syncState.isSyncing) return;

  syncState.isSyncing = true;
  syncState.lastError = null;

  try {
    const spreadsheetId = process.env.VITE_POD_BACKUP_SHEET_ID || '1TwvUk5fsPbbvpG_eNfxuVFxxIZJv2Czo9LaGM8OWNHQ';
    const sheetName = process.env.VITE_POD_BACKUP_SHEET_NAME || 'ialsystems_backup_pod';
    const webAppUrl = process.env.VITE_POD_BACKUP_WEBAPP_URL || 'https://script.google.com/macros/s/AKfycbw1Xl1-ds50TWAw4BOPr4nWbD1VDFQazWxdER1JnJlqUHcspn-Op9wHa8e1h8BmioV9/exec';

    // 1. If we don't have a starting ID, query Google Sheet directly for the true max ID
    if (!syncState.lastSyncedId || syncState.lastSyncedId <= 0) {
      const sheetRes = await getGoogleSheetMaxId({ spreadsheetId, sheetName, webAppUrl });
      if (sheetRes.ok && sheetRes.sheet_max_id > 0) {
        syncState.lastSyncedId = sheetRes.sheet_max_id;
        saveState();
        console.log(`[Server POD Sync] 🎯 Google Sheet Max ID ទទួលបានគឺ: #${syncState.lastSyncedId}`);
      }
    }

    if (!syncState.lastSyncedId || syncState.lastSyncedId <= 0) {
      syncState.isSyncing = false;
      return;
    }

    // 2. Query MySQL Hostinger for new Delivered shipments with id > lastSyncedId
    const newRecordsRes = await getPodNewDeliveredRecords({
      sinceId: syncState.lastSyncedId,
      limit: 300
    });

    if (!newRecordsRes.ok) {
      throw new Error(newRecordsRes.message || 'Failed to fetch new records from MySQL');
    }

    if (newRecordsRes.count === 0) {
      // Up to date
      syncState.lastSyncedAt = new Date().toISOString();
      syncState.isSyncing = false;
      return;
    }

    // 3. Batch new records into chunks of 100 for safe transmission
    const records = newRecordsRes.records;
    const chunkSize = 100;
    let totalSyncedInRun = 0;
    let highestSyncedId = syncState.lastSyncedId;

    for (let i = 0; i < records.length; i += chunkSize) {
      const chunk = records.slice(i, i + chunkSize);
      const pushRes = await syncPodBatchToGoogleSheets({
        webAppUrl,
        rows: chunk,
        mode: 'append',
        isFirstBatch: false,
        spreadsheetId,
        sheetName
      });

      if (!pushRes.ok) {
        throw new Error(pushRes.message || 'Google Apps Script push failed');
      }

      const chunkMaxId = Math.max(...chunk.map(r => Number(r.id) || 0));
      if (chunkMaxId > highestSyncedId) {
        highestSyncedId = chunkMaxId;
      }
      totalSyncedInRun += chunk.length;
    }

    if (totalSyncedInRun > 0) {
      syncState.lastSyncedId = highestSyncedId;
      syncState.lastSyncedCount = totalSyncedInRun;
      syncState.totalSyncedAllTime += totalSyncedInRun;
      syncState.lastSyncedAt = new Date().toISOString();
      saveState();

      console.log(`[Server POD Sync] ✓ ⚡ បានបន្ថែម ${totalSyncedInRun} កញ្ចប់ Delivered ថ្មីទៅកាន់ Google Sheet ជោគជ័យ! (Max ID: #${highestSyncedId})`);
    }
  } catch (err) {
    syncState.lastError = err.message;
    console.error(`[Server POD Sync Error]:`, err.message);
  } finally {
    syncState.isSyncing = false;
  }
}

/**
 * 🚀 Initialize the background sync worker inside Vite or Node server
 */
export function initServerPodSync(httpServer) {
  loadState();

  if (syncIntervalTimer) {
    clearInterval(syncIntervalTimer);
  }

  const intervalMs = Math.max(10, syncState.intervalSeconds || 15) * 1000;
  console.log(`[Server POD Sync] 🟢 សេវាកម្ម Server Background Sync ចាប់ផ្ដើមដំណើរការ (រៀងរាល់ ${syncState.intervalSeconds || 15} វិនាទីម្តង)...`);

  // Initial run after 5 seconds to let server finish booting
  setTimeout(() => {
    runServerPodSyncIteration();
  }, 5000);

  syncIntervalTimer = setInterval(() => {
    runServerPodSyncIteration();
  }, intervalMs);

  if (httpServer) {
    httpServer.on('close', () => {
      if (syncIntervalTimer) clearInterval(syncIntervalTimer);
    });
  }
}

/**
 * Get current sync state
 */
export function getSyncState() {
  return { ...syncState };
}

/**
 * Update sync state
 */
export function updateSyncState(updates) {
  syncState = { ...syncState, ...updates };
  saveState();
  return { ...syncState };
}
