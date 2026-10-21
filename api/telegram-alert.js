import handler from '../backend/api/telegram-proxy.js';
import { withAuth } from '../backend/api/auth-middleware.js';
import { dailySummaryCronHandler } from '../backend/api/daily-distribution-summary.js';

const protectedHandler = withAuth(handler);

// The daily distribution summary scheduler (vercel.json "crons") shares this function to stay
// within Vercel's serverless function limit. It is guarded by CRON_SECRET, not a user login.
export default function telegramAlert(req, res) {
  if (req.query?.cron === 'daily-summary') return dailySummaryCronHandler(req, res);
  return protectedHandler(req, res);
}
