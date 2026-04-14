import { Types } from 'mongoose';
import Conversation from '../models/Conversation';
import Message, { type IMessage, type MessageKind } from '../models/Message';
import User from '../models/User';
import { formatChatDisplayName } from '../utils/displayName';
import { notifyNewChatMessage } from './pushNotificationService';
import { isInboundUnread, outgoingMessageUiStatus, receiptForUser } from '../utils/chatReadStatus';

export class ChatMessageError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = 'ChatMessageError';
  }
}

export type SerializedChatMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  kind: MessageKind;
  text: string;
  createdAt: Date;
  senderDisplayName: string;
  senderName: string;
  senderAvatarUrl?: string;
  /** Outgoing bubbles only; omitted for inbound. */
  deliveryStatus?: 'sent' | 'delivered' | 'read';
  isUnread: boolean;
  mediaUrl?: string;
  fileName?: string;
  mimeType?: string;
  durationSec?: number;
  replyToMessageId?: string;
  replyToPreview?: string;
  reactions: { userId: string; emoji: string }[];
  starredByMe?: boolean;
  isPinned?: boolean;
  deleted?: boolean;
  /** When true, show “deleted” placeholder for this viewer */
  deletedPlaceholder?: boolean;
  callId?: string;
};

export type CreateChatMessageOpts = {
  kind?: MessageKind;
  mediaUrl?: string;
  fileName?: string;
  mimeType?: string;
  durationSec?: number;
  replyToMessageId?: string;
  callId?: string;
};

function assertParticipant(conv: { participants: Types.ObjectId[] }, senderId: Types.ObjectId) {
  if (!conv.participants.some((p) => p.equals(senderId))) {
    throw new ChatMessageError('Not a participant', 403);
  }
}

async function senderMeta(senderId: Types.ObjectId) {
  const sender = await User.findById(senderId).select('name firstName lastName avatarUrl').lean();
  const senderDisplayName = sender
    ? formatChatDisplayName(sender.firstName, sender.lastName, sender.name)
    : 'User';
  const senderName = sender?.name ?? 'User';
  const senderAvatarUrl = sender?.avatarUrl || undefined;
  return { senderDisplayName, senderName, senderAvatarUrl };
}

/**
 * Shared by REST POST /messages and Socket.IO `send_message`.
 */
export async function createChatMessage(
  senderId: Types.ObjectId,
  conversationId: string,
  text: string,
  opts: CreateChatMessageOpts = {}
): Promise<{ message: SerializedChatMessage }> {
  if (!Types.ObjectId.isValid(conversationId)) {
    throw new ChatMessageError('Invalid conversationId', 400);
  }
  const kind: MessageKind = opts.kind ?? 'text';
  const trimmed =
    typeof text === 'string'
      ? text.trim().slice(0, 8000)
      : '';
  if (kind === 'text' && !trimmed) {
    throw new ChatMessageError('text is required', 400);
  }
  if (kind !== 'text' && kind !== 'call' && kind !== 'system' && !opts.mediaUrl && !trimmed) {
    throw new ChatMessageError('caption or attachment required', 400);
  }

  const conv = await Conversation.findById(conversationId);
  if (!conv) {
    throw new ChatMessageError('Conversation not found', 404);
  }
  assertParticipant(conv, senderId);
  if ((conv as { isLocked?: boolean }).isLocked) {
    throw new ChatMessageError('This chat is locked', 403);
  }

  let replyTo: Types.ObjectId | undefined;
  if (opts.replyToMessageId) {
    if (!Types.ObjectId.isValid(opts.replyToMessageId)) {
      throw new ChatMessageError('Invalid replyToMessageId', 400);
    }
    replyTo = new Types.ObjectId(opts.replyToMessageId);
    const parent = await Message.findOne({ _id: replyTo, conversationId: conv._id }).lean();
    if (!parent) {
      throw new ChatMessageError('Reply target not found', 400);
    }
  }

  const displayText =
    trimmed ||
    (kind === 'image'
      ? '📷 Photo'
      : kind === 'video'
        ? '🎬 Video'
        : kind === 'audio'
          ? '🎤 Voice message'
          : kind === 'file'
            ? '📎 File'
            : '');

  const msg = await Message.create({
    conversationId: conv._id,
    senderId,
    kind,
    text: displayText,
    mediaUrl: opts.mediaUrl,
    fileName: opts.fileName,
    mimeType: opts.mimeType,
    durationSec: opts.durationSec,
    callId: opts.callId,
    replyToMessageId: replyTo,
    reactions: [],
    starredBy: [],
  });

  const preview =
    displayText.length > 120 ? `${displayText.slice(0, 117)}...` : displayText;
  conv.lastMessageAt = msg.createdAt;
  conv.lastMessagePreview = preview;
  conv.lastMessageSenderId = senderId;
  await conv.save();

  const otherParticipant = conv.participants.find((p) => !p.equals(senderId));
  const { senderDisplayName: notifyName } = await senderMeta(senderId);

  if (otherParticipant) {
    void notifyNewChatMessage({
      conversationId: conv._id.toString(),
      senderId,
      recipientId: otherParticipant,
      preview,
      senderDisplayName: notifyName,
    });
  }

  const ser = await serializeMessage(
    msg.toObject() as IMessage,
    senderId,
    conv,
    undefined,
    otherParticipant ?? null
  );
  if (!ser) {
    throw new ChatMessageError('Failed to serialize message', 500);
  }
  return { message: ser };
}

