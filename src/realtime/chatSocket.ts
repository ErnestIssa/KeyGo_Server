import { Types } from 'mongoose';
import type { Server } from 'socket.io';
import Conversation from '../models/Conversation';
import User from '../models/User';
import { createChatMessage, ChatMessageError } from '../services/chatMessageService';
import { markConversationReadByUser } from '../services/conversationReadService';
import { verifyToken } from '../utils/jwt';

function roomForConversation(conversationId: string): string {
  return `conversation:${conversationId}`;
}

export function setupChatSocket(io: Server): void {
  io.use(async (socket, next) => {
    try {
      const auth = socket.handshake.auth as { token?: string } | undefined;
      const headerAuth =
        typeof socket.handshake.headers.authorization === 'string'
          ? socket.handshake.headers.authorization.replace(/^Bearer\s+/i, '')
          : undefined;
      const token = auth?.token ?? headerAuth;
      if (!token) {
        next(new Error('Unauthorized'));
        return;
      }
      const decoded = verifyToken(token);
      const user = await User.findById(decoded.userId).select('-password');
      if (!user) {
        next(new Error('Unauthorized'));
        return;
      }
      (socket.data as { userId: string }).userId = user._id.toString();
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const userId = new Types.ObjectId((socket.data as { userId: string }).userId);

    socket.on(
      'join_conversation',
      async (
        payload: string | { conversationId?: string },
        ack?: (err: Error | null) => void
      ) => {
        const conversationId = typeof payload === 'string' ? payload : payload?.conversationId;
        try {
          if (!conversationId || !Types.ObjectId.isValid(conversationId)) {
            ack?.(new Error('Invalid conversationId'));
            return;
          }
          const conv = await Conversation.findById(conversationId);
          if (!conv || !conv.participants.some((p) => p.equals(userId))) {
            ack?.(new Error('Not a participant'));
            return;
          }
          await socket.join(roomForConversation(conversationId));
          ack?.(null);
        } catch (e) {
          ack?.(e instanceof Error ? e : new Error('Failed to join'));
        }
      }
    );

    socket.on('leave_conversation', (payload: string | { conversationId?: string }) => {
      const conversationId = typeof payload === 'string' ? payload : payload?.conversationId;
      if (conversationId) {
        void socket.leave(roomForConversation(conversationId));
      }
    });

    socket.on(
      'send_message',
      async (
        payload: { conversationId?: string; text?: string; senderId?: string },
        ack?: (result: { ok: true } | { ok: false; error: string }) => void
      ) => {
        try {
          const conversationId = payload?.conversationId;
          const text = payload?.text;
          if (!conversationId || typeof text !== 'string') {
            ack?.({ ok: false, error: 'conversationId and text required' });
            return;
          }
          const { message } = await createChatMessage(userId, conversationId, text);
          io.to(roomForConversation(conversationId)).emit('new_message', { message });
          ack?.({ ok: true });
        } catch (e) {
          if (e instanceof ChatMessageError) {
            ack?.({ ok: false, error: e.message });
            return;
          }
          console.error('[socket] send_message', e);
          ack?.({ ok: false, error: 'Failed to send' });
        }
      }
    );

    socket.on(
      'typing',
      (payload: { conversationId?: string; isTyping?: boolean; userId?: string }) => {
        const conversationId = payload?.conversationId;
        if (!conversationId || !Types.ObjectId.isValid(conversationId)) {
          return;
        }
        void (async () => {
          const conv = await Conversation.findById(conversationId).select('participants').lean();
          if (!conv || !conv.participants.some((p) => p.equals(userId))) {
            return;
          }
          socket.to(roomForConversation(conversationId)).emit('user_typing', {
            conversationId,
            userId: userId.toString(),
            isTyping: Boolean(payload?.isTyping),
          });
        })();
      }
    );

    socket.on('messages_read', (payload: { conversationId?: string; userId?: string }) => {
      const conversationId = payload?.conversationId;
      if (!conversationId || !Types.ObjectId.isValid(conversationId)) {
        return;
      }
      void (async () => {
        const result = await markConversationReadByUser(userId, conversationId);
        if (!result) {
          return;
        }
        io.to(roomForConversation(conversationId)).emit('messages_read', {
          conversationId,
          readerId: userId.toString(),
          readAt: result.readAtIso,
        });
      })();
    });
  });
}
