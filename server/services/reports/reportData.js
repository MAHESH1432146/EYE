import { Experiment, ExperimentAssignment } from '../../models/Experiment.js';
import ParticipantProfile from '../../models/ParticipantProfile.js';
import User from '../../models/User.js';
import Task from '../../models/Task.js';
import { TaskResult, EyeTrackingMetric } from '../../models/TaskData.js';
import { SusResponse } from '../../models/Sus.js';
import { ApiError } from '../../utils/helpers.js';
import { describe } from '../statistics/descriptive.js';
import { SUS_REFERENCE } from '../statistics/sus.js';
import { analyseMetric } from '../statistics/analysis.js';
import { loadDataset, OS_LIST } from '../analytics/dataset.js';
import * as A from '../analytics/analytics.js';
import { FIXATION_PARAMS } from '../eyeTracking/fixations.js';
import { METRIC_PARAMS } from '../eyeTracking/metrics.js';

export const OS_NAMES = { windows: 'Windows 11', macos: 'macOS', linux: 'Linux (openSUSE KDE Plasma)' };

export const STATIC_TEXT = {
  objective:
    'To compare the usability of the graphical user interfaces of Windows 11, macOS and Linux (openSUSE KDE Plasma) by combining objective visual-search performance and eye-tracking behaviour with subjective System Usability Scale (SUS) ratings, and to examine how familiarity with an operating system affects performance.',
  methodology: [
    'Participants performed researcher-assigned tasks on their own computer and operating system, which was verified at the start of the session. Task completion is self-reported when the participant presses End Task; completion time runs from the start of the task to that point (or the time limit).',
    `Eye tracking used browser-based webcam gaze estimation (WebGazer) after explicit consent and a calibration with accuracy validation. Fixations were detected with the I-DT algorithm (dispersion <= ${FIXATION_PARAMS.dispersionThreshold}, minimum duration ${FIXATION_PARAMS.minDurationMs} ms); gaze was tested against the target AOI padded by ${METRIC_PARAMS.aoiMargin} (normalised units).`,
    'Each participant used one operating system (their own); differences between operating systems are therefore between-participant comparisons.',
    'After each operating system, participants completed the 10-item SUS questionnaire (scored 0-100; reference average 68).',
    'Adaptation from the laboratory design: webcam gaze estimation replaces dedicated eye-tracking hardware (Gazepoint GP3 HD) and is considerably less accurate; gaze is mapped to full-screen coordinates, and screen content is documented only by one optional still image per task.',
  ],
  procedure: [
    'Registration and login', 'Information and informed consent', 'Demographic and OS-familiarity survey', 'Operating system check', 'Camera calibration (if eye tracking enabled)',
    'Researcher-assigned tasks performed on the participant\'s own computer, each ended with End Task, then a SUS questionnaire', 'Calculation and storage of results',
  ],
  limitations: [
    'Webcam gaze estimation is approximate; metrics are not equivalent to measurements from dedicated eye-tracking hardware and are affected by lighting, head movement and camera quality.',
    'Metrics that could not be computed from insufficient data are reported as unavailable, not zero.',
    'Samples collected through a web platform may be small and non-representative; statistical results with small n are exploratory.',
    'Task completion is self-reported, and a browser cannot observe what happens inside other applications, so actions on the participant\'s computer are not verified.',
  ],
};

const best = (byOS, key, higherIsBetter) => {
  const items = OS_LIST.filter((os) => byOS[os]?.n > 0).map((os) => ({ os, v: byOS[os][key] }));
  if (items.length < 2) return null;
  items.sort((a, b) => (higherIsBetter ? b.v - a.v : a.v - b.v));
  return items[0];
};

function findings(cmp) {
  const m = cmp.metrics;
  const out = [];
  const add = (label, metric, higher, scale = 1, unit = '') => {
    const b = best(m[metric].byOS, 'mean', higher);
    if (b) out.push(`${label}: ${OS_NAMES[b.os]} (mean ${(b.v * scale).toFixed(1)}${unit}).`);
  };
  add('Highest self-reported task completion rate', 'successRate', true, 100, '%');
  add('Fastest mean completion time (correct tasks)', 'completionTime', false, 1, ' ms');
  add('Highest mean SUS score', 'susScore', true);
  add('Fewest fixations per task', 'fixationCount', false);
  return out;
}

export async function buildExperimentReport(researcherId, experimentId) {
  const experiment = await Experiment.findOne({ _id: experimentId, researcherId });
  if (!experiment) throw new ApiError(404, 'Experiment not found');
  const ds = await loadDataset(researcherId, experimentId);

  const assignments = await ExperimentAssignment.find({ experimentId });
  const profiles = await ParticipantProfile.find({ userId: { $in: assignments.map((a) => a.participantId) } }).lean();
  const count = (arr, f) => arr.reduce((acc, p) => { const k = f(p) || 'unspecified'; acc[k] = (acc[k] || 0) + 1; return acc; }, {});

  const comparison = A.osComparison(ds, 'all');
  const sus = Object.fromEntries(OS_LIST.map((os) => [os, comparison.metrics.susScore.byOS[os]]));
  const statistics = ['completionTime', 'successRate', 'susScore', 'fixationCount'].map((metric) => {
    const r = analyseMetric(ds, metric, 'all');
    return { metric, label: r.label, design: r.osComparison.design, n: r.osComparison.n, omnibus: r.osComparison.omnibus, posthoc: r.osComparison.posthoc, interpretation: r.osComparison.interpretation };
  });

  const generatedFindings = findings(comparison);
  return {
    generatedAt: new Date().toISOString(),
    title: `The Force of Habit: ${experiment.title}`,
    experiment: { _id: experiment._id, title: experiment.title, description: experiment.description, status: experiment.status, operatingSystems: experiment.operatingSystems, taskCount: experiment.taskCount },
    ...STATIC_TEXT,
    osDescriptions: experiment.operatingSystems.map((os) => ({ os, name: OS_NAMES[os] })),
    demographics: {
      assigned: assignments.length, completed: assignments.filter((a) => a.status === 'completed').length,
      surveyCompleted: profiles.filter((p) => p.surveyCompleted).length,
      age: describe(profiles.map((p) => p.age)), gender: count(profiles, (p) => p.gender), primaryOS: count(profiles, (p) => p.primaryOS),
    },
    taskAnalysis: comparison, eyeTracking: A.eyeTracking(ds), sus: { reference: SUS_REFERENCE, byOS: sus }, statistics,
    // Everything below is automatically derived from the stored data, not a researcher-authored finding.
    generated: {
      findings: generatedFindings,
      conclusion: generatedFindings.length
        ? 'Automatically generated summary: the leaders above are descriptive and should be interpreted with the statistical results and limitations in this report.'
        : 'Automatically generated summary: there is not yet enough data across operating systems to draw comparative conclusions.',
    },
  };
}

