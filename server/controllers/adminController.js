import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import User from '../models/User.js';
import ParticipantProfile from '../models/ParticipantProfile.js';
import { Experiment, ExperimentAssignment } from '../models/Experiment.js';
import { TaskResult, GazeRecord, EyeTrackingMetric } from '../models/TaskData.js';
import { SusResponse, ConsentRecord, AuditLog, ExperimentReport } from '../models/Sus.js';
import ScreenSnapshot from '../models/ScreenSnapshot.js';
import { ApiError, asId, asyncHandler, parsePagination } from '../utils/helpers.js';
import { audit } from '../utils/audit.js';

export const activeSchema = z.object({ active: z.boolean() });
export const anonymizeSchema = z.object({ confirm: z.literal('ANONYMIZE') });
export const deleteSchema = z.object({ confirm: z.string().min(1) });

const escapeRx = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const listUsers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = {};
  if (req.query.role === 'researcher' || req.query.role === 'participant') filter.role = req.query.role;
  if (req.query.search) {
    const rx = new RegExp(escapeRx(req.query.search), 'i');
    filter.$or = [{ name: rx }, { email: rx }, { participantCode: rx }];
  }
  const [data, total] = await Promise.all([User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit), User.countDocuments(filter)]);
  res.json({ success: true, data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

export const setActive = asyncHandler(async (req, res) => {
  const id = asId(req.params.id);
  if (id === String(req.user._id)) throw new ApiError(400, 'You cannot change your own status');
  const user = await User.findByIdAndUpdate(id, { active: req.body.active }, { new: true });
  if (!user) throw new ApiError(404, 'User not found');
  await audit(req, req.body.active ? 'user.activate' : 'user.deactivate', 'User', id);
  res.json({ success: true, data: user });
});

// A researcher may only erase/anonymise participants that took part solely in their own experiments.
export async function assertManageable(req, participantId) {
  const user = await User.findOne({ _id: participantId, role: 'participant' });
  if (!user) throw new ApiError(404, 'Participant not found');
  if (req.user.role === 'participant') {
    if (String(req.user._id) !== participantId) throw new ApiError(403, 'Forbidden');
    return user;
  }
  const exps = await ExperimentAssignment.find({ participantId }).distinct('experimentId');
  const foreign = await Experiment.countDocuments({ _id: { $in: exps }, researcherId: { $ne: req.user._id } });
  if (foreign) throw new ApiError(403, 'Participant also took part in another researcher\'s experiment');
  return user;
}

// Personal identifiers are removed; results stay linked by id for scientific integrity.
export async function anonymizeParticipant(req, user) {
  const placeholder = crypto.randomBytes(24).toString('hex');
  user.name = 'Anonymized participant';
  user.email = `anonymized-${user._id}@anonymized.invalid`;
  user.passwordHash = await bcrypt.hash(placeholder, 10);
  user.resetTokenHash = undefined;
  user.resetTokenExpires = undefined;
  user.active = false;
  user.anonymizedAt = new Date();
  await user.save();
  await ParticipantProfile.updateOne({ userId: user._id }, { $unset: { age: '', gender: '', education: '' } });
  await ConsentRecord.create({ participantId: user._id, consentVersion: 'withdrawal', consentStatus: 'withdrawn', cameraConsent: false });
  await audit(req, 'participant.anonymize', 'User', user._id);
}

export const anonymize = asyncHandler(async (req, res) => {
  const user = await assertManageable(req, asId(req.params.id));
  await anonymizeParticipant(req, user);
  res.json({ success: true });
});

export const deleteParticipantData = asyncHandler(async (req, res) => {
  const id = asId(req.params.id);
  const user = await assertManageable(req, id);
  if (req.body.confirm !== user.participantCode) throw new ApiError(400, 'Confirmation must equal the participant ID');
  await Promise.all([
    TaskResult.deleteMany({ participantId: id }), GazeRecord.deleteMany({ participantId: id }), EyeTrackingMetric.deleteMany({ participantId: id }),
    SusResponse.deleteMany({ participantId: id }), ConsentRecord.deleteMany({ participantId: id }), ExperimentAssignment.deleteMany({ participantId: id }),
    ExperimentReport.deleteMany({ participantId: id }), ParticipantProfile.deleteMany({ userId: id }), ScreenSnapshot.deleteMany({ participantId: id }),
  ]);
  await user.deleteOne();
  await audit(req, 'participant.delete', 'User', id, { code: user.participantCode });
  res.json({ success: true });
});

export const auditLogs = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, 50);
  const filter = {};
  if (req.query.action) filter.action = new RegExp(`^${escapeRx(req.query.action)}`);
  if (req.query.actorId) filter.actorId = asId(req.query.actorId, 'actorId');
  const [data, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('actorId', 'name email role').lean(),
    AuditLog.countDocuments(filter),
  ]);
  res.json({ success: true, data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

export const incompleteSessions = asyncHandler(async (req, res) => {
  const mine = await Experiment.find({ researcherId: req.user._id }).select('title');
  const titles = new Map(mine.map((e) => [String(e._id), e.title]));
  const data = await ExperimentAssignment.find({ experimentId: { $in: mine.map((e) => e._id) }, status: { $in: ['assigned', 'in_progress', 'reopened'] } })
    .populate('participantId', 'name participantCode').sort({ updatedAt: -1 }).lean();
  res.json({ success: true, data: data.map((a) => ({ ...a, experimentTitle: titles.get(String(a.experimentId)) })) });
});
