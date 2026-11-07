import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/error.js';
import * as a from '../controllers/adminController.js';

const router = Router();
router.use(authenticate, authorize('researcher'));
router.get('/users', a.listUsers);
router.patch('/users/:id', validate(a.activeSchema), a.setActive);
router.post('/participants/:id/anonymize', validate(a.anonymizeSchema), a.anonymize);
router.delete('/participants/:id', validate(a.deleteSchema), a.deleteParticipantData);
router.get('/audit-logs', a.auditLogs);
router.get('/incomplete', a.incompleteSessions);

export default router;
