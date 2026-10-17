import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../app.js';
import { TEST_PASSWORDS } from '../fixtures/mockData.js';
import { generateTestToken } from '../fixtures/testHelpers.js';

describe('Permissions & Auth API Endpoints (Integration Tests)', () => {
  const testUserEmail = `test_temp_${Date.now()}@ialsystems.com`;
  const testUserPassword = 'TestSecurePassword2026!';
  const adminToken = generateTestToken({ role: 'ADMIN' });

  it('GET /api/permissions should return 200 and SANITIZE all passwords', async () => {
    const res = await request(app).get('/api/permissions');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(Array.isArray(res.body.data)).toBe(true);

    // SECURITY ASSERTION: Ensure no user record exposes passwords
    for (const user of res.body.data) {
      expect(user.password).toBeUndefined();
      expect(user.email).toBeDefined();
      expect(user.role).toBeDefined();
    }
  });

  describe('POST /api/permissions (Security & RBAC)', () => {
    it('should reject save with 401 when Authorization token is missing', async () => {
      const res = await request(app)
        .post('/api/permissions')
        .send({
          action: 'save',
          email: 'unauth@ialsystems.com',
          name: 'Hacker',
          role: 'ADMIN'
        });

      expect(res.status).toBe(401);
      expect(res.body.status).toBe('error');
    });

    it('should reject save with 403 when caller is non-admin USER', async () => {
      const userToken = generateTestToken({ role: 'USER' });
      const res = await request(app)
        .post('/api/permissions')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          action: 'save',
          email: 'escalate@ialsystems.com',
          name: 'Privilege Escalation Attempt',
          role: 'ADMIN'
        });

      expect(res.status).toBe(403);
      expect(res.body.status).toBe('error');
    });
  });

  describe('POST /api/permissions (action: login)', () => {
    // 1. Create a known test user first
    it('should setup a test user for login test', async () => {
      const res = await request(app)
        .post('/api/permissions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          action: 'save',
          email: testUserEmail,
          name: 'Integration Test User',
          role: 'USER',
          status: 'ACTIVE',
          password: testUserPassword
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
    });

    it('should reject login with 400 when email or password is missing', async () => {
      const res1 = await request(app)
        .post('/api/permissions')
        .send({ action: 'login', email: '' });
      expect(res1.status).toBe(400);

      const res2 = await request(app)
        .post('/api/permissions')
        .send({ action: 'login', email: testUserEmail, password: '' });
      expect(res2.status).toBe(400);
    });

    it('should reject login with 401 when email is not registered', async () => {
      const res = await request(app)
        .post('/api/permissions')
        .send({
          action: 'login',
          email: 'unknown_ghost_account_999@ialsystems.com',
          password: 'somepassword'
        });

      expect(res.status).toBe(401);
      expect(res.body.status).toBe('error');
    });

    it('should reject login with 401 when password is incorrect', async () => {
      const res = await request(app)
        .post('/api/permissions')
        .send({
          action: 'login',
          email: testUserEmail,
          password: 'WrongPassword123'
        });

      expect(res.status).toBe(401);
      expect(res.body.status).toBe('error');
    });

    it('should succeed with 200, issue signed JWT token, and sanitize user on valid credentials', async () => {
      const res = await request(app)
        .post('/api/permissions')
        .send({
          action: 'login',
          email: testUserEmail,
          password: testUserPassword
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(typeof res.body.token).toBe('string');
      expect(res.body.token.split('.').length).toBe(3); // valid JWT structure
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe(testUserEmail);
      expect(res.body.user.password).toBeUndefined(); // never expose password
    });

    it('should reject login with 403 if account is suspended', async () => {
      const suspendedEmail = `suspended_${Date.now()}@ialsystems.com`;
      await request(app)
        .post('/api/permissions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          action: 'save',
          email: suspendedEmail,
          status: 'SUSPENDED',
          password: 'Password123'
        });

      const res = await request(app)
        .post('/api/permissions')
        .send({
          action: 'login',
          email: suspendedEmail,
          password: 'Password123'
        });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Account Suspended');

      // Cleanup
      await request(app)
        .post('/api/permissions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ action: 'delete', email: suspendedEmail });
    });
  });

  describe('POST /api/permissions (CRUD management)', () => {
    it('should reject delete with 400 when email is omitted', async () => {
      const res = await request(app)
        .post('/api/permissions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ action: 'delete' });

      expect(res.status).toBe(400);
    });

    it('should successfully delete user and return 200', async () => {
      const res = await request(app)
        .post('/api/permissions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ action: 'delete', email: testUserEmail });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      const found = res.body.data.find(u => u.email === testUserEmail);
      expect(found).toBeUndefined();
    });
  });
});
