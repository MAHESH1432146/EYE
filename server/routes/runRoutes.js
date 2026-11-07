import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/error.js';
import * as r from '../controllers/runController.js';

// Mounted before the researcher-only routers so these participant paths are matched first.
export const runExperimentRouter = Router();
runExperimentRouter.get('/:id/session', authenticate, authorize('participant'), r.getSession);
runExperimentRouter.post('/:id/consent', authenticate, authorize('participant'), validate(r.consentSchema), r.giveConsent);
runExperimentRouter.post('/:id/start', authenticate, authorize('participant'), r.startExperiment);
runExperimentRouter.post('/:id/os-check', authenticate, authorize('participant'), validate(r.osCheckSchema), r.checkOS);
runExperimentRouter.post('/:id/finish-tasks', authenticate, authorize('participant'), r.finishTasksEarly);
runExperimentRouter.post('/:id/resume-tasks', authenticate, authorize('participant'), r.resumeTasks);
runExperimentRouter.post('/:id/complete', authenticate, authorize('participant'), r.completeExperiment);

export const runTaskRouter = Router();
runTaskRouter.post('/:id/start', authenticate, authorize('participant'), r.startTask);
runTaskRouter.post('/:id/complete', authenticate, authorize('participant'), validate(r.completeTaskSchema), r.completeTask);
