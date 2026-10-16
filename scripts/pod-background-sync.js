import { initServerPodSync, getSyncState } from '../api/pod-background-sync.js';

console.log('====================================================');
console.log('   IAL Systems - Standalone POD Background Sync     ');
console.log('====================================================');

initServerPodSync();

setInterval(() => {
  const state = getSyncState();
  console.log(`[Status Heartbeat] Enabled: ${state.enabled} | Last Synced ID: #${state.lastSyncedId} | Total: ${state.totalSyncedAllTime}`);
}, 60000);
