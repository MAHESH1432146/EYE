import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;
const OS = ['windows', 'macos', 'linux'];

const taskResultSchema = new mongoose.Schema(
  {
    experimentId: { type: ObjectId, ref: 'Experiment', required: true },
    participantId: { type: ObjectId, ref: 'User', required: true },
    taskId: { type: ObjectId, ref: 'Task', required: true },
    operatingSystem: { type: String, enum: OS, required: true },
    startedAt: { type: Date, required: true },
    completedAt: Date,
    completionTime: Number, // ms; null until finished
    isCorrect: { type: Boolean, default: false }, // self-reported: the participant said they completed the task
    // Automatic check against the active-window timeline reported by the desktop app; never inferred from the browser alone.
    verification: {
      status: { type: String, enum: ['verified', 'not_detected', 'unavailable', 'not_verifiable'], default: 'not_verifiable' },
      matchedApp: String,
      firstMatchedMs: Number,
    },
    attempts: { type: Number, default: 0 },
    incorrectAttempts: { type: Number, default: 0 },
    timedOut: { type: Boolean, default: false },
    endedEarly: { type: Boolean, default: false }, // participant pressed End Task
    // Target-application sessions seen by the desktop app; closing the app is never treated as completing the task.
    activity: {
      detection: { type: String, enum: ['desktop', 'manual'] },
      sessions: [{ _id: false, startMs: Number, endMs: Number, durationMs: Number, app: String }],
      sessionCount: Number,
      events: [{ _id: false, at: Date, kind: String, app: String, pid: Number, title: String, path: String, alreadyRunning: Boolean }], // from the OS-level monitor
      totalMs: Number,
      closedAtEnd: Boolean, // target application was closed when the task ended
    },
  },
  { timestamps: true }
);
taskResultSchema.index({ participantId: 1, taskId: 1 }, { unique: true });
taskResultSchema.index({ experimentId: 1, operatingSystem: 1 });

export const TaskResult = mongoose.model('TaskResult', taskResultSchema);

const gazeRecordSchema = new mongoose.Schema(
  {
    experimentId: { type: ObjectId, ref: 'Experiment', required: true },
    participantId: { type: ObjectId, ref: 'User', required: true },
    taskId: { type: ObjectId, ref: 'Task', required: true },
    operatingSystem: { type: String, enum: OS, required: true },
    // t: ms since stimulus onset, x/y normalised 0..1 of the stimulus, c: confidence (optional)
    gazeSamples: [{ _id: false, t: Number, x: Number, y: Number, c: Number }],
    blinks: [{ _id: false, t: Number, d: Number }], // t: onset ms since stimulus, d: closed duration ms
    faceLostMs: { type: Number, default: 0 }, // time the face or eyes were not detected
    // Calibrated display (DIP): gaze x/y are fractions of it, so global position = display origin + fraction * size.
    display: { id: Number, x: Number, y: Number, width: Number, height: Number, scaleFactor: Number },
    // Active-window timeline from the desktop app; b = [x, y, width, height] in global DIP coordinates.
    appEvents: [{ _id: false, t: Number, app: String, title: String, path: String, b: [Number] }],
    // Recorded gaps in tracking (never filled with invented data).
    interruptions: [{ _id: false, t: Number, d: Number, reason: String }],
    environment: { source: { type: String, enum: ['browser', 'desktop', 'agent'], default: 'browser' }, platform: String, appVersion: String },
    calibrationQuality: Number,
    recordingStatus: { type: String, enum: ['recording', 'complete', 'insufficient'], default: 'recording' },
    samplingRateHz: Number,
  },
  { timestamps: true }
);
gazeRecordSchema.index({ participantId: 1, taskId: 1 }, { unique: true });

export const GazeRecord = mongoose.model('GazeRecord', gazeRecordSchema);

const metricsSchema = new mongoose.Schema(
  {
    experimentId: { type: ObjectId, ref: 'Experiment', required: true },
    participantId: { type: ObjectId, ref: 'User', required: true },
    taskId: { type: ObjectId, ref: 'Task', required: true },
    operatingSystem: { type: String, enum: OS, required: true },
    // null = unavailable (insufficient data); 0 is a real measured zero
    ttff: { type: Number, default: null },
    fixationCount: { type: Number, default: null },
    dwellTime: { type: Number, default: null },
    revisitCount: { type: Number, default: null },
    totalFixations: { type: Number, default: null },
    totalRevisits: { type: Number, default: null }, // returns to any previously viewed screen region
    interruptedMs: { type: Number, default: null },
    targetKind: { type: String, enum: ['app', 'region', 'none'], default: 'none' },
    totalDwell: { type: Number, default: null },
    avgFixationDuration: { type: Number, default: null },
    blinkCount: { type: Number, default: null },
    blinkRate: { type: Number, default: null }, // blinks per minute of tracked time
    trackedMs: { type: Number, default: null },
    faceLostMs: { type: Number, default: null },
    regions: { type: mongoose.Schema.Types.Mixed, default: null }, // per-cell fixation count and dwell on a grid over the stimulus
    dataQuality: { type: String, enum: ['good', 'fair', 'poor', 'unavailable'], default: 'unavailable' },
  },
  { timestamps: true }
);
metricsSchema.index({ participantId: 1, taskId: 1 }, { unique: true });

export const EyeTrackingMetric = mongoose.model('EyeTrackingMetric', metricsSchema);
