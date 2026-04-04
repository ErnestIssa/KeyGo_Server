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
} from '../controllers/userController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/demo-login', demoLogin);
router.get('/profile', authenticate, getProfile);
router.post('/push-token', authenticate, registerPushToken);
router.get('/public/:userId', authenticate, getPublicProfile);
router.patch('/role', authenticate, updateRole);
router.post('/avatar', authenticate, uploadAvatar);

export default router;
