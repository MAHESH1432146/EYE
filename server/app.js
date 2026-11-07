import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { notFound, errorHandler } from './middleware/error.js';
import authRoutes from './routes/authRoutes.js';
import participantRoutes from './routes/participantRoutes.js';
import { experimentRouter, taskRouter, assignmentRouter } from './routes/experimentRoutes.js';
import { runExperimentRouter, runTaskRouter } from './routes/runRoutes.js';
import gazeRoutes from './routes/gazeRoutes.js';
import susRoutes from './routes/susRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import adminRoutes from './routes/adminRoutes.js';

export function createApp() {
  const app = express();
  // With client/dist built, the API also serves the web app, so one HTTPS URL is all participants need.
  const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../client/dist');
  const serveClient = env.nodeEnv !== 'test' && fs.existsSync(path.join(distDir, 'index.html'));
  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' }, contentSecurityPolicy: serveClient ? false : undefined }));
  app.use(cors({ origin: env.clientUrl }));
  app.use(express.json({ limit: '2mb' }));
  if (env.nodeEnv !== 'test') app.use(morgan('dev'));
  app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false }));

  app.get('/api/health', (_req, res) => res.json({ success: true, status: 'ok' }));
  app.use('/api/auth', authRoutes);
  app.use('/api/participants', participantRoutes);
  app.use('/api/experiments', runExperimentRouter);
  app.use('/api/tasks', runTaskRouter);
  app.use('/api/experiments', experimentRouter);
  app.use('/api/tasks', taskRouter);
  app.use('/api/assignments', assignmentRouter);
  app.use('/api/gaze', gazeRoutes);
  app.use('/api/sus', susRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/admin', adminRoutes);

  if (serveClient) {
    app.use(express.static(distDir));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
