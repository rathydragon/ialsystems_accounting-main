/**
 * Backend Gemini Proxy Handler
 * Forwards Gemini API calls using the server-side GEMINI_API_KEY so the key is
 * never shipped to the browser. Callers must be authenticated (see routes.js /
 * api/gemini-proxy.js).
 *
 * GET  -> { configured: boolean }
 * POST { op: 'list' }                      -> Gemini ListModels response
 * POST { op: 'generate', model, body }     -> Gemini generateContent response
 */

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const PLACEHOLDER_KEYS = new Set(['MY_GEMINI_API_KEY', 'YOUR_GEMINI_API_KEY']);
const MODEL_NAME_RE = /^[A-Za-z0-9._-]{1,100}$/;

export function getServerGeminiKey() {
  const key = String(process.env.GEMINI_API_KEY || '').trim();
  return key && !PLACEHOLDER_KEYS.has(key) ? key : '';
}

function sendJson(res, statusCode, data) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

export default async function geminiProxyHandler(req, res) {
  const apiKey = getServerGeminiKey();

  if (req.method === 'GET') {
    return sendJson(res, 200, { configured: Boolean(apiKey) });
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: { message: 'Method Not Allowed' } });
  }

  if (!apiKey) {
    return sendJson(res, 503, { error: { message: 'Gemini API key is not configured on the server.' } });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  const { op, model, body: geminiBody } = body || {};

  let url;
  let init;
  if (op === 'list') {
    url = `${GEMINI_BASE_URL}/models?key=${encodeURIComponent(apiKey)}`;
    init = { method: 'GET' };
  } else if (op === 'generate') {
    if (!MODEL_NAME_RE.test(String(model || ''))) {
      return sendJson(res, 400, { error: { message: 'Invalid model name.' } });
    }
    if (!geminiBody || typeof geminiBody !== 'object') {
      return sendJson(res, 400, { error: { message: 'Missing request body.' } });
    }
    url = `${GEMINI_BASE_URL}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    init = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiBody)
    };
  } else {
    return sendJson(res, 400, { error: { message: 'Unknown op. Use "list" or "generate".' } });
  }

  try {
    const upstream = await fetch(url, { ...init, signal: AbortSignal.timeout(45000) });
    const data = await upstream.json().catch(() => ({}));
    return sendJson(res, upstream.status, data);
  } catch (err) {
    return sendJson(res, 502, { error: { message: `Gemini request failed: ${err?.message || 'Network error'}` } });
  }
}
