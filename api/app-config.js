import handler from '../backend/api/app-config.js';
import { withAuth } from '../backend/api/auth-middleware.js';

export default withAuth(handler);
