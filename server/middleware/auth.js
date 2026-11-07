import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { env } from '../config/env.js';
import { ApiError, asyncHandler } from '../utils/helpers.js';

export const authenticate = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new ApiError(401, 'Authentication required');

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch (err) {
    throw new ApiError(401, err.name === 'TokenExpiredError' ? 'Session expired' : 'Invalid token');
  }
  const user = await User.findById(payload.sub);
  if (!user || !user.active) throw new ApiError(401, 'Account not available');
  req.user = user;
  next();
});

export const authorize = (...roles) => (req, _res, next) => {
  if (!req.user || !roles.includes(req.user.role)) return next(new ApiError(403, 'Forbidden'));
  next();
};

// Participants may only act on their own id; researchers may act on any.
export const selfOrResearcher = (param = 'id') => (req, _res, next) => {
  if (req.user.role === 'researcher' || String(req.user._id) === req.params[param]) return next();
  next(new ApiError(403, 'Forbidden'));
};
