import { Router } from 'express';
import { getBootstrap } from '../controllers/bootstrapController';

const router = Router();

router.get('/bootstrap', getBootstrap);

export default router;
