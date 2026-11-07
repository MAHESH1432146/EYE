import { Router } from 'express';
import { authenticate, authorize, selfOrResearcher } from '../middleware/auth.js';
import { validate } from '../middleware/error.js';
import * as c from '../controllers/participantController.js';
import * as admin from '../controllers/adminController.js';

const router = Router();
router.use(authenticate);

router.get('/', authorize('researcher'), c.listParticipants);
router.get('/:id', selfOrResearcher(), c.getParticipant);
router.put('/:id', selfOrResearcher(), validate(c.profileSchema), c.updateProfile);
router.get('/:id/progress', selfOrResearcher(), c.getProgress);
router.post('/:id/anonymize', selfOrResearcher(), validate(admin.anonymizeSchema), admin.anonymize);

export default router;
