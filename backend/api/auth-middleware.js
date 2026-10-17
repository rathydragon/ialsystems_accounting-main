import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const FALLBACK_TEST_SECRET = 'test_jwt_secret_64_characters_long_for_isolated_unit_testing_key!';
const MIN_SECRET_LENGTH = 32;

let ephemeralDevSecret = null;

/**
 * Retrieve securely configured JWT secret.
 * - Uses process.env.JWT_SECRET when set (min 32 chars).
 * - In test environment, falls back to a fixed test secret.
 * - In local development (NODE_ENV=development, not on Vercel), falls back to a
 *   random per-process secret so tokens can never be forged from source code.
 * - Everywhere else (production / Vercel), throws: a missing secret must fail closed.
 */
export function getJwtSecret() {
  const secret = (process.env.JWT_SECRET || '').trim();
  if (secret && !secret.includes('generate_a_secure_random')) {
    if (secret.length < MIN_SECRET_LENGTH && process.env.NODE_ENV !== 'test') {
      throw new Error(`JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters long`);
    }
    return secret;
  }
  if (process.env.NODE_ENV === 'test') {
    return FALLBACK_TEST_SECRET;
  }
  if (process.env.NODE_ENV === 'development' && !process.env.VERCEL) {
    if (!ephemeralDevSecret) {
      ephemeralDevSecret = crypto.randomBytes(48).toString('hex');
      console.warn('[auth] JWT_SECRET is not set. Using a random development secret; sessions reset on every restart.');
    }
    return ephemeralDevSecret;
  }
  throw new Error('JWT_SECRET is not configured. Set a random secret of at least 32 characters in the environment.');
}

/**
 * Extract Bearer token from Express request or Serverless request
 */
export function extractToken(req) {
  const authHeader = req.headers?.authorization || req.headers?.Authorization;
  if (authHeader && typeof authHeader === 'string') {
    const parts = authHeader.trim().split(' ');
    if (parts.length === 2 && /^Bearer$/i.test(parts[0])) {
      return parts[1];
    }
  }
  // Optional query token fallback for specific export/download requests if provided
  if (req.query?.token && typeof req.query.token === 'string') {
    return req.query.token;
  }
  return null;
}

/**
 * Direct request authentication helper for serverless handlers and middleware
 * Returns decoded user payload or sends 401/403 and returns null
 */
export function authenticateRequest(req, res) {
  const token = extractToken(req);
  if (!token) {
    res.statusCode = 401;
    res.setHeader?.('Content-Type', 'application/json');
    res.end(JSON.stringify({
      ok: false,
      status: 'error',
      message: 'Unauthorized: Access token is missing or invalid'
    }));
    return null;
  }

  try {
    const secret = getJwtSecret();
    const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });

    if (decoded.status === 'SUSPENDED') {
      res.statusCode = 403;
      res.setHeader?.('Content-Type', 'application/json');
      res.end(JSON.stringify({
        ok: false,
        status: 'error',
        message: 'Forbidden: Account is suspended'
      }));
      return null;
    }

    req.user = decoded;
    return decoded;
  } catch (err) {
    res.statusCode = 401;
    res.setHeader?.('Content-Type', 'application/json');
    res.end(JSON.stringify({
      ok: false,
      status: 'error',
      message: 'Unauthorized: Token is invalid or expired'
    }));
    return null;
  }
}

/**
 * Express Middleware: Verify JWT Authentication
 */
export function verifyAuth(req, res, next) {
  const user = authenticateRequest(req, res);
  if (user) {
    next();
  }
}

/**
 * Express Middleware: Require specific role(s)
 * Master Admins automatically bypass role requirements.
 */
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      const user = authenticateRequest(req, res);
      if (!user) return;
    }

    const userRole = (req.user?.role || 'USER').toUpperCase();
    const normalizedRoles = allowedRoles.map(r => r.toUpperCase());

    if (userRole === 'ADMIN' || normalizedRoles.includes(userRole)) {
      return next();
    }

    res.statusCode = 403;
    res.setHeader?.('Content-Type', 'application/json');
    res.end(JSON.stringify({
      ok: false,
      status: 'error',
      message: 'Forbidden: Insufficient privileges for this action'
    }));
  };
}

/**
 * Serverless wrapper: authenticate (and optionally require role(s)) before
 * delegating to a handler. Used by Vercel functions in /api, which bypass the
 * Express router's verifyAuth/requireRole middleware.
 * CORS preflight (OPTIONS) is passed through unauthenticated.
 */
export function withAuth(handler, ...allowedRoles) {
  return async (req, res) => {
    if (req.method === 'OPTIONS') return handler(req, res);
    if (!req.user && !authenticateRequest(req, res)) return;
    if (allowedRoles.length === 0) return handler(req, res);

    let allowed = false;
    requireRole(...allowedRoles)(req, res, () => { allowed = true; });
    if (allowed) return handler(req, res);
  };
}

/**
 * Express Middleware: Optional Authentication (attaches req.user if token is present)
 */
export function optionalAuth(req, _res, next) {
  const token = extractToken(req);
  if (token) {
    try {
      const secret = getJwtSecret();
      const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
      if (decoded && decoded.status !== 'SUSPENDED') {
        req.user = decoded;
      }
    } catch {}
  }
  next();
}
