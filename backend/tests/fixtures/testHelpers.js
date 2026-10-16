import jwt from 'jsonwebtoken';
import { vi } from 'vitest';

export const TEST_JWT_SECRET = 'test_jwt_secret_64_characters_long_for_isolated_unit_testing_key!';

/**
 * Generate signed JWT token for test requests
 */
export function generateTestToken(payload = {}, options = {}) {
  const defaultPayload = {
    id: 'test-user-id',
    email: 'test@ialsystems.com',
    name: 'Test Operator',
    role: 'ADMIN',
    status: 'ACTIVE',
    canCreate: true,
    canEdit: true,
    canDelete: true
  };

  return jwt.sign(
    { ...defaultPayload, ...payload },
    TEST_JWT_SECRET,
    { expiresIn: '1h', ...options }
  );
}

/**
 * Creates a mock MySQL pool that satisfies mysql2/promise interface
 */
export function createMockMySqlPool({ queryResolver, executeResolver } = {}) {
  const mockQuery = vi.fn(async (sql, params = []) => {
    if (queryResolver) {
      return queryResolver(sql, params);
    }
    return [[]];
  });

  const mockExecute = vi.fn(async (sql, params = []) => {
    if (executeResolver) {
      return executeResolver(sql, params);
    }
    return [[]];
  });

  const mockConnection = {
    query: mockQuery,
    execute: mockExecute,
    release: vi.fn(),
    destroy: vi.fn()
  };

  return {
    query: mockQuery,
    execute: mockExecute,
    getConnection: vi.fn(async () => mockConnection),
    end: vi.fn(async () => {}),
    on: vi.fn()
  };
}

/**
 * Creates a mock PostgreSQL client/pool
 */
export function createMockPgPool({ queryResolver } = {}) {
  const mockQuery = vi.fn(async (sql, params = []) => {
    if (queryResolver) {
      return queryResolver(sql, params);
    }
    return { rows: [], rowCount: 0 };
  });

  return {
    query: mockQuery,
    connect: vi.fn(async () => ({
      query: mockQuery,
      release: vi.fn()
    })),
    end: vi.fn(async () => {}),
    on: vi.fn()
  };
}
