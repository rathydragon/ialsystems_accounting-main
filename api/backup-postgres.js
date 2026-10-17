import handler from '../backend/api/backup-postgres.js';
import { withAuth } from '../backend/api/auth-middleware.js';

export default withAuth(handler, 'ADMIN', 'ACCOUNTANT');
