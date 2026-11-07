import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { validate } from '../middleware/error.js';
import { authenticate } from '../middleware/auth.js';
import * as c from '../controllers/authController.js';

const router = Router();
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });

router.post('/register', authLimiter, validate(c.registerSchema), c.register);
router.post('/login', authLimiter, validate(c.loginSchema), c.login);
router.post('/forgot-password', authLimiter, validate(c.forgotSchema), c.forgotPassword);
router.post('/reset-password', authLimiter, validate(c.resetSchema), c.resetPassword);
router.get('/me', authenticate, c.me);

export default router;
