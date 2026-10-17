import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import app, { createApp } from '../../app.js';
import { generateTestToken } from '../fixtures/testHelpers.js';

describe('Security Headers & CORS Policy (Integration Tests)', () => {
  it('should include Helmet security headers on all responses', async () => {
    const res = await request(app).get('/');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-dns-prefetch-control']).toBe('off');
    expect(res.headers['x-download-options']).toBe('noopen');
    expect(res.headers['x-permitted-cross-domain-policies']).toBe('none');
  });

  describe('CORS Whitelist Policy', () => {
    it('should allow and reflect trusted localhost origin with credentials', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Origin', 'http://localhost:3000');

      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('should allow trusted local Wi-Fi LAN IP origin', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Origin', 'http://192.168.1.100:3000');

      expect(res.headers['access-control-allow-origin']).toBe('http://192.168.1.100:3000');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('should NOT trust LAN IP origins in production unless CORS_ALLOW_LAN=true', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      try {
        const res = await request(createApp())
          .get('/api/health')
          .set('Origin', 'http://192.168.1.100:3000');
        expect(res.headers['access-control-allow-origin']).not.toBe('http://192.168.1.100:3000');
        expect(res.headers['access-control-allow-credentials']).toBeUndefined();

        vi.stubEnv('CORS_ALLOW_LAN', 'true');
        const allowed = await request(createApp())
          .get('/api/health')
          .set('Origin', 'http://192.168.1.100:3000');
        expect(allowed.headers['access-control-allow-origin']).toBe('http://192.168.1.100:3000');
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it('should NOT allow or reflect untrusted external origin with credentials', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Origin', 'https://untrusted-external-domain.com');

      // Crucial: Must NOT reflect untrusted origin as allowed with credentials!
      expect(res.headers['access-control-allow-origin']).not.toBe('https://untrusted-external-domain.com');
      expect(res.headers['access-control-allow-credentials']).toBeUndefined();
    });

    it('should return 204 on CORS preflight OPTIONS request from allowed origin', async () => {
      const res = await request(app)
        .options('/api/health')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'GET');

      expect(res.status).toBe(204);
      expect(res.headers['access-control-allow-methods']).toContain('GET');
    });
  });

  describe('Token transport', () => {
    it('should reject JWT passed via ?token= query string', async () => {
      const res = await request(app).get(`/api/pod-sync-status?token=${generateTestToken()}`);
      expect(res.status).toBe(401);
    });

    it('should accept JWT passed via Authorization header', async () => {
      const res = await request(app)
        .get('/api/pod-sync-status')
        .set('Authorization', `Bearer ${generateTestToken()}`);
      expect(res.status).toBe(200);
    });
  });
});
