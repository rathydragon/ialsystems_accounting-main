import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import apiRoutes from './api/routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from backend/.env
dotenv.config({ path: path.resolve(__dirname, '.env') });

export function createApp() {
  const app = express();

  // 1. HTTP Security Headers with Helmet
  app.disable('x-powered-by');
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: process.env.ENABLE_CSP === 'true' ? {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://accounts.google.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", "data:", "blob:", "https:", "http:"],
        connectSrc: ["'self'", "https:", "wss:", "http:"],
        frameSrc: ["'self'", "https://accounts.google.com"],
        objectSrc: ["'none'"]
      }
    } : false
  }));

  // Trust proxy for reverse proxy and Vite dev proxy
  app.set('trust proxy', 1);

  // 2. Rate Limiting Middleware (Skipped in test environment, dev mode, and for localhost)
  if (process.env.NODE_ENV !== 'test') {
    const apiLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: process.env.RATE_LIMIT_MAX ? parseInt(process.env.RATE_LIMIT_MAX, 10) : 5000,
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => {
        // Skip rate limit in development or for exact localhost/loopback addresses
        if (process.env.NODE_ENV === 'development') return true;
        const ip = req.ip || req.connection?.remoteAddress || '';
        return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
      },
      message: { ok: false, message: 'Too many requests from this IP, please try again later.' }
    });
    const loginLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: process.env.LOGIN_RATE_LIMIT_MAX ? parseInt(process.env.LOGIN_RATE_LIMIT_MAX, 10) : 10,
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => {
        if (process.env.NODE_ENV === 'development') return true;
        const action = req.body?.action || req.query?.action;
        return action !== 'login' && action !== 'google_login';
      },
      message: { status: 'error', message: 'Too many login attempts. Please try again later.' }
    });
    app.use('/api/permissions', loginLimiter);
    app.use('/api/', apiLimiter);
  }

  // 3. Secure Whitelist-Only CORS Configuration
  const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
    : ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5173'];

  // Private LAN origins (192.168.x.x / 10.x.x.x) are trusted automatically outside
  // production only. In production, list them in CORS_ORIGIN or set CORS_ALLOW_LAN=true.
  const allowLanOrigins = process.env.CORS_ALLOW_LAN
    ? process.env.CORS_ALLOW_LAN === 'true'
    : process.env.NODE_ENV !== 'production';

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const isLocalNetwork = allowLanOrigins && origin && /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/.test(origin);
    const isAllowed = origin && (allowedOrigins.includes(origin) || allowedOrigins.includes('*') || isLocalNetwork);

    if (isAllowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    } else if (!origin) {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-target-url');

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      return res.end();
    }
    next();
  });

  // 4. Body parser with reasonable limits
  app.use(express.json({ limit: '20mb' }));
  app.use(express.urlencoded({ extended: true, limit: '20mb' }));

  // Mount all API routes under /api
  app.use('/api', apiRoutes);

  // Health check endpoint
  app.get('/', (_req, res) => {
    res.json({
      name: 'IAL Systems Accounting API',
      status: 'running',
      apiDocs: '/api/health'
    });
  });

  // 404 Fallback for unknown API routes
  app.use('/api/*', (_req, res) => {
    res.status(404).json({
      ok: false,
      message: 'API endpoint not found'
    });
  });

  // 5. Centralized Production Error Handling Middleware (Hides stack traces in production)
  app.use((err, _req, res, _next) => {
    const isProd = process.env.NODE_ENV === 'production';
    const statusCode = err.status || err.statusCode || 500;
    
    // Log server error internally
    console.error(`[Server Error ${statusCode}]:`, err.message || err);

    res.status(statusCode).json({
      ok: false,
      status: 'error',
      message: isProd ? 'Internal Server Error' : (err.message || 'An unexpected error occurred'),
      ...(isProd ? {} : { stack: err.stack })
    });
  });

  return app;
}

const app = createApp();
export default app;
