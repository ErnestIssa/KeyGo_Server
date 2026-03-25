import { Response } from 'express';
import Trip from '../models/Trip';
import { AuthRequest } from '../middleware/auth';

function refId(ref: unknown): string | null {
  if (ref == null) return null;
  if (typeof ref === 'object' && ref !== null && '_id' in ref) {
    return String((ref as { _id: unknown })._id);
  }
  return String(ref);
}

const tripJson = (trip: {
  _id: unknown;
  owner: unknown;
  driver?: unknown;
  pickupLocation: string;
  dropoffLocation: string;
  carDescription: string;
  paymentAmount: number;
  status: string;
  createdAt: Date;
}) => {
  const o = trip.owner as { _id?: unknown; name?: string; email?: string } | null;
  const d = trip.driver as { _id?: unknown; name?: string; email?: string } | null;
  return {
    id: String(trip._id),
    pickupLocation: trip.pickupLocation,
    dropoffLocation: trip.dropoffLocation,
    carDescription: trip.carDescription,
    paymentAmount: trip.paymentAmount,
    status: trip.status,
    createdAt: trip.createdAt,
    owner: o
      ? { id: String(o._id), name: o.name, email: o.email }
      : undefined,
    driver: d
      ? { id: String(d._id), name: d.name, email: d.email }
      : undefined,
  };
};

export const createTrip = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user || user.role !== 'owner') {
      res.status(403).json({ error: 'Only owners can create trips' });
      return;
    }

    const { pickupLocation, dropoffLocation, carDescription, paymentAmount } = req.body as {
      pickupLocation?: string;
      dropoffLocation?: string;
      carDescription?: string;
      paymentAmount?: number;
    };

    if (!pickupLocation?.trim() || !dropoffLocation?.trim() || !carDescription?.trim()) {
      res.status(400).json({ error: 'Pickup, dropoff, and car description are required' });
      return;
    }

    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      res.status(400).json({ error: 'paymentAmount must be a non-negative number' });
      return;
    }

    const trip = await Trip.create({
      owner: user._id,
      pickupLocation: pickupLocation.trim(),
      dropoffLocation: dropoffLocation.trim(),
      carDescription: carDescription.trim(),
      paymentAmount: amount,
      status: 'pending',
    });

    await trip.populate('owner', 'name email');
    res.status(201).json({ trip: tripJson(trip) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create trip' });
  }
};

/** Pending trips for drivers to browse */
export const listAvailableTrips = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user || user.role !== 'driver') {
      res.status(403).json({ error: 'Only drivers can browse available trips' });
      return;
    }

    const trips = await Trip.find({ status: 'pending' })
      .sort({ createdAt: -1 })
      .populate('owner', 'name email');

    res.json({ trips: trips.map((t: (typeof trips)[number]) => tripJson(t)) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list trips' });
  }
};

/** Trips where I am owner or assigned driver */
export const listMyTrips = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const uid = user._id;
    const trips = await Trip.find({
      $or: [{ owner: uid }, { driver: uid }],
    })
      .sort({ createdAt: -1 })
      .populate('owner', 'name email')
      .populate('driver', 'name email');

    res.json({ trips: trips.map((t: (typeof trips)[number]) => tripJson(t)) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list your trips' });
  }
};

export const getTrip = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { id } = req.params;
    const trip = await Trip.findById(id).populate('owner', 'name email').populate('driver', 'name email');

    if (!trip) {
      res.status(404).json({ error: 'Trip not found' });
      return;
    }

    const uid = String(user._id);
    const isOwner = refId(trip.owner) === uid;
    const isDriver = refId(trip.driver) === uid;

    if (trip.status === 'pending' && user.role === 'driver') {
      res.json({ trip: tripJson(trip) });
      return;
    }

    if (isOwner || isDriver) {
      res.json({ trip: tripJson(trip) });
      return;
    }

    res.status(403).json({ error: 'You cannot view this trip' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load trip' });
  }
};

export const acceptTrip = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user || user.role !== 'driver') {
      res.status(403).json({ error: 'Only drivers can accept trips' });
      return;
    }

    const { id } = req.params;
    const trip = await Trip.findById(id);

    if (!trip) {
      res.status(404).json({ error: 'Trip not found' });
      return;
    }

    if (String(trip.owner) === String(user._id)) {
      res.status(403).json({ error: 'You cannot accept your own trip' });
      return;
    }

    if (trip.status !== 'pending') {
      res.status(400).json({ error: 'Trip is not available to accept' });
      return;
    }

    trip.driver = user._id;
    trip.status = 'accepted';
    await trip.save();
    await trip.populate('owner', 'name email');
    await trip.populate('driver', 'name email');

    res.json({ trip: tripJson(trip) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to accept trip' });
  }
};

export const completeTrip = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user || user.role !== 'owner') {
      res.status(403).json({ error: 'Only the owner can confirm delivery' });
      return;
    }

    const { id } = req.params;
    const trip = await Trip.findById(id);

    if (!trip) {
      res.status(404).json({ error: 'Trip not found' });
      return;
    }

    if (String(trip.owner) !== String(user._id)) {
      res.status(403).json({ error: 'Only the trip owner can complete it' });
      return;
    }

    if (trip.status !== 'accepted') {
      res.status(400).json({ error: 'Trip must be accepted before completion' });
      return;
    }

    trip.status = 'completed';
    await trip.save();
    await trip.populate('owner', 'name email');
    await trip.populate('driver', 'name email');

    res.json({ trip: tripJson(trip) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to complete trip' });
  }
};
