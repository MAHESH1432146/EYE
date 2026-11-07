import { z } from 'zod';
import { ExperimentAssignment } from '../models/Experiment.js';
import Task from '../models/Task.js';
import { TaskResult, GazeRecord, EyeTrackingMetric } from '../models/TaskData.js';
import ScreenSnapshot from '../models/ScreenSnapshot.js';
import { ConsentRecord } from '../models/Sus.js';
import { Experiment } from '../models/Experiment.js';
import { ApiError, asId, asyncHandler } from '../utils/helpers.js';
import { computeMetrics } from '../services/eyeTracking/metrics.js';
import { makeTargetTest, verifyTask } from '../services/eyeTracking/targets.js';
import { detectFixations } from '../services/eyeTracking/fixations.js';
import { buildHeatmap } from '../services/eyeTracking/heatmap.js';
import { loadAssignment } from './runController.js';

const id = z.string().regex(/^[a-f\d]{24}$/i);
const MAX_BATCH = 500;
const MAX_SAMPLES = 30000;

const MAX_APP_EVENTS = 3000;
const MAX_INTERRUPTIONS = 500;
const display = z.object({ id: z.number().int(), x: z.number(), y: z.number(), width: z.number().min(100).max(20000), height: z.number().min(100).max(20000), scaleFactor: z.number().min(0.5).max(8) });

export const calibrationSchema = z.object({ experimentId: id, quality: z.number().min(0).max(1) });
export const recordingSchema = z.object({
  taskId: id,
  samplingRateHz: z.number().min(0).max(240).optional(),
  withGaze: z.boolean().optional(), // false/omitted: desktop events only (no camera), so calibration is not required
  display: display.optional(),
  environment: z.object({ source: z.enum(['browser', 'desktop', 'agent']), platform: z.string().max(40).optional(), appVersion: z.string().max(40).optional() }).optional(),
});
export const batchSchema = z.object({
  taskId: id,
  samples: z
    .array(z.object({ t: z.number().min(0).max(3_600_000), x: z.number().min(-2).max(3), y: z.number().min(-2).max(3), c: z.number().min(0).max(1).optional() }))
    .min(0)
    .max(MAX_BATCH),
  blinks: z.array(z.object({ t: z.number().min(0).max(3_600_000), d: z.number().min(0).max(5000) })).max(100).optional(),
  faceLostMs: z.number().min(0).max(3_600_000).optional(), // cumulative, so the largest value wins
  appEvents: z.array(z.object({
    t: z.number().min(0).max(3_600_000), app: z.string().max(200).optional(), title: z.string().max(300).optional(), path: z.string().max(400).optional(),
    b: z.array(z.number()).length(4).optional(),
  })).max(200).optional(),
  interruptions: z.array(z.object({ t: z.number().min(0).max(3_600_000), d: z.number().min(0).max(3_600_000), reason: z.enum(['face_lost', 'window_hidden', 'display_changed', 'camera_error', 'system_suspend', 'tracking_paused']) })).max(50).optional(),
});

async function openTaskResult(req, taskId) {
  const result = await TaskResult.findOne({ participantId: req.user._id, taskId });
  if (!result) throw new ApiError(409, 'Task was not started');
  if (result.completedAt) throw new ApiError(409, 'Task already completed');
  return result;
}

export const saveCalibration = asyncHandler(async (req, res) => {
  const { assignment } = await loadAssignment(req, req.body.experimentId);
  assignment.progress.set('calibration', true);
  assignment.calibrationQuality = req.body.quality;
  await assignment.save();
  res.json({ success: true });
});

export const createRecording = asyncHandler(async (req, res) => {
  const result = await openTaskResult(req, req.body.taskId);
  const assignment = await ExperimentAssignment.findOne({ experimentId: result.experimentId, participantId: req.user._id });
  if (req.body.withGaze && !assignment?.progress.get('calibration')) throw new ApiError(409, 'Calibration is required before recording');
  const rec = await GazeRecord.findOneAndUpdate(
    { participantId: req.user._id, taskId: result.taskId },
    {
      $setOnInsert: {
        experimentId: result.experimentId, operatingSystem: result.operatingSystem, gazeSamples: [],
        calibrationQuality: assignment.calibrationQuality, recordingStatus: 'recording',
      },
      ...(req.body.samplingRateHz && { samplingRateHz: req.body.samplingRateHz }),
      ...(req.body.display && { display: req.body.display }),
      ...(req.body.environment && { environment: req.body.environment }),
    },
    { upsert: true, new: true }
  );
  res.status(201).json({ success: true, data: { _id: rec._id } });
});

export const appendSamples = asyncHandler(async (req, res) => {
  const result = await openTaskResult(req, req.body.taskId);
  // Atomic bounded push: the filter refuses once the cap would be exceeded.
  const { samples, blinks = [], faceLostMs, appEvents = [], interruptions = [] } = req.body;
  const update = {};
  const push = {};
  if (samples.length) push.gazeSamples = { $each: samples };
  if (blinks.length) push.blinks = { $each: blinks };
  if (appEvents.length) push.appEvents = { $each: appEvents };
  if (interruptions.length) push.interruptions = { $each: interruptions };
  if (Object.keys(push).length) update.$push = push;
  if (faceLostMs !== undefined) update.$max = { faceLostMs };
  if (!Object.keys(update).length) return res.status(201).json({ success: true, accepted: 0 });
  const upd = await GazeRecord.updateOne(
    {
      participantId: req.user._id, taskId: result.taskId, recordingStatus: 'recording',
      [`gazeSamples.${MAX_SAMPLES - samples.length}`]: { $exists: false },
      [`appEvents.${MAX_APP_EVENTS - appEvents.length}`]: { $exists: false },
      [`interruptions.${MAX_INTERRUPTIONS - interruptions.length}`]: { $exists: false },
    },
    update
  );
  if (!upd.matchedCount) throw new ApiError(409, 'Recording not open or sample limit reached');
  res.status(201).json({ success: true, accepted: samples.length });
});

