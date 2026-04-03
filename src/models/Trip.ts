import mongoose, { Schema, Document, Types } from 'mongoose';

export type TripStatus = 'pending' | 'accepted' | 'completed';

export interface IVehicleLocation {
  latitude: number;
  longitude: number;
  heading?: number;
  recordedAt: Date;
}

export interface ITrip extends Document {
  owner: Types.ObjectId;
  pickupLocation: string;
  dropoffLocation: string;
  /** Optional WGS84 — set from geocoding or client Mapbox picker. */
  pickupLatitude?: number;
  pickupLongitude?: number;
  dropoffLatitude?: number;
  dropoffLongitude?: number;
  /** Assigned driver’s last reported position for in-trip tracking. */
  vehicleLocation?: IVehicleLocation;
  carDescription: string;
  paymentAmount: number;
  status: TripStatus;
  driver?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const VehicleLocationSchema = new Schema(
  {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    heading: { type: Number },
    recordedAt: { type: Date, required: true },
  },
  { _id: false }
);

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
    pickupLatitude: { type: Number },
    pickupLongitude: { type: Number },
    dropoffLatitude: { type: Number },
    dropoffLongitude: { type: Number },
    vehicleLocation: { type: VehicleLocationSchema },
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
