import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import * as c from '../controllers/analyticsController.js';

const router = Router();
router.use(authenticate, authorize('researcher'));
router.get('/overview', c.getOverview);
router.get('/os-comparison', c.getOSComparison);
router.get('/task-performance', c.getTaskPerformance);
router.get('/eye-tracking', c.getEyeTracking);
router.get('/participant-groups', c.getParticipantGroups);
router.get('/statistics', c.getStatistics);
router.get('/recommendations', c.getRecommendations);
router.get('/task-report', c.getTaskReport);

export default router;
