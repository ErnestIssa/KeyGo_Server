import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  createTrip,
  listAvailableTrips,
  listMyTrips,
  getTrip,
  acceptTrip,
  completeTrip,
  updateTripVehicleLocation,
  postTripLiveLocation,
  startTripRelocation,
} from '../controllers/tripController';

const router = Router();

router.use(authenticate);

router.post('/', createTrip);
router.get('/available', listAvailableTrips);
router.get('/mine', listMyTrips);
router.patch('/:id/vehicle-location', updateTripVehicleLocation);
router.patch('/:id/live-location', postTripLiveLocation);
router.post('/:id/start-relocation', startTripRelocation);
router.get('/:id', getTrip);
router.post('/:id/accept', acceptTrip);
router.post('/:id/complete', completeTrip);

export default router;
