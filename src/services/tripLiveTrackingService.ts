import type { ITrip } from '../models/Trip';
import { emitToUser } from '../realtime/chatRealtime';

const BROADCAST_THROTTLE_MS = 2000;
const lastBroadcast = new Map<string, number>();

export type MarkerKind = 'car' | 'person';

/** Who “owns” the car icon for map UX: before handoff the car is with the owner; after, with the driver. */
export function markerKindsForTrip(trip: {
  status: string;
  relocationPhase?: string | null;
  driver?: unknown;
}): { owner: MarkerKind; driver: MarkerKind } | null {
  if (trip.status === 'pending') {
    return { owner: 'car', driver: 'person' };
  }
  if (trip.status !== 'accepted') {
    return null;
  }
  const phase = trip.relocationPhase ?? 'awaiting_handoff';
  if (phase === 'in_transit') {
    return { owner: 'person', driver: 'car' };
  }
  return { owner: 'car', driver: 'person' };
}

export function liveLocationJson(
  vl?: { latitude: number; longitude: number; heading?: number; recordedAt: Date }
): {
  latitude: number;
  longitude: number;
  heading?: number;
  recordedAt: string;
} | undefined {
  if (!vl) return undefined;
  return {
    latitude: vl.latitude,
    longitude: vl.longitude,
    ...(vl.heading != null ? { heading: vl.heading } : {}),
    recordedAt: vl.recordedAt instanceof Date ? vl.recordedAt.toISOString() : String(vl.recordedAt),
  };
}

export function liveTrackingPayloadForTrip(trip: ITrip) {
  const kinds = markerKindsForTrip(trip);
  if (!kinds) return null;

  if (trip.status === 'pending') {
    return {
      relocationPhase: null as null,
      ownerLiveLocation: liveLocationJson(trip.ownerLiveLocation),
      driverLiveLocation: undefined as undefined,
      ownerMarkerKind: kinds.owner,
      driverMarkerKind: kinds.driver,
    };
  }

  if (trip.status === 'accepted') {
    return {
      relocationPhase: trip.relocationPhase ?? 'awaiting_handoff',
      ownerLiveLocation: liveLocationJson(trip.ownerLiveLocation),
      driverLiveLocation: liveLocationJson(trip.driverLiveLocation),
      ownerMarkerKind: kinds.owner,
      driverMarkerKind: kinds.driver,
    };
  }

  return null;
}

export type TripLiveSocketPayload = {
  tripId: string;
  relocationPhase: 'awaiting_handoff' | 'in_transit' | null;
  ownerLiveLocation: ReturnType<typeof liveLocationJson>;
  driverLiveLocation: ReturnType<typeof liveLocationJson>;
  vehicleLocation: ReturnType<typeof liveLocationJson>;
  ownerMarkerKind: MarkerKind;
  driverMarkerKind: MarkerKind;
  updatedByUserId: string;
};

export function buildTripLiveSocketPayload(trip: ITrip, updatedByUserId: string): TripLiveSocketPayload | null {
  const kinds = markerKindsForTrip(trip);
  if (!kinds) return null;
  const relocationPhase =
    trip.status === 'accepted' ? trip.relocationPhase ?? 'awaiting_handoff' : null;
  return {
    tripId: String(trip._id),
    relocationPhase,
    ownerLiveLocation: liveLocationJson(trip.ownerLiveLocation),
    driverLiveLocation: liveLocationJson(trip.driverLiveLocation),
    vehicleLocation: liveLocationJson(trip.vehicleLocation),
    ownerMarkerKind: kinds.owner,
    driverMarkerKind: kinds.driver,
    updatedByUserId,
  };
}

/** Throttle socket fan-out per trip (still persist every POST in the controller). */
export function shouldBroadcastTripLive(tripId: string): boolean {
  const now = Date.now();
  const last = lastBroadcast.get(tripId) ?? 0;
  if (now - last < BROADCAST_THROTTLE_MS) return false;
  lastBroadcast.set(tripId, now);
  return true;
}

export function broadcastTripLiveToParties(trip: ITrip, updatedByUserId: string): void {
  const payload = buildTripLiveSocketPayload(trip, updatedByUserId);
  if (!payload) return;
  const ownerId = String(trip.owner);
  const driverId = trip.driver ? String(trip.driver) : null;
  emitToUser(ownerId, 'trip_live_update', payload);
  if (driverId && driverId !== ownerId) {
    emitToUser(driverId, 'trip_live_update', payload);
  }
}

/** Same as `broadcastTripLiveToParties` but respects per-trip throttle (for high-frequency GPS POSTs). */
export function maybeBroadcastTripLive(trip: ITrip, updatedByUserId: string): void {
  if (!shouldBroadcastTripLive(String(trip._id))) return;
  broadcastTripLiveToParties(trip, updatedByUserId);
}
