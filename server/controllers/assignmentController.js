import { z } from 'zod';
import { Experiment, ExperimentAssignment } from '../models/Experiment.js';
import Task from '../models/Task.js';
import { TaskResult, GazeRecord, EyeTrackingMetric } from '../models/TaskData.js';
import ScreenSnapshot from '../models/ScreenSnapshot.js';
import { SusResponse } from '../models/Sus.js';
import { ApiError, asId, asyncHandler } from '../utils/helpers.js';
import { audit } from '../utils/audit.js';
import { ownedExperiment } from './experimentController.js';

const id = z.string().regex(/^[a-f\d]{24}$/i);
const taskIds = z.array(id).max(200);

export const createAssignmentsSchema = z.object({
  experimentId: id,
  participantIds: z.array(id).min(1).max(500),
  taskIds: taskIds.optional(), // empty or omitted = every active task for the participant's own OS
});
export const updateAssignmentSchema = z.object({
  taskIds: taskIds.optional(),
  status: z.enum(['assigned', 'in_progress', 'completed', 'reopened']).optional(),
  reset: z.boolean().optional(), // erase this participant's results for the experiment so it can be redone
});

async function assertTasksBelong(experimentId, ids) {
  if (!ids?.length) return;
  const n = await Task.countDocuments({ _id: { $in: ids }, experimentId });
  if (n !== new Set(ids).size) throw new ApiError(400, 'Some tasks do not belong to this experiment');
}

export const createAssignments = asyncHandler(async (req, res) => {
  const { experimentId, participantIds, taskIds: tasks = [] } = req.body;
  const exp = await ownedExperiment(req, experimentId);
  await assertTasksBelong(experimentId, tasks);

  const existing = new Set(
    (await ExperimentAssignment.find({ experimentId, participantId: { $in: participantIds } })).map((a) => String(a.participantId))
  );
  const created = [];
  const skipped = [];
  for (const pid of participantIds) {
    if (existing.has(pid)) skipped.push({ participantId: pid, reason: 'already assigned' });
    // The working OS sequence is fixed to the participant's real OS at the OS check.
    else created.push({ experimentId, participantId: pid, assignedOSSequence: exp.operatingSystems, assignedTaskIds: tasks });
  }
  const docs = created.length ? await ExperimentAssignment.insertMany(created) : [];
  await audit(req, 'assignment.create', 'Experiment', experimentId, { created: docs.length, tasks: tasks.length });
  res.status(201).json({ success: true, data: docs, skipped });
});

export const listAssignments = asyncHandler(async (req, res) => {
  const exp = await ownedExperiment(req, asId(req.query.experimentId, 'experimentId'));
  const data = await ExperimentAssignment.find({ experimentId: exp._id })
    .populate('participantId', 'name email participantCode')
    .sort({ createdAt: -1 });
  res.json({ success: true, data });
});

export const myAssignments = asyncHandler(async (req, res) => {
  const data = await ExperimentAssignment.find({ participantId: req.user._id })
    .populate('experimentId', 'title description status eyeTrackingEnabled showResultsToParticipants')
    .sort({ createdAt: -1 });
  res.json({ success: true, data });
});

async function ownedAssignment(req) {
  const a = await ExperimentAssignment.findById(req.params.id);
  if (!a) throw new ApiError(404, 'Assignment not found');
  if (!(await Experiment.exists({ _id: a.experimentId, researcherId: req.user._id }))) throw new ApiError(404, 'Assignment not found');
  return a;
}

export const updateAssignment = asyncHandler(async (req, res) => {
  const a = await ownedAssignment(req);
  const { taskIds: tasks, status, reset } = req.body;
  if (reset) {
    const where = { experimentId: a.experimentId, participantId: a.participantId };
    await Promise.all([
      TaskResult.deleteMany(where), GazeRecord.deleteMany(where), EyeTrackingMetric.deleteMany(where),
      SusResponse.deleteMany(where), ScreenSnapshot.deleteMany(where),
    ]);
    // Consent stays valid; calibration must be redone for the new run.
    a.progress = { consent: a.progress.get('consent') || false };
    a.calibrationQuality = undefined;
    a.skippedTaskIds = [];
    a.startedAt = undefined;
    a.completedAt = undefined;
    a.status = 'assigned';
  }
  if (tasks) {
    if (a.status === 'in_progress') throw new ApiError(409, 'Cannot change the tasks of a running session');
    await assertTasksBelong(a.experimentId, tasks);
    a.assignedTaskIds = tasks;
  }
  if (status) {
    a.status = status;
    if (status === 'reopened') a.completedAt = undefined;
  }
  await a.save();
  await audit(req, 'assignment.update', 'ExperimentAssignment', a._id, req.body);
  res.json({ success: true, data: a });
});

export const deleteAssignment = asyncHandler(async (req, res) => {
  const a = await ownedAssignment(req);
  if (a.status !== 'assigned') throw new ApiError(409, 'Only unstarted assignments can be removed');
  await a.deleteOne();
  await audit(req, 'assignment.delete', 'ExperimentAssignment', a._id);
  res.json({ success: true });
});
