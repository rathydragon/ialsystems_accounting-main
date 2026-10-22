import { describe, it, expect, vi, beforeEach } from 'vitest';

const authFetch = vi.fn();
vi.mock('../../src/services/apiClient', () => ({ authFetch: (...args: any[]) => authFetch(...args) }));

const COLUMNS = ['BARCODE', 'SHIPPER', 'CONSIGNEE', 'DESTINATION', 'PAYMENT', 'USD', 'KG', 'STATUS'];
const reply = (rows: any[][]) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, columns: COLUMNS, rows }) });

describe('Data Report lookup from MySQL', () => {
  beforeEach(() => {
    vi.resetModules();
    authFetch.mockReset();
  });

  it('fetches only unknown barcodes and feeds the Warehouse lookup', async () => {
    authFetch.mockImplementation(() =>
      reply([
        ['SOCAM1', 'SOCAM1', 'BUYMED', 'Shop A', 'BAVET', 'COD', '12.5', '1.2', 'UPLEFT'],
        ['DUP1', 'DUP1', 'NEW SHIPPER', 'B', 'POIPET', '', '', '', ''],
        ['DUP1', 'DUP1', 'OLD SHIPPER', 'C', 'PNH', '', '', '', '']
      ])
    );
    const store = await import('../../src/services/dataReportLookupService');
    const { lookupTrackingFromDataReport, getDataReportDestination } = await import(
      '../../src/services/warehouseScanService'
    );

    const events: string[] = [];
    window.addEventListener('accounting_data_report_updated', () => events.push('updated'));

    expect(lookupTrackingFromDataReport('socam1')).toBeNull();
    expect(await store.prefetchDataReportBarcodes(['socam1', ' DUP1 ', 'MISSING9'])).toBe(true);
    expect(events).toEqual(['updated']);

    const body = JSON.parse(authFetch.mock.calls[0][1].body);
    expect(body.barcodes).toEqual(['SOCAM1', 'DUP1', 'MISSING9']);

    const m = lookupTrackingFromDataReport('socam1');
    expect(m).toMatchObject({ shipper: 'BUYMED', consignee: 'Shop A', destination: 'BAVET', codAmount: 12.5, weightKg: 1.2 });
    // duplicate barcode: the newest row (first from the server) wins
    expect(lookupTrackingFromDataReport('DUP1')?.shipper).toBe('NEW SHIPPER');
    expect(getDataReportDestination('DUP1')).toBe('POIPET');

    // already checked (found or not) → no second request
    expect(await store.prefetchDataReportBarcodes(['SOCAM1', 'MISSING9'])).toBe(false);
    expect(authFetch).toHaveBeenCalledTimes(1);
  });

  it('returns a row keyed by column name for the Distribution Report', async () => {
    authFetch.mockImplementation(() => reply([['XA99', 'XA99', 'SHOP', 'Mr. A', 'BMC', '', '', '', 'DELIVERED']]));
    const store = await import('../../src/services/dataReportLookupService');
    await store.prefetchDataReportBarcodes(['XA99']);
    expect(store.getDataReportRowByLabel('xa99')).toMatchObject({ SHIPPER: 'SHOP', CONSIGNEE: 'Mr. A', STATUS: 'DELIVERED' });
    expect(store.getDataReportRowByLabel('NOPE')).toBeNull();
  });

  it('a failed request is retried next time instead of being remembered as missing', async () => {
    authFetch.mockImplementationOnce(() => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ ok: false }) }));
    authFetch.mockImplementationOnce(() => reply([['RTRY1', 'RTRY1', 'S', 'C', 'D', '', '', '', '']]));
    const store = await import('../../src/services/dataReportLookupService');
    expect(await store.prefetchDataReportBarcodes(['RTRY1'])).toBe(false);
    expect(await store.prefetchDataReportBarcodes(['RTRY1'])).toBe(true);
  });
});
