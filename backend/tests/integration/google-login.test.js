import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../app.js';
import { resetLoginAttemptsForTesting } from '../../api/permissions.js';
import { TEST_JWT_SECRET } from '../fixtures/testHelpers.js';

const CLIENT_ID = '594375780266-3pu9am9mgelmd08f0fkc06n3m2gho1bn.apps.googleusercontent.com';

function googleClaims(overrides = {}) {
  return {
    iss: 'https://accounts.google.com',
    aud: CLIENT_ID,
    email: 'rathykim34@gmail.com',
    email_verified: 'true',
    exp: String(Math.floor(Date.now() / 1000) + 3600),
    picture: 'https://example.com/p.png',
    ...overrides
  };
}

describe('POST /api/permissions action=google_login', () => {
  const originalFetch = global.fetch;

  function mockGoogle(claims, ok = true) {
    global.fetch = vi.fn(async (url, init) => {
      if (String(url).startsWith('https://oauth2.googleapis.com/tokeninfo')) {
        return { ok, json: async () => claims };
      }
      return originalFetch(url, init);
    });
  }

  beforeEach(() => resetLoginAttemptsForTesting());
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('issues a server JWT for a verified Google credential of a registered user', async () => {
    mockGoogle(googleClaims());
    const res = await request(app)
      .post('/api/permissions')
      .send({ action: 'google_login', credential: 'fake.google.jwt' });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('rathykim34@gmail.com');
    expect(res.body.user.password).toBeUndefined();
    const decoded = jwt.verify(res.body.token, TEST_JWT_SECRET, { algorithms: ['HS256'] });
    expect(decoded.email).toBe('rathykim34@gmail.com');
    expect(decoded.role).toBe('ADMIN');

    const tokenUrl = global.fetch.mock.calls[0][0];
    expect(tokenUrl).toContain('id_token=fake.google.jwt');
  });

  it('the issued JWT authorizes protected API calls', async () => {
    mockGoogle(googleClaims());
    const login = await request(app)
      .post('/api/permissions')
      .send({ action: 'google_login', credential: 'fake.google.jwt' });

    const res = await request(app)
      .get('/api/pod-sync-status')
      .set('Authorization', `Bearer ${login.body.token}`);
    expect(res.status).toBe(200);
  });

  it.each([
    ['credential issued for another client', { aud: 'someone-else.apps.googleusercontent.com' }],
    ['unverified email', { email_verified: 'false' }],
    ['expired credential', { exp: String(Math.floor(Date.now() / 1000) - 10) }],
    ['foreign issuer', { iss: 'https://evil.example.com' }]
  ])('rejects %s with 401', async (_name, overrides) => {
    mockGoogle(googleClaims(overrides));
    const res = await request(app)
      .post('/api/permissions')
      .send({ action: 'google_login', credential: 'fake.google.jwt' });
    expect(res.status).toBe(401);
    expect(res.body.token).toBeUndefined();
  });

  it('rejects a credential Google says is invalid', async () => {
    mockGoogle({ error: 'invalid_token' }, false);
    const res = await request(app)
      .post('/api/permissions')
      .send({ action: 'google_login', credential: 'garbage' });
    expect(res.status).toBe(401);
  });

  it('rejects verified Google accounts that are not registered', async () => {
    mockGoogle(googleClaims({ email: `stranger_${Date.now()}@gmail.com` }));
    const res = await request(app)
      .post('/api/permissions')
      .send({ action: 'google_login', credential: 'fake.google.jwt' });
    expect(res.status).toBe(403);
    expect(res.body.token).toBeUndefined();
  });
});
