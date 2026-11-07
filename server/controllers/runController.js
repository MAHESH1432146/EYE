import { z } from 'zod';
import { Experiment, ExperimentAssignment } from '../models/Experiment.js';
import Task from '../models/Task.js';
import ParticipantProfile from '../models/ParticipantProfile.js';
import { ConsentRecord, SusResponse } from '../models/Sus.js';
import { TaskResult } from '../models/TaskData.js';
import { ApiError, asyncHandler } from '../utils/helpers.js';
import { audit } from '../utils/audit.js';
import { finalizeGaze } from './gazeController.js';
import { detectOSFromUA } from '../services/osDetect.js';
import { summariseActivity } from '../services/eyeTracking/targets.js';

export const CONSENT_VERSION = '2.0';
const GRACE_MS = 1500; // network latency allowance on the server-side time limit

export const consentSchema = z.object({ cameraConsent: z.boolean(), screenConsent: z.boolean().optional(), participation: z.literal(true) });
export const osCheckSchema = z.object({ selectedOS: z.enum(['windows', 'macos', 'linux']) });
// completed / not_completed are the participant's own report when pressing End Task; timeout is sent by the timer.
export const completeTaskSchema = z.object({
  outcome: z.enum(['completed', 'not_completed', 'timeout']),
  endedAfterMs: z.number().min(0).max(7_200_000).optional(), // elapsed time when End Task was pressed, before the outcome dialog
  activity: z.object({
    detection: z.enum(['desktop', 'manual']),
    closedAtEnd: z.boolean().optional(),
    sessions: z.array(z.object({ startMs: z.number().min(0), endMs: z.number().min(0), app: z.string().max(200).optional() })).max(200),
    events: z.array(z.object({
      ts: z.number().int().positive(), type: z.enum(['target_window_opened', 'target_window_closed', 'target_activated', 'target_process_started', 'target_process_exited']),
      app: z.string().max(200).optional(), pid: z.number().int().optional(), title: z.string().max(300).optional(), path: z.string().max(500).optional(), alreadyRunning: z.boolean().optional(),
    })).max(500).optional(),
  }).optional(),
});

// Tasks a participant may do for one OS: the researcher's per-participant selection, or every active task when none was chosen.
export const taskQuery = (assignment, experimentId, os) => {
  const skipped = (assignment.skippedTaskIds || []).map(String);
  const assigned = (assignment.assignedTaskIds || []).filter((id) => !skipped.includes(String(id)));
  return {
    experimentId, active: true, operatingSystem: os,
    ...(assignment.assignedTaskIds?.length ? { _id: { $in: assigned } } : skipped.length ? { _id: { $nin: skipped } } : {}),
  };
};

export async function loadAssignment(req, experimentId = req.params.id) {
  const assignment = await ExperimentAssignment.findOne({ experimentId, participantId: req.user._id });
  if (!assignment) throw new ApiError(404, 'You are not assigned to this experiment');
  const experiment = await Experiment.findById(experimentId);
  if (!experiment || !['active', 'in_progress'].includes(experiment.status)) throw new ApiError(409, 'This experiment is not open');
  // The OS reported by this request always wins over anything stored earlier (stale or default sequences).
  const detected = detectOSFromUA(req.headers['user-agent']);
  if (detected && assignment.osCheck?.matched && assignment.osCheck.detectedOS === detected && assignment.assignedOSSequence.join() !== detected) {
    assignment.assignedOSSequence = [detected];
    assignment.sequenceOverridden = true;
    await assignment.save();
  }
  return { assignment, experiment, detected };
}

// Why the participant's real OS cannot be served with tasks (null = fine).
async function osMismatch(assignment, experiment, detected) {
  if (!detected) return { reason: 'unsupported', detectedOS: null, assignedOS: [] };
  if (!experiment.operatingSystems.includes(detected)) return { reason: 'not_in_experiment', detectedOS: detected, assignedOS: experiment.operatingSystems };
  if (assignment.assignedTaskIds?.length && !(await Task.exists(taskQuery(assignment, experiment._id, detected)))) {
    const assignedOS = await Task.find({ _id: { $in: assignment.assignedTaskIds }, active: true }).distinct('operatingSystem');
    return { reason: 'no_assigned_tasks', detectedOS: detected, assignedOS };
  }
  return null;
}

