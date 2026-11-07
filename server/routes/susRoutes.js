import { Router } from 'express';
import { authenticate, authorize, selfOrResearcher } from '../middleware/auth.js';
import { validate } from '../middleware/error.js';
import * as s from '../controllers/susController.js';

const router = Router();
router.use(authenticate);
router.get('/statements', s.getStatements);
router.post('/submit', authorize('participant'), validate(s.submitSchema), s.submitSus);
router.get('/analysis/:experimentId', authorize('researcher'), s.susAnalysis);
router.get('/:participantId', selfOrResearcher('participantId'), s.getParticipantSus);

export default router;
