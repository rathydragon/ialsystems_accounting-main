import { bookingApiHandler } from '../backend/api/telegram-booking.js';
import { withAuth } from '../backend/api/auth-middleware.js';

export default withAuth(bookingApiHandler);
