import https from 'https';
import zlib from 'zlib';
import { fetchGoogleScript } from './remote-mysql.js';

// In-Memory Caches & In-Flight Request Deduplication to prevent Google 429 Too Many Requests
const sheetDataCache = new Map();
const gasApiCache = new Map();
const inFlightRequests = new Map();

const SHEET_CACHE_TTL_MS = 45 * 1000; // 45 seconds cache for sheets
const GAS_CACHE_TTL_MS = 25 * 1000;   // 25 seconds cache for read-only GAS endpoints
const CSV_FAST_TIMEOUT_MS = 3500;     // CSV export is skipped (GViz used) if slower than this

// Periodically clean up stale cache entries
setInterval(() => {
  const now = Date.now();
  for (const [key, item] of sheetDataCache.entries()) {
    if (now - item.timestamp > SHEET_CACHE_TTL_MS * 2) {
      sheetDataCache.delete(key);
    }
  }
  for (const [key, item] of gasApiCache.entries()) {
    if (now - item.timestamp > GAS_CACHE_TTL_MS * 2) {
      gasApiCache.delete(key);
    }
  }
}, 60000);

function sendResponse(req, res, statusCode, contentType, bodyText) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Vary', 'Accept-Encoding');

  const acceptEncoding = (req.headers['accept-encoding'] || '').toLowerCase();
  if (acceptEncoding.includes('gzip') && Buffer.byteLength(bodyText) > 1024) {
    try {
      res.setHeader('Content-Encoding', 'gzip');
      const gzipped = zlib.gzipSync(Buffer.from(bodyText, 'utf8'));
      res.end(gzipped);
      return;
    } catch {
      // Fallback to uncompressed on gzip failure
    }
  }

  res.end(bodyText);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-target-url');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const urlObj = new URL(req.url, 'http://localhost');
  const directTargetUrl = urlObj.searchParams.get('url') || 
    urlObj.searchParams.get('targetUrl') || 
    req.headers['x-target-url'] || 
    (req.body && (req.body.url || req.body.webAppUrl)) || 
    '';

  const forceRefresh = urlObj.searchParams.get('forceRefresh') === '1' || 
    urlObj.searchParams.get('force') === 'true' ||
    urlObj.searchParams.get('refresh') === 'true';

  // Validate target URL strictly to prevent SSRF
  let isGoogleScriptDomain = false;
  if (directTargetUrl) {
    try {
      const parsedUrl = new URL(directTargetUrl);
      if (parsedUrl.protocol === 'https:') {
        const hostname = parsedUrl.hostname.toLowerCase();
        isGoogleScriptDomain = hostname === 'script.google.com' || 
                               hostname.endsWith('.script.google.com') || 
                               hostname === 'script.googleusercontent.com' ||
                               hostname.endsWith('.script.googleusercontent.com');
      }
    } catch {}
  }

  // Proxy Google Apps Script Web App calls directly through Node with custom DNS to prevent ERR_NAME_NOT_RESOLVED
  if (directTargetUrl && isGoogleScriptDomain) {
    const isGet = (req.method || 'GET').toUpperCase() === 'GET';
    const isReadOnlyGasAction = isGet && (
      directTargetUrl.includes('action=get_settings') || 
      directTargetUrl.includes('action=get_payers') ||
      directTargetUrl.includes('action=get_permissions') ||
      directTargetUrl.includes('action=get_list_name')
    );

    const gasCacheKey = directTargetUrl.replace(/[?&]t=\d+/g, '');

    // Return cached GAS response if read-only and within TTL to prevent HTTP 429
    if (isReadOnlyGasAction && !forceRefresh) {
      const cachedGas = gasApiCache.get(gasCacheKey);
      if (cachedGas && Date.now() - cachedGas.timestamp < GAS_CACHE_TTL_MS) {
        sendResponse(req, res, cachedGas.status, 'application/json', cachedGas.text);
        return;
      }
    }

    try {
      let bodyData = null;
      if (req.method === 'POST') {
        bodyData = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
      }

      const gasRes = await fetchGoogleScript(directTargetUrl, {
        method: req.method || 'GET',
        body: bodyData,
        timeout: 35000
      });

      const responseText = await gasRes.text();
      const gasStatus = gasRes.status || 200;

      if (isReadOnlyGasAction && gasStatus === 200 && responseText && !responseText.includes('429')) {
        gasApiCache.set(gasCacheKey, {
          text: responseText,
          status: gasStatus,
          timestamp: Date.now()
        });
      }

      sendResponse(req, res, gasStatus, 'application/json', responseText);
      return;
    } catch (err) {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err.message, status: 'error' }));
      return;
    }
  }

  const id = urlObj.searchParams.get('id') || '';
  const sheet = urlObj.searchParams.get('sheet') || '';
  const gid = urlObj.searchParams.get('gid') || '';
  const requestedFormat = (urlObj.searchParams.get('format') || 'auto').toLowerCase();

  if (!id || !id.trim()) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Missing spreadsheet id' }));
    return;
  }

  const cleanId = id.trim();
  const cleanSheet = sheet.trim();
  const cleanGid = gid.trim();

  const cacheKey = `${cleanId}:${cleanSheet}:${cleanGid}:${requestedFormat}`;

  // 1. Check in-memory sheet cache (Serves in < 1ms!)
  if (!forceRefresh) {
    const cachedSheet = sheetDataCache.get(cacheKey);
    if (cachedSheet && Date.now() - cachedSheet.timestamp < SHEET_CACHE_TTL_MS) {
      sendResponse(req, res, cachedSheet.status, cachedSheet.contentType, cachedSheet.text);
      return;
    }
  }

  // 2. In-flight request deduplication (prevents duplicate simultaneous calls to Google Sheets)
  if (inFlightRequests.has(cacheKey) && !forceRefresh) {
    try {
      const sharedResult = await inFlightRequests.get(cacheKey);
      sendResponse(req, res, sharedResult.status, sharedResult.contentType, sharedResult.text);
      return;
    } catch (err) {
      // In-flight error fallback
    }
  }

  // 3. Fetch from Google. CSV export gives the exact cell text, but its redirect to
  // googleusercontent.com can hang for 30+ seconds, while GViz usually answers in ~1s.
  // So both start together: CSV is used if it arrives quickly, otherwise GViz.
  const fetchPromise = (async () => {
    const userAgent = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' };

    let gvizUrl = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(cleanId)}/gviz/tq?tqx=out:json`;
    if (cleanSheet) {
      gvizUrl += `&sheet=${encodeURIComponent(cleanSheet)}`;
    } else if (cleanGid) {
      gvizUrl += `&gid=${encodeURIComponent(cleanGid)}`;
    }

    const gvizPromise = fetch(gvizUrl, { headers: userAgent, signal: AbortSignal.timeout(30000) })
      .then(async (gvizRes) => ({
        status: gvizRes.status || 200,
        contentType: 'application/json',
        text: await gvizRes.text()
      }));
    // Avoid an unhandled rejection if CSV wins and GViz later fails
    gvizPromise.catch(() => {});

    if (requestedFormat !== 'gviz') {
      let csvUrl = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(cleanId)}/export?format=csv`;
      if (cleanSheet) {
        csvUrl += `&sheet=${encodeURIComponent(cleanSheet)}`;
      } else if (cleanGid) {
        csvUrl += `&gid=${encodeURIComponent(cleanGid)}`;
      }

      const csvPromise = (async () => {
        const csvRes = await fetch(csvUrl, { headers: userAgent, signal: AbortSignal.timeout(CSV_FAST_TIMEOUT_MS) });
        if (!csvRes.ok) return null;
        const csvText = await csvRes.text();
        // Verify it's real CSV and not Google login / HTML page
        const isHtml = csvText.includes('<!DOCTYPE') || csvText.includes('accounts.google.com') || csvText.includes('ServiceLogin');
        if (isHtml || !(csvText.includes(',') || csvText.includes('\n'))) return null;
        return { status: 200, contentType: 'text/csv; charset=utf-8', text: csvText };
      })().catch((csvErr) => {
        console.debug('CSV export fallback to GViz:', csvErr.message);
        return null;
      });

      const csvResult = await csvPromise;
      if (csvResult) return csvResult;
    }

    return gvizPromise;
  })();

  inFlightRequests.set(cacheKey, fetchPromise);

  try {
    const result = await fetchPromise;
    inFlightRequests.delete(cacheKey);

    // Cache successful responses
    if (result.status === 200 && result.text) {
      sheetDataCache.set(cacheKey, {
        status: result.status,
        contentType: result.contentType,
        text: result.text,
        timestamp: Date.now()
      });
    }

    sendResponse(req, res, result.status, result.contentType, result.text);
  } catch (err) {
    inFlightRequests.delete(cacheKey);
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Failed to fetch from Google Sheets', details: err.message }));
  }
}
