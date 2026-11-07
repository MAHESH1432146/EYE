import { z } from 'zod';
import User from '../models/User.js';
import ParticipantProfile from '../models/ParticipantProfile.js';
import { ExperimentAssignment } from '../models/Experiment.js';
import Task from '../models/Task.js';
import { TaskResult } from '../models/TaskData.js';
import { ApiError, asyncHandler, parsePagination } from '../utils/helpers.js';
import { recommendSequence } from '../services/sequence.js';
import { audit } from '../utils/audit.js';

const OS = z.enum(['windows', 'macos', 'linux']);
const freq = z.enum(['daily', 'weekly', 'monthly', 'rarely', 'never']);
const rating = z.coerce.number().int().min(1).max(5);
const perOS = (s) => z.object({ windows: s, macos: s, linux: s });

export const profileSchema = z.object({
  age: z.coerce.number().int().min(10).max(120),
  gender: z.enum(['female', 'male', 'non-binary', 'prefer-not-to-say', '']).optional(),
  education: z.string().trim().max(100).optional(),
  primaryOS: OS,
  usageFrequency: perOS(freq),
  familiarity: perOS(rating),
  yearsOfExperience: z.coerce.number().min(0).max(80),
});

export const listParticipants = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const { search, primaryOS } = req.query;

  const userFilter = { role: 'participant' };
  if (search) {
    const rx = new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    userFilter.$or = [{ name: rx }, { email: rx }, { participantCode: rx }];
  }
  if (primaryOS) {
    const ids = await ParticipantProfile.find({ primaryOS: String(primaryOS) }).distinct('userId');
    userFilter._id = { $in: ids };
  }

  const [users, total] = await Promise.all([
    User.find(userFilter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(userFilter),
  ]);
  const profiles = await ParticipantProfile.find({ userId: { $in: users.map((u) => u._id) } });
  const byUser = new Map(profiles.map((p) => [String(p.userId), p]));

  res.json({
    success: true,
    data: users.map((u) => ({ ...u.toJSON(), profile: byUser.get(String(u._id)) || null })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

export const getParticipant = asyncHandler(async (req, res) => {
  const user = await User.findOne({ _id: req.params.id, role: 'participant' });
  if (!user) throw new ApiError(404, 'Participant not found');
  const profile = await ParticipantProfile.findOne({ userId: user._id });
  res.json({
    success: true,
    data: {
      user,
      profile,
      recommendedSequence: profile?.surveyCompleted ? recommendSequence(profile) : null,
    },
  });
});

export const updateProfile = asyncHandler(async (req, res) => {
  const user = await User.findOne({ _id: req.params.id, role: 'participant' });
  if (!user) throw new ApiError(404, 'Participant not found');
  const profile = await ParticipantProfile.findOneAndUpdate(
    { userId: user._id },
    { ...req.body, userId: user._id, surveyCompleted: true },
    { new: true, upsert: true, runValidators: true }
  );
  await audit(req, 'participant.profile.update', 'ParticipantProfile', profile._id);
  res.json({ success: true, data: profile, recommendedSequence: recommendSequence(profile) });
});

export const getProgress = asyncHandler(async (req, res) => {
  const profile = await ParticipantProfile.findOne({ userId: req.params.id });
  const assignments = await ExperimentAssignment.find({ participantId: req.params.id }).populate('experimentId', 'title status showResultsToParticipants');
  // Completed means every assigned task was done; stopping early is reported as such with the real counts.
  const withStats = await Promise.all(assignments.map(async (a) => {
    const expId = a.experimentId?._id;
    const [total, done] = await Promise.all([
      a.assignedTaskIds?.length ? a.assignedTaskIds.length : Task.countDocuments({ experimentId: expId, active: true, operatingSystem: { $in: a.assignedOSSequence } }),
      TaskResult.countDocuments({ experimentId: expId, participantId: a.participantId, completedAt: { $ne: null } }),
    ]);
    return { ...a.toJSON(), taskStats: { total, done, finishedEarly: a.status === 'completed' && done < total } };
  }));
  res.json({
    success: true,
    data: { surveyCompleted: !!profile?.surveyCompleted, assignments: withStats },
  });
});
