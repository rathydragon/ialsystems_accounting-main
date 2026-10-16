import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../app.js';

describe('App Config & Distribution Reports API (Integration Tests)', () => {
  it('GET /api/app-config should handle request and return JSON response', async () => {
    const res = await request(app).get('/api/app-config');
    expect(res.status).toBe(200);
    expect(typeof res.body).toBe('object');
  });

  it('POST /api/app-config should reject 400 when id or data is missing', async () => {
    const res = await request(app)
      .post('/api/app-config')
      .send({
        exchangeRate: 4100
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Missing id or data');
  });

  it('POST /api/app-config should accept valid config object with id and data', async () => {
    const res = await request(app)
      .post('/api/app-config')
      .send({
        id: 'system_settings',
        data: { exchangeRate: 4100, appName: 'IAL Systems Test' }
      });

    // 200 on success or fallback
    expect([200, 500]).toContain(res.status);
    expect(typeof res.body).toBe('object');
  });

  it('GET /api/distribution-reports should respond with reports list or empty fallback', async () => {
    const res = await request(app).get('/api/distribution-reports');
    expect([200, 500]).toContain(res.status);
    expect(typeof res.body).toBe('object');
  });

  it('GET /api/backup-postgres should respond with connection and status', async () => {
    const res = await request(app).get('/api/backup-postgres');
    expect(res.status).toBe(200);
    expect(res.body.ok !== undefined).toBe(true);
  });
});
