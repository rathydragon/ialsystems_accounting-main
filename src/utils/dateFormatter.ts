/**
 * 🕒 Universal Date Time Formatter - Cambodia Local Timezone (Asia/Phnom_Penh, UTC+7)
 * Formats dates cleanly to standard: YYYY-MM-DD HH:mm:ss (e.g. 2026-09-21 08:50:47)
 * Strictly anchored to Cambodia Time (Asia/Phnom_Penh) across all browsers, servers (Vercel/Node), and databases.
 */

export const CAMBODIA_TIMEZONE = 'Asia/Phnom_Penh';

/**
 * Extracts Cambodia local date & time parts from any Date object
 */
export function getCambodiaTimeParts(d: Date = new Date()): {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
} {
  const safeDate = isNaN(d.getTime()) ? new Date() : d;
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: CAMBODIA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(safeDate);
  const p: Record<string, string> = {};
  for (const part of parts) {
    p[part.type] = part.value;
  }

  const hour = p.hour === '24' ? '00' : (p.hour || '00');
  return {
    year: p.year || '1970',
    month: p.month || '01',
    day: p.day || '01',
    hour,
    minute: p.minute || '00',
    second: p.second || '00',
  };
}

/**
 * Formats any input (Date, string, timestamp) to Cambodia standard: YYYY-MM-DD HH:mm:ss
 */
export function formatToStandardDateTime(val: any, fallback?: string): string {
  if (!val && val !== 0) {
    if (fallback) return formatToStandardDateTime(fallback);
    return getCurrentStandardDateTime();
  }

  // If already a Date object
  if (val instanceof Date) {
    if (isNaN(val.getTime())) {
      return fallback ? formatToStandardDateTime(fallback) : getCurrentStandardDateTime();
    }
    const { year, month, day, hour, minute, second } = getCambodiaTimeParts(val);
    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
  }

  const str = String(val).trim();

  // Already strictly YYYY-MM-DD HH:mm:ss
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(str)) {
    return str;
  }

  // Already strictly YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return `${str} 00:00:00`;
  }

  try {
    let d: Date | null = null;

    // Google Sheets Viz format: Date(2026,8,21) or Date(2026,8,21,8,50,47)
    if (str.startsWith('Date(')) {
      const parts = str.replace('Date(', '').replace(')', '').split(',').map(p => Number(p.trim()));
      d = new Date(parts[0], parts[1], parts[2], parts[3] || 0, parts[4] || 0, parts[5] || 0);
    } else {
      // Check regex for formats like "24-Sep-2026", "24/Sep/2026", "24-09-2026"
      const m = str.match(/^(\d{1,2})[-/ ]([A-Za-z]{3}|\d{1,2})[-/ ](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
      if (m) {
        const day = m[1].padStart(2, '0');
        const monthPart = m[2];
        const yr = m[3];
        const hr = (m[4] || '00').padStart(2, '0');
        const min = (m[5] || '00').padStart(2, '0');
        const sec = (m[6] || '00').padStart(2, '0');

        let mo = '01';
        if (/^\d+$/.test(monthPart)) {
          mo = monthPart.padStart(2, '0');
        } else {
          const months: Record<string, string> = {
            jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
            jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
          };
          mo = months[monthPart.toLowerCase().slice(0, 3)] || '01';
        }
        return `${yr}-${mo}-${day} ${hr}:${min}:${sec}`;
      }

      // Check standard JS Date string parsing (e.g. "Mon Sep 21 2026 08:50:47 GMT+0700 (Indochina Time)" or ISO)
      const parsed = new Date(str);
      if (!isNaN(parsed.getTime())) {
        d = parsed;
      }
    }

    if (d && !isNaN(d.getTime())) {
      const { year, month, day, hour, minute, second } = getCambodiaTimeParts(d);
      return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
    }
  } catch (e) {}

  return fallback ? formatToStandardDateTime(fallback) : str;
}

/**
 * Returns current timestamp in Cambodia (Asia/Phnom_Penh) formatted as: YYYY-MM-DD HH:mm:ss
 */
export function getCurrentStandardDateTime(): string {
  const { year, month, day, hour, minute, second } = getCambodiaTimeParts(new Date());
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

/**
 * Returns current local date in Cambodia (Asia/Phnom_Penh) formatted as: YYYY-MM-DD
 */
export function getLocalDateString(d: Date = new Date()): string {
  const { year, month, day } = getCambodiaTimeParts(d);
  return `${year}-${month}-${day}`;
}

/**
 * Formats a date specifically for Cambodia display (e.g. DD/MM/YYYY HH:mm)
 */
export function formatToCambodiaDisplay(val: any): string {
  if (!val) return '';
  const std = formatToStandardDateTime(val);
  const m = std.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`;
  }
  return std;
}
