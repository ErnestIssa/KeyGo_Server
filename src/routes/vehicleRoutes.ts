import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { listVehicles } from '../controllers/vehicleController';

const router = Router();

router.use(authenticate);
router.get('/', listVehicles);

export default router;