export async function buildParticipantReport(participantId, experimentId) {
  const [user, profile, assignment, experiment] = await Promise.all([
    User.findOne({ _id: participantId, role: 'participant' }),
    ParticipantProfile.findOne({ userId: participantId }),
    ExperimentAssignment.findOne({ participantId, experimentId }),
    Experiment.findById(experimentId),
  ]);
  if (!user || !assignment || !experiment) throw new ApiError(404, 'Participant report not found');

  const [results, metrics, sus] = await Promise.all([
    TaskResult.find({ participantId, experimentId }).lean(),
    EyeTrackingMetric.find({ participantId, experimentId }).lean(),
    SusResponse.find({ participantId, experimentId }).lean(),
  ]);
  const tasks = await Task.find({ _id: { $in: results.map((r) => r.taskId) } }).select('taskNumber instruction').lean();
  const T = new Map(tasks.map((t) => [String(t._id), t]));
  const M = new Map(metrics.map((m) => [String(m.taskId), m]));

  const taskRows = results.map((r) => {
    const m = M.get(String(r.taskId));
    return {
      taskId: String(r.taskId), operatingSystem: r.operatingSystem, taskNumber: T.get(String(r.taskId))?.taskNumber, instruction: T.get(String(r.taskId))?.instruction,
      isCorrect: r.isCorrect, timedOut: r.timedOut, completionTime: r.completionTime, verification: r.verification?.status || 'not_verifiable',
      fixationCount: m?.totalFixations ?? null, dwellTime: m?.totalDwell ?? null, avgFixationDuration: m?.avgFixationDuration ?? null, blinkRate: m?.blinkRate ?? null, dataQuality: m?.dataQuality ?? null,
      ttff: m?.ttff ?? null, revisitCount: m?.revisitCount ?? null,
    };
  }).sort((a, b) => a.operatingSystem.localeCompare(b.operatingSystem) || a.taskNumber - b.taskNumber);

  const mean = (rows, k) => { const v = rows.map((r) => r[k]).filter((x) => x !== null && x !== undefined); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const byOS = Object.fromEntries(OS_LIST.map((os) => {
    const r = taskRows.filter((x) => x.operatingSystem === os);
    const ok = r.filter((x) => x.isCorrect);
    return [os, {
      tasks: r.length, correct: ok.length, successRate: r.length ? ok.length / r.length : null, avgCompletionTime: mean(ok, 'completionTime'),
      fixationCount: mean(r.filter((x) => x.dataQuality && x.dataQuality !== 'unavailable'), 'fixationCount'),
      dwellTime: mean(r.filter((x) => x.dataQuality && x.dataQuality !== 'unavailable'), 'dwellTime'),
      avgFixationDuration: mean(r.filter((x) => x.dataQuality && x.dataQuality !== 'unavailable'), 'avgFixationDuration'),
      blinkRate: mean(r.filter((x) => x.dataQuality && x.dataQuality !== 'unavailable'), 'blinkRate'),
      ttff: mean(r.filter((x) => x.dataQuality && x.dataQuality !== 'unavailable'), 'ttff'),
      revisitCount: mean(r.filter((x) => x.dataQuality && x.dataQuality !== 'unavailable'), 'revisitCount'),
      verified: r.filter((x) => x.verification === 'verified').length,
      sus: sus.find((s) => s.operatingSystem === os)?.susScore ?? null,
    }];
  }));

  return {
    generatedAt: new Date().toISOString(),
    participant: { participantId: String(user._id), code: user.participantCode, name: user.name },
    experiment: { _id: experiment._id, title: experiment.title },
    profile: profile ? { age: profile.age, gender: profile.gender, primaryOS: profile.primaryOS, familiarity: profile.familiarity, usageFrequency: profile.usageFrequency, yearsOfExperience: profile.yearsOfExperience } : null,
    status: assignment.status, osSequence: assignment.assignedOSSequence, calibrationQuality: assignment.calibrationQuality ?? null,
    summary: {
      tasksCompleted: taskRows.length, correct: taskRows.filter((r) => r.isCorrect).length,
      failedTasks: taskRows.filter((r) => !r.isCorrect).map((r) => ({ operatingSystem: r.operatingSystem, taskNumber: r.taskNumber, reason: r.timedOut ? 'timeout' : 'not completed' })),
      avgCompletionTime: mean(taskRows.filter((r) => r.isCorrect), 'completionTime'),
    },
    byOS, tasks: taskRows,
  };
}
