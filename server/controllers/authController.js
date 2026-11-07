import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import User from '../models/User.js';
import { env } from '../config/env.js';
import { ApiError, asyncHandler } from '../utils/helpers.js';
import { audit } from '../utils/audit.js';

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a number');

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email(),
  password,
  age: z.coerce.number().int().min(10).max(120).optional().or(z.literal('').transform(() => undefined)),
  role: z.enum(['participant', 'researcher']).default('participant'),
  inviteCode: z.string().optional(),
});
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
  remember: z.boolean().optional(),
});
export const forgotSchema = z.object({ email: z.string().trim().toLowerCase().email() });
export const resetSchema = z.object({ token: z.string().min(10), password });

const signToken = (user, remember) =>
  jwt.sign({ sub: String(user._id), role: user.role }, env.jwtSecret, { expiresIn: remember ? '7d' : env.jwtExpiresIn });

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function safeEqual(a, b) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export const register = asyncHandler(async (req, res) => {
  const { name, email, password: pw, role, inviteCode, age } = req.body;

  if (role === 'researcher') {
    if (!env.researcherInviteCode || !inviteCode || !safeEqual(inviteCode, env.researcherInviteCode)) {
      throw new ApiError(403, 'A valid researcher invite code is required');
    }
  }
  if (await User.exists({ email })) throw new ApiError(409, 'Email already registered');

  const user = await User.create({
    name,
    email,
    passwordHash: await bcrypt.hash(pw, 12),
    role,
    participantCode: role === 'participant' ? `P-${crypto.randomBytes(3).toString('hex').toUpperCase()}` : undefined,
  });

  if (role === 'participant') {
    const ParticipantProfile = (await import('../models/ParticipantProfile.js')).default;
    await ParticipantProfile.create({ userId: user._id, age });
  }

  req.user = user;
  await audit(req, 'auth.register', 'User', user._id, { role });
  res.status(201).json({ success: true, token: signToken(user), user });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password: pw, remember } = req.body;
  const user = await User.findOne({ email }).select('+passwordHash');
  // Same error for unknown email / wrong password to avoid account enumeration.
  const ok = user && user.active && (await bcrypt.compare(pw, user.passwordHash));
  if (!ok) throw new ApiError(401, 'Invalid email or password');
  req.user = user;
  await audit(req, 'auth.login', 'User', user._id);
  res.json({ success: true, token: signToken(user, remember), user });
});

export const me = asyncHandler(async (req, res) => {
  res.json({ success: true, user: req.user });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: req.body.email });
  let devToken;
  if (user && user.active) {
    const token = crypto.randomBytes(32).toString('hex');
    user.resetTokenHash = sha256(token);
    user.resetTokenExpires = new Date(Date.now() + 30 * 60 * 1000);
    await user.save();
    // No mail service is configured; the token is only returned outside production.
    if (env.nodeEnv !== 'production') devToken = token;
  }
  res.json({
    success: true,
    message: 'If that email exists, a reset link has been generated.',
    ...(devToken && { devResetToken: devToken }),
  });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const user = await User.findOne({
    resetTokenHash: sha256(req.body.token),
    resetTokenExpires: { $gt: new Date() },
  }).select('+resetTokenHash +resetTokenExpires');
  if (!user) throw new ApiError(400, 'Reset token is invalid or has expired');

  user.passwordHash = await bcrypt.hash(req.body.password, 12);
  user.resetTokenHash = undefined;
  user.resetTokenExpires = undefined;
  await user.save();
  res.json({ success: true, message: 'Password updated' });
});
