import User from '../../models/User.js';
import ParticipantProfile from '../../models/ParticipantProfile.js';
import { Experiment, ExperimentAssignment } from '../../models/Experiment.js';
import { GazeRecord } from '../../models/TaskData.js';
import { describe } from '../statistics/descriptive.js';
import { METRICS, OS_LIST, GROUPS, observations } from './dataset.js';

const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);

export async function overview(ds, researcherId) {
  const expIds = ds.experiments.map((e) => e._id);
  const [totalParticipants, activeParticipants, completedAssignments, gazeRecordings, profiles] = await Promise.all([
    User.countDocuments({ role: 'participant', active: true }),
    ExperimentAssignment.countDocuments({ experimentId: { $in: expIds }, status: 'in_progress' }),
    ExperimentAssignment.countDocuments({ experimentId: { $in: expIds }, status: 'completed' }),
    GazeRecord.countDocuments({ experimentId: { $in: expIds }, recordingStatus: { $ne: 'recording' } }),
    ParticipantProfile.find({ surveyCompleted: true }).lean(),
  ]);
  const experiments = await Experiment.find({ researcherId }).select('status');

  const familiarity = OS_LIST.map((os) => ({
    os,
    ...Object.fromEntries([1, 2, 3, 4, 5].map((r) => [`r${r}`, profiles.filter((p) => p.familiarity?.[os] === r).length])),
  }));
  const failures = OS_LIST.map((os) => {
    const r = ds.rows.filter((x) => x.os === os && !x.isCorrect);
    return { os, timeout: r.filter((x) => x.timedOut).length, incorrect: r.filter((x) => !x.timedOut).length };
  });
  const times = observations(ds, 'completionTime').map((o) => o.value);
  const sus = ds.susRows.map((s) => s.score);

  return {
    cards: {
      totalParticipants, activeParticipants,
      completedExperiments: experiments.filter((e) => e.status === 'completed').length,
      completedAssignments,
      ongoingExperiments: experiments.filter((e) => ['active', 'in_progress'].includes(e.status)).length,
      totalTaskAttempts: ds.rows.length,
      avgCompletionTime: mean(times),
      avgSus: mean(sus),
      eyeTrackingRecordings: gazeRecordings,
    },
    charts: {
      participantsByPrimaryOS: OS_LIST.map((os) => ({ os, count: profiles.filter((p) => p.primaryOS === os).length })),
      familiarity,
      failures,
    },
  };
}

const metricSummary = (ds, metric, group) => {
  const obs = observations(ds, metric, group);
  return Object.fromEntries(OS_LIST.map((os) => {
    const v = obs.filter((o) => o.os === os);
    return [os, { ...describe(v.map((o) => o.value)), participants: new Set(v.map((o) => o.participantId)).size }];
  }));
};

export function osComparison(ds, group = 'all') {
  return {
    group,
    metrics: Object.fromEntries(Object.keys(METRICS).map((m) => [m, { label: METRICS[m].label, unit: METRICS[m].unit, byOS: metricSummary(ds, m, group) }])),
    byTask: taskPerformance(ds, group),
  };
}

export function taskPerformance(ds, group = 'all') {
  const succ = observations(ds, 'successRate', group);
  const time = observations(ds, 'completionTime', group);
  const nums = [...new Set(succ.map((o) => o.taskNumber))].sort((a, b) => a - b);
  return nums.map((n) => {
    const row = { taskNumber: n };
    for (const os of OS_LIST) {
      const s = succ.filter((o) => o.taskNumber === n && o.os === os).map((o) => o.value);
      const t = time.filter((o) => o.taskNumber === n && o.os === os).map((o) => o.value);
      row[`${os}_success`] = mean(s);
      row[`${os}_time`] = mean(t);
      row[`${os}_n`] = s.length;
    }
    return row;
  });
}

export function eyeTracking(ds) {
  const keys = ['fixationCount', 'dwellTime', 'avgFixationDuration', 'ttff', 'revisitCount', 'blinkRate'];
  const quality = Object.fromEntries(OS_LIST.map((os) => {
    const m = ds.metrics.filter((x) => x.operatingSystem === os);
    return [os, { total: m.length, ...Object.fromEntries(['good', 'fair', 'poor', 'unavailable'].map((q) => [q, m.filter((x) => x.dataQuality === q).length])) }];
  }));
  return { metrics: Object.fromEntries(keys.map((k) => [k, { label: METRICS[k].label, byOS: metricSummary(ds, k, 'all') }])), quality };
}

const TASK_METRICS = ['completionTime', 'successRate', 'verifiedRate', 'fixationCount', 'dwellTime', 'avgFixationDuration', 'ttff', 'revisitCount', 'blinkRate'];

// Task-wise performance: one entry per task and OS (separate participant groups), plus per-participant rows for comparison.
export function taskReport(ds, group = 'all') {
  const obs = Object.fromEntries(TASK_METRICS.map((m) => [m, observations(ds, m, group)]));
  const keys = new Map();
  for (const r of ds.rows) keys.set(`${r.os}|${r.taskNumber}`, { os: r.os, taskNumber: r.taskNumber, instruction: r.instruction });
  const tasks = [...keys.values()]
    .sort((a, b) => a.os.localeCompare(b.os) || a.taskNumber - b.taskNumber)
    .map((k) => ({
      ...k,
      participants: new Set(ds.rows.filter((r) => r.os === k.os && r.taskNumber === k.taskNumber).map((r) => r.participantId)).size,
      metrics: Object.fromEntries(TASK_METRICS.map((m) => [m, describe(obs[m].filter((o) => o.os === k.os && o.taskNumber === k.taskNumber).map((o) => o.value))])),
    }));
  const rows = ds.rows.map((r) => ({
    participantId: r.participantId, os: r.os, taskNumber: r.taskNumber, instruction: r.instruction, completionTime: r.completionTime,
    selfReportedComplete: r.isCorrect, timedOut: r.timedOut, verification: r.verification,
    activeMs: r.activityMs, activitySessions: r.activitySessions, closedAtEnd: r.activityClosedAtEnd,
    fixations: r.metrics?.totalFixations ?? null, dwell: r.metrics?.totalDwell ?? null, avgFixation: r.metrics?.avgFixationDuration ?? null,
    ttff: r.metrics?.ttff ?? null, revisits: r.metrics?.revisitCount ?? null, blinkRate: r.metrics?.blinkRate ?? null, dataQuality: r.metrics?.dataQuality ?? null,
  }));
  return { tasks, rows };
}

export function participantGroups(ds) {
  return Object.fromEntries(GROUPS.map((g) => [g, osComparison(ds, g).metrics]));
}
