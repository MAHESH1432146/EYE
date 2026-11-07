import { Router } from 'express';
import { authenticate, authorize, selfOrResearcher } from '../middleware/auth.js';
import { validate } from '../middleware/error.js';
import * as g from '../controllers/gazeController.js';
import * as a from '../controllers/gazeAnalysisController.js';

const router = Router();
router.use(authenticate);
router.post('/calibration', authorize('participant'), validate(g.calibrationSchema), g.saveCalibration);
router.post('/recordings', authorize('participant'), validate(g.recordingSchema), g.createRecording);
router.post('/samples/batch', authorize('participant'), validate(g.batchSchema), g.appendSamples);
router.get('/result/:taskId', authorize('participant'), g.getMyResult);
router.post('/snapshot', authorize('participant'), validate(g.snapshotSchema), g.saveSnapshot);
router.get('/snapshot/:taskId', g.getSnapshot);
router.get('/recordings', authorize('researcher'), a.listRecordings);
router.get('/live/active', authorize('researcher'), a.liveActive);
router.get('/live/:taskId', authorize('researcher'), a.liveTask);
router.get('/heatmap/:taskId', authorize('researcher'), a.getHeatmap);
router.get('/scanpath/:taskId', authorize('researcher'), a.getScanPath);
router.get('/:participantId/:taskId', selfOrResearcher('participantId'), g.getGaze);

export default router;
