import https from 'https';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  const urlObj = new URL(req.url, 'http://localhost');
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

  https.get(gvizUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (googleRes) => {
    res.statusCode = googleRes.statusCode || 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    googleRes.pipe(res);
  }).on('error', (err) => {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Failed to fetch from Google Sheets', details: err.message }));
  });
}
