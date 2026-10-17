import { describe, it, expect, vi } from 'vitest';
import { withAuth } from '../../api/auth-middleware.js';
import appConfigFn from '../../../api/app-config.js';
import backupPostgresFn from '../../../api/backup-postgres.js';
import backupScheduleFn from '../../../api/backup-schedule.js';
import telegramAlertFn from '../../../api/telegram-alert.js';
import { generateTestToken } from '../fixtures/testHelpers.js';

function mockReq({ method = 'GET', token, body } = {}) {
  return {
    method,
    url: '/api/test',
    headers: token ? { authorization: `Bearer ${token}` } : {},
    query: {},
    body
  };
}

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(k, v) { res.headers[k.toLowerCase()] = v; },
    status(code) { res.statusCode = code; return res; },
    json(data) { res.body = data; return res; },
    end(data) { if (data !== undefined) res.body = JSON.parse(data); return res; }
  };
  return res;
}

describe('withAuth (serverless wrapper)', () => {
  it('rejects requests without a token with 401', async () => {
    const handler = vi.fn();
    const res = mockRes();
    await withAuth(handler)(mockReq(), res);
    expect(res.statusCode).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it('passes CORS preflight through without a token', async () => {
    const handler = vi.fn();
    await withAuth(handler, 'ADMIN')(mockReq({ method: 'OPTIONS' }), mockRes());
    expect(handler).toHaveBeenCalledOnce();
  });

  it('calls the handler for an authenticated user', async () => {
    const handler = vi.fn();
    const req = mockReq({ token: generateTestToken({ role: 'USER' }) });
    await withAuth(handler)(req, mockRes());
    expect(handler).toHaveBeenCalledOnce();
    expect(req.user.role).toBe('USER');
  });

  it('returns 403 when the user lacks a required role', async () => {
    const handler = vi.fn();
    const res = mockRes();
    await withAuth(handler, 'ACCOUNTANT')(mockReq({ token: generateTestToken({ role: 'USER' }) }), res);
    expect(res.statusCode).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it('lets ADMIN bypass role requirements', async () => {
    const handler = vi.fn();
    await withAuth(handler, 'ACCOUNTANT')(mockReq({ token: generateTestToken({ role: 'ADMIN' }) }), mockRes());
    expect(handler).toHaveBeenCalledOnce();
  });
});

describe('Vercel /api functions require authentication', () => {
  it.each([
    ['app-config GET', appConfigFn, 'GET'],
    ['app-config POST', appConfigFn, 'POST'],
    ['backup-postgres GET', backupPostgresFn, 'GET'],
    ['backup-postgres POST', backupPostgresFn, 'POST'],
    ['backup-schedule GET', backupScheduleFn, 'GET'],
    ['backup-schedule POST', backupScheduleFn, 'POST'],
    ['telegram-alert POST', telegramAlertFn, 'POST']
  ])('%s without token returns 401', async (_name, fn, method) => {
    const res = mockRes();
    await fn(mockReq({ method, body: { id: 'x', data: {} } }), res);
    expect(res.statusCode).toBe(401);
  });

  it('backup-postgres rejects non-accountant users with 403', async () => {
    const res = mockRes();
    await backupPostgresFn(mockReq({ method: 'POST', token: generateTestToken({ role: 'USER' }) }), res);
    expect(res.statusCode).toBe(403);
  });

  it('backup-schedule allows any user to read but only ADMIN to write', async () => {
    const userToken = generateTestToken({ role: 'USER' });

    const getRes = mockRes();
    await backupScheduleFn(mockReq({ method: 'GET', token: userToken }), getRes);
    expect(getRes.statusCode).toBe(200);
    expect(getRes.body.ok).toBe(true);

    const postRes = mockRes();
    await backupScheduleFn(mockReq({ method: 'POST', token: userToken, body: { time: '01:00' } }), postRes);
    expect(postRes.statusCode).toBe(403);
  });
});
