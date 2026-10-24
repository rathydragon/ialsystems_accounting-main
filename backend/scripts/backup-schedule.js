/**
 * The one place that decides when the next PostgreSQL backup is due.
 * Settings are kept in scripts/backup-schedule.json (written by Settings → "រក្សាទុក").
 * Every run (button, browser, Windows Task Scheduler) records lastBackupAt here, so all
 * triggers share the same clock and never run twice for the same slot.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SCHED_FILE = path.resolve(__dirname, 'backup-schedule.json');

const DEFAULT_SCHEDULE = { enabled: true, mode: 'DAILY_TIME', time: '18:00', intervalHours: 1, intervalMinutes: 0 };

export function readSchedule() {
  try {
    if (fs.existsSync(SCHED_FILE)) return { ...DEFAULT_SCHEDULE, ...JSON.parse(fs.readFileSync(SCHED_FILE, 'utf8')) };
  } catch {}
  return { ...DEFAULT_SCHEDULE };
}

export function writeSchedule(patch) {
  const updated = { ...readSchedule(), ...patch };
  fs.writeFileSync(SCHED_FILE, JSON.stringify(updated, null, 2), 'utf8');
  return updated;
}

/** "HH:MM" from whatever was saved (older saves stored a full Date string). */
export function dailyTime(s) {
  const m = String(s?.time || '').match(/(\d{1,2}):(\d{2})/);
  const h = m ? Math.min(23, parseInt(m[1], 10)) : 18;
  const min = m ? Math.min(59, parseInt(m[2], 10)) : 0;
  return { h, min, text: `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}` };
}

export function intervalMinutes(s) {
  const total = (Number(s?.intervalHours) || 0) * 60 + (Number(s?.intervalMinutes) || 0);
  return Math.max(total, 15); // never more often than every 15 minutes
}

export function scheduleLabel(s) {
  if (s?.enabled === false) return 'បានផ្អាក (Auto-Backup Paused)';
  if (s?.mode === 'INTERVAL') {
    const total = intervalMinutes(s);
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `រៀងរាល់ ${[h ? `${h} ម៉ោង` : '', m ? `${m} នាទី` : ''].filter(Boolean).join(' ')}ម្តង (Auto-Backup)`;
  }
  return `រៀងរាល់ថ្ងៃ ម៉ោង ${dailyTime(s).text} (Auto-Backup)`;
}

/** When the next backup should run (Date), or null when paused. A time in the past means "due now". */
export function nextRunAt(s, now = new Date()) {
  if (s?.enabled === false) return null;
  const last = s?.lastBackupAt ? new Date(s.lastBackupAt) : null;
  if (s?.mode === 'INTERVAL') {
    if (!last || isNaN(last)) return now;
    return new Date(last.getTime() + intervalMinutes(s) * 60000);
  }
  const { h, min } = dailyTime(s);
  const todaySlot = new Date(now);
  todaySlot.setHours(h, min, 0, 0);
  if (now >= todaySlot) {
    // Today's slot has passed: due now unless it already ran after the slot
    if (!last || isNaN(last) || last < todaySlot) return todaySlot;
    return new Date(todaySlot.getTime() + 24 * 3600000);
  }
  return todaySlot;
}

export function isDue(s, now = new Date()) {
  const next = nextRunAt(s, now);
  return Boolean(next && now >= next);
}
