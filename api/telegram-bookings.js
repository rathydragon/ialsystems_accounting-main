import { bookingApiHandler, webhookHandler } from '../backend/api/telegram-booking.js';
import { withAuth } from '../backend/api/auth-middleware.js';

const protectedHandler = withAuth(bookingApiHandler);

// One function serves both routes to stay within Vercel's serverless function limit.
// /api/telegram-booking-webhook is rewritten here with ?hook=1 (see vercel.json); it is public on
// purpose because Telegram calls it directly, and the handler checks the secret token header.
export default function handler(req, res) {
  if (req.query?.hook === '1') return webhookHandler(req, res);
  return protectedHandler(req, res);
}
