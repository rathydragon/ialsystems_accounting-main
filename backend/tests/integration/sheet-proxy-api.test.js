import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../app.js';

describe('Sheet Proxy API & SSRF Protection (Integration Tests)', () => {
  it('OPTIONS /api/sheet-proxy should handle CORS preflight with 204 No Content', async () => {
    const res = await request(app).options('/api/sheet-proxy');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-methods']).toContain('GET');
  });

  it('GET /api/sheet-proxy without spreadsheet id or targetUrl should return 400', async () => {
    const res = await request(app).get('/api/sheet-proxy');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Missing spreadsheet id');
  });

  describe('SSRF Attack Prevention', () => {
    it('should reject SSRF attempt with query param substring (attacker.com/?script.google.com)', async () => {
      const res = await request(app)
        .get('/api/sheet-proxy')
        .query({ url: 'http://attacker.com/?script.google.com' });

      // Because hostname is attacker.com, it should not be allowed as Google Script
      // and falls through to require spreadsheet id or returns 400
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('should reject SSRF attempt with subdomain spoof (script.google.com.attacker.com)', async () => {
      const res = await request(app)
        .get('/api/sheet-proxy')
        .query({ url: 'https://script.google.com.attacker.com/exec' });

      expect(res.status).toBe(400);
    });

    it('should reject non-HTTPS Google Script URLs', async () => {
      const res = await request(app)
        .get('/api/sheet-proxy')
        .query({ url: 'http://script.google.com/macros/s/xyz/exec' });

      expect(res.status).toBe(400);
    });
  });
});
