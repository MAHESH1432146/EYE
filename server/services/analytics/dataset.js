import mongoose from 'mongoose';
import { Experiment } from '../../models/Experiment.js';
import ParticipantProfile from '../../models/ParticipantProfile.js';
import { TaskResult, EyeTrackingMetric } from '../../models/TaskData.js';
import { SusResponse } from '../../models/Sus.js';
import Task from '../../models/Task.js';

export const OS_LIST = ['windows', 'macos', 'linux'];
export const METRICS = {
  completionTime: { label: 'Completion time (ms, tasks reported complete)', unit: 'ms' },
  successRate: { label: 'Task completion rate (self-reported)', unit: '' },
  verifiedRate: { label: 'Automatically verified completion rate', unit: '' },
  fixationCount: { label: 'Fixation count per task', unit: '' },
  dwellTime: { label: 'Total fixation dwell time per task (ms)', unit: 'ms' },
  avgFixationDuration: { label: 'Average fixation duration (ms)', unit: 'ms' },
  ttff: { label: 'Time to first fixation on target (ms)', unit: 'ms' },
  revisitCount: { label: 'Revisits to target', unit: '' },
  blinkRate: { label: 'Blink rate (per minute)', unit: '/min' },
  susScore: { label: 'SUS score', unit: '' },
};

// Field of the stored eye-tracking metric document behind each gaze metric.
const GAZE_FIELD = { fixationCount: 'totalFixations', dwellTime: 'totalDwell', avgFixationDuration: 'avgFixationDuration', blinkRate: 'blinkRate', ttff: 'ttff', revisitCount: 'revisitCount' };

/** Loads only data belonging to experiments owned by the researcher. */
export async function loadDataset(researcherId, experimentId) {
  const expFilter = { researcherId };
  if (experimentId) expFilter._id = new mongoose.Types.ObjectId(experimentId);
  const experiments = await Experiment.find(expFilter).select('_id status');
  const ids = experiments.map((e) => e._id);

  const [results, metrics, sus, tasks] = await Promise.all([
    TaskResult.find({ experimentId: { $in: ids }, completedAt: { $ne: null } }).lean(),
    EyeTrackingMetric.find({ experimentId: { $in: ids } }).lean(),
    SusResponse.find({ experimentId: { $in: ids } }).lean(),
    Task.find({ experimentId: { $in: ids } }).select('taskNumber instruction').lean(),
  ]);
  const participantIds = [...new Set([...results, ...sus].map((r) => String(r.participantId)))];
  const profiles = await ParticipantProfile.find({ userId: { $in: participantIds } }).lean();

  const profileBy = new Map(profiles.map((p) => [String(p.userId), p]));
  const metricBy = new Map(metrics.map((m) => [`${m.participantId}:${m.taskId}`, m]));
  const taskNo = new Map(tasks.map((t) => [String(t._id), t.taskNumber]));
  const taskText = new Map(tasks.map((t) => [String(t._id), t.instruction]));
  const isPrimary = (pid, os) => profileBy.get(String(pid))?.primaryOS === os;

  const rows = results.map((r) => {
    const m = metricBy.get(`${r.participantId}:${r.taskId}`);
    return {
      participantId: String(r.participantId), os: r.operatingSystem, taskId: String(r.taskId), taskNumber: taskNo.get(String(r.taskId)),
      instruction: taskText.get(String(r.taskId)),
      isCorrect: r.isCorrect, timedOut: r.timedOut, attempts: r.attempts, completionTime: r.completionTime, verification: r.verification?.status || 'not_verifiable',
      activityMs: r.activity?.detection === 'desktop' ? r.activity.totalMs : null, activitySessions: r.activity?.detection === 'desktop' ? r.activity.sessionCount : null,
      activityClosedAtEnd: r.activity?.detection === 'desktop' ? !!r.activity.closedAtEnd : null,
      metrics: m || null, isPrimary: isPrimary(r.participantId, r.operatingSystem),
      primaryOS: profileBy.get(String(r.participantId))?.primaryOS || null,
    };
  });
  const susRows = sus.map((s) => ({
    participantId: String(s.participantId), os: s.operatingSystem, score: s.susScore,
    isPrimary: isPrimary(s.participantId, s.operatingSystem), primaryOS: profileBy.get(String(s.participantId))?.primaryOS || null,
  }));
  return { experiments, rows, susRows, profiles, metrics };
}

export const GROUPS = ['all', 'primary', 'nonprimary'];
const inGroup = (row, group) => group === 'all' || (group === 'primary' ? row.isPrimary : !row.isPrimary);

/**
 * Observations for one metric: {participantId, os, taskNumber, value, isPrimary}.
 * Missing values (unavailable gaze data, not-reached TTFF, incorrect-task completion time) are omitted, never zero-filled.
 */
export function observations(ds, metric, group = 'all') {
  if (metric === 'susScore') {
    return ds.susRows.filter((r) => inGroup(r, group)).map((r) => ({ participantId: r.participantId, os: r.os, taskNumber: null, value: r.score, isPrimary: r.isPrimary, primaryOS: r.primaryOS }));
  }
  const out = [];
  for (const r of ds.rows.filter((x) => inGroup(x, group))) {
    let value = null;
    if (metric === 'successRate') value = r.isCorrect ? 1 : 0;
    else if (metric === 'verifiedRate') value = r.verification === 'verified' ? 1 : r.verification === 'not_detected' ? 0 : null; // only where verification was possible
    else if (metric === 'completionTime') value = r.isCorrect ? r.completionTime : null;
    else if (r.metrics && r.metrics.dataQuality !== 'unavailable') value = r.metrics[GAZE_FIELD[metric]];
    if (value !== null && value !== undefined) out.push({ participantId: r.participantId, os: r.os, taskNumber: r.taskNumber, value, isPrimary: r.isPrimary, primaryOS: r.primaryOS });
  }
  return out;
}

// Participant-level value per OS (mean over that participant's tasks) so observations are independent within a group.
export function perParticipant(obs) {
  const acc = new Map();
  for (const o of obs) {
    const key = `${o.os}|${o.participantId}`;
    const cur = acc.get(key) || { os: o.os, participantId: o.participantId, primaryOS: o.primaryOS, sum: 0, n: 0 };
    cur.sum += o.value; cur.n++;
    acc.set(key, cur);
  }
  return [...acc.values()].map((a) => ({ os: a.os, participantId: a.participantId, primaryOS: a.primaryOS, value: a.sum / a.n }));
}
