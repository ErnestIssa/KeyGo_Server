import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IInboxMessage extends Document {
  userId: Types.ObjectId;
  channel: 'notifications' | 'support';
  title: string;
  body: string;
  read: boolean;
  /** True when message is from support or system; false when user sent to support. */
  fromSupport: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const InboxMessageSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    channel: { type: String, enum: ['notifications', 'support'], required: true },
    title: { type: String, trim: true, default: '' },
    body: { type: String, trim: true, required: true },
    read: { type: Boolean, default: false },
    fromSupport: { type: Boolean, default: false },
  },
  { timestamps: true }
);

InboxMessageSchema.index({ userId: 1, channel: 1, createdAt: -1 });

export default mongoose.model<IInboxMessage>('InboxMessage', InboxMessageSchema);