/** System line when a call is placed (WebRTC orchestration). */
export async function createCallStartedSystemMessage(
  senderId: Types.ObjectId,
  conversationId: string,
  callId: string,
  callKind: 'voice' | 'video'
): Promise<{ message: SerializedChatMessage }> {
  const icon = callKind === 'voice' ? '\u{1F4DE}' : '\u{1F4F9}';
  const label = callKind === 'voice' ? 'Voice' : 'Video';
  return createChatMessage(senderId, conversationId, `${icon} ${label} call started`, {
    kind: 'system',
    callId,
  });
}

export async function createCallLogMessage(
  senderId: Types.ObjectId,
  conversationId: string,
  payload: {
    callKind: 'voice' | 'video';
    status: 'completed' | 'missed' | 'declined';
    durationSec?: number;
    callId?: string;
  }
): Promise<{ message: SerializedChatMessage }> {
  const conv = await Conversation.findById(conversationId);
  if (!conv) {
    throw new ChatMessageError('Conversation not found', 404);
  }
  assertParticipant(conv, senderId);
  const icon = payload.callKind === 'voice' ? '📞' : '📹';
  const dur =
    payload.status === 'completed' && payload.durationSec != null && payload.durationSec > 0
      ? ` · ${formatDuration(payload.durationSec)}`
      : '';
  const statusLine =
    payload.status === 'missed'
      ? 'Missed call'
      : payload.status === 'declined'
        ? 'Declined'
        : 'Call';
  const text = `${icon} ${payload.callKind === 'voice' ? 'Voice' : 'Video'} ${statusLine}${dur}`;

  const msg = await Message.create({
    conversationId: conv._id,
    senderId,
    kind: 'call',
    text,
    durationSec: payload.durationSec,
    callId: payload.callId,
    reactions: [],
    starredBy: [],
  });

  const preview = text.length > 120 ? `${text.slice(0, 117)}...` : text;
  conv.lastMessageAt = msg.createdAt;
  conv.lastMessagePreview = preview;
  conv.lastMessageSenderId = senderId;
  await conv.save();

  const otherParticipant = conv.participants.find((p) => !p.equals(senderId));
  const { senderDisplayName, senderName, senderAvatarUrl } = await senderMeta(senderId);

  if (otherParticipant) {
    void notifyNewChatMessage({
      conversationId: conv._id.toString(),
      senderId,
      recipientId: otherParticipant,
      preview,
      senderDisplayName,
    });
  }

  const ser = await serializeMessage(
    msg.toObject() as IMessage,
    senderId,
    conv,
    undefined,
    otherParticipant ?? null
  );
  if (!ser) {
    throw new ChatMessageError('Failed to serialize message', 500);
  }
  return { message: ser };
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `0:${String(s).padStart(2, '0')}`;
}

