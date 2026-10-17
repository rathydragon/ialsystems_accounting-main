import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { installAuthInterceptor, isPublicApiUrl, setAuthToken } from '../../src/services/apiClient';

describe('isPublicApiUrl', () => {
  it('treats health, sheet-proxy and permission reads/logins as public', () => {
    expect(isPublicApiUrl('/api/health')).toBe(true);
    expect(isPublicApiUrl('/api/sheet-proxy?url=x')).toBe(true);
    expect(isPublicApiUrl('/api/permissions')).toBe(true);
    expect(isPublicApiUrl('/api/permissions', { method: 'POST', body: JSON.stringify({ action: 'login' }) })).toBe(true);
    expect(isPublicApiUrl('/api/permissions', { method: 'POST', body: JSON.stringify({ action: 'google_login' }) })).toBe(true);
  });

  it('treats protected endpoints and permission mutations as private', () => {
    expect(isPublicApiUrl('/api/remote-mysql?action=stats')).toBe(false);
    expect(isPublicApiUrl('https://ialsystems-admin.vercel.app/api/app-config?t=1')).toBe(false);
    expect(isPublicApiUrl('/api/permissions', { method: 'POST', body: JSON.stringify({ action: 'bulk_sync' }) })).toBe(false);
    expect(isPublicApiUrl('/api/permissions', { method: 'POST', body: 'not json' })).toBe(false);
  });
});

describe('installAuthInterceptor while signed out', () => {
  const nativeFetch = vi.fn(async () => new Response('{}', { status: 200 }));

  beforeAll(() => {
    window.fetch = nativeFetch as unknown as typeof window.fetch;
    installAuthInterceptor();
  });

  beforeEach(() => {
    localStorage.clear();
    nativeFetch.mockClear();
  });

  it('answers protected endpoints locally with 401 without hitting the network', async () => {
    const res = await window.fetch('/api/remote-mysql?action=get_warehouse_scans');
    expect(res.status).toBe(401);
    expect(nativeFetch).not.toHaveBeenCalled();
  });

  it('still sends public requests such as Google login', async () => {
    await window.fetch('/api/permissions', {
      method: 'POST',
      body: JSON.stringify({ action: 'google_login', credential: 'x' })
    });
    expect(nativeFetch).toHaveBeenCalledOnce();
  });

  it('sends protected requests with a Bearer token once signed in', async () => {
    setAuthToken('jwt-123');
    await window.fetch('/api/remote-mysql?action=stats');
    expect(nativeFetch).toHaveBeenCalledOnce();
    const init = (nativeFetch.mock.calls[0] as unknown[])[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBe('Bearer jwt-123');
  });

  it('does not touch non-API requests', async () => {
    await window.fetch('https://example.com/data.json');
    expect(nativeFetch).toHaveBeenCalledOnce();
  });
});
