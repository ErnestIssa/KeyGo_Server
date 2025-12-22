import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IRating extends Document {
  carRequest: Types.ObjectId;
  rater: Types.ObjectId; // User who gives the rating
  rated: Types.ObjectId; // User who receives the rating
  rating: number; // 1-5
  comment?: string;
  createdAt: Date;
  updatedAt: Date;
}

const RatingSchema: Schema = new Schema(
  {
    carRequest: {
      type: Schema.Types.ObjectId,
      ref: 'CarRequest',
      required: true,
    },
    rater: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    rated: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Ensure one rating per user per car request
RatingSchema.index({ carRequest: 1, rater: 1, rated: 1 }, { unique: true });

export default mongoose.model<IRating>('Rating', RatingSchema);

