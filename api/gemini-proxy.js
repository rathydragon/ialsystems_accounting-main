import handler from '../backend/api/gemini-proxy.js';
import { withAuth } from '../backend/api/auth-middleware.js';

export default withAuth(handler);
