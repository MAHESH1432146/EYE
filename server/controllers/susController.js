import { z } from 'zod';
import { Experiment, ExperimentAssignment } from '../models/Experiment.js';
import Task from '../models/Task.js';
import { SusResponse } from '../models/Sus.js';
import { TaskResult } from '../models/TaskData.js';
import { ApiError, asyncHandler } from '../utils/helpers.js';
import { susScore, SUS_STATEMENTS, SUS_REFERENCE } from '../services/statistics/sus.js';
import { describe } from '../services/statistics/descriptive.js';
import { loadAssignment, taskQuery } from './runController.js';

const id = z.string().regex(/^[a-f\d]{24}$/i);

export const submitSchema = z.object({
  experimentId: id,
  operatingSystem: z.enum(['windows', 'macos', 'linux']),
  responses: z.array(z.number().int().min(1).max(5)).length(10),
});

export const submitSus = asyncHandler(async (req, res) => {
  const { experimentId, operatingSystem, responses } = req.body;
  const { assignment } = await loadAssignment(req, experimentId);
  if (!assignment.assignedOSSequence.includes(operatingSystem)) throw new ApiError(403, 'This OS is not part of your sequence');

  const total = await Task.countDocuments(taskQuery(assignment, experimentId, operatingSystem));
  const done = await TaskResult.countDocuments({ experimentId, participantId: req.user._id, operatingSystem, completedAt: { $ne: null } });
  if (done < total) throw new ApiError(409, 'Finish all tasks for this OS before the questionnaire');
  if (await SusResponse.exists({ experimentId, participantId: req.user._id, operatingSystem })) throw new ApiError(409, 'Already submitted');

  const doc = await SusResponse.create({
    experimentId, participantId: req.user._id, operatingSystem, responses, susScore: susScore(responses),
  });
  assignment.progress.set(`${operatingSystem}_sus`, true);
  await assignment.save();
  // Score is not echoed back to participants during the session.
  res.status(201).json({ success: true, data: { _id: doc._id } });
});

export const getStatements = (_req, res) => res.json({ success: true, data: { statements: SUS_STATEMENTS, reference: SUS_REFERENCE } });

// Participants see only their own; researchers see participants of experiments they own.
export const getParticipantSus = asyncHandler(async (req, res) => {
  const filter = { participantId: req.params.participantId };
  if (req.user.role === 'researcher') {
    const own = await Experiment.find({ researcherId: req.user._id }).distinct('_id');
    filter.experimentId = { $in: own };
  } else if (String(req.user._id) !== req.params.participantId) {
    throw new ApiError(403, 'Forbidden');
  } else {
    const shown = await Experiment.find({ showResultsToParticipants: true }).distinct('_id');
    filter.experimentId = { $in: shown };
  }
  const data = await SusResponse.find(filter).sort({ submittedAt: 1 });
  res.json({ success: true, data });
});

export const susAnalysis = asyncHandler(async (req, res) => {
  const exp = await Experiment.findOne({ _id: req.params.experimentId, researcherId: req.user._id });
  if (!exp) throw new ApiError(404, 'Experiment not found');
  const rows = await SusResponse.find({ experimentId: exp._id }).populate('participantId', 'name participantCode');

  const byOS = {};
  for (const os of exp.operatingSystems) {
    const mine = rows.filter((r) => r.operatingSystem === os);
    const stats = describe(mine.map((r) => r.susScore));
    byOS[os] = {
      ...stats,
      aboveReference: stats.mean === null ? null : stats.mean > SUS_REFERENCE,
      scores: mine.map((r) => ({ participantId: r.participantId?._id, participant: r.participantId?.name, code: r.participantId?.participantCode, score: r.susScore })),
    };
  }
  res.json({ success: true, data: { reference: SUS_REFERENCE, byOS } });
});