// Called when a task finishes: closes the recording and stores derived metrics.
export async function finalizeGaze(task, participantId) {
  const rec = await GazeRecord.findOne({ participantId, taskId: task._id });
  if (!rec) return null;
  const target = makeTargetTest(task, rec);
  const m = computeMetrics(rec.gazeSamples, null, rec.calibrationQuality, { blinks: rec.blinks, faceLostMs: rec.faceLostMs, interruptions: rec.interruptions, target });
  rec.recordingStatus = m.dataQuality === 'unavailable' ? 'insufficient' : 'complete';
  await rec.save();
  // Verification comes from the recorded active-window timeline, never from the participant's own report.
  await TaskResult.updateOne({ participantId, taskId: task._id }, { verification: verifyTask(task, rec.appEvents) });
  return EyeTrackingMetric.findOneAndUpdate(
    { participantId, taskId: task._id },
    { ...m, experimentId: task.experimentId, operatingSystem: task.operatingSystem },
    { upsert: true, new: true }
  );
}

// Participant's own post-task summary.
export const getMyResult = asyncHandler(async (req, res) => {
  const taskId = req.params.taskId;
  const result = await TaskResult.findOne({ participantId: req.user._id, taskId });
  if (!result?.completedAt) throw new ApiError(409, 'Task is not finished');
  const [task, rec, m, snap] = await Promise.all([
    Task.findById(taskId).select('instruction taskNumber operatingSystem'),
    GazeRecord.findOne({ participantId: req.user._id, taskId }),
    EyeTrackingMetric.findOne({ participantId: req.user._id, taskId }),
    ScreenSnapshot.exists({ participantId: req.user._id, taskId }),
  ]);
  const samples = rec?.gazeSamples || [];
  const step = Math.max(1, Math.ceil(samples.length / 100));
  const pick = ['totalFixations', 'totalDwell', 'avgFixationDuration', 'blinkCount', 'blinkRate', 'trackedMs', 'faceLostMs', 'regions', 'dataQuality', 'ttff', 'revisitCount', 'fixationCount', 'dwellTime', 'totalRevisits', 'interruptedMs', 'targetKind'];
  res.json({
    success: true,
    data: {
      task: task && { instruction: task.instruction, taskNumber: task.taskNumber, operatingSystem: task.operatingSystem },
      hasSnapshot: !!snap,
      completionTime: result.completionTime, timedOut: result.timedOut, selfReportedComplete: result.isCorrect, verification: result.verification,
      gaze: rec && m ? {
        metrics: Object.fromEntries(pick.map((k) => [k, m[k] ?? null])),
        fixations: detectFixations(samples).map((f, i) => ({ order: i + 1, ...f })),
        heatmap: buildHeatmap(samples),
        coordinates: samples.filter((_, i) => i % step === 0).map((s) => ({ t: s.t, x: s.x, y: s.y })),
        sampleCount: samples.length,
      } : null,
    },
  });
});

export const getGaze = asyncHandler(async (req, res) => {
  const { participantId, taskId } = req.params;
  const [rec, metrics] = await Promise.all([
    GazeRecord.findOne({ participantId, taskId }),
    EyeTrackingMetric.findOne({ participantId, taskId }),
  ]);
  if (!rec) throw new ApiError(404, 'No gaze recording');
  if (req.user.role === 'researcher' && !(await Experiment.exists({ _id: rec.experimentId, researcherId: req.user._id }))) throw new ApiError(404, 'No gaze recording');
  res.json({ success: true, data: { recording: rec, metrics } });
});

const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
export const snapshotSchema = z.object({
  taskId: id,
  image: z.string().max(900_000), // base64 JPEG, downscaled by the client
  width: z.number().int().min(100).max(4000),
  height: z.number().int().min(100).max(4000),
});

// One still per task, only with the participant's explicit screen-capture consent.
export const saveSnapshot = asyncHandler(async (req, res) => {
  const result = await openTaskResult(req, req.body.taskId);
  const consent = await ConsentRecord.findOne({ participantId: req.user._id, experimentId: result.experimentId, consentStatus: 'granted' }).sort({ createdAt: -1 });
  if (!consent?.screenConsent) throw new ApiError(403, 'Screen capture consent was not given');
  const data = Buffer.from(req.body.image.replace(/^data:image\/jpeg;base64,/, ''), 'base64');
  if (data.length < 100 || data.length > 600_000 || !data.subarray(0, 3).equals(JPEG_MAGIC)) throw new ApiError(400, 'Invalid JPEG image');
  await ScreenSnapshot.findOneAndUpdate(
    { participantId: req.user._id, taskId: result.taskId },
    { experimentId: result.experimentId, data, width: req.body.width, height: req.body.height },
    { upsert: true }
  );
  res.status(201).json({ success: true });
});

// Participants may fetch only their own still; researchers only stills from experiments they own.
export const getSnapshot = asyncHandler(async (req, res) => {
  const participantId = req.user.role === 'participant' ? String(req.user._id) : asId(req.query.participantId, 'participantId');
  const snap = await ScreenSnapshot.findOne({ participantId, taskId: asId(req.params.taskId, 'taskId') });
  if (!snap) throw new ApiError(404, 'No screen snapshot');
  if (req.user.role === 'researcher' && !(await Experiment.exists({ _id: snap.experimentId, researcherId: req.user._id }))) throw new ApiError(404, 'No screen snapshot');
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.send(snap.data);
});