const setProgress = (assignment, key) => assignment.progress.set(key, true);
const latestConsent = (participantId, experimentId) =>
  ConsentRecord.findOne({ participantId, experimentId, consentStatus: 'granted' }).sort({ createdAt: -1 });

export const getSession = asyncHandler(async (req, res) => {
  const { assignment, experiment, detected } = await loadAssignment(req);
  const mismatch = await osMismatch(assignment, experiment, detected);
  // Only the detected OS is ever loaded; a stored order or earlier selection cannot add another OS.
  const sequence = detected && !mismatch ? [detected] : [];
  const [profile, consent, tasksPerOS, results, sus] = await Promise.all([
    ParticipantProfile.findOne({ userId: req.user._id }),
    latestConsent(req.user._id, experiment._id),
    Promise.all(sequence.map((os) => Task.find(taskQuery(assignment, experiment._id, os)).select('experimentId operatingSystem taskNumber instruction timeLimit targetApp').sort({ taskNumber: 1 }))),
    TaskResult.find({ experimentId: experiment._id, participantId: req.user._id, completedAt: { $ne: null } }).select('taskId'),
    SusResponse.find({ experimentId: experiment._id, participantId: req.user._id }).select('operatingSystem'),
  ]);
  const done = new Set(results.map((r) => String(r.taskId)));
  res.json({
    success: true,
    data: {
      experiment: {
        _id: experiment._id, title: experiment.title, description: experiment.description,
        eyeTrackingEnabled: experiment.eyeTrackingEnabled, durationMinutes: experiment.durationMinutes,
      },
      assignment: {
        status: assignment.status, sequence, progress: Object.fromEntries(assignment.progress),
        osCheck: assignment.osCheck?.matched && assignment.osCheck.detectedOS === detected ? { detectedOS: detected } : null,
      },
      detectedOS: detected,
      osMismatch: mismatch,
      surveyCompleted: !!profile?.surveyCompleted,
      consent: consent ? { cameraConsent: consent.cameraConsent, screenConsent: consent.screenConsent, version: consent.consentVersion } : null,
      gazeActive: !!(experiment.eyeTrackingEnabled && consent?.cameraConsent),
      susDone: sus.map((s) => s.operatingSystem),
      tasksByOS: Object.fromEntries(
        sequence.map((os, i) => [os, tasksPerOS[i].map((t) => ({ ...t.toObject(), completed: done.has(String(t._id)) }))])
      ),
    },
  });
});

export const giveConsent = asyncHandler(async (req, res) => {
  const { assignment, experiment } = await loadAssignment(req);
  await ConsentRecord.create({
    participantId: req.user._id, experimentId: experiment._id, consentVersion: CONSENT_VERSION,
    consentStatus: 'granted', cameraConsent: req.body.cameraConsent, screenConsent: !!req.body.screenConsent,
  });
  setProgress(assignment, 'consent');
  await assignment.save();
  res.status(201).json({ success: true });
});

// The server re-detects the OS from the User-Agent, so the client cannot simply claim a match.
// A participant only ever receives the tasks of the OS they are actually using.
export const checkOS = asyncHandler(async (req, res) => {
  const { assignment, experiment, detected } = await loadAssignment(req);
  const selected = req.body.selectedOS;
  const mismatch = await osMismatch(assignment, experiment, detected);
  const matched = detected !== null && detected === selected && !mismatch;
  if (matched) {
    assignment.assignedOSSequence = [detected];
    assignment.sequenceOverridden = true;
  }
  assignment.osCheck = { selectedOS: selected, detectedOS: detected || undefined, matched, checkedAt: new Date() };
  await assignment.save();
  await audit(req, 'experiment.oscheck', 'Experiment', assignment.experimentId, { selected, detected, matched, reason: mismatch?.reason });
  res.json({ success: true, data: { detectedOS: detected, matched, mismatch } });
});

