import mongoose, { Document, Schema, Types } from 'mongoose';

export type MessageKind = 'text' | 'image' | 'video' | 'file' | 'audio' | 'call' | 'system';

export interface IMessageReaction {
  userId: Types.ObjectId;
  emoji: string;
}

export interface IMessage extends Document {
  conversationId: Types.ObjectId;
  senderId: Types.ObjectId;
  kind: MessageKind;
  /** Text body, caption, or call summary line */
  text: string;
  /** Relative URL served from API, e.g. /uploads/chat/... */
  mediaUrl?: string;
  fileName?: string;
  mimeType?: string;
  /** Audio / video duration in seconds */
  durationSec?: number;
  /** Links chat rows to an active or past WebRTC call session */
  callId?: string;
  replyToMessageId?: Types.ObjectId;
  reactions: IMessageReaction[];
  /** When the peer client received the message (socket delivery ack). */
  deliveredToPeerAt?: Date;
  deletedAt?: Date;
  /** True when delete for everyone; if false, only sender-side delete (undelivered). */
  deletedForEveryone?: boolean;
  starredBy: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const ReactionSchema = new Schema<IMessageReaction>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    emoji: { type: String, required: true, maxlength: 32 },
  },
  { _id: false }
);

const MessageSchema = new Schema<IMessage>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    kind: {
      type: String,
      enum: ['text', 'image', 'video', 'file', 'audio', 'call', 'system'],
      default: 'text',
    },
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 8000,
    },
    mediaUrl: { type: String, maxlength: 2048 },
    fileName: { type: String, maxlength: 512 },
    mimeType: { type: String, maxlength: 200 },
    durationSec: { type: Number, min: 0, max: 86400 },
    callId: { type: String, maxlength: 64, index: true },
    replyToMessageId: { type: Schema.Types.ObjectId, ref: 'Message' },
    reactions: { type: [ReactionSchema], default: [] },
    deliveredToPeerAt: { type: Date },
    deletedAt: { type: Date },
    deletedForEveryone: { type: Boolean },
    starredBy: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], default: [] },
  },
  { timestamps: true }
);

MessageSchema.index({ conversationId: 1, createdAt: 1 });

export default mongoose.model<IMessage>('Message', MessageSchema);
