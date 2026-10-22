import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setItemFreeingSpace, saveDisposableCache, saveListCache } from '../../src/utils/safeStorage';

/** A localStorage stand-in with a small quota, counted in characters. */
function installQuotaStorage(limit: number) {
  const data = new Map<string, string>();
  const used = () => [...data].reduce((n, [k, v]) => n + k.length + v.length, 0);
  const storage = {
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => {
      const before = data.get(k);
      data.set(k, v);
      if (used() > limit) {
        if (before === undefined) data.delete(k);
        else data.set(k, before);
        throw Object.assign(new Error('full'), { name: 'QuotaExceededError' });
      }
    },
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    }
  };
  vi.stubGlobal('localStorage', storage);
  return data;
}

describe('safeStorage priority', () => {
  let data: Map<string, string>;
  beforeEach(() => {
    data = installQuotaStorage(1000);
  });

  it('frees Google Sheets copies so app data can be saved', () => {
    saveDisposableCache('accounting_data_bm_cached_rows', 'x'.repeat(700));
    expect(data.has('accounting_data_bm_cached_rows')).toBe(true);

    expect(setItemFreeingSpace('accounting_app_saved_batches_v1', 'b'.repeat(500))).toBe(true);
    expect(data.get('accounting_app_saved_batches_v1')).toHaveLength(500);
    expect(data.has('accounting_data_bm_cached_rows')).toBe(false);
  });

  it('a Google Sheets copy never removes app data or throws', () => {
    setItemFreeingSpace('accounting_app_saved_batches_v1', 'b'.repeat(500));
    expect(() => saveDisposableCache('accounting_sokimex_cached_rows', 'x'.repeat(700))).not.toThrow();
    expect(data.has('accounting_sokimex_cached_rows')).toBe(false);
    expect(data.get('accounting_app_saved_batches_v1')).toHaveLength(500);
  });

  it('saveListCache frees Google Sheets copies before trimming the list', () => {
    saveDisposableCache('accounting_followup_bm_cached_rows', 'x'.repeat(800));
    const items = Array.from({ length: 60 }, (_, i) => `item-${i}`);
    saveListCache('ial_warehouse_scans_data_v1', items);
    expect(JSON.parse(data.get('ial_warehouse_scans_data_v1')!)).toHaveLength(60);
    expect(data.has('accounting_followup_bm_cached_rows')).toBe(false);
  });

  it('returns false when app data is too big even after freeing space', () => {
    expect(setItemFreeingSpace('accounting_medicine_batches_v1', 'm'.repeat(2000))).toBe(false);
  });
});