export async function markMessageDelivered(
  readerId: Types.ObjectId,
  messageId: string
): Promise<{ conversationId: string; messageId: string } | null> {
  if (!Types.ObjectId.isValid(messageId)) {
    return null;
  }
  const msg = await Message.findById(messageId);
  if (!msg) {
    return null;
  }
  if (msg.senderId.equals(readerId)) {
    return null;
  }
  const conv = await Conversation.findById(msg.conversationId);
  if (!conv || !conv.participants.some((p) => p.equals(readerId))) {
    return null;
  }
  if (msg.deliveredToPeerAt) {
    return { conversationId: conv._id.toString(), messageId: msg._id.toString() };
  }
  msg.deliveredToPeerAt = new Date();
  await msg.save();
  return { conversationId: conv._id.toString(), messageId: msg._id.toString() };
}

export async function deleteChatMessage(
  userId: Types.ObjectId,
  messageId: string,
  forEveryone: boolean
): Promise<{ conversationId: string; message: SerializedChatMessage } | null> {
  if (!Types.ObjectId.isValid(messageId)) {
    throw new ChatMessageError('Invalid message', 400);
  }
  const msg = await Message.findById(messageId);
  if (!msg) {
    throw new ChatMessageError('Message not found', 404);
  }
  const conv = await Conversation.findById(msg.conversationId);
  if (!conv || !conv.participants.some((p) => p.equals(userId))) {
    throw new ChatMessageError('Not a participant', 403);
  }
  const isSender = msg.senderId.equals(userId);
  if (!isSender) {
    throw new ChatMessageError('Only the sender can delete', 403);
  }
  if (msg.deletedAt) {
    throw new ChatMessageError('Already deleted', 400);
  }

  const peer = conv.participants.find((p) => !p.equals(userId));
  const delivered = Boolean(msg.deliveredToPeerAt);

  if (forEveryone) {
    if (!delivered) {
      throw new ChatMessageError('Message was not delivered yet — remove for you only', 400);
    }
    msg.deletedForEveryone = true;
  } else {
    msg.deletedForEveryone = false;
  }
  msg.deletedAt = new Date();
  msg.text = '';
  msg.mediaUrl = undefined;
  msg.fileName = undefined;
  msg.mimeType = undefined;
  await msg.save();

  const serialized = await serializeMessage(
    msg.toObject() as IMessage,
    userId,
    conv,
    undefined,
    peer ?? null
  );
  if (!serialized) {
    throw new ChatMessageError('Failed to serialize message', 500);
  }
  return { conversationId: conv._id.toString(), message: serialized };
}

export async function setMessageReaction(
  userId: Types.ObjectId,
  messageId: string,
  emoji: string | null
): Promise<{ conversationId: string; message: SerializedChatMessage } | null> {
  if (!Types.ObjectId.isValid(messageId)) {
    throw new ChatMessageError('Invalid message', 400);
  }
  const msg = await Message.findById(messageId);
  if (!msg || msg.deletedAt) {
    throw new ChatMessageError('Message not found', 404);
  }
  const conv = await Conversation.findById(msg.conversationId);
  if (!conv || !conv.participants.some((p) => p.equals(userId))) {
    throw new ChatMessageError('Not a participant', 403);
  }

  const reactions = [...(msg.reactions ?? [])].filter((r) => !r.userId.equals(userId));
  if (emoji && emoji.trim()) {
    reactions.push({ userId, emoji: emoji.trim().slice(0, 32) });
  }
  msg.reactions = reactions as typeof msg.reactions;
  await msg.save();

  const peer = conv.participants.find((p) => !p.equals(userId));
  const updated = await serializeMessage(msg.toObject() as IMessage, userId, conv, undefined, peer ?? null);
  if (!updated) {
    throw new ChatMessageError('Failed to serialize message', 500);
  }
  return {
    conversationId: conv._id.toString(),
    message: updated,
  };
}

