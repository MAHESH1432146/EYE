import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;
const OS = ['windows', 'macos', 'linux'];

// Tasks are instructions only: participants perform them on their own computer.
const taskSchema = new mongoose.Schema(
  {
    experimentId: { type: ObjectId, ref: 'Experiment', required: true },
    operatingSystem: { type: String, enum: OS, required: true },
    taskNumber: { type: Number, min: 1, max: 100, required: true },
    instruction: { type: String, required: true, maxlength: 500 },
    category: { type: String, default: '' },
    timeLimit: { type: Number, default: 120, min: 10 }, // seconds; the task ends automatically at the limit
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
    // Application the participant must open (desktop app only): match is a list of case-insensitive substrings tested
    // against the active window's app name, title and path.
    targetApp: { match: { type: [String], default: [] } },
    // Optional on-screen region (fractions of the participant's calibrated display) used for TTFF and revisits.
    targetRegion: { x: { type: Number, min: 0, max: 1 }, y: { type: Number, min: 0, max: 1 }, width: { type: Number, min: 0, max: 1 }, height: { type: Number, min: 0, max: 1 } },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);
taskSchema.index({ experimentId: 1, operatingSystem: 1, taskNumber: 1 }, { unique: true });

export default mongoose.model('Task', taskSchema);
