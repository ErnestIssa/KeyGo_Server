import { Router } from 'express';
import {
  register,
  login,
  demoLogin,
  getProfile,
  getPublicProfile,
  registerPushToken,
  uploadAvatar,
  updateRole,
  patchUserSettings,
  patchUserAddress,
} from '../controllers/userController';
import { listInbox, postSupportMessage, markInboxRead } from '../controllers/inboxController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/demo-login', demoLogin);
router.get('/profile', authenticate, getProfile);
router.post('/push-token', authenticate, registerPushToken);
router.get('/public/:userId', authenticate, getPublicProfile);
router.patch('/role', authenticate, updateRole);
router.patch('/settings', authenticate, patchUserSettings);
router.patch('/address', authenticate, patchUserAddress);
router.get('/inbox', authenticate, listInbox);
router.post('/inbox/support', authenticate, postSupportMessage);
router.patch('/inbox/:id/read', authenticate, markInboxRead);
router.post('/avatar', authenticate, uploadAvatar);

export default router;
