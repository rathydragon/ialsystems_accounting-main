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

describe('Return Shipments warehouse scans (tbl_return_shipments)', () => {
  it('creates the return table and reads it as RETURN_SHIPMENTS with the reason in holdReason', async () => {
    const { pool, calls } = makePool((sql) =>
      sql.startsWith('SELECT * FROM tbl_return_shipments')
        ? [{ id: 'r1', barcode: 'IAL1', return_reason: 'Customer Refused', send_to_customer: 'ANDROMEDA', remarks: 'call fail', operation_code: 'OP-RTN-261021-KARUNA-001', scan_date: '2026-10-21', created_at: '2026-10-21T09:00:00Z' }]
        : []
    );

    const scans = await getWarehouseScansFromMySQL(pool);

    expect(calls.some((c) => /CREATE TABLE IF NOT EXISTS `tbl_return_shipments`/.test(c.sql))).toBe(true);
    const ret = scans.find((s) => s.id === 'r1');
    expect(ret).toMatchObject({
      scanType: 'RETURN_SHIPMENTS',
      barcode: 'IAL1',
      holdReason: 'Customer Refused',
      sendToCustomer: 'ANDROMEDA',
      remarks: 'call fail',
      operationCode: 'OP-RTN-261021-KARUNA-001',
    });
  });

  it('only shows own returns to "own data" users', async () => {
    const { pool, calls } = makePool();
    await getWarehouseScansFromMySQL(pool, { role: 'HUB', viewOnlyOwn: true, email: 'a@ial.com', name: 'A' });
    const sql = calls.find((c) => c.sql.startsWith('SELECT * FROM tbl_return_shipments')).sql;
    expect(sql).toContain('WHERE (operator_email IN (?) OR created_by IN (?))');
  });

  it('saves a return scan into tbl_return_shipments with its reason', async () => {
    const { pool, calls } = makePool();
    await saveWarehouseScanToMySQL(pool, [
      { id: 'r2', scanType: 'RETURN_SHIPMENTS', barcode: 'IAL2', holdReason: 'Wrong Address', sendToCustomer: ' ABC Co., Ltd ', remarks: 'x', date: '2026-10-21', operationCode: 'OP-RTN-261021-001' },
    ]);
    const insert = calls.find((c) => /INSERT INTO tbl_return_shipments/.test(c.sql));
    expect(insert).toBeDefined();
    expect(insert.params.slice(0, 7)).toEqual(['r2', 'IAL2', 'IAL2', '', 'Wrong Address', 'ABC Co., Ltd', 'x']);
    expect(insert.params[11]).toBe('OP-RTN-261021-001');
  });
});
