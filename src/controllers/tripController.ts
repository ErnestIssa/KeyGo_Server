import { Response } from 'express';
import Trip from '../models/Trip';
import type { ITrip } from '../models/Trip';
import { AuthRequest } from '../middleware/auth';
import {
  broadcastTripLiveToParties,
  liveTrackingPayloadForTrip,
  maybeBroadcastTripLive,
} from '../services/tripLiveTrackingService';
import { isValidLatLng, parseCoordinate } from '../utils/geo';

function refId(ref: unknown): string | null {
  if (ref == null) return null;
  if (typeof ref === 'object' && ref !== null && '_id' in ref) {
    return String((ref as { _id: unknown })._id);
  }
  return String(ref);
}

type Viewer = { _id: unknown; role: string; driverApproved?: boolean };

/** Server-computed UI hints — clients must not infer permissions from role + status alone. */
function allowedActionsForTrip(
  trip: { status: string; owner: unknown; driver?: unknown; relocationPhase?: string },
  viewer: Viewer
): { accept: boolean; complete: boolean; startRelocation: boolean } {
  const uid = String(viewer._id);
  const ownerId = refId(trip.owner);
  const driverId = refId(trip.driver);
  const isOwner = ownerId != null && ownerId === uid;

  if (viewer.role === 'driver' && trip.status === 'pending' && ownerId != null && ownerId !== uid) {
    return { accept: true, complete: false, startRelocation: false };
  }
  if (viewer.role === 'owner' && trip.status === 'accepted' && isOwner) {
    return { accept: false, complete: true, startRelocation: false };
  }
  const phase = trip.relocationPhase ?? 'awaiting_handoff';
  if (
    viewer.role === 'driver' &&
    trip.status === 'accepted' &&
    driverId === uid &&
    phase === 'awaiting_handoff' &&
    viewer.driverApproved !== false
  ) {
    return { accept: false, complete: false, startRelocation: true };
  }
  return { accept: false, complete: false, startRelocation: false };
}

const tripJson = (
  trip: {
    _id: unknown;
    owner: unknown;
    driver?: unknown;
    pickupLocation: string;
    dropoffLocation: string;
    pickupLatitude?: number;
    pickupLongitude?: number;
    dropoffLatitude?: number;
    dropoffLongitude?: number;
    vehicleLocation?: {
      latitude: number;
      longitude: number;
      heading?: number;
      recordedAt: Date;
    };
    ownerLiveLocation?: {
      latitude: number;
      longitude: number;
      heading?: number;
      recordedAt: Date;
    };
    driverLiveLocation?: {
      latitude: number;
      longitude: number;
      heading?: number;
      recordedAt: Date;
    };
    relocationPhase?: string;
    carDescription: string;
    paymentAmount: number;
    status: string;
    createdAt: Date;
  },
  viewer?: Viewer
) => {
  const o = trip.owner as { _id?: unknown; name?: string; email?: string } | null;
  const d = trip.driver as { _id?: unknown; name?: string; email?: string } | null;
  const vl = trip.vehicleLocation;
  const liveTracking = liveTrackingPayloadForTrip(trip as unknown as ITrip);
  return {
    id: String(trip._id),
    pickupLocation: trip.pickupLocation,
    dropoffLocation: trip.dropoffLocation,
    ...(trip.pickupLatitude != null && trip.pickupLongitude != null
      ? { pickupLatitude: trip.pickupLatitude, pickupLongitude: trip.pickupLongitude }
      : {}),
    ...(trip.dropoffLatitude != null && trip.dropoffLongitude != null
      ? { dropoffLatitude: trip.dropoffLatitude, dropoffLongitude: trip.dropoffLongitude }
      : {}),
    ...(vl
      ? {
          vehicleLocation: {
            latitude: vl.latitude,
            longitude: vl.longitude,
            ...(vl.heading != null ? { heading: vl.heading } : {}),
            recordedAt: vl.recordedAt instanceof Date ? vl.recordedAt.toISOString() : vl.recordedAt,
          },
        }
      : {}),
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
    allowedActions: viewer
      ? allowedActionsForTrip(trip, viewer)
      : { accept: false, complete: false, startRelocation: false },
    ...(liveTracking ? { liveTracking } : {}),
  };
};

