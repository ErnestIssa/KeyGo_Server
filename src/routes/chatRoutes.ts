import { Router } from 'express';
import {
  clearConversationHandler,
  createConversation,
  deleteConversation,
  getUnreadChatCount,
  listConversations,
  listMatches,
  listMessages,
  markConversationRead,
  markConversationUnreadHandler,
  patchConversationSettings,
  postConversationLockHandler,
  postMessage,
  recentTripsForChat,
} from '../controllers/chatController';
import { authenticate } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.post('/conversations', createConversation);
router.get('/conversations', listConversations);
router.delete('/conversations/:conversationId', deleteConversation);
router.patch('/conversations/:conversationId/settings', patchConversationSettings);
router.post('/conversations/:conversationId/clear', clearConversationHandler);
router.post('/conversations/:conversationId/mark-unread', markConversationUnreadHandler);
router.post('/conversations/:conversationId/lock', postConversationLockHandler);
router.post('/conversations/:conversationId/read', markConversationRead);
router.post('/messages', postMessage);
router.get('/messages/:conversationId', listMessages);
router.get('/chat/matches', listMatches);
router.get('/chat/unread-count', getUnreadChatCount);
router.get('/chat/recent-trips', recentTripsForChat);

export default router;
