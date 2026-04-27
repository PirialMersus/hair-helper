import mongoose from 'mongoose';

const needSchema = new mongoose.Schema(
  {
    masterId: { type: String, required: true, index: true },
    text: { type: String, required: true },
  },
  { timestamps: true }
);

export const NeedModel = mongoose.model('Need', needSchema);
