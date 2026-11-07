import { z } from 'zod';
import { Experiment, ExperimentAssignment } from '../models/Experiment.js';
import Task from '../models/Task.js';
import { TaskResult } from '../models/TaskData.js';
import { ApiError, asyncHandler, parsePagination } from '../utils/helpers.js';
import { audit } from '../utils/audit.js';
import { DEFAULT_TASKS, APP_TARGETS } from '../services/defaultTasks.js';

const OS = z.enum(['windows', 'macos', 'linux']);

export const experimentSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().max(5000).optional(),
  operatingSystems: z.array(OS).min(1).optional(),
  status: z.enum(['draft', 'active', 'in_progress', 'completed', 'archived']).optional(),
  durationMinutes: z.coerce.number().int().min(1).max(600).optional(),
  eyeTrackingEnabled: z.boolean().optional(),
  showResultsToParticipants: z.boolean().optional(),
});

export async function refreshTaskCount(experimentId) {
  const n = await Task.countDocuments({ experimentId, active: true });
  await Experiment.updateOne({ _id: experimentId }, { taskCount: n });
}

// Researchers only see and edit their own experiments.
export async function ownedExperiment(req, id = req.params.id) {
  const exp = await Experiment.findOne({ _id: id, researcherId: req.user._id });
  if (!exp) throw new ApiError(404, 'Experiment not found');
  return exp;
}

export const createExperiment = asyncHandler(async (req, res) => {
  const exp = await Experiment.create({ ...req.body, researcherId: req.user._id });
  await audit(req, 'experiment.create', 'Experiment', exp._id);
  res.status(201).json({ success: true, data: exp });
});

export const listExperiments = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = { researcherId: req.user._id };
  if (req.query.status) filter.status = String(req.query.status);
  const [data, total] = await Promise.all([
    Experiment.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Experiment.countDocuments(filter),
  ]);
  const counts = await ExperimentAssignment.aggregate([
    { $match: { experimentId: { $in: data.map((e) => e._id) } } },
    { $group: { _id: '$experimentId', n: { $sum: 1 } } },
  ]);
  const byId = new Map(counts.map((c) => [String(c._id), c.n]));
  res.json({
    success: true,
    data: data.map((e) => ({ ...e, participantCount: byId.get(String(e._id)) || 0 })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

export const getExperiment = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await ownedExperiment(req) });
});

export const updateExperiment = asyncHandler(async (req, res) => {
  const exp = await ownedExperiment(req);
  Object.assign(exp, req.body);
  await exp.save();
  await audit(req, 'experiment.update', 'Experiment', exp._id);
  res.json({ success: true, data: exp });
});

// Experiments that already hold results are archived instead of deleted (data retention).
export const deleteExperiment = asyncHandler(async (req, res) => {
  const exp = await ownedExperiment(req);
  if (await TaskResult.exists({ experimentId: exp._id })) {
    exp.status = 'archived';
    await exp.save();
    await audit(req, 'experiment.archive', 'Experiment', exp._id);
    return res.json({ success: true, archived: true, data: exp });
  }
  await Promise.all([
    Task.deleteMany({ experimentId: exp._id }),
    ExperimentAssignment.deleteMany({ experimentId: exp._id }),
    exp.deleteOne(),
  ]);
  await audit(req, 'experiment.delete', 'Experiment', exp._id);
  res.json({ success: true, deleted: true });
});

export const listExperimentTasks = asyncHandler(async (req, res) => {
  const exp = await ownedExperiment(req);
  const filter = { experimentId: exp._id };
  if (req.query.operatingSystem) filter.operatingSystem = String(req.query.operatingSystem);
  const data = await Task.find(filter).sort({ operatingSystem: 1, taskNumber: 1 });
  res.json({ success: true, data });
});

// Creates the 16-task bank for every selected OS; skips tasks that already exist.
export const seedDefaultTasks = asyncHandler(async (req, res) => {
  const exp = await ownedExperiment(req);
  const docs = exp.operatingSystems.flatMap((operatingSystem) =>
    DEFAULT_TASKS.map(({ app, ...t }) => ({ ...t, experimentId: exp._id, operatingSystem, timeLimit: 120, targetApp: { match: app ? APP_TARGETS[app][operatingSystem] : [] } }))
  );
  const result = await Task.bulkWrite(
    docs.map((d) => ({
      updateOne: {
        filter: { experimentId: d.experimentId, operatingSystem: d.operatingSystem, taskNumber: d.taskNumber },
        update: { $setOnInsert: d },
        upsert: true,
      },
    }))
  );
  await refreshTaskCount(exp._id);
  await audit(req, 'task.seed', 'Experiment', exp._id, { created: result.upsertedCount });
  res.status(201).json({ success: true, created: result.upsertedCount });
});
