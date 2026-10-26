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

// In-Memory Brute Force Login Protection (Tracks failed attempts per IP and email)
const loginAttempts = new Map();
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export function getClientIp(req) {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (forwarded && typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || '127.0.0.1';
}

export function checkLoginRateLimit(key) {
  const now = Date.now();
  const record = loginAttempts.get(key);
  if (!record) return { allowed: true };

  if (record.lockedUntil && now < record.lockedUntil) {
    const remainingSec = Math.ceil((record.lockedUntil - now) / 1000);
    return {
      allowed: false,
      remainingSec,
      message: `Too many failed login attempts. Account temporarily locked for ${remainingSec} seconds.`
    };
  }

  if (record.lockedUntil && now >= record.lockedUntil) {
    loginAttempts.delete(key);
    return { allowed: true };
  }

  if (now - record.firstAttempt > LOCKOUT_DURATION_MS) {
    loginAttempts.delete(key);
    return { allowed: true };
  }

  return { allowed: true };
}

export function recordFailedLogin(key) {
  const now = Date.now();
  const record = loginAttempts.get(key) || { count: 0, firstAttempt: now, lockedUntil: 0 };
  record.count += 1;

  if (record.count >= MAX_FAILED_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_DURATION_MS;
  }
  loginAttempts.set(key, record);
}

export function recordSuccessfulLogin(key) {
  loginAttempts.delete(key);
}

export function resetLoginAttemptsForTesting() {
  loginAttempts.clear();
}

const DEFAULT_GOOGLE_CLIENT_ID = '594375780266-3pu9am9mgelmd08f0fkc06n3m2gho1bn.apps.googleusercontent.com';
const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

function getAllowedGoogleClientIds() {
  return [process.env.GOOGLE_CLIENT_ID, process.env.VITE_GOOGLE_CLIENT_ID, DEFAULT_GOOGLE_CLIENT_ID]
    .map(id => String(id || '').trim())
    .filter(Boolean);
}

/**
 * Load the permission list: local file first (Express server), then the Google Sheets
 * Web App (Vercel, where the local file does not exist). Always includes the Master Admin.
 */
async function loadPermissionList() {
  let list = readLocalPermissions();

  if (!list || list.length === 0) {
    try {
      const webAppUrl = process.env.VITE_GOOGLE_WEBAPP_URL || 'https://script.google.com/macros/s/AKfycbxWDKd5u7G82MttghlrfJrfxcEjQ73CyEJzN9zlZiRv_gekhAoxK7JMjo-0yj-Y7XY4SA/exec';
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
  return list;
}

function issueSessionToken(user) {
  return jwt.sign(
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
}

/**
 * Verify a Google Sign-In ID token (credential) with Google and return its claims,
 * or null when it is invalid, expired, unverified, or issued for another client.
 */
export async function verifyGoogleCredential(credential) {
  if (!credential || typeof credential !== 'string') return null;
  try {
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const claims = await res.json();
    const emailVerified = claims.email_verified === true || claims.email_verified === 'true';
    if (!GOOGLE_ISSUERS.includes(claims.iss)) return null;
    if (!getAllowedGoogleClientIds().includes(claims.aud)) return null;
    if (!claims.email || !emailVerified) return null;
    if (Number(claims.exp) * 1000 < Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
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
      const list = await loadPermissionList();

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
        const ip = getClientIp(req);
        const rateKey = `${ip}_${email}`;

        const rateCheck = checkLoginRateLimit(rateKey);
        if (!rateCheck.allowed) {
          res.statusCode = 429;
          res.setHeader('Retry-After', String(rateCheck.remainingSec));
          res.end(JSON.stringify({
            status: 'error',
            message: rateCheck.message,
            retryAfter: rateCheck.remainingSec
          }));
          return;
        }

        if (!email || !inputPassword) {
          recordFailedLogin(rateKey);
          res.statusCode = 400;
          res.end(JSON.stringify({ status: 'error', message: 'សូមបញ្ចូល Email និង Password ឱ្យបានត្រឹមត្រូវ!' }));
          return;
        }

        const user = currentList.find(p => (p.email || '').toLowerCase().trim() === email);
        if (!user) {
          recordFailedLogin(rateKey);
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
          recordFailedLogin(rateKey);
          res.statusCode = 401;
          res.end(JSON.stringify({ status: 'error', message: 'អ៊ីមែល ឬពាក្យសម្ងាត់មិនត្រឹមត្រូវទេ!' }));
          return;
        }

        // Login successful: reset rate limit attempts
        recordSuccessfulLogin(rateKey);

        // Generate Signed JWT Token with Pinned Algorithm
        const token = issueSessionToken(user);

        res.statusCode = 200;
        res.end(JSON.stringify({
          status: 'success',
          token,
          user: sanitizeUser(user),
          message: 'ចូលប្រើប្រាស់ជោគជ័យ'
        }));
        return;
      }

      // ============================================================
      // Action: GOOGLE_LOGIN (verify Google ID token server-side, then issue JWT)
      // ============================================================
      if (action === 'google_login') {
        const ip = getClientIp(req);
        const rateKey = `${ip}_google`;
        const rateCheck = checkLoginRateLimit(rateKey);
        if (!rateCheck.allowed) {
          res.statusCode = 429;
          res.setHeader('Retry-After', String(rateCheck.remainingSec));
          res.end(JSON.stringify({ status: 'error', message: rateCheck.message, retryAfter: rateCheck.remainingSec }));
          return;
        }

        const claims = await verifyGoogleCredential(body.credential);
        if (!claims) {
          recordFailedLogin(rateKey);
          res.statusCode = 401;
          res.end(JSON.stringify({ status: 'error', message: 'Google Sign-In មិនត្រឹមត្រូវ ឬផុតកំណត់ សូមព្យាយាមម្តងទៀត!' }));
          return;
        }

        const email = String(claims.email).toLowerCase().trim();
        const list = await loadPermissionList();
        const user = list.find(p => (p.email || '').toLowerCase().trim() === email);
        if (!user) {
          res.statusCode = 403;
          res.end(JSON.stringify({ status: 'error', message: `⚠️ គណនី «${email}» មិនទាន់ត្រូវបាន Admin បន្ថែមក្នុងប្រព័ន្ធកំណត់សិទ្ធិឡើយ! សូមទាក់ទង Admin ជាមុនសិន។` }));
          return;
        }
        if (user.status === 'SUSPENDED') {
          res.statusCode = 403;
          res.end(JSON.stringify({ status: 'error', message: 'គណនីរបស់អ្នកត្រូវបានផ្អាកការប្រើប្រាស់ (Account Suspended)!' }));
          return;
        }

        recordSuccessfulLogin(rateKey);
        res.statusCode = 200;
        res.end(JSON.stringify({
          status: 'success',
          token: issueSessionToken(user),
          user: { ...sanitizeUser(user), picture: claims.picture || '' },
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

          // Bulk sync never changes an existing user's password: browsers keep old or default
          // ('123456') values in their cached list and re-sent them on every sync, resetting
          // passwords. Passwords change only through the single "save" action.
          let securePassword = existing?.password;
          if (!existing?.password && incoming.password !== undefined && String(incoming.password).trim() !== '') {
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
