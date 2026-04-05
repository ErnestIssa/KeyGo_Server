import { Request, Response } from 'express';
import User from '../models/User';
import Trip from '../models/Trip';

/** GET /api/public/bootstrap — counts for splash / marketing (no auth). */
export const getBootstrap = async (_req: Request, res: Response): Promise<void> => {
  try {
    const [userCount, tripCount] = await Promise.all([User.countDocuments(), Trip.countDocuments()]);
    res.json({
      userCount,
      tripCount,
      tagline: 'KeyGo — vehicle relocation, not a taxi.',
    });
  } catch (e) {
    console.error('[public] bootstrap', e);
    res.status(500).json({ error: 'bootstrap failed' });
  }
};
