import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;
const OS = ['windows', 'macos', 'linux'];

const experimentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '', maxlength: 5000 },
    researcherId: { type: ObjectId, ref: 'User', required: true, index: true },
    operatingSystems: { type: [{ type: String, enum: OS }], default: OS },
    status: { type: String, enum: ['draft', 'active', 'in_progress', 'completed', 'archived'], default: 'draft', index: true },
    taskCount: { type: Number, default: 0 },
    durationMinutes: { type: Number, min: 1 },
    eyeTrackingEnabled: { type: Boolean, default: true },
    showResultsToParticipants: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const Experiment = mongoose.model('Experiment', experimentSchema);

const assignmentSchema = new mongoose.Schema(
  {
    experimentId: { type: ObjectId, ref: 'Experiment', required: true },
    participantId: { type: ObjectId, ref: 'User', required: true },
    assignedOSSequence: { type: [{ type: String, enum: OS }], default: [] },
    assignedTaskIds: { type: [{ type: ObjectId, ref: 'Task' }], default: [] }, // empty = every active task for the participant's OS
    skippedTaskIds: { type: [{ type: ObjectId, ref: 'Task' }], default: [] }, // tasks the participant chose not to do (finished early)
    sequenceOverridden: { type: Boolean, default: false },
    calibrationQuality: { type: Number, min: 0, max: 1 },
    osCheck: {
      selectedOS: { type: String, enum: OS },
      detectedOS: { type: String, enum: OS },
      matched: { type: Boolean, default: false },
      checkedAt: Date,
    },
    status: { type: String, enum: ['assigned', 'in_progress', 'completed', 'reopened'], default: 'assigned' },
    progress: { type: Map, of: Boolean, default: {} }, // e.g. survey, calibration, windows_tasks, windows_sus
    startedAt: Date,
    completedAt: Date,
  },
  { timestamps: true }
);
assignmentSchema.index({ experimentId: 1, participantId: 1 }, { unique: true });

export const ExperimentAssignment = mongoose.model('ExperimentAssignment', assignmentSchema);
