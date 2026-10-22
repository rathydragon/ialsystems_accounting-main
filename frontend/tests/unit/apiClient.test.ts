import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getAuthToken,
  setAuthToken,
  clearAuthSession,
  authFetch,
  installAuthInterceptor,
  JWT_STORAGE_KEY,
  AUTH_USER_STORAGE_KEY
} from '../../src/services/apiClient';

describe('API Client & Authentication Fetcher (Unit Tests)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('Token & Storage Management', () => {
    it('should set and get auth token from localStorage', () => {
      expect(getAuthToken()).toBeNull();
      setAuthToken('mock_jwt_token_12345');
      expect(getAuthToken()).toBe('mock_jwt_token_12345');
      expect(localStorage.getItem(JWT_STORAGE_KEY)).toBe('mock_jwt_token_12345');
    });

    it('should clear token when empty value passed', () => {
      setAuthToken('token_to_clear');
      expect(getAuthToken()).toBe('token_to_clear');
      setAuthToken('');
      expect(getAuthToken()).toBeNull();
    });

    it('should comprehensively purge all auth keys on clearAuthSession()', () => {
      localStorage.setItem(JWT_STORAGE_KEY, 'secret_token');
      localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify({ name: 'Admin' }));
      localStorage.setItem('accounting_app_auth_user', 'legacy');
      localStorage.setItem('accounting_user_permissions', 'cached_perms');

      clearAuthSession();

      expect(localStorage.getItem(JWT_STORAGE_KEY)).toBeNull();
      expect(localStorage.getItem(AUTH_USER_STORAGE_KEY)).toBeNull();
      expect(localStorage.getItem('accounting_app_auth_user')).toBeNull();
      expect(localStorage.getItem('accounting_user_permissions')).toBeNull();
      expect(localStorage.getItem('LOGGED_OUT_EXPLICITLY')).toBe('true');
    });
  });

  describe('authFetch', () => {
    it('should attach Bearer token to internal /api/ requests', async () => {
      setAuthToken('valid_user_jwt_token');

      let capturedHeaders: Headers | null = null;
      vi.spyOn(window, 'fetch').mockImplementationOnce(async (_input, init) => {
        capturedHeaders = new Headers(init?.headers);
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      });

      const res = await authFetch('/api/remote-mysql?action=test');
      expect(res.status).toBe(200);
      expect(capturedHeaders).not.toBeNull();
      expect(capturedHeaders!.get('Authorization')).toBe('Bearer valid_user_jwt_token');
    });

    it('should NOT attach token to external URLs (avoids token leakage)', async () => {
      setAuthToken('secret_token_do_not_leak');

      let capturedHeaders: Headers | null = null;
      vi.spyOn(window, 'fetch').mockImplementationOnce(async (_input, init) => {
        capturedHeaders = new Headers(init?.headers);
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      });

      await authFetch('https://script.google.com/macros/s/xyz/exec');
      expect(capturedHeaders).not.toBeNull();
      expect(capturedHeaders!.has('Authorization')).toBe(false);
    });

    it('should trigger auth:expired event on 401 Unauthorized response', async () => {
      setAuthToken('expired_token');

      vi.spyOn(window, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: false, message: 'Token expired' }), { status: 401 })
      );

      let eventTriggered = false;
      const listener = () => {
        eventTriggered = true;
      };
      window.addEventListener('auth:expired', listener);

      const res = await authFetch('/api/remote-mysql?action=get_batches');
      expect(res.status).toBe(401);
      expect(eventTriggered).toBe(true);
      expect(getAuthToken()).toBeNull(); // Cleaned up

      window.removeEventListener('auth:expired', listener);
    });
  });

  describe('Expired tokens', () => {
    const makeJwt = (expSeconds: number) => {
      const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '');
      return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ email: 'a@b.c', exp: expSeconds })}.sig`;
    };

    it('drops an expired token and signals auth:expired without a network call', async () => {
      setAuthToken(makeJwt(Math.floor(Date.now() / 1000) - 60));
      const fetchSpy = vi.spyOn(window, 'fetch');
      const listener = vi.fn();
      window.addEventListener('auth:expired', listener);

      expect(getAuthToken()).toBeNull();
      expect(localStorage.getItem(JWT_STORAGE_KEY)).toBeNull();
      await new Promise(r => setTimeout(r, 0));
      expect(listener).toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();

      window.removeEventListener('auth:expired', listener);
    });

    it('keeps a token that has not expired yet', () => {
      const token = makeJwt(Math.floor(Date.now() / 1000) + 3600);
      setAuthToken(token);
      expect(getAuthToken()).toBe(token);
    });
  });
});
