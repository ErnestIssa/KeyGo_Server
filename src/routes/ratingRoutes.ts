import { Router } from 'express';
import {
  createRating,
  getUserRatings,
  updateRating,
} from '../controllers/ratingController';
import { authenticate } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

router.post('/', createRating);
router.get('/user/:userId', getUserRatings);
router.put('/:id', updateRating);

export default router;

