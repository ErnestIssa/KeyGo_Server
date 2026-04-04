/**
 * Real-time chat (Socket.IO / ws) — placeholder.
 *
 * When you add a WebSocket server:
 * - On connection, verify JWT and join rooms `conversation:<id>` for each participant conversation.
 * - On POST message success (or in controller), emit `message:new` to room `conversation:<conversationId>`.
 * - Mobile/web clients subscribe and merge into local state or invalidate polling.
 */
export function registerChatRealtimePlaceholder(): void {
  /* intentionally empty */
}
