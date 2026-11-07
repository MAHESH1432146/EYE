import { z } from 'zod';
import Task from '../models/Task.js';
import { ApiError, asyncHandler } from '../utils/helpers.js';
import { audit } from '../utils/audit.js';
import { ownedExperiment, refreshTaskCount } from './experimentController.js';

const unit = z.coerce.number().min(0).max(1);
const base = {
  instruction: z.string().trim().min(3).max(500),
  category: z.string().max(60).optional(),
  timeLimit: z.coerce.number().int().min(10).max(1800).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  active: z.boolean().optional(),
  targetApp: z.object({ match: z.array(z.string().trim().min(1).max(160)).max(10) }).optional(),
  targetRegion: z.object({ x: unit, y: unit, width: unit, height: unit })
    .refine((r) => r.x + r.width <= 1.0001 && r.y + r.height <= 1.0001, 'Region must lie inside the screen').nullable().optional(),
};
export const createTaskSchema = z.object({
  ...base,
  experimentId: z.string().regex(/^[a-f\d]{24}$/i),
  operatingSystem: z.enum(['windows', 'macos', 'linux']),
  taskNumber: z.coerce.number().int().min(1).max(100),
});
export const updateTaskSchema = z.object(base).partial();

async function ownedTask(req) {
  const task = await Task.findById(req.params.id);
  if (!task) throw new ApiError(404, 'Task not found');
  await ownedExperiment(req, task.experimentId);
  return task;
}

export const createTask = asyncHandler(async (req, res) => {
  await ownedExperiment(req, req.body.experimentId);
  const task = await Task.create(req.body);
  await refreshTaskCount(task.experimentId);
  await audit(req, 'task.create', 'Task', task._id);
  res.status(201).json({ success: true, data: task });
});

export const getTask = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await ownedTask(req) });
});

export const updateTask = asyncHandler(async (req, res) => {
  const task = await ownedTask(req);
  const { targetRegion, ...rest } = req.body;
  Object.assign(task, rest);
  if (targetRegion !== undefined) task.targetRegion = targetRegion ?? undefined; // null clears the region
  await task.save();
  await refreshTaskCount(task.experimentId);
  await audit(req, 'task.update', 'Task', task._id);
  res.json({ success: true, data: task });
});

export const deleteTask = asyncHandler(async (req, res) => {
  const task = await ownedTask(req);
  await task.deleteOne();
  await refreshTaskCount(task.experimentId);
  await audit(req, 'task.delete', 'Task', task._id);
  res.json({ success: true });
});
