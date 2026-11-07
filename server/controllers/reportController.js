import { z } from 'zod';
import { Experiment } from '../models/Experiment.js';
import User from '../models/User.js';
import { ExperimentReport } from '../models/Sus.js';
import { ApiError, asId, asyncHandler } from '../utils/helpers.js';
import { audit } from '../utils/audit.js';
import { toCsv } from '../services/reports/csv.js';
import { buildExperimentReport, buildParticipantReport } from '../services/reports/reportData.js';
import { writeExperimentPdf, writeParticipantPdf } from '../services/reports/pdf.js';
import { loadDataset } from '../services/analytics/dataset.js';
import { taskReport } from '../services/analytics/analytics.js';

const format = z.enum(['json', 'csv', 'pdf']).default('json');

async function ownedExperimentId(req, value) {
  const id = asId(value, 'experimentId');
  if (!(await Experiment.exists({ _id: id, researcherId: req.user._id }))) throw new ApiError(404, 'Experiment not found');
  return id;
}

const log = (req, experimentId, participantId, reportType) =>
  ExperimentReport.create({ experimentId, participantId, reportType, generatedBy: req.user._id }).then(() => audit(req, `report.${reportType}`, 'Experiment', experimentId));

function sendCsv(res, name, csv) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.send(`\uFEFF${csv}`);
}

const participantColumns = [
  ['operatingSystem', 'OS'], ['taskNumber', 'Task'], ['instruction', 'Instruction'], ['isCorrect', 'Completed (self-reported)'], ['verification', 'Automatic verification'], ['timedOut', 'Timed out'],
  ['completionTime', 'Completion time (ms)'], ['fixationCount', 'Fixation count'], ['dwellTime', 'Total dwell time (ms)'], ['avgFixationDuration', 'Average fixation (ms)'],
  ['ttff', 'TTFF on target (ms)'], ['revisitCount', 'Revisits to target'], ['blinkRate', 'Blink rate (per min)'], ['dataQuality', 'Gaze data quality'],
].map(([value, header]) => ({ value, header }));

export const participantReport = asyncHandler(async (req, res) => {
  const fmt = format.parse(req.query.format);
  const participantId = asId(req.params.participantId, 'participantId');
  const experimentId = asId(req.query.experimentId, 'experimentId');

  if (req.user.role === 'participant') {
    const exp = await Experiment.findById(experimentId);
    if (String(req.user._id) !== participantId || !exp?.showResultsToParticipants || fmt !== 'json') throw new ApiError(403, 'Forbidden');
  } else {
    await ownedExperimentId(req, experimentId);
  }
  const report = await buildParticipantReport(participantId, experimentId);

  if (req.user.role === 'researcher') await log(req, experimentId, participantId, 'participant');
  if (fmt === 'pdf') return writeParticipantPdf(res, report);
  if (fmt === 'csv') return sendCsv(res, `participant-${report.participant.code}.csv`, toCsv(report.tasks, participantColumns));
  res.json({ success: true, data: report });
});

export const experimentReport = asyncHandler(async (req, res) => {
  const fmt = format.parse(req.query.format);
  const experimentId = await ownedExperimentId(req, req.params.experimentId);
  const report = await buildExperimentReport(req.user._id, experimentId);
  await log(req, experimentId, undefined, 'experiment');
  if (fmt === 'pdf') return writeExperimentPdf(res, report);
  res.json({ success: true, data: report });
});

const DATASETS = ['task-results', 'eye-metrics', 'sus', 'task-wise'];

