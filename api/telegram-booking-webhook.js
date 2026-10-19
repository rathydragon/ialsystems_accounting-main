import { webhookHandler } from '../backend/api/telegram-booking.js';

// Public on purpose: Telegram calls this directly; the handler checks the secret token header.
export default webhookHandler;
