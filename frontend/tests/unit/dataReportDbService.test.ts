import { describe, it, expect, vi, beforeEach } from 'vitest';

const authFetch = vi.fn();
vi.mock('../../src/services/apiClient', () => ({ authFetch: (...args: any[]) => authFetch(...args) }));

const ok = (body: any) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, ...body }) });

describe('Data Report full load from MySQL', () => {
  beforeEach(() => {
    vi.resetModules();
    authFetch.mockReset();
  });

  it('reports progress, keeps sheet order and detects number columns', async () => {
    authFetch.mockImplementation((url: string) => {
      if (url.includes('data_report_db_meta')) {
        return ok({ version: 5, total: 3, columns: ['BARCODE', 'USD'], order: ['C3', 'A1', 'B2'], lastSync: null });
      }
      return ok({ version: 5, rows: [['A1', 'A1', '2'], ['B2', 'B2', '3.5'], ['C3', 'C3', '']] });
    });
    const svc = await import('../../src/services/dataReportDbService');
    const progress: Array<[number, number]> = [];
    const res = await svc.fetchDataReportFromDb((l, t) => progress.push([l, t]));

    expect(res.success).toBe(true);
    expect(res.rows.map((r) => r.col_0)).toEqual(['C3', 'A1', 'B2']);
    expect(res.columns[1].type).toBe('number');
    expect(progress[0]).toEqual([0, 3]);
    expect(progress[progress.length - 1]).toEqual([3, 3]);
    expect(svc.getCachedDataReportDb().rows).toHaveLength(3);
  });

  it('the browser copy is optional: no IndexedDB → null, no error', async () => {
    const svc = await import('../../src/services/dataReportDbService');
    const saved = (globalThis as any).indexedDB;
    (globalThis as any).indexedDB = undefined;
    await expect(svc.readDataReportDiskCopy()).resolves.toBeNull();
    (globalThis as any).indexedDB = saved;
  });
});
