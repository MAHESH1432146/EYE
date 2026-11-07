import bcrypt from 'bcryptjs';
import { connectDB } from '../config/db.js';
import User from '../models/User.js';
import mongoose from 'mongoose';

const email = (process.env.SEED_RESEARCHER_EMAIL || '').toLowerCase();
const pw = process.env.SEED_RESEARCHER_PASSWORD;
if (!email || !pw) {
  console.error('Set SEED_RESEARCHER_EMAIL and SEED_RESEARCHER_PASSWORD');
  process.exit(1);
}

await connectDB();
if (await User.exists({ email })) {
  console.log('Researcher already exists');
} else {
  await User.create({ name: 'Researcher', email, role: 'researcher', passwordHash: await bcrypt.hash(pw, 12) });
  console.log(`Researcher created: ${email}`);
}
await mongoose.disconnect();
