import { Router } from 'express';
import {
  logAgreement,
  getAgreements,
} from '../controllers/agreementController';
import { authenticate } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

router.post('/', logAgreement);
router.get('/car-request/:carRequestId', getAgreements);

export default router;

