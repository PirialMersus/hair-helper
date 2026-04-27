import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema(
  {
    masterId: { type: String, required: true, unique: true, index: true },
    step: {
      type: String,
      enum: [
        'IDLE',
        'CLIENT_CARD_OPEN',
        'AWAIT_CLIENT_NAME',
        'AWAIT_CLIENT_PHONE',
        'AWAIT_INCOME',
        'AWAIT_EXPENSE',
        'AWAIT_NEED',
        'AWAIT_PHOTO_ATTACHMENT',
      ],
      default: 'IDLE',
    },
    activeClientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null },
    pendingPhotoFileId: { type: String, default: null },
    activeDate: { type: Date, default: () => new Date() },
    pendingActions: { type: Array, default: [] },
  },
  { timestamps: true }
);

export const SessionModel = mongoose.model('Session', sessionSchema);
