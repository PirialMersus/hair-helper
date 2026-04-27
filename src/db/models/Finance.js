import mongoose from 'mongoose';

const financeSchema = new mongoose.Schema(
  {
    masterId: { type: String, required: true, index: true },
    amount: { type: Number, required: true },
    type: { type: String, enum: ['income', 'expense'], required: true },
    category: { type: String, default: '' },
    date: { type: Date, default: () => new Date() },
  },
  { timestamps: true }
);

financeSchema.index({ masterId: 1, date: -1 });

export const FinanceModel = mongoose.model('Finance', financeSchema);
