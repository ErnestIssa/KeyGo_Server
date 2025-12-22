import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IChatMessage extends Document {
  carRequest: Types.ObjectId;
  sender: Types.ObjectId;
  receiver: Types.ObjectId;
  message: string;
  isRead: boolean;
  createdAt: Date;
}

const ChatMessageSchema: Schema = new Schema(
  {
    carRequest: {
      type: Schema.Types.ObjectId,
      ref: 'CarRequest',
      required: true,
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    receiver: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

ChatMessageSchema.index({ carRequest: 1, createdAt: -1 });

export default mongoose.model<IChatMessage>('ChatMessage', ChatMessageSchema);

