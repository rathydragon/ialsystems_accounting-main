import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../app.js';
import { generateTestToken } from '../fixtures/testHelpers.js';

describe('Health & Config Endpoints (Integration Tests)', () => {
  const adminToken = generateTestToken({ role: 'ADMIN' });

  it('GET / should return 200 with service information (Public)', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('running');
    expect(res.body.name).toBe('IAL Systems Accounting API');
  });

  it('GET /api/health should return 200 with healthy status and timestamp (Public)', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.service).toBe('ialsystems-accounting-backend');
    expect(res.body.timestamp).toBeDefined();
  });

  it('should reject unauthenticated access to /api/backup-schedule with 401', async () => {
    const res = await request(app).get('/api/backup-schedule');
    expect(res.status).toBe(401);
  });

  it('GET /api/backup-schedule should return 200 with schedule configuration when authenticated', async () => {
    const res = await request(app)
      .get('/api/backup-schedule')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.schedule).toBeDefined();
    expect(typeof res.body.schedule).toBe('object');
  });

  it('POST /api/backup-schedule should update schedule and return 200 when authenticated as ADMIN', async () => {
    const newSchedule = {
      enabled: true,
      mode: 'INTERVAL',
      intervalHours: 2,
      intervalMinutes: 30
    };

    const res = await request(app)
      .post('/api/backup-schedule')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(newSchedule);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.schedule.mode).toBe('INTERVAL');
    expect(res.body.schedule.intervalHours).toBe(2);
  });

  it('GET /api/pod-sync-status should return 200 with pod sync state when authenticated', async () => {
    const res = await request(app)
      .get('/api/pod-sync-status')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.state).toBeDefined();
  });

  it('POST /api/pod-sync-control should update sync interval and return 200 when authenticated as ADMIN', async () => {
    const res = await request(app)
      .post('/api/pod-sync-control')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'set_interval', intervalSeconds: 30 });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.state.intervalSeconds).toBe(30);
  });
});

