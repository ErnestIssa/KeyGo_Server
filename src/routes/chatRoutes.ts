import { Router } from 'express';
import {
  sendMessage,
  getMessages,
  markAsRead,
} from '../controllers/chatController';
import { authenticate } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

router.post('/', sendMessage);
router.get('/car-request/:carRequestId', getMessages);
router.put('/:messageId/read', markAsRead);

export default router;

