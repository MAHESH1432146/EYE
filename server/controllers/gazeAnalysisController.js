import mongoose from 'mongoose';
import { Experiment } from '../models/Experiment.js';
import User from '../models/User.js';
import Task from '../models/Task.js';
import { GazeRecord, EyeTrackingMetric, TaskResult } from '../models/TaskData.js';
import { computeMetrics } from '../services/eyeTracking/metrics.js';
import { ApiError, asId, asyncHandler } from '../utils/helpers.js';
import { detectFixations, FIXATION_PARAMS } from '../services/eyeTracking/fixations.js';
import { buildHeatmap } from '../services/eyeTracking/heatmap.js';

// Researchers may only read gaze data of experiments they own.
async function ownedTask(req, taskId) {
  const task = await Task.findById(taskId);
  if (!task) throw new ApiError(404, 'Task not found');
  if (!(await Experiment.exists({ _id: task.experimentId, researcherId: req.user._id }))) throw new ApiError(404, 'Task not found');
  return task;
}

export const listRecordings = asyncHandler(async (req, res) => {
  const { operatingSystem } = req.query;
  const experimentId = asId(req.query.experimentId, 'experimentId');
  if (!(await Experiment.exists({ _id: experimentId, researcherId: req.user._id }))) throw new ApiError(404, 'Experiment not found');

  const filter = { experimentId };
  if (operatingSystem) filter.operatingSystem = String(operatingSystem);
  const recs = await GazeRecord.aggregate([
    { $match: { experimentId: new mongoose.Types.ObjectId(experimentId), ...(operatingSystem && { operatingSystem: String(operatingSystem) }) } },
    { $project: { participantId: 1, taskId: 1, operatingSystem: 1, recordingStatus: 1, calibrationQuality: 1, sampleCount: { $size: '$gazeSamples' } } },
    { $limit: 5000 },
  ]);
  const [users, tasks, metrics, results] = await Promise.all([
    User.find({ _id: { $in: recs.map((r) => r.participantId) } }).select('name participantCode'),
    Task.find({ _id: { $in: recs.map((r) => r.taskId) } }).select('taskNumber instruction'),
    EyeTrackingMetric.find(filter),
    TaskResult.find({ experimentId }).select('participantId taskId verification isCorrect'),
  ]);
  const U = new Map(users.map((u) => [String(u._id), u]));
  const T = new Map(tasks.map((t) => [String(t._id), t]));
  const M = new Map(metrics.map((m) => [`${m.participantId}:${m.taskId}`, m]));
  const R = new Map(results.map((x) => [`${x.participantId}:${x.taskId}`, x]));

  res.json({
    success: true,
    data: recs.map((r) => ({
      ...r,
      participant: U.get(String(r.participantId)),
      task: T.get(String(r.taskId)),
      metrics: M.get(`${r.participantId}:${r.taskId}`) || null,
      verification: R.get(`${r.participantId}:${r.taskId}`)?.verification?.status || null,
      selfReported: R.get(`${r.participantId}:${r.taskId}`)?.isCorrect ?? null,
    })),
  });
});

// Same task = same screenshot, so samples from different participants can be pooled.
export const getHeatmap = asyncHandler(async (req, res) => {
  const task = await ownedTask(req, req.params.taskId);
  const filter = { taskId: task._id };
  if (req.query.participantId) filter.participantId = asId(req.query.participantId, 'participantId');
  const recs = await GazeRecord.find(filter).select('gazeSamples');
  const points = recs.flatMap((r) => r.gazeSamples);
  res.json({
    success: true,
    data: {
      heatmap: buildHeatmap(points),
      recordings: recs.length,
      task: { _id: task._id, operatingSystem: task.operatingSystem, taskNumber: task.taskNumber, instruction: task.instruction },
    },
  });
});

export const getScanPath = asyncHandler(async (req, res) => {
  const task = await ownedTask(req, req.params.taskId);
  const participantId = asId(req.query.participantId, 'participantId');
  const rec = await GazeRecord.findOne({ taskId: task._id, participantId });
  if (!rec) throw new ApiError(404, 'No gaze recording');
  const metrics = await EyeTrackingMetric.findOne({ taskId: task._id, participantId });
  res.json({
    success: true,
    data: {
      fixations: detectFixations(rec.gazeSamples).map((f, i) => ({ order: i + 1, ...f })),
      fixationParams: FIXATION_PARAMS,
      metrics,
      task: { _id: task._id, operatingSystem: task.operatingSystem, taskNumber: task.taskNumber, instruction: task.instruction },
    },
  });
});

// Tasks currently being performed (started, not finished) in the researcher's experiments.
export const liveActive = asyncHandler(async (req, res) => {
  const experimentId = asId(req.query.experimentId, 'experimentId');
  if (!(await Experiment.exists({ _id: experimentId, researcherId: req.user._id }))) throw new ApiError(404, 'Experiment not found');
  const running = await TaskResult.find({ experimentId, completedAt: null, startedAt: { $gt: new Date(Date.now() - 10 * 60 * 1000) } }).lean();
  const [users, tasks] = await Promise.all([
    User.find({ _id: { $in: running.map((r) => r.participantId) } }).select('name participantCode'),
    Task.find({ _id: { $in: running.map((r) => r.taskId) } }).select('taskNumber instruction'),
  ]);
  const U = new Map(users.map((u) => [String(u._id), u]));
  const T = new Map(tasks.map((t) => [String(t._id), t]));
  res.json({
    success: true,
    data: running.map((r) => ({ participantId: r.participantId, participant: U.get(String(r.participantId)), taskId: r.taskId, task: T.get(String(r.taskId)), operatingSystem: r.operatingSystem, startedAt: r.startedAt })),
  });
});

// Metrics are recomputed from the samples received so far, so they update while the task runs.
export const liveTask = asyncHandler(async (req, res) => {
  const task = await ownedTask(req, req.params.taskId);
  const participantId = asId(req.query.participantId, 'participantId');
  const [result, rec] = await Promise.all([
    TaskResult.findOne({ taskId: task._id, participantId }),
    GazeRecord.findOne({ taskId: task._id, participantId }),
  ]);
  const samples = rec?.gazeSamples || [];
  res.json({
    success: true,
    data: {
      running: !!result && !result.completedAt, finished: !!result?.completedAt, isCorrect: result?.isCorrect ?? null,
      samples: samples.length, elapsedMs: samples.length ? samples[samples.length - 1].t : 0,
      metrics: computeMetrics(samples, null, rec?.calibrationQuality, { blinks: rec?.blinks, faceLostMs: rec?.faceLostMs }),
      fixations: detectFixations(samples).length,
      heatmap: buildHeatmap(samples),
      task: { _id: task._id, operatingSystem: task.operatingSystem, taskNumber: task.taskNumber, instruction: task.instruction },
    },
  });
});
