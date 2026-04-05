import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IConversationReadReceipt {
  user: Types.ObjectId;
  lastReadAt: Date;
}

/** Per-user UI / notification preferences for this conversation (max 2 entries). */
export interface IParticipantSettings {
  user: Types.ObjectId;
  archived: boolean;
  muted: boolean;
  favorite: boolean;
  /** Custom list label (“Add to list”). */
  listTag: string | null;
  /** Forces unread badge until thread is opened. */
  manualUnread: boolean;
}

export interface IConversation extends Document {
  /** Exactly two user ids, sorted ascending by string id for stable uniqueness. */
  participants: Types.ObjectId[];
  /** Per-participant read cursor for unread counts (max 2 entries). */
  readReceipts?: IConversationReadReceipt[];
  /** Per-participant list/archive/mute/favorite flags. */
  participantSettings?: IParticipantSettings[];
  /** When true, no participant can send messages until cleared. */
  isLocked: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt?: Date;
  lastMessagePreview?: string;
  /** Denormalized sender of the latest message (for list row status). */
  lastMessageSenderId?: Types.ObjectId;
}

const ConversationSchema = new Schema<IConversation>(
  {
    participants: {
      type: [{ type: Schema.Types.ObjectId, ref: 'User' }],
      validate: {
        validator(v: Types.ObjectId[]) {
          return (
            Array.isArray(v) &&
            v.length === 2 &&
            v[0] &&
            v[1] &&
            !v[0].equals(v[1]) &&
            v[0].toString() < v[1].toString()
          );
        },
        message: 'participants must be two distinct user ids in ascending id order',
      },
    },
    lastMessageAt: { type: Date },
    lastMessagePreview: { type: String, maxlength: 280 },
    lastMessageSenderId: { type: Schema.Types.ObjectId, ref: 'User' },
    readReceipts: {
      type: [
        {
          user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
          lastReadAt: { type: Date, required: true },
        },
      ],
      default: [],
    },
    participantSettings: {
      type: [
        {
          user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
          archived: { type: Boolean, default: false },
          muted: { type: Boolean, default: false },
          favorite: { type: Boolean, default: false },
          listTag: { type: String, default: null, maxlength: 120 },
          manualUnread: { type: Boolean, default: false },
        },
      ],
      default: [],
    },
    isLocked: { type: Boolean, default: false },
  },
  { timestamps: true }
);

ConversationSchema.index({ 'participants.0': 1, 'participants.1': 1 }, { unique: true });
ConversationSchema.index({ lastMessageAt: -1 });

export default mongoose.model<IConversation>('Conversation', ConversationSchema);
