/**
 * Local PostgreSQL Offline Backup (run by Task Scheduler / run-backup.bat / npm run backup:pg)
 * ប្រព័ន្ធ Backup ទិន្នន័យទាំងអស់ពី Hostinger MySQL ចូល Local PostgreSQL
 */
import { runFullBackup, getPgConfig, MIRROR_SCHEMA } from './hostinger-mirror.js';
import { readSchedule, isDue, nextRunAt, scheduleLabel } from './backup-schedule.js';
import { exportInvoiceNumbers, isInvoiceExportDue } from './invoice-export.js';

// --if-due: used by Windows Task Scheduler (runs every 15 min); only back up when the
// schedule saved in Settings says it is time. Without it, the backup always runs.
const IF_DUE = process.argv.includes('--if-due');

async function main() {
  // Invoice numbers (local only) -> OneDrive, once a day (takes about a second)
  if (isInvoiceExportDue()) {
    console.log(`[${new Date().toISOString()}] Daily invoice numbers export to OneDrive...`);
    await exportInvoiceNumbers({ log: (m) => console.log(m) });
  }

  if (IF_DUE) {
    const sched = readSchedule();
    if (!isDue(sched)) {
      const next = nextRunAt(sched);
      console.log(`[${new Date().toISOString()}] Not due (${scheduleLabel(sched)}). Next: ${next ? next.toISOString() : 'paused'}`);
      process.exit(0);
    }
  }
  const cfg = getPgConfig();
  console.log('====================================================');
  console.log('🚀 Backup: Hostinger MySQL -> Local PostgreSQL');
  console.log(`📅 ${new Date().toLocaleString('en-GB', { timeZone: 'Asia/Phnom_Penh' })}`);
  console.log(`💾 Target: ${cfg.host}:${cfg.port}/${cfg.database} (schema "${MIRROR_SCHEMA}")`);
  console.log('====================================================');

  const result = await runFullBackup({ log: (m) => console.log(m) });

  console.log('====================================================');
  console.log(`${result.ok ? '🎉 Done' : '⚠️ Done with errors'}: ${result.tables.length} tables, ${result.totalRows.toLocaleString()} rows, ${(result.durationMs / 1000).toFixed(1)} s`);
  if (result.failed.length) console.log(`✗ Failed tables: ${result.failed.map((t) => `${t.table} (${t.error})`).join(', ')}`);
  if (result.legacyError) console.log(`✗ JSON copy: ${result.legacyError}`);
  console.log('====================================================');
  process.exit(result.ok ? 0 : 2);
}

main().catch((err) => {
  console.error('❌ Backup failed:', err?.message || err);
  process.exit(err?.code === 'BACKUP_RUNNING' ? 0 : 1);
});