export async function setMessageStarred(
  userId: Types.ObjectId,
  messageId: string,
  starred: boolean
): Promise<{ conversationId: string; message: SerializedChatMessage } | null> {
  if (!Types.ObjectId.isValid(messageId)) {
    throw new ChatMessageError('Invalid message', 400);
  }
  const msg = await Message.findById(messageId);
  if (!msg || msg.deletedAt) {
    throw new ChatMessageError('Message not found', 404);
  }
  const conv = await Conversation.findById(msg.conversationId);
  if (!conv || !conv.participants.some((p) => p.equals(userId))) {
    throw new ChatMessageError('Not a participant', 403);
  }

  let stars = (msg.starredBy ?? []).filter((id) => !id.equals(userId));
  if (starred) {
    stars.push(userId);
  }
  msg.starredBy = stars;
  await msg.save();

  const peer = conv.participants.find((p) => !p.equals(userId));
  const updated = await serializeMessage(msg.toObject() as IMessage, userId, conv, undefined, peer ?? null);
  if (!updated) {
    throw new ChatMessageError('Failed to serialize message', 500);
  }
  return {
    conversationId: conv._id.toString(),
    message: updated,
  };
}

export async function setPinnedMessage(
  userId: Types.ObjectId,
  conversationId: string,
  messageId: string | null
): Promise<void> {
  if (!Types.ObjectId.isValid(conversationId)) {
    throw new ChatMessageError('Invalid conversation', 400);
  }
  const conv = await Conversation.findById(conversationId);
  if (!conv || !conv.participants.some((p) => p.equals(userId))) {
    throw new ChatMessageError('Not a participant', 403);
  }
  if (!messageId) {
    conv.pinnedMessageId = undefined;
    await conv.save();
    return;
  }
  if (!Types.ObjectId.isValid(messageId)) {
    throw new ChatMessageError('Invalid message', 400);
  }
  const msg = await Message.findOne({ _id: messageId, conversationId: conv._id });
  if (!msg || msg.deletedAt) {
    throw new ChatMessageError('Message not found', 404);
  }
  conv.pinnedMessageId = msg._id as Types.ObjectId;
  await conv.save();
}

async function serializeMessage(
  m: IMessage,
  viewerId: Types.ObjectId,
  conv: {
    _id: Types.ObjectId;
    participants: Types.ObjectId[];
    readReceipts?: { user: Types.ObjectId; lastReadAt: Date }[];
    pinnedMessageId?: Types.ObjectId;
  },
  replyPreviewMap: Map<string, string> | undefined,
  _peerId: Types.ObjectId | null
): Promise<SerializedChatMessage | null> {
  const senderIdStr = m.senderId.toString();
  const mine = m.senderId.equals(viewerId);

  if (m.deletedAt) {
    const peerSaw = Boolean(m.deliveredToPeerAt);
    if (!mine && !peerSaw) {
      return null;
    }
    const peer = conv.participants.find((p) => !p.equals(m.senderId));
    const peerLastRead = peer ? receiptForUser(conv.readReceipts, peer) : undefined;
    const deliveryStatus = mine ? outgoingMessageUiStatus(m.createdAt, peerLastRead) : undefined;
    const meta = await senderMeta(m.senderId);
    return {
      id: m._id.toString(),
      conversationId: conv._id.toString(),
      senderId: senderIdStr,
      kind: (m.kind as MessageKind) ?? 'text',
      text: mine ? 'You deleted this message.' : 'This message was deleted.',
      createdAt: m.createdAt,
      senderDisplayName: meta.senderDisplayName,
      senderName: meta.senderName,
      senderAvatarUrl: meta.senderAvatarUrl,
      deliveryStatus,
      isUnread: false,
      reactions: [],
      deleted: true,
      deletedPlaceholder: true,
      isPinned: conv.pinnedMessageId?.equals(m._id as Types.ObjectId),
    };
  }

  const peer = conv.participants.find((p) => !p.equals(viewerId));
  const peerLastRead = peer ? receiptForUser(conv.readReceipts, peer) : undefined;
  const myLastRead = receiptForUser(conv.readReceipts, viewerId);
  const deliveryStatus = mine ? outgoingMessageUiStatus(m.createdAt, peerLastRead) : undefined;

  const meta = await senderMeta(m.senderId);
  const reactions = (m.reactions ?? []).map((r) => ({
    userId: r.userId.toString(),
    emoji: r.emoji,
  }));

  let replyToPreview: string | undefined;
  if (m.replyToMessageId) {
    const rid = m.replyToMessageId.toString();
    replyToPreview = replyPreviewMap?.get(rid);
    if (!replyToPreview) {
      const parent = await Message.findById(m.replyToMessageId).select('text deletedAt').lean();
      replyToPreview = parent?.deletedAt ? '[Deleted]' : (parent?.text ?? '').slice(0, 160) || 'Message';
    }
  }

  const starredByMe = (m.starredBy ?? []).some((id) => id.equals(viewerId));

  return {
    id: m._id.toString(),
    conversationId: conv._id.toString(),
    senderId: senderIdStr,
    kind: (m.kind as MessageKind) ?? 'text',
    text: m.text,
    createdAt: m.createdAt,
    senderDisplayName: meta.senderDisplayName,
    senderName: meta.senderName,
    senderAvatarUrl: meta.senderAvatarUrl,
    deliveryStatus,
    isUnread: !mine && isInboundUnread(m.createdAt, myLastRead),
    mediaUrl: m.mediaUrl,
    fileName: m.fileName,
    mimeType: m.mimeType,
    durationSec: m.durationSec,
    callId: m.callId,
    replyToMessageId: m.replyToMessageId?.toString(),
    replyToPreview,
    reactions,
    starredByMe,
    isPinned: conv.pinnedMessageId?.equals(m._id as Types.ObjectId),
  };
}

