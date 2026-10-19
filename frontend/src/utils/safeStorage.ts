// LocalStorage is only a cache — Hostinger MySQL is the source of truth.
// Saves as many of the newest items as fit; on quota errors it halves the slice,
// and drops the key entirely rather than leaving a stale copy behind.

const isQuotaError = (err: any) =>
  err?.name === 'QuotaExceededError' || err?.name === 'NS_ERROR_DOM_QUOTA_REACHED' || err?.code === 22 || err?.code === 1014;

export function saveListCache<T>(key: string, items: T[], maxItems = 5000, minItems = 50): void {
  let count = Math.min(items.length, maxItems);
  while (true) {
    try {
      localStorage.setItem(key, JSON.stringify(items.slice(0, count)));
      return;
    } catch (err) {
      if (!isQuotaError(err) || count <= minItems) {
        try { localStorage.removeItem(key); } catch { /* ignore */ }
        if (!isQuotaError(err)) console.warn(`LocalStorage save error (${key}):`, err);
        return;
      }
      count = Math.floor(count / 2);
    }
  }
}
