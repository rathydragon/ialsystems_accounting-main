import { describe, it, expect, vi } from 'vitest';
import { getWarehouseScansFromMySQL, saveWarehouseScanToMySQL } from '../../api/mysql-master-handlers.js';

const makePool = (rowsBySql = () => []) => {
  const calls = [];
  const query = vi.fn(async (sql, params) => {
    calls.push({ sql, params });
    return [rowsBySql(sql) || []];
  });
  const conn = {
    query,
    beginTransaction: vi.fn(async () => {}),
    commit: vi.fn(async () => {}),
    rollback: vi.fn(async () => {}),
    release: vi.fn(),
  };
  return { pool: { query, getConnection: vi.fn(async () => conn) }, calls };
};

describe('Customer Pickup warehouse scans (tbl_customer_pickup)', () => {
  it('creates the table and reads rows as CUSTOMER_PICKUP with truck, kgs and pcs', async () => {
    const { pool, calls } = makePool((sql) =>
      sql.startsWith('SELECT * FROM tbl_customer_pickup')
        ? [{ id: 'c1', barcode: 'IAL9', driver_name: 'Sokha', truck_no: '3A-1234', kgs: '12.500', pcs: 3, operation_code: 'OP-CUS-261024-001', scan_date: '2026-10-24', created_at: '2026-10-24T09:00:00Z' }]
        : []
    );

    const scans = await getWarehouseScansFromMySQL(pool);

    expect(calls.some((c) => /CREATE TABLE IF NOT EXISTS `tbl_customer_pickup`/.test(c.sql))).toBe(true);
    expect(scans.find((s) => s.id === 'c1')).toMatchObject({
      scanType: 'CUSTOMER_PICKUP',
      barcode: 'IAL9',
      driverName: 'Sokha',
      truckNo: '3A-1234',
      kgs: 12.5,
      pcs: 3,
      operationCode: 'OP-CUS-261024-001',
    });
  });

  it('saves company, driver, truck, kgs and pcs; blanks are stored as NULL', async () => {
    const { pool, calls } = makePool();
    await saveWarehouseScanToMySQL(pool, [
      { id: 'c2', scanType: 'CUSTOMER_PICKUP', barcode: 'IAL10', sendToCustomer: ' ABC Co ', driverName: 'Dara', truckNo: '2B-5555', kgs: '4.2', pcs: 2, date: '2026-10-24' },
      { id: 'c3', scanType: 'CUSTOMER_PICKUP', barcode: 'IAL11', truckNo: '2B-5555', kgs: '', date: '2026-10-24' },
    ]);
    const inserts = calls.filter((c) => /INSERT INTO tbl_customer_pickup/.test(c.sql));
    expect(inserts).toHaveLength(2);
    expect(inserts[0].params.slice(0, 8)).toEqual(['c2', 'IAL10', 'IAL10', 'ABC Co', 'Dara', '2B-5555', 4.2, 2]);
    expect(inserts[1].params.slice(3, 8)).toEqual([null, '', '2B-5555', null, null]);
  });
});