export const startExperiment = asyncHandler(async (req, res) => {
  const { assignment, experiment, detected } = await loadAssignment(req);
  const profile = await ParticipantProfile.findOne({ userId: req.user._id });
  if (!profile?.surveyCompleted) throw new ApiError(409, 'Complete the participant survey first');
  if (!assignment.progress.get('consent')) throw new ApiError(409, 'Informed consent is required');
  if (!assignment.osCheck?.matched || assignment.osCheck.detectedOS !== detected) throw new ApiError(409, 'Operating system check is required');
  if (await osMismatch(assignment, experiment, detected)) throw new ApiError(409, 'No tasks are assigned for your operating system. Contact the researcher.');

  const consent = await latestConsent(req.user._id, experiment._id);
  if (experiment.eyeTrackingEnabled && consent?.cameraConsent && !assignment.progress.get('calibration')) {
    throw new ApiError(409, 'Complete webcam calibration first');
  }

  for (const os of assignment.assignedOSSequence) {
    if (!(await Task.exists(taskQuery(assignment, experiment._id, os)))) {
      throw new ApiError(409, `No tasks are assigned to you for ${os}. Contact the researcher.`);
    }
  }
  if (assignment.status === 'assigned' || assignment.status === 'reopened') {
    assignment.status = 'in_progress';
    assignment.startedAt ??= new Date();
    await assignment.save();
    if (experiment.status === 'active') await Experiment.updateOne({ _id: experiment._id }, { status: 'in_progress' });
    await audit(req, 'experiment.start', 'Experiment', experiment._id);
  }
  res.json({ success: true });
});

async function taskContext(req) {
  const task = await Task.findOne({ _id: req.params.id, active: true });
  if (!task) throw new ApiError(404, 'Task not found');
  const { assignment, experiment, detected } = await loadAssignment(req, task.experimentId);
  if (assignment.status !== 'in_progress') throw new ApiError(409, 'Experiment not started');
  if (task.operatingSystem !== detected) throw new ApiError(403, 'This task is not for your operating system');
  if (assignment.assignedTaskIds?.length && !assignment.assignedTaskIds.some((id) => String(id) === String(task._id))) throw new ApiError(403, 'This task was not assigned to you');
  if (assignment.skippedTaskIds?.some((id) => String(id) === String(task._id))) throw new ApiError(403, 'You finished the tasks early; this task was skipped');
  return { task, assignment, experiment };
}

export const startTask = asyncHandler(async (req, res) => {
  const { task } = await taskContext(req);
  let result = await TaskResult.findOne({ participantId: req.user._id, taskId: task._id });
  if (result?.completedAt) throw new ApiError(409, 'Task already completed');
  if (!result) {
    result = await TaskResult.create({
      experimentId: task.experimentId, participantId: req.user._id, taskId: task._id,
      operatingSystem: task.operatingSystem, startedAt: new Date(),
    });
  }
  // Resume-safe: remaining time is derived from the original server start time.
  const remainingMs = Math.max(0, task.timeLimit * 1000 - (Date.now() - result.startedAt.getTime()));
  res.json({ success: true, data: { taskId: task._id, instruction: task.instruction, timeLimit: task.timeLimit, remainingMs, startedAt: result.startedAt } });
});

