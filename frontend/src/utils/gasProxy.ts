/**
 * Safely resolves a Google Apps Script Web App URL to route through /api/sheet-proxy
 * when running in the browser to avoid `net::ERR_NAME_NOT_RESOLVED` and CORS errors
 * caused by local ISP DNS failing to resolve `script.googleusercontent.com`.
 */
export function getProxiedGasUrl(url?: string | null): string {
  if (!url || typeof url !== 'string' || !url.trim()) return '';
  const trimmed = url.trim();
  if (trimmed.includes('script.google.com') || trimmed.includes('script.googleusercontent.com')) {
    return `/api/sheet-proxy?url=${encodeURIComponent(trimmed)}`;
  }
  return trimmed;
}

/**
 * Robust fetch for Google Apps Script Web App requests (GET or POST)
 */
export async function fetchGasWebApp(url: string, options: RequestInit = {}): Promise<Response> {
  const proxiedUrl = getProxiedGasUrl(url);
  return fetch(proxiedUrl, {
    ...options
  });
}
