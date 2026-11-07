// One-off: gives tasks that have no target application the default rules for their OS, inferred from the instruction wording.
// Usage (API running in trial mode): node scripts/backfillTargets.js [mongodb-uri]
import mongoose from 'mongoose';
import Task from '../models/Task.js';
import { APP_TARGETS, inferTargetKey } from '../services/defaultTasks.js';

await mongoose.connect(process.argv[2] || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27018/force_of_habit');
let changed = 0;
for (const t of await Task.find({ $or: [{ 'targetApp.match': { $exists: false } }, { 'targetApp.match': { $size: 0 } }] })) {
  const key = inferTargetKey(t.instruction);
  if (!key) continue;
  t.targetApp = { match: APP_TARGETS[key][t.operatingSystem] };
  await t.save();
  changed += 1;
  console.log(`Task ${t.taskNumber} (${t.operatingSystem}) "${t.instruction}" -> ${key}`);
}
console.log(`${changed} task(s) updated`);
await mongoose.disconnect();
