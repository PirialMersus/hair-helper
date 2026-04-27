import mongoose from 'mongoose';

const visitHistoryEntrySchema = new mongoose.Schema(
  {
    date: { type: Date, default: () => new Date() },
    recipe: { type: String, default: '' },
    photoBefore: { type: String, default: null },
    photoAfter: { type: String, default: null },
    comment: { type: String, default: '' },
  },
  { _id: true }
);

const clientSchema = new mongoose.Schema(
  {
    masterId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    phone: { type: String, default: null },
    tags: [{ type: String }],
    visitHistory: [visitHistoryEntrySchema],
  },
  { timestamps: true }
);

clientSchema.index({ masterId: 1, updatedAt: -1 });
clientSchema.index({ masterId: 1, name: 1 });

export const ClientModel = mongoose.model('Client', clientSchema);
