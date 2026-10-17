import { describe, it, expect, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {
  sanitizeUser,
  checkLoginRateLimit,
  recordFailedLogin,
  recordSuccessfulLogin,
  resetLoginAttemptsForTesting
} from '../../api/permissions.js';
import { generateTestToken, TEST_JWT_SECRET } from '../fixtures/testHelpers.js';
import { TEST_PASSWORDS, MOCK_USERS } from '../fixtures/mockData.js';

describe('Permissions & Authentication Logic (Unit Tests)', () => {
  describe('sanitizeUser', () => {
    it('should strip password field from user object', () => {
      const sensitiveUser = {
        id: 'u-123',
        email: 'test@example.com',
        name: 'John Doe',
        password: 'raw_password_123',
        role: 'ADMIN'
      };

      const clean = sanitizeUser(sensitiveUser);

      expect(clean.password).toBeUndefined();
      expect(clean.id).toBe('u-123');
      expect(clean.email).toBe('test@example.com');
      expect(clean.name).toBe('John Doe');
      expect(clean.role).toBe('ADMIN');
    });

    it('should return null or non-object values unchanged', () => {
      expect(sanitizeUser(null)).toBeNull();
      expect(sanitizeUser(undefined)).toBeUndefined();
      expect(sanitizeUser('string')).toBe('string');
    });
  });

  describe('Password Hashing & Verification (bcrypt)', () => {
    it('should correctly hash and verify password with bcrypt', () => {
      const rawPassword = 'SecretAccounting2026!';
      const hash = bcrypt.hashSync(rawPassword, 10);

      expect(hash).toMatch(/^\$2[ab]\$/);
      expect(bcrypt.compareSync(rawPassword, hash)).toBe(true);
      expect(bcrypt.compareSync('WrongPassword', hash)).toBe(false);
    });

    it('should verify pre-hashed admin password fixture', () => {
      const isValid = bcrypt.compareSync(TEST_PASSWORDS.rawAdmin, TEST_PASSWORDS.hashAdmin);
      expect(isValid).toBe(true);
    });
  });

  describe('JWT Session Tokens', () => {
    it('should generate valid JWT token with user claims and expiration', () => {
      const token = generateTestToken({
        id: 'u-admin-1',
        email: 'admin@ialsystems.com',
        role: 'ADMIN'
      });

      expect(typeof token).toBe('string');
      const decoded = jwt.verify(token, TEST_JWT_SECRET);
      expect(decoded.id).toBe('u-admin-1');
      expect(decoded.email).toBe('admin@ialsystems.com');
      expect(decoded.role).toBe('ADMIN');
      expect(decoded.exp).toBeGreaterThan(Date.now() / 1000);
    });

    it('should reject invalid or tampered JWT token', () => {
      const token = generateTestToken();
      const tampered = token.slice(0, -5) + 'abcde';

      expect(() => {
        jwt.verify(tampered, TEST_JWT_SECRET);
      }).toThrow();
    });

    it('should reject token signed with different secret', () => {
      const wrongToken = jwt.sign({ user: 'hacker' }, 'attacker_secret_key');

      expect(() => {
        jwt.verify(wrongToken, TEST_JWT_SECRET);
      }).toThrow();
    });
  });

  describe('Brute Force Login Protection', () => {
    const testKey = '192.168.1.100_victim@ialsystems.com';

    beforeEach(() => {
      resetLoginAttemptsForTesting();
    });

    it('should allow initial login attempts', () => {
      expect(checkLoginRateLimit(testKey).allowed).toBe(true);
    });

    it('should lock out user/IP after 5 failed login attempts', () => {
      for (let i = 0; i < 4; i++) {
        recordFailedLogin(testKey);
        expect(checkLoginRateLimit(testKey).allowed).toBe(true);
      }

      // 5th failed attempt triggers lockout
      recordFailedLogin(testKey);
      const check = checkLoginRateLimit(testKey);
      expect(check.allowed).toBe(false);
      expect(check.remainingSec).toBeGreaterThan(0);
      expect(check.message).toContain('locked');
    });

    it('should clear failed attempts on successful login', () => {
      recordFailedLogin(testKey);
      recordFailedLogin(testKey);
      recordSuccessfulLogin(testKey);

      expect(checkLoginRateLimit(testKey).allowed).toBe(true);
    });
  });
});
