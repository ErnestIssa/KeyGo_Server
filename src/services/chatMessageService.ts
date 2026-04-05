import { Types } from 'mongoose';
import Conversation from '../models/Conversation';
import Message from '../models/Message';
import User from '../models/User';
import { formatChatDisplayName } from '../utils/displayName';
import { outgoingMessageUiStatus, receiptForUser } from '../utils/chatReadStatus';
import { notifyNewChatMessage } from './pushNotificationService';

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
  text: string;
  createdAt: Date;
  senderDisplayName: string;
  senderName: string;
  senderAvatarUrl?: string;
  deliveryStatus: 'sent' | 'delivered' | 'read';
  isUnread: boolean;
};

/**
 * Shared by REST POST /messages and Socket.IO `send_message`.
 */
export async function createChatMessage(
  senderId: Types.ObjectId,
  conversationId: string,
  text: string
): Promise<{ message: SerializedChatMessage }> {
  if (!Types.ObjectId.isValid(conversationId)) {
    throw new ChatMessageError('Invalid conversationId', 400);
  }
  const trimmed = typeof text === 'string' ? text.trim().slice(0, 4000) : '';
  if (!trimmed) {
    throw new ChatMessageError('text is required', 400);
  }

  const conv = await Conversation.findById(conversationId);
  if (!conv) {
    throw new ChatMessageError('Conversation not found', 404);
  }
  if (!conv.participants.some((p) => p.equals(senderId))) {
    throw new ChatMessageError('Not a participant', 403);
  }
  if ((conv as { isLocked?: boolean }).isLocked) {
    throw new ChatMessageError('This chat is locked', 403);
  }

  const msg = await Message.create({
    conversationId: conv._id,
    senderId,
    text: trimmed,
  });

  const preview = msg.text.length > 120 ? `${msg.text.slice(0, 117)}...` : msg.text;
  conv.lastMessageAt = msg.createdAt;
  conv.lastMessagePreview = preview;
  conv.lastMessageSenderId = senderId;
  await conv.save();

  const otherParticipant = conv.participants.find((p) => !p.equals(senderId));
  const peerReadAt = otherParticipant
    ? receiptForUser(conv.readReceipts as { user: Types.ObjectId; lastReadAt: Date }[] | undefined, otherParticipant)
    : undefined;
  const deliveryStatus = outgoingMessageUiStatus(msg.createdAt, peerReadAt);

  const sender = await User.findById(senderId).select('name firstName lastName avatarUrl').lean();
  const senderDisplayName = sender
    ? formatChatDisplayName(sender.firstName, sender.lastName, sender.name)
    : 'User';
  const senderName = sender?.name ?? 'User';
  const senderAvatarUrl = sender?.avatarUrl || undefined;

  if (otherParticipant) {
    void notifyNewChatMessage({
      conversationId: conv._id.toString(),
      senderId,
      recipientId: otherParticipant,
      preview,
      senderDisplayName,
    });
  }

  return {
    message: {
      id: msg._id.toString(),
      conversationId: conv._id.toString(),
      senderId: senderId.toString(),
      text: msg.text,
      createdAt: msg.createdAt,
      senderDisplayName,
      senderName,
      senderAvatarUrl,
      deliveryStatus,
      isUnread: false,
    },
  };
}