export const createTrip = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user || user.role !== 'owner') {
      res.status(403).json({ error: 'Only owners can create trips' });
      return;
    }

    const {
      pickupLocation,
      dropoffLocation,
      carDescription,
      paymentAmount,
      pickupLatitude: rawPickupLat,
      pickupLongitude: rawPickupLng,
      dropoffLatitude: rawDropLat,
      dropoffLongitude: rawDropLng,
    } = req.body as {
      pickupLocation?: string;
      dropoffLocation?: string;
      carDescription?: string;
      paymentAmount?: number;
      pickupLatitude?: unknown;
      pickupLongitude?: unknown;
      dropoffLatitude?: unknown;
      dropoffLongitude?: unknown;
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

    const pLat = parseCoordinate(rawPickupLat);
    const pLng = parseCoordinate(rawPickupLng);
    const dLat = parseCoordinate(rawDropLat);
    const dLng = parseCoordinate(rawDropLng);

    const trip = await Trip.create({
      owner: user._id,
      pickupLocation: pickupLocation.trim(),
      dropoffLocation: dropoffLocation.trim(),
      carDescription: carDescription.trim(),
      paymentAmount: amount,
      status: 'pending',
      ...(pLat != null && pLng != null && isValidLatLng(pLat, pLng)
        ? { pickupLatitude: pLat, pickupLongitude: pLng }
        : {}),
      ...(dLat != null && dLng != null && isValidLatLng(dLat, dLng)
        ? { dropoffLatitude: dLat, dropoffLongitude: dLng }
        : {}),
    });

    await trip.populate('owner', 'name email');
    res.status(201).json({ trip: tripJson(trip, user) });
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

    if (user.driverApproved === false) {
      res.status(403).json({ error: 'Driver account is not approved to browse trips' });
      return;
    }

    const trips = await Trip.find({
      status: 'pending',
      owner: { $ne: user._id },
    })
      .sort({ createdAt: -1 })
      .populate('owner', 'name email');

    res.json({ trips: trips.map((t: (typeof trips)[number]) => tripJson(t, user)) });
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

    res.json({ trips: trips.map((t: (typeof trips)[number]) => tripJson(t, user)) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list your trips' });
  }
};

/** Assigned driver reports live vehicle position (accepted trips only). */
export const updateTripVehicleLocation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user || user.role !== 'driver') {
      res.status(403).json({ error: 'Only drivers can update vehicle location' });
      return;
    }

    if (user.driverApproved === false) {
      res.status(403).json({ error: 'Driver account is not approved' });
      return;
    }

    const { id } = req.params;
    const { latitude: rawLat, longitude: rawLng, heading: rawHeading } = req.body as {
      latitude?: unknown;
      longitude?: unknown;
      heading?: unknown;
    };

    const lat = parseCoordinate(rawLat);
    const lng = parseCoordinate(rawLng);
    if (lat == null || lng == null || !isValidLatLng(lat, lng)) {
      res.status(400).json({ error: 'Valid latitude and longitude are required' });
      return;
    }

    let heading: number | undefined;
    if (rawHeading !== undefined && rawHeading !== null && rawHeading !== '') {
      const h = parseCoordinate(rawHeading);
      if (h == null || h < 0 || h > 360) {
        res.status(400).json({ error: 'heading must be a number from 0 to 360' });
        return;
      }
      heading = h;
    }

    const trip = await Trip.findById(id);
    if (!trip) {
      res.status(404).json({ error: 'Trip not found' });
      return;
    }

    if (String(trip.driver) !== String(user._id)) {
      res.status(403).json({ error: 'Only the assigned driver can update vehicle location' });
      return;
    }

    if (trip.status !== 'accepted') {
      res.status(400).json({ error: 'Trip must be accepted to report location' });
      return;
    }

    const loc = {
      latitude: lat,
      longitude: lng,
      recordedAt: new Date(),
      ...(heading != null ? { heading } : {}),
    };
    trip.driverLiveLocation = loc;
    if (trip.relocationPhase === 'in_transit') {
      trip.vehicleLocation = loc;
    }
    await trip.save();
    await trip.populate('owner', 'name email');
    await trip.populate('driver', 'name email');

    maybeBroadcastTripLive(trip as unknown as ITrip, String(user._id));

    res.json({ trip: tripJson(trip, user) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update vehicle location' });
  }
};

