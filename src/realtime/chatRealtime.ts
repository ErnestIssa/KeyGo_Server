import type { Server } from 'socket.io';

let ioRef: Server | null = null;

export function setChatSocketServer(io: Server): void {
  ioRef = io;
}

export function getChatSocketServer(): Server | null {
  return ioRef;
}

function roomForConversation(conversationId: string): string {
  return `conversation:${conversationId}`;
}

/** Notify others in the thread that read receipts changed (REST or socket). */
export function broadcastMessagesRead(
  conversationId: string,
  readerId: string,
  readAtIso: string
): void {
  ioRef
    ?.to(roomForConversation(conversationId))
    .emit('messages_read', { conversationId, readerId, readAt: readAtIso });
}

export function broadcastToConversation(conversationId: string, event: string, payload: unknown): void {
  ioRef?.to(roomForConversation(conversationId)).emit(event, payload);
}

/** Personal room: each socket joins `user:<userId>` in chatSocket for direct signaling / calls. */
export function userRoom(userId: string): string {
  return `user:${userId}`;
}

export function emitToUser(userId: string, event: string, payload: unknown): void {
  ioRef?.to(userRoom(userId)).emit(event, payload);
}
