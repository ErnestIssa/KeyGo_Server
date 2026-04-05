import { Types } from 'mongoose';
import Conversation from '../models/Conversation';
import Message from '../models/Message';

export type MarkReadResult = { readAt: Date; readAtIso: string };

function clearManualUnread(
  conv: { participantSettings?: { user: Types.ObjectId; manualUnread?: boolean }[] },
  userId: Types.ObjectId
): void {
  const ps = conv.participantSettings;
  if (!ps?.length) return;
  const i = ps.findIndex((s) => s.user.equals(userId));
  if (i >= 0) {
    ps[i].manualUnread = false;
  }
}

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
  clearManualUnread(conv, userId);
  await conv.save();
  return { readAt: now, readAtIso: now.toISOString() };
}

/** Sets read cursor before the latest message so inbound shows as unread. */
export async function markConversationUnreadByUser(
  userId: Types.ObjectId,
  conversationId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Types.ObjectId.isValid(conversationId)) {
    return { ok: false, error: 'Invalid conversationId' };
  }
  const conv = await Conversation.findById(conversationId);
  if (!conv) {
    return { ok: false, error: 'Conversation not found' };
  }
  if (!conv.participants.some((p) => p.equals(userId))) {
    return { ok: false, error: 'Not a participant' };
  }

  const lastMsg = await Message.findOne({ conversationId: conv._id }).sort({ createdAt: -1 }).lean();
  const before = lastMsg?.createdAt
    ? new Date(new Date(lastMsg.createdAt).getTime() - 2000)
    : new Date(0);

  const receipts = [...(conv.readReceipts ?? [])];
  const ridx = receipts.findIndex((r) => r.user.equals(userId));
  if (ridx >= 0) {
    receipts[ridx].lastReadAt = before;
  } else {
    receipts.push({ user: userId, lastReadAt: before });
  }
  conv.readReceipts = receipts;

  const ps = [...(conv.participantSettings ?? [])];
  let pi = ps.findIndex((s) => s.user.equals(userId));
  if (pi < 0) {
    ps.push({
      user: userId,
      archived: false,
      muted: false,
      favorite: false,
      listTag: null,
      manualUnread: true,
    });
  } else {
    ps[pi].manualUnread = true;
  }
  conv.participantSettings = ps;

  await conv.save();
  return { ok: true };
}
