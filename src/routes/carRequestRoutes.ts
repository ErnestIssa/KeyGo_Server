import { Router } from 'express';
import {
  createCarRequest,
  getCarRequests,
  getCarRequest,
  updateCarRequest,
  deleteCarRequest,
  expressInterest,
  acceptRequest,
} from '../controllers/carRequestController';
import { authenticate } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

router.post('/', createCarRequest);
router.post('/requests', createCarRequest);
router.get('/', getCarRequests);
router.get('/:id', getCarRequest);
router.put('/:id', updateCarRequest);
router.delete('/:id', deleteCarRequest);
router.post('/:id/interest', expressInterest);
router.post('/:id/accept', acceptRequest);

export default router;

