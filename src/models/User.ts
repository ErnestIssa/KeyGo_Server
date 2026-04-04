import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  email: string;
  password: string;
  name: string;
  /** Given name(s); optional for legacy accounts (derived from `name` in API). */
  firstName?: string;
  /** Family name(s); optional for legacy accounts. */
  lastName?: string;
  role: 'owner' | 'driver' | 'admin';
  /** Only used for role === driver. Owners/admins are treated as approved for trip actions. */
  driverApproved: boolean;
  /** Public path served from API origin, e.g. /uploads/avatars/<id>.jpg */
  avatarUrl?: string;
  /** Display rating 0–5 (e.g. from reviews); defaults in API response when unset. */
  ratingAverage?: number;
  /** Expo push token for remote notifications (mobile). */
  expoPushToken?: string;
  /** User can disable push from app settings. */
  notificationsEnabled?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema: Schema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    firstName: {
      type: String,
      trim: true,
    },
    lastName: {
      type: String,
      trim: true,
    },
    role: {
      type: String,
      enum: ['owner', 'driver', 'admin'],
      required: true,
    },
    driverApproved: {
      type: Boolean,
      default: true,
    },
    avatarUrl: {
      type: String,
      trim: true,
    },
    ratingAverage: {
      type: Number,
      min: 0,
      max: 5,
    },
    expoPushToken: {
      type: String,
      trim: true,
    },
    notificationsEnabled: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IUser>('User', UserSchema);