export const completeTask = asyncHandler(async (req, res) => {
  const { task, assignment } = await taskContext(req);
  const result = await TaskResult.findOne({ participantId: req.user._id, taskId: task._id });
  if (!result) throw new ApiError(409, 'Task was not started');
  if (result.completedAt) throw new ApiError(409, 'Task already completed');

  const now = new Date();
  const elapsed = now - result.startedAt;
  const expired = elapsed > task.timeLimit * 1000 + GRACE_MS;
  const { outcome } = req.body;

  if (outcome === 'timeout' && !expired && elapsed < task.timeLimit * 1000 - GRACE_MS) throw new ApiError(400, 'Time limit not reached');
  if (expired || outcome === 'timeout') {
    result.timedOut = true;
  } else {
    result.endedEarly = true; // ended by the participant
    result.isCorrect = outcome === 'completed'; // self-reported
  }
  result.completedAt = now;
  // The participant's own End Task moment counts, but it can never exceed the server-measured elapsed time.
  const measured = req.body.endedAfterMs !== undefined && !result.timedOut ? Math.min(elapsed, req.body.endedAfterMs) : elapsed;
  result.completionTime = Math.min(measured, task.timeLimit * 1000);
  if (req.body.activity) result.activity = summariseActivity(req.body.activity, result.completionTime);
  await result.save();

  await finalizeGaze(task, req.user._id);
  const verification = (await TaskResult.findById(result._id).select('verification')).verification;
  const total = await Task.countDocuments(taskQuery(assignment, task.experimentId, task.operatingSystem));
  const n = await TaskResult.countDocuments({ experimentId: task.experimentId, participantId: req.user._id, operatingSystem: task.operatingSystem, completedAt: { $ne: null } });
  const osTasksDone = n >= total;
  if (osTasksDone) {
    setProgress(assignment, `${task.operatingSystem}_tasks`);
    await assignment.save();
  }
  res.json({ success: true, data: { finished: true, timedOut: !!result.timedOut, selfReportedComplete: result.isCorrect, verification, completionTime: result.completionTime, activity: result.activity, osTasksDone } });
});

// The participant stops doing tasks: the remaining ones are skipped (not recorded as results) and the questionnaire follows.
// The assignment is still reported as finished early, not completed, on the dashboard.
export const finishTasksEarly = asyncHandler(async (req, res) => {
  const { assignment, experiment, detected } = await loadAssignment(req);
  if (assignment.status !== 'in_progress') throw new ApiError(409, 'Experiment not started');
  if (!detected) throw new ApiError(409, 'Operating system not detected');
  const [tasks, done] = await Promise.all([
    Task.find(taskQuery(assignment, experiment._id, detected)).select('_id'),
    TaskResult.find({ experimentId: experiment._id, participantId: req.user._id, operatingSystem: detected, completedAt: { $ne: null } }).select('taskId'),
  ]);
  const doneIds = new Set(done.map((r) => String(r.taskId)));
  if (!doneIds.size) throw new ApiError(409, 'Complete at least one task before finishing early');
  const remaining = tasks.filter((t) => !doneIds.has(String(t._id))).map((t) => t._id);
  assignment.skippedTaskIds = [...(assignment.skippedTaskIds || []), ...remaining];
  setProgress(assignment, `${detected}_tasks`);
  await assignment.save();
  await audit(req, 'experiment.finish_tasks_early', 'Experiment', experiment._id, { skipped: remaining.length, completed: doneIds.size });
  res.json({ success: true, data: { skipped: remaining.length } });
});

// Brings back the tasks skipped by finishing early so the participant can carry on from where they stopped.
export const resumeTasks = asyncHandler(async (req, res) => {
  const { assignment, experiment, detected } = await loadAssignment(req);
  if (!assignment.skippedTaskIds?.length) throw new ApiError(409, 'There are no skipped tasks to continue');
  assignment.skippedTaskIds = [];
  assignment.status = 'in_progress';
  assignment.completedAt = undefined;
  if (detected) assignment.progress.set(`${detected}_tasks`, false);
  await assignment.save();
  await audit(req, 'experiment.resume_tasks', 'Experiment', experiment._id);
  res.json({ success: true });
});

export const completeExperiment = asyncHandler(async (req, res) => {
  const { assignment, experiment } = await loadAssignment(req);
  for (const os of assignment.assignedOSSequence) {
    const total = await Task.countDocuments(taskQuery(assignment, experiment._id, os));
    const finished = await TaskResult.countDocuments({ experimentId: experiment._id, participantId: req.user._id, operatingSystem: os, completedAt: { $ne: null } });
    if (finished < total) throw new ApiError(409, `Tasks for ${os} are not finished`);
    if (!(await SusResponse.exists({ experimentId: experiment._id, participantId: req.user._id, operatingSystem: os }))) {
      throw new ApiError(409, `The ${os} questionnaire is not completed`);
    }
  }
  assignment.status = 'completed';
  assignment.completedAt = new Date();
  await assignment.save();
  await audit(req, 'experiment.complete', 'Experiment', experiment._id);
  res.json({ success: true });
});
