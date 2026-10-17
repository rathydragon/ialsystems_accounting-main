import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import { getJwtSecret, authenticateRequest } from './auth-middleware.js';

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

// Strip password from user object before sending to client
export function sanitizeUser(user) {
  if (!user || typeof user !== 'object') return user;
  const { password, ...safeUser } = user;
  return safeUser;
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  try {
    // 1. GET: Return all user permissions SANITIZED (NO PASSWORDS)
    if (req.method === 'GET') {
      let list = readLocalPermissions();

      if (!list || list.length === 0) {
        try {
          const webAppUrl = process.env.VITE_GOOGLE_WEBAPP_URL || 'https://script.google.com/macros/s/AKfycbxSYmPsF37ycoH9jnEmrK1xBZR9U1zhimCvzWNeedeAkMrjLykCAwW6nuRXVhIEjSq0gw/exec';
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

      // CRITICAL: Strip password field completely before returning to client
      const sanitizedList = list.map(sanitizeUser);
      res.statusCode = 200;
      res.end(JSON.stringify({ status: 'success', source: 'local_server', data: sanitizedList }));
      return;
    }

    // 2. POST Handler
    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch {}
      }

      let currentList = readLocalPermissions() || [];
      const action = body?.action || 'save';

      // ============================================================
      // Action: LOGIN (Server-Side Authentication with Password Verification)
      // ============================================================
      if (action === 'login') {
        const email = String(body.email || '').toLowerCase().trim();
        const inputPassword = String(body.password || '').trim();

        if (!email || !inputPassword) {
          res.statusCode = 400;
          res.end(JSON.stringify({ status: 'error', message: 'សូមបញ្ចូល Email និង Password ឱ្យបានត្រឹមត្រូវ!' }));
          return;
        }

        const user = currentList.find(p => (p.email || '').toLowerCase().trim() === email);
        if (!user) {
          res.statusCode = 401;
          res.end(JSON.stringify({ status: 'error', message: 'អ៊ីមែល ឬពាក្យសម្ងាត់មិនត្រឹមត្រូវទេ!' }));
          return;
        }

        if (user.status === 'SUSPENDED') {
          res.statusCode = 403;
          res.end(JSON.stringify({ status: 'error', message: 'គណនីរបស់អ្នកត្រូវបានផ្អាកការប្រើប្រាស់ (Account Suspended)!' }));
          return;
        }

        const storedPassword = String(user.password || '');
        let isPasswordValid = false;

        if (storedPassword.startsWith('$2a$') || storedPassword.startsWith('$2b$')) {
          // Compare using bcrypt
          isPasswordValid = bcrypt.compareSync(inputPassword, storedPassword);
        } else {
          // Legacy plain password verification (and auto-migrate to bcrypt hash)
          if (storedPassword && inputPassword === storedPassword) {
            isPasswordValid = true;
            try {
              user.password = bcrypt.hashSync(inputPassword, 10);
              writeLocalPermissions(currentList);
            } catch {}
          }
        }

        if (!isPasswordValid) {
          res.statusCode = 401;
          res.end(JSON.stringify({ status: 'error', message: 'អ៊ីមែល ឬពាក្យសម្ងាត់មិនត្រឹមត្រូវទេ!' }));
          return;
        }

        // Generate Signed JWT Token with Pinned Algorithm
        const token = jwt.sign(
          {
            id: user.id || user.email,
            email: user.email,
            name: user.name || '',
            role: user.role || 'USER',
            status: user.status || 'ACTIVE',
            viewOnlyOwn: Boolean(user.viewOnlyOwn),
            canCreate: Boolean(user.canCreate),
            canEdit: Boolean(user.canEdit),
            canDelete: Boolean(user.canDelete)
          },
          getJwtSecret(),
          { algorithm: 'HS256', expiresIn: '12h' }
        );

        res.statusCode = 200;
        res.end(JSON.stringify({
          status: 'success',
          token,
          user: sanitizeUser(user),
          message: 'ចូលប្រើប្រាស់ជោគជ័យ'
        }));
        return;
      }

      // Actions other than login modify permissions and require authenticated ADMIN role
      const authUser = authenticateRequest(req, res);
      if (!authUser) return;
      if (authUser.role !== 'ADMIN') {
        res.statusCode = 403;
        res.end(JSON.stringify({ status: 'error', message: 'Forbidden: Admin access required' }));
        return;
      }

      // ============================================================
      // Action: DELETE USER
      // ============================================================
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
        res.end(JSON.stringify({ status: 'success', message: `Deleted ${email}`, data: currentList.map(sanitizeUser) }));
        return;
      }

      // ============================================================
      // Action: BULK_SYNC
      // ============================================================
      if (action === 'bulk_sync' && Array.isArray(body.permissions)) {
        const updatedMap = new Map();
        for (const p of currentList) {
          if (p.email) updatedMap.set(p.email.toLowerCase().trim(), p);
        }
        for (const incoming of body.permissions) {
          if (!incoming.email) continue;
          const cleanEmail = incoming.email.toLowerCase().trim();
          const existing = updatedMap.get(cleanEmail);

          // If password is updated, hash it
          let securePassword = existing?.password;
          if (incoming.password !== undefined && String(incoming.password).trim() !== '') {
            const rawPwd = String(incoming.password).trim();
            securePassword = (rawPwd.startsWith('$2a$') || rawPwd.startsWith('$2b$'))
              ? rawPwd
              : bcrypt.hashSync(rawPwd, 10);
          }

          updatedMap.set(cleanEmail, {
            ...existing,
            ...incoming,
            password: securePassword,
            updatedAt: new Date().toISOString()
          });
        }
        currentList = Array.from(updatedMap.values());
        writeLocalPermissions(currentList);
        res.statusCode = 200;
        res.end(JSON.stringify({ status: 'success', count: currentList.length, data: currentList.map(sanitizeUser) }));
        return;
      }

      // ============================================================
      // Action: SAVE SINGLE PERMISSION
      // ============================================================
      const perm = body.permission || body;
      const cleanEmail = String(perm.email || '').toLowerCase().trim();
      if (!cleanEmail) {
        res.statusCode = 400;
        res.end(JSON.stringify({ status: 'error', message: 'Email is required' }));
        return;
      }

      const existingIdx = currentList.findIndex(p => (p.email || '').toLowerCase().trim() === cleanEmail);
      let securePassword = existingIdx >= 0 ? currentList[existingIdx].password : undefined;

      if (perm.password !== undefined && String(perm.password).trim() !== '') {
        const rawPwd = String(perm.password).trim();
        securePassword = (rawPwd.startsWith('$2a$') || rawPwd.startsWith('$2b$'))
          ? rawPwd
          : bcrypt.hashSync(rawPwd, 10);
      }

      const updatedUser = {
        ...(existingIdx >= 0 ? currentList[existingIdx] : {}),
        ...perm,
        email: cleanEmail,
        password: securePassword,
        updatedAt: new Date().toISOString()
      };

      if (existingIdx >= 0) {
        currentList[existingIdx] = updatedUser;
      } else {
        currentList.push(updatedUser);
      }

      writeLocalPermissions(currentList);
      res.statusCode = 200;
      res.end(JSON.stringify({ status: 'success', email: cleanEmail, data: currentList.map(sanitizeUser) }));
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
