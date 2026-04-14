import { Router } from 'express';
import {
  clearConversationHandler,
  createConversation,
  deleteConversation,
  deleteMessageHandler,
  getUnreadChatCount,
  listConversations,
  listMatches,
  listMessages,
  markConversationRead,
  markConversationUnreadHandler,
  patchConversationPin,
  patchConversationSettings,
  patchMessageReaction,
  patchMessageStar,
  postCallLog,
  postConversationLockHandler,
  postAudioNoteUpload,
  postMessage,
  postMessageUpload,
  postReportMessage,
  recentTripsForChat,
} from '../controllers/chatController';
import { authenticate } from '../middleware/auth';
import { audioNoteUpload } from '../middleware/audioNoteUpload';
import { chatMediaUpload } from '../middleware/chatUpload';

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
router.post('/conversations/:conversationId/call-log', postCallLog);
router.patch('/conversations/:conversationId/pin', patchConversationPin);

router.post('/messages/upload', chatMediaUpload.single('file'), postMessageUpload);
router.post('/audio-notes/upload', audioNoteUpload.single('file'), postAudioNoteUpload);
router.post('/messages', postMessage);
router.get('/messages/:conversationId', listMessages);
router.patch('/messages/:messageId/reaction', patchMessageReaction);
router.patch('/messages/:messageId/star', patchMessageStar);
router.delete('/messages/:messageId', deleteMessageHandler);
router.post('/messages/:messageId/report', postReportMessage);

router.get('/chat/matches', listMatches);
router.get('/chat/unread-count', getUnreadChatCount);
router.get('/chat/recent-trips', recentTripsForChat);

export default router;
