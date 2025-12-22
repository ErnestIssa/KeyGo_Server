import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ICarRequest extends Document {
  requester: Types.ObjectId;
  title: string;
  description: string;
  pickupLocation: {
    address: string;
    city: string;
    postalCode: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
  };
  deliveryLocation: {
    address: string;
    city: string;
    postalCode: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
  };
  preferredDate?: Date;
  carDetails: {
    make: string;
    model: string;
    year?: number;
    licensePlate?: string;
  };
  insurance?: {
    provider?: string;
    policyNumber?: string;
  };
  deductible?: number;
  status: 'open' | 'in_progress' | 'completed' | 'cancelled';
  interestedDrivers: Types.ObjectId[];
  selectedDriver?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CarRequestSchema: Schema = new Schema(
  {
    requester: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    pickupLocation: {
      address: { type: String, required: true },
      city: { type: String, required: true },
      postalCode: { type: String, required: true },
      coordinates: {
        lat: { type: Number },
        lng: { type: Number },
      },
    },
    deliveryLocation: {
      address: { type: String, required: true },
      city: { type: String, required: true },
      postalCode: { type: String, required: true },
      coordinates: {
        lat: { type: Number },
        lng: { type: Number },
      },
    },
    preferredDate: {
      type: Date,
    },
    carDetails: {
      make: { type: String, required: true },
      model: { type: String, required: true },
      year: { type: Number },
      licensePlate: { type: String },
    },
    insurance: {
      provider: { type: String },
      policyNumber: { type: String },
    },
    deductible: {
      type: Number,
    },
    status: {
      type: String,
      enum: ['open', 'in_progress', 'completed', 'cancelled'],
      default: 'open',
    },
    interestedDrivers: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    selectedDriver: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<ICarRequest>('CarRequest', CarRequestSchema);

