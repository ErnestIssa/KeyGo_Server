import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IConversationReadReceipt {
  user: Types.ObjectId;
  lastReadAt: Date;
}

export interface IConversation extends Document {
  /** Exactly two user ids, sorted ascending by string id for stable uniqueness. */
  participants: Types.ObjectId[];
  /** Per-participant read cursor for unread counts (max 2 entries). */
  readReceipts?: IConversationReadReceipt[];
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt?: Date;
  lastMessagePreview?: string;
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
    readReceipts: {
      type: [
        {
          user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
          lastReadAt: { type: Date, required: true },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

ConversationSchema.index({ 'participants.0': 1, 'participants.1': 1 }, { unique: true });
ConversationSchema.index({ lastMessageAt: -1 });

export default mongoose.model<IConversation>('Conversation', ConversationSchema);
