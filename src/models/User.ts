import mongoose, { Schema, Document } from 'mongoose';
import { DEFAULT_APP_SETTINGS } from './userSettings';

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
  /** E.164 or local digits; collected at signup for contact / calls. */
  phone?: string;
  /** Expo push token for remote notifications (mobile). */
  expoPushToken?: string;
  /** User can disable push from app settings. */
  notificationsEnabled?: boolean;
  /** Personal vs business account (dealers, fleets, etc.). */
  accountKind?: 'individual' | 'organization';
  /** Business display name when accountKind === organization. */
  organizationName?: string;
  /** e.g. dealer, fleet, rental — free text. */
  organizationType?: string;
  /** Mailing / handoff address — all optional until user fills profile. */
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    region?: string;
    postalCode?: string;
    country?: string;
  };
  /** App preferences — merged with defaults in API. */
  appSettings?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const AddressSchema = new Schema(
  {
    line1: { type: String, trim: true },
    line2: { type: String, trim: true },
    city: { type: String, trim: true },
    region: { type: String, trim: true },
    postalCode: { type: String, trim: true },
    country: { type: String, trim: true },
  },
  { _id: false }
);

const AppSettingsSchema = new Schema(
  {
    privacy: {
      profileVisibility: {
        type: String,
        enum: ['everyone', 'drivers_only', 'minimal'],
        default: DEFAULT_APP_SETTINGS.privacy.profileVisibility,
      },
      shareAnalytics: { type: Boolean, default: DEFAULT_APP_SETTINGS.privacy.shareAnalytics },
    },
    accessibility: {
      reduceMotion: { type: Boolean, default: DEFAULT_APP_SETTINGS.accessibility.reduceMotion },
      boldText: { type: Boolean, default: DEFAULT_APP_SETTINGS.accessibility.boldText },
    },
    nightMode: {
      type: String,
      enum: ['system', 'light', 'dark'],
      default: DEFAULT_APP_SETTINGS.nightMode,
    },
    shortcuts: {
      enabled: { type: Boolean, default: DEFAULT_APP_SETTINGS.shortcuts.enabled },
    },
    communication: {
      email: { type: Boolean, default: DEFAULT_APP_SETTINGS.communication.email },
      push: { type: Boolean, default: DEFAULT_APP_SETTINGS.communication.push },
      sms: { type: Boolean, default: DEFAULT_APP_SETTINGS.communication.sms },
    },
    navigation: {
      preferredMaps: {
        type: String,
        enum: ['google', 'apple', 'waze'],
        default: DEFAULT_APP_SETTINGS.navigation.preferredMaps,
      },
    },
    soundsVoice: {
      messageSounds: { type: Boolean, default: DEFAULT_APP_SETTINGS.soundsVoice.messageSounds },
      voiceGuidance: { type: Boolean, default: DEFAULT_APP_SETTINGS.soundsVoice.voiceGuidance },
    },
    safety: {
      pinVerificationEnabled: { type: Boolean, default: DEFAULT_APP_SETTINGS.safety.pinVerificationEnabled },
      followMyTripEnabled: { type: Boolean, default: DEFAULT_APP_SETTINGS.safety.followMyTripEnabled },
      tripCheckNotificationsEnabled: {
        type: Boolean,
        default: DEFAULT_APP_SETTINGS.safety.tripCheckNotificationsEnabled,
      },
    },
  },
  { _id: false }
);

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
    phone: {
      type: String,
      trim: true,
      maxlength: 32,
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
    accountKind: {
      type: String,
      enum: ['individual', 'organization'],
      default: 'individual',
    },
    organizationName: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    organizationType: {
      type: String,
      trim: true,
      maxlength: 120,
    },
    address: {
      type: AddressSchema,
      default: undefined,
    },
    appSettings: {
      type: AppSettingsSchema,
      default: undefined,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IUser>('User', UserSchema);
