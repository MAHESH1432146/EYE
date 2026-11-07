import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import * as r from '../controllers/reportController.js';

const router = Router();
router.use(authenticate);
router.get('/participant/:participantId', r.participantReport); // researchers; participants only for JSON when enabled
router.get('/experiment/:experimentId', authorize('researcher'), r.experimentReport);
router.get('/export/csv', authorize('researcher'), r.exportCsv);
router.get('/export/pdf', authorize('researcher'), r.exportPdf);

export default router;
