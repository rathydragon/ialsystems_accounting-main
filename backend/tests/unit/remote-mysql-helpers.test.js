import { describe, it, expect } from 'vitest';
import { buildShipmentWhere } from '../../api/remote-mysql.js';

describe('Shipment SQL Builder (Unit Tests)', () => {
  describe('buildShipmentWhere', () => {
    it('should default status to Delivered when no status provided', () => {
      const { whereSql, params } = buildShipmentWhere({});
      expect(whereSql).toContain('status = ?');
      expect(params).toEqual(['Delivered']);
    });

    it('should omit status clause when status is ALL', () => {
      const { whereSql, params } = buildShipmentWhere({ status: 'ALL' });
      expect(whereSql).toBe('');
      expect(params).toEqual([]);
    });

    it('should support numeric ID search (#10023 or 10023)', () => {
      const { whereSql, params } = buildShipmentWhere({ search: '#10023', status: 'ALL' });
      expect(whereSql).toContain('(id = ? OR tracking_number = ?)');
      expect(params).toEqual([10023, '#10023']);
    });

    it('should support alphanumeric tracking search with index seek', () => {
      const { whereSql, params } = buildShipmentWhere({ search: 'TRK-987654', status: 'ALL' });
      expect(whereSql).toContain('(tracking_number = ? OR tracking_number LIKE ? OR sign_by LIKE ?)');
      expect(params).toEqual(['TRK-987654', 'TRK-987654%', '%TRK-987654%']);
    });

    it('should support multi-field general text search', () => {
      const { whereSql, params } = buildShipmentWhere({ search: 'Phnom Penh', status: 'ALL' });
      expect(whereSql).toContain('(tracking_number LIKE ? OR sign_by LIKE ? OR issue_by LIKE ? OR delivery_by LIKE ?)');
      expect(params).toEqual(['%Phnom Penh%', '%Phnom Penh%', '%Phnom Penh%', '%Phnom Penh%']);
    });

    it('should filter by issueBy when provided and not ALL', () => {
      const { whereSql, params } = buildShipmentWhere({ issueBy: 'Main Hub', status: 'ALL' });
      expect(whereSql).toContain('issue_by = ?');
      expect(params).toEqual(['Main Hub']);
    });

    it('should append date range parameters when startDate and endDate provided', () => {
      const { whereSql, params } = buildShipmentWhere({
        startDate: '2026-03-01',
        endDate: '2026-03-05',
        status: 'Delivered'
      });

      expect(whereSql).toContain('status = ?');
      expect(params[0]).toBe('Delivered');
      expect(params).toContain('2026-03-01 00:00:00');
      expect(params).toContain('2026-03-05 23:59:59');
    });

    it('should combine multiple filters with AND', () => {
      const { whereSql, params } = buildShipmentWhere({
        status: 'Delivered',
        search: '#555',
        issueBy: 'Branch A',
        startDate: '2026-03-01'
      });

      expect(whereSql).toMatch(/^WHERE .* AND .* AND .* AND .*/);
      expect(params.length).toBe(5);
    });
  });
});
