/**
 * Centralized API Client & Authentication Fetcher
 * Manages JWT tokens, automatic Authorization Bearer header injection,
 * and secure storage cleanup on logout.
 */

export const JWT_STORAGE_KEY = 'accounting_jwt_token';
export const AUTH_USER_STORAGE_KEY = 'accounting_app_auth_user_v2';
export const LEGACY_AUTH_STORAGE_KEY = 'accounting_app_auth_user';

/**
 * Read the `exp` claim (seconds) of a JWT. Returns null when the token is not a
 * readable JWT, so unknown token formats are left for the server to judge.
 */
function getTokenExpiry(token: string): number | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    const exp = JSON.parse(json)?.exp;
    return typeof exp === 'number' ? exp : null;
  } catch {
    return null;
  }
}

/** True when the token's expiry time has passed (30s margin for clock drift). */
export function isTokenExpired(token: string): boolean {
  const exp = getTokenExpiry(token);
  return exp !== null && exp * 1000 <= Date.now() + 30_000;
}

/**
 * Retrieve the current JWT token from localStorage.
 * An expired token is removed here and the app is told the session ended, so no
 * request is sent with it (the server would only answer 401).
 */
export function getAuthToken(): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const token = window.localStorage.getItem(JWT_STORAGE_KEY);
      if (token && isTokenExpired(token)) {
        window.localStorage.removeItem(JWT_STORAGE_KEY);
        // Notify after the current call stack so listeners never update state mid-render.
        setTimeout(() => window.dispatchEvent(new CustomEvent('auth:expired')), 0);
        return null;
      }
      return token;
    }
  } catch (err) {
    console.warn('[apiClient] Failed to read token from localStorage:', err);
  }
  return null;
}

/**
 * Save JWT token into localStorage
 */
export function setAuthToken(token: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (token && token.trim()) {
        window.localStorage.setItem(JWT_STORAGE_KEY, token.trim());
      } else {
        window.localStorage.removeItem(JWT_STORAGE_KEY);
      }
    }
  } catch (err) {
    console.warn('[apiClient] Failed to save token to localStorage:', err);
  }
}

/**
 * Purge all authentication and user identity artifacts from client storage
 */
export function clearAuthSession(): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(JWT_STORAGE_KEY);
      window.localStorage.removeItem(AUTH_USER_STORAGE_KEY);
      window.localStorage.removeItem(LEGACY_AUTH_STORAGE_KEY);
      window.localStorage.removeItem('accounting_user_permissions');
      window.localStorage.removeItem('user_permissions_cache');
      window.localStorage.setItem('LOGGED_OUT_EXPLICITLY', 'true');
    }
  } catch (err) {
    console.warn('[apiClient] Failed to clear auth storage:', err);
  }
}

/**
 * Helper to determine if a target URL is an internal API endpoint
 */
function isInternalApiUrl(url: string): boolean {
  if (!url) return false;
  // Local paths like /api/...
  if (url.startsWith('/api/')) return true;
  // Absolute URLs matching current origin with /api/
  if (typeof window !== 'undefined' && window.location) {
    const origin = window.location.origin;
    if (url.startsWith(`${origin}/api/`)) return true;
  }
  return false;
}

/**
 * Internal endpoints that work without signing in (login, public permission list,
 * health check, Google Sheets proxy).
 */
const PUBLIC_API_PATHS = ['/api/health', '/api/sheet-proxy'];
const PUBLIC_PERMISSION_ACTIONS = ['login', 'google_login'];

export function isPublicApiUrl(url: string, init?: RequestInit): boolean {
  const path = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
  if (PUBLIC_API_PATHS.some(p => path === p || path.startsWith(p + '/'))) return true;
  if (path === '/api/permissions') {
    const method = String(init?.method || 'GET').toUpperCase();
    if (method === 'GET') return true;
    try {
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
      return PUBLIC_PERMISSION_ACTIONS.includes(body?.action);
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Authenticated Fetch: automatically injects Authorization Bearer header
 * into requests destined for internal /api/* endpoints.
 */
export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string'
    ? input
    : input instanceof URL
    ? input.toString()
    : input.url;

  let finalInput = input;
  let finalInit: RequestInit = { ...(init || {}) };

  if (isInternalApiUrl(url)) {
    const token = getAuthToken();
    if (token) {
      if (typeof Request !== 'undefined' && input instanceof Request) {
        const headers = new Headers(input.headers);
        if (!headers.has('Authorization')) {
          headers.set('Authorization', `Bearer ${token}`);
        }
        finalInput = new Request(input, { headers });
      } else {
        const headers = new Headers(finalInit.headers || {});
        if (!headers.has('Authorization')) {
          headers.set('Authorization', `Bearer ${token}`);
        }
        finalInit.headers = headers;
      }
    }
  }

  const response = await fetch(finalInput, finalInit);

  // If receiving 401 on internal endpoint (and not standard login failure), handle expired token
  if (
    response.status === 401 &&
    isInternalApiUrl(url) &&
    !url.includes('action=login')
  ) {
    const token = getAuthToken();
    if (token) {
      console.warn('[apiClient] Session expired (HTTP 401). Clearing credentials.');
      clearAuthSession();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('auth:expired'));
      }
    }
  }

  return response;
}

let isInterceptorInstalled = false;

/**
 * Installs a transparent fetch interceptor so that ALL fetch calls to /api/*
 * throughout legacy components automatically attach the Bearer token without code changes.
 */
export function installAuthInterceptor(): void {
  if (isInterceptorInstalled || typeof window === 'undefined' || typeof window.fetch !== 'function') {
    return;
  }

  const nativeFetch = window.fetch.bind(window);

  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
      ? input.toString()
      : input.url;

    if (isInternalApiUrl(url)) {
      const token = getAuthToken();
      const isRequestObject = typeof Request !== 'undefined' && input instanceof Request;
      if (!token && !isRequestObject && !isPublicApiUrl(url, init)) {
        // Not signed in: protected endpoints would only answer 401. Answer locally instead of
        // hitting the network, so background polling on the login screen stays silent.
        return new Response(
          JSON.stringify({ ok: false, status: 'error', message: 'Not signed in' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (token) {
        let finalInput = input;
        let finalInit: RequestInit = { ...(init || {}) };

        if (typeof Request !== 'undefined' && input instanceof Request) {
          const headers = new Headers(input.headers);
          if (!headers.has('Authorization')) {
            headers.set('Authorization', `Bearer ${token}`);
          }
          finalInput = new Request(input, { headers });
        } else {
          const headers = new Headers(finalInit.headers || {});
          if (!headers.has('Authorization')) {
            headers.set('Authorization', `Bearer ${token}`);
          }
          finalInit.headers = headers;
        }

        const res = await nativeFetch(finalInput, finalInit);

        if (res.status === 401 && !url.includes('action=login')) {
          console.warn('[apiClient] Intercepted HTTP 401 Unauthorized. Session expired.');
          clearAuthSession();
          window.dispatchEvent(new CustomEvent('auth:expired'));
        }

        return res;
      }
    }

    return nativeFetch(input, init);
  };

  isInterceptorInstalled = true;
}
