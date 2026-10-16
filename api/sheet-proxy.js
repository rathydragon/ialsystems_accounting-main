import https from 'https';
import { fetchGoogleScript } from './remote-mysql.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-target-url');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  const urlObj = new URL(req.url, 'http://localhost');
  const directTargetUrl = urlObj.searchParams.get('url') || 
    urlObj.searchParams.get('targetUrl') || 
    req.headers['x-target-url'] || 
    (req.body && (req.body.url || req.body.webAppUrl)) || 
    '';

  // Proxy Google Apps Script Web App calls directly through Node with custom DNS to prevent ERR_NAME_NOT_RESOLVED
  if (directTargetUrl && (directTargetUrl.includes('script.google.com') || directTargetUrl.includes('script.googleusercontent.com'))) {
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
      res.statusCode = gasRes.status || 200;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store, no-cache');
      res.end(responseText);
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

  if (!id || !id.trim()) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Missing spreadsheet id' }));
    return;
  }

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  let gvizUrl = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id.trim())}/gviz/tq?tqx=out:json&t=${Date.now()}`;
  if (sheet && sheet.trim()) {
    gvizUrl += `&sheet=${encodeURIComponent(sheet.trim())}`;
  } else if (gid && gid.trim()) {
    gvizUrl += `&gid=${encodeURIComponent(gid.trim())}`;
  }

  try {
    const googleRes = await fetch(gvizUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(20000)
    });
    const text = await googleRes.text();
    res.statusCode = googleRes.status || 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.end(text);
  } catch (err) {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Failed to fetch from Google Sheets', details: err.message }));
  }
}
