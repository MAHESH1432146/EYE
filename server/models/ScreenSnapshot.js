import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

// One downscaled JPEG still of the participant's screen per task (never video); stored only with screen consent.
const snapshotSchema = new mongoose.Schema(
  {
    experimentId: { type: ObjectId, ref: 'Experiment', required: true },
    participantId: { type: ObjectId, ref: 'User', required: true },
    taskId: { type: ObjectId, ref: 'Task', required: true },
    data: { type: Buffer, required: true },
    width: Number,
    height: Number,
  },
  { timestamps: true }
);
snapshotSchema.index({ participantId: 1, taskId: 1 }, { unique: true });

export default mongoose.model('ScreenSnapshot', snapshotSchema);
