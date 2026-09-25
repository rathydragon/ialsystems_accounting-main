/**
 * 🕒 Universal Date Time Formatter
 * Formats dates cleanly to standard: YYYY-MM-DD HH:mm:ss (e.g. 2026-09-21 08:50:47)
 * Prevents Timezone pollution like: "Mon Sep 21 2026 00:00:00 GMT+0700 (Indochina Time)"
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
    const y = val.getFullYear();
    const mo = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    const h = String(val.getHours()).padStart(2, '0');
    const mi = String(val.getMinutes()).padStart(2, '0');
    const s = String(val.getSeconds()).padStart(2, '0');
    return `${y}-${mo}-${d} ${h}:${mi}:${s}`;
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
      const y = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const h = String(d.getHours()).padStart(2, '0');
      const mi = String(d.getMinutes()).padStart(2, '0');
      const s = String(d.getSeconds()).padStart(2, '0');
      return `${y}-${mo}-${day} ${h}:${mi}:${s}`;
    }
  } catch (e) {}

  return fallback ? formatToStandardDateTime(fallback) : str;
}

/**
 * Returns current timestamp formatted as: YYYY-MM-DD HH:mm:ss
 */
export function getCurrentStandardDateTime(): string {
  const now = new Date();
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return `${y}-${mo}-${d} ${h}:${mi}:${s}`;
}

/**
 * Returns current local date formatted as: YYYY-MM-DD
 */
export function getLocalDateString(d: Date = new Date()): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}
