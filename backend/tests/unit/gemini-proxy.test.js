import { describe, it, expect, vi, afterEach } from 'vitest';
import geminiProxyHandler from '../../api/gemini-proxy.js';

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(k, v) { res.headers[k.toLowerCase()] = v; },
    end(data) { res.body = data ? JSON.parse(data) : undefined; }
  };
  return res;
}

describe('Gemini Proxy Handler (Unit Tests)', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    vi.unstubAllEnvs();
    global.fetch = originalFetch;
  });

  it('reports whether the server key is configured, without exposing it', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'server-secret-key');
    const res = mockRes();
    await geminiProxyHandler({ method: 'GET' }, res);
    expect(res.body).toEqual({ configured: true });
    expect(JSON.stringify(res.body)).not.toContain('server-secret-key');

    vi.stubEnv('GEMINI_API_KEY', 'MY_GEMINI_API_KEY');
    const placeholderRes = mockRes();
    await geminiProxyHandler({ method: 'GET' }, placeholderRes);
    expect(placeholderRes.body).toEqual({ configured: false });
  });

  it('returns 503 when no server key is configured', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    const res = mockRes();
    await geminiProxyHandler({ method: 'POST', body: { op: 'list' } }, res);
    expect(res.statusCode).toBe(503);
  });

  it('rejects invalid model names (no path injection)', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'server-secret-key');
    global.fetch = vi.fn();
    const res = mockRes();
    await geminiProxyHandler(
      { method: 'POST', body: { op: 'generate', model: '../../files', body: {} } },
      res
    );
    expect(res.statusCode).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('forwards generateContent with the server key and relays the response', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'server-secret-key');
    global.fetch = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: '{"amount":10}' }] } }] })
    });
    const res = mockRes();
    await geminiProxyHandler(
      { method: 'POST', body: { op: 'generate', model: 'gemini-2.5-flash', body: { contents: [] } } },
      res
    );

    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=server-secret-key'
    );
    expect(JSON.parse(init.body)).toEqual({ contents: [] });
    expect(res.statusCode).toBe(200);
    expect(res.body.candidates[0].content.parts[0].text).toBe('{"amount":10}');
  });
});
