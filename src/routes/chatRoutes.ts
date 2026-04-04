import { Router } from 'express';
import {
  createConversation,
  deleteConversation,
  getUnreadChatCount,
  listConversations,
  listMatches,
  listMessages,
  markConversationRead,
  postMessage,
  recentTripsForChat,
} from '../controllers/chatController';
import { authenticate } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.post('/conversations', createConversation);
router.get('/conversations', listConversations);
router.delete('/conversations/:conversationId', deleteConversation);
router.post('/conversations/:conversationId/read', markConversationRead);
router.post('/messages', postMessage);
router.get('/messages/:conversationId', listMessages);
router.get('/chat/matches', listMatches);
router.get('/chat/unread-count', getUnreadChatCount);
router.get('/chat/recent-trips', recentTripsForChat);

export default router;
