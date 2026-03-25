import { Router } from 'express';
import { register, login, demoLogin, getProfile } from '../controllers/userController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/demo-login', demoLogin);
router.get('/profile', authenticate, getProfile);

export default router;
