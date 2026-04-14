import { Router } from 'express';
import {
  getIceConfig,
  postAcceptCall,
  postCancelCall,
  postEndCall,
  postRejectCall,
  postSignalAnswer,
  postSignalIce,
  postSignalOffer,
  postStartCall,
} from '../controllers/callController';
import { authenticate } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/ice-config', getIceConfig);
router.post('/start', postStartCall);
router.post('/accept', postAcceptCall);
router.post('/reject', postRejectCall);
router.post('/cancel', postCancelCall);
router.post('/end', postEndCall);
router.post('/signal/offer', postSignalOffer);
router.post('/signal/answer', postSignalAnswer);
router.post('/signal/ice', postSignalIce);

export default router;
