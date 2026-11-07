import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;
const OS = ['windows', 'macos', 'linux'];

const susSchema = new mongoose.Schema(
  {
    participantId: { type: ObjectId, ref: 'User', required: true },
    experimentId: { type: ObjectId, ref: 'Experiment', required: true },
    operatingSystem: { type: String, enum: OS, required: true },
    responses: {
      type: [Number],
      validate: {
        validator: (v) => v.length === 10 && v.every((n) => Number.isInteger(n) && n >= 1 && n <= 5),
        message: 'SUS requires 10 integer responses between 1 and 5',
      },
    },
    susScore: { type: Number, min: 0, max: 100 },
    submittedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
susSchema.index({ participantId: 1, experimentId: 1, operatingSystem: 1 }, { unique: true });

export const SusResponse = mongoose.model('SusResponse', susSchema);

const reportSchema = new mongoose.Schema(
  {
    experimentId: { type: ObjectId, ref: 'Experiment', required: true },
    participantId: { type: ObjectId, ref: 'User' },
    reportType: { type: String, enum: ['participant', 'experiment'], required: true },
    generatedBy: { type: ObjectId, ref: 'User' },
    generatedAt: { type: Date, default: Date.now },
    reportUrl: String,
  },
  { timestamps: true }
);

export const ExperimentReport = mongoose.model('ExperimentReport', reportSchema);

const consentSchema = new mongoose.Schema(
  {
    participantId: { type: ObjectId, ref: 'User', required: true },
    experimentId: { type: ObjectId, ref: 'Experiment' },
    consentVersion: { type: String, required: true },
    consentStatus: { type: String, enum: ['granted', 'withdrawn'], required: true },
    cameraConsent: { type: Boolean, default: false },
    screenConsent: { type: Boolean, default: false }, // one downscaled still of the participant's screen per task
    consentTimestamp: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
consentSchema.index({ participantId: 1, experimentId: 1, consentVersion: 1 });

export const ConsentRecord = mongoose.model('ConsentRecord', consentSchema);

const auditSchema = new mongoose.Schema(
  {
    actorId: { type: ObjectId, ref: 'User', index: true },
    action: { type: String, required: true },
    targetType: String,
    targetId: String,
    ip: String,
    meta: mongoose.Schema.Types.Mixed,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const AuditLog = mongoose.model('AuditLog', auditSchema);
