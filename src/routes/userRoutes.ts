import { Router } from 'express';
import { register, login, demoLogin, getProfile, uploadAvatar } from '../controllers/userController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/demo-login', demoLogin);
router.get('/profile', authenticate, getProfile);
router.post('/avatar', authenticate, uploadAvatar);

export default router;
