import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PERMISSIONS_FILE = path.resolve(__dirname, '../scripts/user_permissions.json');

const MASTER_ADMIN_EMAIL = 'rathykim34@gmail.com';
const IAL_ACCOUNTING_EMAIL = 'ialexpress2023@gmail.com';

function readLocalPermissions() {
  try {
    if (fs.existsSync(PERMISSIONS_FILE)) {
      const content = fs.readFileSync(PERMISSIONS_FILE, 'utf8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('[permissions.js] Error reading local permissions file:', err.message);
  }
  return null;
}

function writeLocalPermissions(perms) {
  try {
    fs.writeFileSync(PERMISSIONS_FILE, JSON.stringify(perms, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('[permissions.js] Error writing local permissions file:', err.message);
    return false;
  }
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  try {
    // 1. GET: Return all user permissions from local file or fetch from Google Sheets
    if (req.method === 'GET') {
      let list = readLocalPermissions();

      // If file doesn't exist yet, fetch from Google Apps Script once to prefill
      if (!list || list.length === 0) {
        try {
          const webAppUrl = process.env.VITE_GOOGLE_WEBAPP_URL || 'https://script.google.com/macros/s/AKfycbygSQiOEQX0ip8yb3wcw7Rctjv884tm6BGluiUkkSdxySMfdjtXwvAWS-NEky-HaBr0vQ/exec';
          const fetchRes = await fetch(`${webAppUrl}${webAppUrl.includes('?') ? '&' : '?'}action=get_permissions`);
          if (fetchRes.ok) {
            const json = await fetchRes.json();
            if (json && json.status === 'success' && Array.isArray(json.data)) {
              list = json.data;
              writeLocalPermissions(list);
            }
          }
        } catch (fetchErr) {
          console.warn('[permissions.js] Initial Google Sheets fetch failed:', fetchErr.message);
        }
      }

      if (!list) list = [];

      // Ensure Master Admin exists
      const masterIdx = list.findIndex(p => (p.email || '').toLowerCase().trim() === MASTER_ADMIN_EMAIL);
      if (masterIdx < 0) {
        list.unshift({
          id: 'u-master-admin',
          email: MASTER_ADMIN_EMAIL,
          name: 'KEUN RATHY',
          role: 'ADMIN',
          status: 'ACTIVE',
          canCreate: true,
          canEdit: true,
          canDelete: true,
          createdAt: new Date().toISOString()
        });
        writeLocalPermissions(list);
      }

      res.statusCode = 200;
      res.end(JSON.stringify({ status: 'success', source: 'local_server', data: list }));
      return;
    }

    // 2. POST: Save, Update, or Delete
    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch {}
      }

      let currentList = readLocalPermissions() || [];
      const action = body?.action || 'save';

      // Action: DELETE
      if (action === 'delete') {
        const email = String(body.email || '').toLowerCase().trim();
        if (!email) {
          res.statusCode = 400;
          res.end(JSON.stringify({ status: 'error', message: 'Email required' }));
          return;
        }
        currentList = currentList.filter(p => (p.email || '').toLowerCase().trim() !== email);
        writeLocalPermissions(currentList);
        res.statusCode = 200;
        res.end(JSON.stringify({ status: 'success', message: `Deleted ${email}`, data: currentList }));
        return;
      }

      // Action: BULK_SYNC
      if (action === 'bulk_sync' && Array.isArray(body.permissions)) {
        // Merge with existing passwords to never lose passwords
        const updatedMap = new Map();
        for (const p of currentList) {
          if (p.email) updatedMap.set(p.email.toLowerCase().trim(), p);
        }
        for (const incoming of body.permissions) {
          if (!incoming.email) continue;
          const cleanEmail = incoming.email.toLowerCase().trim();
          const existing = updatedMap.get(cleanEmail);
          updatedMap.set(cleanEmail, {
            ...existing,
            ...incoming,
            password: incoming.password !== undefined ? incoming.password : existing?.password,
            updatedAt: new Date().toISOString()
          });
        }
        currentList = Array.from(updatedMap.values());
        writeLocalPermissions(currentList);
        res.statusCode = 200;
        res.end(JSON.stringify({ status: 'success', count: currentList.length, data: currentList }));
        return;
      }

      // Action: SAVE SINGLE PERMISSION
      const perm = body.permission || body;
      const cleanEmail = String(perm.email || '').toLowerCase().trim();
      if (!cleanEmail) {
        res.statusCode = 400;
        res.end(JSON.stringify({ status: 'error', message: 'Email is required' }));
        return;
      }

      const existingIdx = currentList.findIndex(p => (p.email || '').toLowerCase().trim() === cleanEmail);
      if (existingIdx >= 0) {
        currentList[existingIdx] = {
          ...currentList[existingIdx],
          ...perm,
          password: perm.password !== undefined ? perm.password : currentList[existingIdx].password,
          updatedAt: new Date().toISOString()
        };
      } else {
        currentList.push({
          ...perm,
          email: cleanEmail,
          updatedAt: new Date().toISOString()
        });
      }

      writeLocalPermissions(currentList);
      res.statusCode = 200;
      res.end(JSON.stringify({ status: 'success', email: cleanEmail, data: currentList }));
      return;
    }

    res.statusCode = 405;
    res.end(JSON.stringify({ status: 'error', message: 'Method Not Allowed' }));
  } catch (err) {
    console.error('[permissions.js] Handler error:', err);
    res.statusCode = 500;
    res.end(JSON.stringify({ status: 'error', message: err.message }));
  }
}
