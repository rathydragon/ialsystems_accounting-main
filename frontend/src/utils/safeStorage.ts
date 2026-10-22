// LocalStorage is only a cache — Hostinger MySQL is the source of truth.
// The browser gives each site about 5 MB, shared by every key.

export const isQuotaError = (err: any) =>
  err?.name === 'QuotaExceededError' || err?.name === 'NS_ERROR_DOM_QUOTA_REACHED' || err?.code === 22 || err?.code === 1014;

/**
 * Copies of Google Sheets rows. They can always be downloaded again, so they are the first
 * thing removed when app data (batches, scans, reports) needs the space.
 */
const DISPOSABLE_SHEET_CACHE_KEYS = [
  'accounting_data_report_cached_rows',
  'accounting_meterial_office_cached_rows',
  'accounting_data_bm_cached_rows',
  'accounting_followup_bm_cached_rows',
  'accounting_sokimex_cached_rows'
];

/** Removes the Google Sheets row copies (except `keep`). Returns true if anything was removed. */
export function freeDisposableCaches(keep?: string): boolean {
  let freed = false;
  for (const key of DISPOSABLE_SHEET_CACHE_KEYS) {
    if (key === keep) continue;
    try {
      if (localStorage.getItem(key) !== null) {
        localStorage.removeItem(key);
        freed = true;
      }
    } catch {
      /* ignore */
    }
  }
  return freed;
}

/**
 * Saves app data. When storage is full, it removes the Google Sheets copies and tries again.
 * Returns false (without throwing) if it still does not fit.
 */
export function setItemFreeingSpace(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    if (!isQuotaError(err)) throw err;
  }
  if (!freeDisposableCaches(key)) return false;
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    if (!isQuotaError(err)) throw err;
    return false;
  }
}

/**
 * Saves a Google Sheets copy. Never throws and never removes other data to make room:
 * if it does not fit, the old copy is dropped and the page simply downloads the sheet again.
 */
export function saveDisposableCache(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  }
}

// Saves as many of the newest items as fit; on quota errors it first frees the Google Sheets
// copies, then halves the slice, and drops the key entirely rather than leaving a stale copy behind.
export function saveListCache<T>(key: string, items: T[], maxItems = 5000, minItems = 50): void {
  let count = Math.min(items.length, maxItems);
  let triedFreeing = false;
  while (true) {
    try {
      localStorage.setItem(key, JSON.stringify(items.slice(0, count)));
      return;
    } catch (err) {
      if (isQuotaError(err) && !triedFreeing) {
        triedFreeing = true;
        if (freeDisposableCaches(key)) continue;
      }
      if (!isQuotaError(err) || count <= minItems) {
        try { localStorage.removeItem(key); } catch { /* ignore */ }
        if (!isQuotaError(err)) console.warn(`LocalStorage save error (${key}):`, err);
        return;
      }
      count = Math.floor(count / 2);
    }
  }
}
