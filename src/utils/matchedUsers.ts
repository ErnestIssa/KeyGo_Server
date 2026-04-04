import { Types } from 'mongoose';
import Trip from '../models/Trip';

/**
 * True when the two users have at least one trip together as owner ↔ driver (accepted or completed).
 */
export async function areUsersMatched(userIdA: Types.ObjectId, userIdB: Types.ObjectId): Promise<boolean> {
  if (userIdA.equals(userIdB)) return false;
  const trip = await Trip.findOne({
    status: { $in: ['accepted', 'completed'] },
    $or: [
      { owner: userIdA, driver: userIdB },
      { owner: userIdB, driver: userIdA },
    ],
  })
    .select('_id')
    .lean();
  return Boolean(trip);
}

/** Sorted pair of ObjectIds for conversation uniqueness. */
export function sortedParticipantPair(a: Types.ObjectId, b: Types.ObjectId): [Types.ObjectId, Types.ObjectId] {
  const sa = a.toString();
  const sb = b.toString();
  return sa < sb ? [a, b] : [b, a];
}
