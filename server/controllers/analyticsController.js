import { z } from 'zod';
import { asyncHandler, asId } from '../utils/helpers.js';
import User from '../models/User.js';
import { loadDataset, METRICS, GROUPS } from '../services/analytics/dataset.js';
import * as A from '../services/analytics/analytics.js';
import { analyseMetric } from '../services/statistics/analysis.js';
import { recommend } from '../services/analytics/recommendations.js';

const query = z.object({
  experimentId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  group: z.enum(GROUPS).default('all'),
  metric: z.enum(Object.keys(METRICS)).default('completionTime'),
});

const load = async (req) => {
  const q = query.parse(req.query);
  return { q, ds: await loadDataset(req.user._id, q.experimentId) };
};

export const getOverview = asyncHandler(async (req, res) => {
  const { ds } = await load(req);
  res.json({ success: true, data: await A.overview(ds, req.user._id) });
});
export const getOSComparison = asyncHandler(async (req, res) => {
  const { q, ds } = await load(req);
  res.json({ success: true, data: A.osComparison(ds, q.group) });
});
export const getTaskPerformance = asyncHandler(async (req, res) => {
  const { q, ds } = await load(req);
  res.json({ success: true, data: A.taskPerformance(ds, q.group) });
});
export const getEyeTracking = asyncHandler(async (req, res) => {
  const { ds } = await load(req);
  res.json({ success: true, data: A.eyeTracking(ds) });
});
export const getParticipantGroups = asyncHandler(async (req, res) => {
  const { ds } = await load(req);
  res.json({ success: true, data: A.participantGroups(ds) });
});
export const getStatistics = asyncHandler(async (req, res) => {
  const { q, ds } = await load(req);
  res.json({ success: true, data: analyseMetric(ds, q.metric, q.group) });
});

export const getTaskReport = asyncHandler(async (req, res) => {
  const { q, ds } = await load(req);
  const report = A.taskReport(ds, q.group);
  const users = await User.find({ _id: { $in: [...new Set(report.rows.map((r) => r.participantId))] } }).select('participantCode');
  const code = new Map(users.map((u) => [String(u._id), u.participantCode]));
  res.json({ success: true, data: { ...report, rows: report.rows.map((r) => ({ ...r, participant: code.get(r.participantId) || r.participantId })) } });
});

export const getRecommendations = asyncHandler(async (req, res) => {
  const { ds } = await load(req);
  const participantId = req.query.participantId ? asId(req.query.participantId, 'participantId') : undefined;
  res.json({ success: true, data: recommend(ds, { participantId }) });
});
