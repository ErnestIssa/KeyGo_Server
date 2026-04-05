import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IReport extends Document {
  reporterId: Types.ObjectId;
  reportedUserId: Types.ObjectId;
  conversationId?: Types.ObjectId;
  messageId?: Types.ObjectId;
  kind: 'message' | 'user';
  /** e.g. spam, harassment — optional for MVP */
  reason?: string;
  createdAt: Date;
}

const ReportSchema = new Schema<IReport>(
  {
    reporterId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reportedUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation' },
    messageId: { type: Schema.Types.ObjectId, ref: 'Message' },
    kind: { type: String, enum: ['message', 'user'], required: true },
    reason: { type: String, maxlength: 2000 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export default mongoose.model<IReport>('Report', ReportSchema);
