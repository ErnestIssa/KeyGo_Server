import { Types } from 'mongoose';

/** Outgoing bubble / row: pink sent → blue delivered (on server, not read) → green read */
export type OutgoingUiStatus = 'sent' | 'delivered' | 'read';
export type IncomingUiStatus = 'received' | 'read';
export type LastMessageStatus = OutgoingUiStatus | IncomingUiStatus;

const DELIVERED_AFTER_MS = 2500;

export function receiptForUser(
  readReceipts: { user: Types.ObjectId; lastReadAt: Date }[] | undefined,
  userId: Types.ObjectId
): Date | undefined {
  return readReceipts?.find((r) => r.user.equals(userId))?.lastReadAt;
}

export function outgoingMessageUiStatus(
  messageCreatedAt: Date,
  peerLastReadAt: Date | undefined,
  now: Date = new Date()
): OutgoingUiStatus {
  if (peerLastReadAt && peerLastReadAt >= messageCreatedAt) {
    return 'read';
  }
  if (now.getTime() - messageCreatedAt.getTime() >= DELIVERED_AFTER_MS) {
    return 'delivered';
  }
  return 'sent';
}

export function isInboundUnread(messageCreatedAt: Date, myLastReadAt: Date | undefined): boolean {
  const since = myLastReadAt ?? new Date(0);
  return messageCreatedAt > since;
}

export function lastMessageRowStatus(
  lastSenderId: Types.ObjectId,
  meId: Types.ObjectId,
  lastCreatedAt: Date,
  myLastReadAt: Date | undefined,
  otherLastReadAt: Date | undefined,
  now: Date = new Date()
): LastMessageStatus {
  if (lastSenderId.equals(meId)) {
    return outgoingMessageUiStatus(lastCreatedAt, otherLastReadAt, now);
  }
  if (myLastReadAt && myLastReadAt >= lastCreatedAt) {
    return 'read';
  }
  return 'received';
}
