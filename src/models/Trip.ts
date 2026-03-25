import mongoose, { Schema, Document, Types } from 'mongoose';

export type TripStatus = 'pending' | 'accepted' | 'completed';

export interface ITrip extends Document {
  owner: Types.ObjectId;
  pickupLocation: string;
  dropoffLocation: string;
  carDescription: string;
  paymentAmount: number;
  status: TripStatus;
  driver?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const TripSchema: Schema = new Schema(
  {
    owner: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    pickupLocation: {
      type: String,
      required: true,
      trim: true,
    },
    dropoffLocation: {
      type: String,
      required: true,
      trim: true,
    },
    carDescription: {
      type: String,
      required: true,
      trim: true,
    },
    paymentAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'completed'],
      default: 'pending',
    },
    driver: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<ITrip>('Trip', TripSchema);
