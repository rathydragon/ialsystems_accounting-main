import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../app.js';
import * as masterHandlersModule from '../../api/mysql-master-handlers.js';
import { MOCK_BATCHES, MOCK_PAYERS } from '../fixtures/mockData.js';
import { generateTestToken } from '../fixtures/testHelpers.js';

describe('Remote MySQL API Endpoints (Integration Tests)', () => {
  const authToken = generateTestToken({ role: 'ADMIN' });

  it('should reject unauthenticated request with 401', async () => {
    const res = await request(app)
      .get('/api/remote-mysql')
      .query({ action: 'test' });

    expect(res.status).toBe(401);
    expect(res.body.status).toBe('error');
  });

  describe('GET /api/remote-mysql?action=...', () => {
    it('should return 400 when an invalid or unknown action is supplied', async () => {
      const res = await request(app)
        .get('/api/remote-mysql')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ action: 'non_existent_action_xyz' });

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.message).toContain('Unknown action');
    });

    it('should return 200 with test results when action=test', async () => {
      // The handler calls testMySQLConnection() inside its own module, so a spy
      // on the export is not seen. Put a fake pool where getMySQLPool() looks instead.
      const fakeConnection = {
        query: vi.fn(async (sql) => {
          if (sql.startsWith('SHOW TABLES')) {
            return [[{ Tables_in_db: 'tbl_batches' }, { Tables_in_db: 'tbl_collection_items' }]];
          }
          return [[{ result: 2 }]];
        }),
        release: vi.fn()
      };
      const previousPool = globalThis.__ial_mysql_pool;
      globalThis.__ial_mysql_pool = { getConnection: async () => fakeConnection };

      let res;
      try {
        res = await request(app)
          .get('/api/remote-mysql')
          .set('Authorization', `Bearer ${authToken}`)
          .query({ action: 'test' });
      } finally {
        globalThis.__ial_mysql_pool = previousPool;
      }

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.tables).toContain('tbl_batches');
    });

    it('should return 200 with batches when action=get_batches', async () => {
      vi.spyOn(masterHandlersModule, 'getBatchesFromMySQL').mockResolvedValueOnce(MOCK_BATCHES);

      const res = await request(app)
        .get('/api/remote-mysql')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ action: 'get_batches' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(2);
    });

    it('should return 200 with payers when action=get_payers', async () => {
      vi.spyOn(masterHandlersModule, 'getPayersFromMySQL').mockResolvedValueOnce(MOCK_PAYERS);

      const res = await request(app)
        .get('/api/remote-mysql')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ action: 'get_payers' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data[0].name).toBe('Sokha Delivery Team');
    });
  });

  describe('POST /api/remote-mysql', () => {
    it('should successfully call save_batch and return 200', async () => {
      vi.spyOn(masterHandlersModule, 'saveBatchToMySQL').mockResolvedValueOnce({
        ok: true,
        batchNumber: 'BATCH-SAVE-100',
        message: 'Batch saved successfully'
      });

      const res = await request(app)
        .post('/api/remote-mysql')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          action: 'save_batch',
          batch: {
            id: 'BATCH-SAVE-100',
            batchNumber: 'BATCH-SAVE-100',
            items: []
          }
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.batchNumber).toBe('BATCH-SAVE-100');
    });

    it('should successfully call delete_batch and return 200', async () => {
      vi.spyOn(masterHandlersModule, 'deleteBatchFromMySQL').mockResolvedValueOnce({
        ok: true,
        batchNumber: 'BATCH-DEL-100',
        message: 'Batch deleted'
      });

      const res = await request(app)
        .post('/api/remote-mysql')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          action: 'delete_batch',
          batchNumber: 'BATCH-DEL-100'
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('should reject delete_all_batches when caller is not an ADMIN with 403', async () => {
      const userToken = generateTestToken({ role: 'USER', email: 'user@example.com' });
      const res = await request(app)
        .post('/api/remote-mysql')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          action: 'delete_all_batches'
        });

      expect(res.status).toBe(403);
      expect(res.body.ok).toBe(false);
      expect(res.body.message).toContain('Admin privilege required');
    });

    it('should reject delete_batch when non-admin user has canDelete false with 403', async () => {
      const userToken = generateTestToken({
        role: 'USER',
        canDelete: false,
        email: 'user@example.com'
      });
      const res = await request(app)
        .post('/api/remote-mysql')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          action: 'delete_batch',
          batchNumber: 'BATCH-DEL-200'
        });

      expect(res.status).toBe(403);
      expect(res.body.ok).toBe(false);
      expect(res.body.message).toContain('permission');
    });
  });
});

