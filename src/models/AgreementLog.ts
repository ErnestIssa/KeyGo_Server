import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IAgreementLog extends Document {
  carRequest: Types.ObjectId;
  requester: Types.ObjectId;
  driver: Types.ObjectId;
  agreementType: 'liability_acknowledgment' | 'terms_acceptance' | 'driver_selection';
  consentText: string;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
  createdAt: Date;
}

const AgreementLogSchema: Schema = new Schema(
  {
    carRequest: {
      type: Schema.Types.ObjectId,
      ref: 'CarRequest',
      required: true,
    },
    requester: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    driver: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    agreementType: {
      type: String,
      enum: ['liability_acknowledgment', 'terms_acceptance', 'driver_selection'],
      required: true,
    },
    consentText: {
      type: String,
      required: true,
    },
    ipAddress: {
      type: String,
    },
    userAgent: {
      type: String,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IAgreementLog>('AgreementLog', AgreementLogSchema);

