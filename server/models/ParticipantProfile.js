import mongoose from 'mongoose';

const freq = ['daily', 'weekly', 'monthly', 'rarely', 'never'];
const osField = { type: Number, min: 1, max: 5 };

const participantProfileSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    age: { type: Number, min: 10, max: 120 },
    gender: { type: String, enum: ['female', 'male', 'non-binary', 'prefer-not-to-say', ''], default: '' },
    education: { type: String, trim: true, maxlength: 100, default: '' },
    primaryOS: { type: String, enum: ['windows', 'macos', 'linux'] },
    usageFrequency: {
      windows: { type: String, enum: freq },
      macos: { type: String, enum: freq },
      linux: { type: String, enum: freq },
    },
    familiarity: { windows: osField, macos: osField, linux: osField },
    yearsOfExperience: { type: Number, min: 0, max: 80 },
    surveyCompleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model('ParticipantProfile', participantProfileSchema);