/** Owner or driver posts device GPS; server stores, throttled socket broadcast to the other party. */
export const postTripLiveLocation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { id } = req.params;
    const { latitude: rawLat, longitude: rawLng, heading: rawHeading } = req.body as {
      latitude?: unknown;
      longitude?: unknown;
      heading?: unknown;
    };

    const lat = parseCoordinate(rawLat);
    const lng = parseCoordinate(rawLng);
    if (lat == null || lng == null || !isValidLatLng(lat, lng)) {
      res.status(400).json({ error: 'Valid latitude and longitude are required' });
      return;
    }

    let heading: number | undefined;
    if (rawHeading !== undefined && rawHeading !== null && rawHeading !== '') {
      const h = parseCoordinate(rawHeading);
      if (h == null || h < 0 || h > 360) {
        res.status(400).json({ error: 'heading must be a number from 0 to 360' });
        return;
      }
      heading = h;
    }

    const trip = await Trip.findById(id);
    if (!trip) {
      res.status(404).json({ error: 'Trip not found' });
      return;
    }

    const uid = String(user._id);
    const isOwner = refId(trip.owner) === uid;
    const isDriver = refId(trip.driver) === uid;

    const loc = {
      latitude: lat,
      longitude: lng,
      recordedAt: new Date(),
      ...(heading != null ? { heading } : {}),
    };

    if (trip.status === 'pending') {
      if (!isOwner) {
        res.status(403).json({ error: 'Only the trip owner can share location before a driver accepts' });
        return;
      }
      trip.ownerLiveLocation = loc;
    } else if (trip.status === 'accepted') {
      if (!isOwner && !isDriver) {
        res.status(403).json({ error: 'You are not a party on this trip' });
        return;
      }
      if (isOwner) {
        trip.ownerLiveLocation = loc;
      }
      if (isDriver) {
        trip.driverLiveLocation = loc;
        if (trip.relocationPhase === 'in_transit') {
          trip.vehicleLocation = loc;
        }
      }
    } else {
      res.status(400).json({ error: 'Live tracking is only available for open or active relocations' });
      return;
    }

    await trip.save();
    await trip.populate('owner', 'name email');
    await trip.populate('driver', 'name email');

    maybeBroadcastTripLive(trip as unknown as ITrip, uid);

    res.json({ trip: tripJson(trip, user) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update live location' });
  }
};

/** Driver marks relocation underway (car handed off); icon semantics flip server-side. */
export const startTripRelocation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user || user.role !== 'driver') {
      res.status(403).json({ error: 'Only the assigned driver can start relocation' });
      return;
    }

    if (user.driverApproved === false) {
      res.status(403).json({ error: 'Driver account is not approved' });
      return;
    }

    const { id } = req.params;
    const trip = await Trip.findById(id);
    if (!trip) {
      res.status(404).json({ error: 'Trip not found' });
      return;
    }

    if (String(trip.driver) !== String(user._id)) {
      res.status(403).json({ error: 'Only the assigned driver can start this relocation' });
      return;
    }

    if (trip.status !== 'accepted') {
      res.status(400).json({ error: 'Trip must be accepted first' });
      return;
    }

    trip.relocationPhase = 'in_transit';
    await trip.save();
    await trip.populate('owner', 'name email');
    await trip.populate('driver', 'name email');

    broadcastTripLiveToParties(trip as unknown as ITrip, String(user._id));

    res.json({ trip: tripJson(trip, user) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to start relocation' });
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
      if (isOwner) {
        res.status(403).json({
          error: 'This is your trip request. Switch to owner mode to view or manage it.',
        });
        return;
      }
      if (user.driverApproved === false) {
        res.status(403).json({ error: 'Driver account is not approved to view available trips' });
        return;
      }
      res.json({ trip: tripJson(trip, user) });
      return;
    }

    if (isOwner || isDriver) {
      res.json({ trip: tripJson(trip, user) });
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

    if (user.driverApproved === false) {
      res.status(403).json({ error: 'Driver account is not approved to accept trips' });
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
    trip.relocationPhase = 'awaiting_handoff';
    await trip.save();
    await trip.populate('owner', 'name email');
    await trip.populate('driver', 'name email');

    broadcastTripLiveToParties(trip as unknown as ITrip, String(user._id));

    res.json({ trip: tripJson(trip, user) });
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
    trip.relocationPhase = undefined;
    trip.ownerLiveLocation = undefined;
    trip.driverLiveLocation = undefined;
    trip.vehicleLocation = undefined;
    await trip.save();
    await trip.populate('owner', 'name email');
    await trip.populate('driver', 'name email');

    res.json({ trip: tripJson(trip, user) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to complete trip' });
  }
};
