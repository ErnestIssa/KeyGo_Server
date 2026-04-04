import { Types } from 'mongoose';
import Conversation from '../models/Conversation';

export type MarkReadResult = { readAt: Date; readAtIso: string };

/**
 * Updates read receipt for `userId` on `conversationId`. Returns null if invalid or not a participant.
 */
export async function markConversationReadByUser(
  userId: Types.ObjectId,
  conversationId: string
): Promise<MarkReadResult | null> {
  if (!Types.ObjectId.isValid(conversationId)) {
    return null;
  }
  const conv = await Conversation.findById(conversationId);
  if (!conv) {
    return null;
  }
  if (!conv.participants.some((p) => p.equals(userId))) {
    return null;
  }
  const now = new Date();
  const receipts = [...(conv.readReceipts ?? [])];
  const idx = receipts.findIndex((r) => r.user.equals(userId));
  if (idx >= 0) {
    receipts[idx].lastReadAt = now;
  } else {
    receipts.push({ user: userId, lastReadAt: now });
  }
  conv.readReceipts = receipts;
  await conv.save();
  return { readAt: now, readAtIso: now.toISOString() };
}
