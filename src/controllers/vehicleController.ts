import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';

export type VehiclePositionRow = {
  id: string;
  lat: number;
  lng: number;
};

/**
 * GET /api/vehicles — sample fleet positions (replace with DB / live pipeline later).
 * Slight motion over time so polling clients see changing coordinates.
 */
export const listVehicles = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const t = Date.now() / 8000;
    const vehicles: VehiclePositionRow[] = [
      {
        id: 'car1',
        lat: 59.33 + 0.003 * Math.sin(t),
        lng: 18.07 + 0.003 * Math.cos(t),
      },
      {
        id: 'car2',
        lat: 59.3285 + 0.002 * Math.cos(t * 1.1),
        lng: 18.065 + 0.002 * Math.sin(t * 0.9),
      },
    ];
    res.json(vehicles);
  } catch {
    res.status(500).json({ error: 'Failed to load vehicles' });
  }
};