export const exportCsv = asyncHandler(async (req, res) => {
  const dataset = z.enum(DATASETS).default('task-results').parse(req.query.dataset);
  const experimentId = await ownedExperimentId(req, req.query.experimentId);
  const ds = await loadDataset(req.user._id, experimentId);
  const codes = new Map((await User.find({ _id: { $in: [...new Set([...ds.rows, ...ds.susRows].map((r) => r.participantId))] } }).select('participantCode')).map((u) => [String(u._id), u.participantCode]));
  const code = (r) => codes.get(r.participantId) || r.participantId;

  let csv;
  if (dataset === 'task-wise') {
    const { rows } = taskReport(ds, 'all');
    csv = toCsv(rows, [
      { header: 'Participant', value: code }, { header: 'OS', value: 'os' }, { header: 'Task', value: 'taskNumber' }, { header: 'Instruction', value: 'instruction' },
      { header: 'Completion time (ms)', value: 'completionTime' }, { header: 'Completed (self-reported)', value: 'selfReportedComplete' },
      { header: 'Automatic verification', value: 'verification' }, { header: 'Timed out', value: 'timedOut' },
      { header: 'Target app active time (ms)', value: 'activeMs' }, { header: 'Target app sessions', value: 'activitySessions' }, { header: 'Target app closed at end', value: 'closedAtEnd' },
      { header: 'Fixation count', value: 'fixations' }, { header: 'Total dwell (ms)', value: 'dwell' }, { header: 'Average fixation (ms)', value: 'avgFixation' },
      { header: 'TTFF on target (ms)', value: 'ttff' }, { header: 'Revisits to target', value: 'revisits' }, { header: 'Blink rate (per min)', value: 'blinkRate' },
      { header: 'Gaze data quality', value: 'dataQuality' },
    ]);
  } else if (dataset === 'sus') {
    csv = toCsv(ds.susRows, [{ header: 'Participant', value: code }, { header: 'OS', value: 'os' }, { header: 'SUS score', value: 'score' }, { header: 'Primary OS', value: 'primaryOS' }]);
  } else if (dataset === 'eye-metrics') {
    csv = toCsv(ds.rows.filter((r) => r.metrics), [
      { header: 'Participant', value: code }, { header: 'OS', value: 'os' }, { header: 'Task', value: 'taskNumber' },
      { header: 'Fixation count', value: (r) => r.metrics.totalFixations }, { header: 'Total dwell time (ms)', value: (r) => r.metrics.totalDwell },
      { header: 'Average fixation (ms)', value: (r) => r.metrics.avgFixationDuration }, { header: 'Blink count', value: (r) => r.metrics.blinkCount },
      { header: 'Blink rate (per min)', value: (r) => r.metrics.blinkRate },
      { header: 'TTFF on target (ms)', value: (r) => r.metrics.ttff }, { header: 'Revisits to target', value: (r) => r.metrics.revisitCount },
      { header: 'Total region revisits', value: (r) => r.metrics.totalRevisits }, { header: 'Interrupted (ms)', value: (r) => r.metrics.interruptedMs },
      { header: 'Data quality', value: (r) => r.metrics.dataQuality },
    ]);
  } else {
    csv = toCsv(ds.rows, [
      { header: 'Participant', value: code }, { header: 'OS', value: 'os' }, { header: 'Task', value: 'taskNumber' }, { header: 'Completed (self-reported)', value: 'isCorrect' },
      { header: 'Timed out', value: 'timedOut' }, { header: 'Automatic verification', value: 'verification' }, { header: 'Completion time (ms)', value: 'completionTime' },
      { header: 'Primary OS', value: 'primaryOS' }, { header: 'Is primary OS', value: 'isPrimary' },
    ]);
  }
  await log(req, experimentId, undefined, 'experiment');
  sendCsv(res, `${dataset}-${experimentId}.csv`, csv);
});

export const exportPdf = asyncHandler(async (req, res) => {
  const experimentId = await ownedExperimentId(req, req.query.experimentId);
  if (req.query.participantId) {
    const participantId = asId(req.query.participantId, 'participantId');
    await log(req, experimentId, participantId, 'participant');
    return writeParticipantPdf(res, await buildParticipantReport(participantId, experimentId));
  }
  await log(req, experimentId, undefined, 'experiment');
  return writeExperimentPdf(res, await buildExperimentReport(req.user._id, experimentId));
});

export { participantColumns };
