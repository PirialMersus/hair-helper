import mongoose from 'mongoose';

const appointmentSchema = new mongoose.Schema(
  {
    masterId: { type: String, required: true, index: true },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null },
    clientName: { type: String, required: true },
    dateTime: { type: Date, required: true },
    serviceType: { type: String, default: '' },
  },
  { timestamps: true }
);

appointmentSchema.index({ masterId: 1, dateTime: 1 });

export const AppointmentModel = mongoose.model('Appointment', appointmentSchema);
