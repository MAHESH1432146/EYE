import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import { createApp } from './app.js';

try {
  await connectDB();
  createApp().listen(env.port, () => console.log(`API listening on :${env.port}`));
} catch (err) {
  console.error('Startup failed:', err.message);
  process.exit(1);
}
