import { describe, it, expect, vi } from 'vitest';
import {
  getBatchesFromMySQL,
  getMedicineBatchesFromMySQL,
  getSettingsFromMySQL,
  getPayersFromMySQL,
  saveBatchToMySQL,
  deleteBatchFromMySQL
} from '../../api/mysql-master-handlers.js';
import { createMockMySqlPool } from '../fixtures/testHelpers.js';
import { MOCK_BATCHES, MOCK_COLLECTION_ITEMS, MOCK_PAYERS } from '../fixtures/mockData.js';

describe('MySQL Master Handlers (Unit Tests)', () => {
  describe('getBatchesFromMySQL', () => {
    it('should query batches and use bounded batch_id IN (?) query for child items', async () => {
      const mockPool = createMockMySqlPool({
        queryResolver: (sql, params) => {
          if (sql.includes('FROM tbl_batches')) {
            return [MOCK_BATCHES];
          }
          if (sql.includes('FROM tbl_collection_items WHERE batch_id IN')) {
            // Verify that batch IDs were passed as parameters
            expect(params[0]).toEqual(['BATCH-2026-001', 'BATCH-2026-002']);
            return [MOCK_COLLECTION_ITEMS];
          }
          return [[]];
        }
      });

      const result = await getBatchesFromMySQL(mockPool, 100);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);

      // Verify batch 1 has 2 collection items mapped
      const batch1 = result.find(b => b.id === 'BATCH-2026-001');
      expect(batch1).toBeDefined();
      expect(batch1.items.length).toBe(2);
      expect(batch1.items[0].tracking).toBe('IAL-TRK-9001');
      expect(batch1.items[1].tracking).toBe('IAL-TRK-9002');

      // Verify batch 2 has 1 collection item mapped
      const batch2 = result.find(b => b.id === 'BATCH-2026-002');
      expect(batch2).toBeDefined();
      expect(batch2.items.length).toBe(1);
      expect(batch2.items[0].tracking).toBe('IAL-TRK-9003');
    });

    it('should return empty array if no batches exist and skip item query', async () => {
      let itemQueryExecuted = false;
      const mockPool = createMockMySqlPool({
        queryResolver: (sql) => {
          if (sql.includes('FROM tbl_batches')) {
            return [[]];
          }
          if (sql.includes('FROM tbl_collection_items')) {
            itemQueryExecuted = true;
            return [[]];
          }
          return [[]];
        }
      });

      const result = await getBatchesFromMySQL(mockPool);
      expect(result).toEqual([]);
      expect(itemQueryExecuted).toBe(false);
    });

    it('should throw an error when database query fails', async () => {
      const mockPool = createMockMySqlPool({
        queryResolver: () => {
          throw new Error('Connection refused to remote MySQL server');
        }
      });

      await expect(getBatchesFromMySQL(mockPool)).rejects.toThrow('Connection refused');
    });
  });

  describe('getMedicineBatchesFromMySQL', () => {
    it('should return mapped medicine batches with bounded items', async () => {
      const mockMedBatches = [
        {
          batch_id: 'MED-001',
          batch_date: '2026-03-01',
          operator: 'Dr. Seng',
          total_items: 1,
          total_usd: '20.00',
          total_khr: '0.00',
          bank_usd: '20.00',
          bank_khr: '0.00',
          cash_usd: '0.00',
          cash_khr: '0.00',
          reconciliation: 'Balanced'
        }
      ];

      const mockMedItems = [
        {
          id: 501,
          batch_id: 'MED-001',
          tracking: 'MED-TRK-1',
          customer_name: 'Pharmacy A',
          payment: 'BANK',
          usd: '20.00',
          khm: '0.00',
          item_date: '2026-03-01'
        }
      ];

      const mockPool = createMockMySqlPool({
        queryResolver: (sql) => {
          if (sql.includes('FROM tbl_medicine_batches')) return [mockMedBatches];
          if (sql.includes('FROM tbl_medicine_items')) return [mockMedItems];
          return [[]];
        }
      });

      const result = await getMedicineBatchesFromMySQL(mockPool);
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('MED-001');
      expect(result[0].items.length).toBe(1);
      expect(result[0].items[0].tracking).toBe('MED-TRK-1');
    });
  });

  describe('getSettingsFromMySQL', () => {
    it('should parse JSON settings and preserve string tokens/PINs', async () => {
      const mockSettingsRows = [
        { setting_key: 'exchangeRate', setting_value: '4150' },
        { setting_key: 'adminPin', setting_value: '"123456"' },
        { setting_key: 'telegramChatId', setting_value: '"924306058"' },
        { setting_key: 'autoBackupEnabled', setting_value: 'true' }
      ];

      const mockPool = createMockMySqlPool({
        queryResolver: () => [mockSettingsRows]
      });

      const settings = await getSettingsFromMySQL(mockPool);

      expect(settings.exchangeRate).toBe(4150);
      expect(settings.adminPin).toBe('123456');
      expect(settings.telegramChatId).toBe('924306058');
      expect(settings.autoBackupEnabled).toBe(true);
    });
  });

  describe('getPayersFromMySQL', () => {
    it('should map payers table rows correctly', async () => {
      const mockPool = createMockMySqlPool({
        queryResolver: () => [MOCK_PAYERS]
      });

      const payers = await getPayersFromMySQL(mockPool);
      expect(payers.length).toBe(1);
      expect(payers[0].name).toBe('Sokha Delivery Team');
      expect(payers[0].phone).toBe('012345678');
      expect(payers[0].area).toBe('Toul Kork');
    });
  });

  describe('saveBatchToMySQL & deleteBatchFromMySQL', () => {
    it('should successfully save batch within a database transaction', async () => {
      let commitCalled = false;
      const mockConnection = {
        beginTransaction: vi.fn(async () => {}),
        query: vi.fn(async () => [{ affectedRows: 1 }]),
        commit: vi.fn(async () => { commitCalled = true; }),
        rollback: vi.fn(async () => {}),
        release: vi.fn()
      };

      const mockPool = {
        getConnection: vi.fn(async () => mockConnection)
      };

      const batchToSave = {
        id: 'BATCH-SAVE-1',
        batchNumber: 'BATCH-SAVE-1',
        date: '2026-03-05',
        operator: 'Test Operator',
        items: [
          { tracking: 'TRK-1', name: 'Cust 1', paymentMethod: 'CASH', usd: 10, khm: 0 }
        ]
      };

      const result = await saveBatchToMySQL(mockPool, batchToSave, false);
      expect(result.ok).toBe(true);
      expect(commitCalled).toBe(true);
    });

    it('should rollback transaction if error occurs during batch save', async () => {
      let rollbackCalled = false;
      const mockConnection = {
        beginTransaction: vi.fn(async () => {}),
        query: vi.fn(async (sql) => {
          if (sql.includes('INSERT INTO tbl_batches')) {
            throw new Error('Duplicate entry for key PRIMARY');
          }
          return [{}];
        }),
        commit: vi.fn(async () => {}),
        rollback: vi.fn(async () => { rollbackCalled = true; }),
        release: vi.fn()
      };

      const mockPool = {
        getConnection: vi.fn(async () => mockConnection)
      };

      await expect(saveBatchToMySQL(mockPool, { id: 'ERR-1' }, false)).rejects.toThrow('Duplicate entry');
      expect(rollbackCalled).toBe(true);
    });
  });
});
