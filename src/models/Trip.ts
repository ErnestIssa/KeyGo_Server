import mongoose, { Schema, Document, Types } from 'mongoose';

export type TripStatus = 'pending' | 'accepted' | 'completed';

/** After accept: car stays with owner until handoff; after driver starts relocation, car moves with driver. */
export type RelocationPhase = 'awaiting_handoff' | 'in_transit';

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
  /** Owner device GPS (car location before handoff; person after). */
  ownerLiveLocation?: IVehicleLocation;
  /** Driver device GPS (person before handoff; car after). */
  driverLiveLocation?: IVehicleLocation;
  /** Set when status becomes `accepted`; driver moves to `in_transit` when relocation underway. */
  relocationPhase?: RelocationPhase;
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
    ownerLiveLocation: { type: VehicleLocationSchema },
    driverLiveLocation: { type: VehicleLocationSchema },
    relocationPhase: {
      type: String,
      enum: ['awaiting_handoff', 'in_transit'],
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
