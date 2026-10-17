import { getJwtSecret } from '../backend/api/auth-middleware.js';

function isJwtSecretConfigured() {
  try {
    return Boolean(getJwtSecret());
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Configuration flags only (booleans), never the secret values themselves
  return res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'ialsystems-accounting-vercel-api',
    config: {
      jwtSecret: isJwtSecretConfigured(),
      telegramBotToken: Boolean(String(process.env.TELEGRAM_BOT_TOKEN || '').trim()),
      geminiApiKey: Boolean(String(process.env.GEMINI_API_KEY || '').trim())
    }
  });
}
