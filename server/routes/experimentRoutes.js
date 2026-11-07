import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/error.js';
import * as e from '../controllers/experimentController.js';
import * as t from '../controllers/taskController.js';
import * as a from '../controllers/assignmentController.js';

export const experimentRouter = Router();
experimentRouter.use(authenticate, authorize('researcher'));
experimentRouter.post('/', validate(e.experimentSchema), e.createExperiment);
experimentRouter.get('/', e.listExperiments);
experimentRouter.get('/:id', e.getExperiment);
experimentRouter.put('/:id', validate(e.experimentSchema.partial()), e.updateExperiment);
experimentRouter.delete('/:id', e.deleteExperiment);
experimentRouter.get('/:id/tasks', e.listExperimentTasks);
experimentRouter.post('/:id/tasks/seed-defaults', e.seedDefaultTasks);

export const taskRouter = Router();
taskRouter.use(authenticate, authorize('researcher'));
taskRouter.post('/', validate(t.createTaskSchema), t.createTask);
taskRouter.get('/:id', t.getTask);
taskRouter.put('/:id', validate(t.updateTaskSchema), t.updateTask);
taskRouter.delete('/:id', t.deleteTask);

export const assignmentRouter = Router();
assignmentRouter.use(authenticate);
assignmentRouter.get('/mine', authorize('participant'), a.myAssignments);
assignmentRouter.post('/', authorize('researcher'), validate(a.createAssignmentsSchema), a.createAssignments);
assignmentRouter.get('/', authorize('researcher'), a.listAssignments);
assignmentRouter.put('/:id', authorize('researcher'), validate(a.updateAssignmentSchema), a.updateAssignment);
assignmentRouter.delete('/:id', authorize('researcher'), a.deleteAssignment);
