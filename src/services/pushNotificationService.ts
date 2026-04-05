import { Types } from 'mongoose';
import Conversation from '../models/Conversation';
import User from '../models/User';
import { getParticipantSettings } from './conversationSettingsService';
import { getChatSocketServer } from '../realtime/chatRealtime';

function roomForConversation(conversationId: string): string {
  return `conversation:${conversationId}`;
}

/**
 * Sends an Expo push when the recipient is not connected to the conversation room
 * (likely not viewing the thread). Skips if notifications disabled or no token.
 */
export async function notifyNewChatMessage(opts: {
  conversationId: string;
  senderId: Types.ObjectId;
  recipientId: Types.ObjectId;
  preview: string;
  senderDisplayName: string;
}): Promise<void> {
  const io = getChatSocketServer();
  if (io) {
    try {
      const sockets = await io.in(roomForConversation(opts.conversationId)).fetchSockets();
      const recipientInRoom = sockets.some(
        (s) => (s.data as { userId?: string }).userId === opts.recipientId.toString()
      );
      if (recipientInRoom) {
        return;
      }
    } catch {
      /* fall through to push */
    }
  }

  const convDoc = await Conversation.findById(opts.conversationId).select('participantSettings').lean();
  if (convDoc) {
    const muted = getParticipantSettings(
      convDoc.participantSettings as Parameters<typeof getParticipantSettings>[0],
      opts.recipientId
    ).muted;
    if (muted) return;
  }

  const u = await User.findById(opts.recipientId).select('expoPushToken notificationsEnabled').lean();
  if (!u) return;
  const doc = u as { expoPushToken?: string; notificationsEnabled?: boolean };
  if (doc.notificationsEnabled === false) return;
  const token = doc.expoPushToken;
  if (!token) return;

  const title = `New message from ${opts.senderDisplayName}`;
  const body =
    opts.preview.length > 100 ? `${opts.preview.slice(0, 97)}...` : opts.preview || 'New message';

  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        to: token,
        title,
        body,
        sound: 'default',
        priority: 'high',
        channelId: 'chat',
        data: {
          conversationId: opts.conversationId,
          url: `keygo://chat/${opts.conversationId}`,
        },
      }),
    });
  } catch {
    /* ignore network errors */
  }
}