export async function listMessagesForUser(
  meId: Types.ObjectId,
  conversationId: string
): Promise<{ messages: SerializedChatMessage[]; peerLastReadAt: string | null; pinnedMessageId: string | null }> {
  if (!Types.ObjectId.isValid(conversationId)) {
    throw new ChatMessageError('Invalid conversationId', 400);
  }
  const conv = await Conversation.findById(conversationId);
  if (!conv) {
    throw new ChatMessageError('Conversation not found', 404);
  }
  if (!conv.participants.some((p) => p.equals(meId))) {
    throw new ChatMessageError('Not a participant', 403);
  }

  const messages = await Message.find({ conversationId: conv._id }).sort({ createdAt: 1 }).limit(300).lean();

  const replyIds = [
    ...new Set(
      messages.map((m) => m.replyToMessageId?.toString()).filter((x): x is string => Boolean(x))
    ),
  ];
  const replyParents =
    replyIds.length > 0
      ? await Message.find({ _id: { $in: replyIds } })
          .select('text')
          .lean()
      : [];
  const replyPreviewMap = new Map<string, string>();
  for (const p of replyParents) {
    replyPreviewMap.set((p._id as Types.ObjectId).toString(), (p.text ?? '').slice(0, 160));
  }

  const otherParticipant = conv.participants.find((p) => !p.equals(meId));
  const peerLastRead = otherParticipant ? receiptForUser(conv.readReceipts, otherParticipant) : undefined;

  const out: SerializedChatMessage[] = [];
  for (const m of messages) {
    const s = await serializeMessage(m as unknown as IMessage, meId, conv, replyPreviewMap, otherParticipant ?? null);
    if (s) {
      out.push(s);
    }
  }

  return {
    messages: out,
    peerLastReadAt: peerLastRead ? peerLastRead.toISOString() : null,
    pinnedMessageId: conv.pinnedMessageId ? conv.pinnedMessageId.toString() : null,
  };
}

/** Re-export for socket — thin wrapper */
export async function createChatMessageFromSocket(
  senderId: Types.ObjectId,
  conversationId: string,
  text: string,
  opts: CreateChatMessageOpts
) {
  return createChatMessage(senderId, conversationId, text, opts);
}
