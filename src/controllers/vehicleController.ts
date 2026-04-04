import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';

export type VehiclePositionRow = {
  id: string;
  lat: number;
  lng: number;
  /** Human-readable status for map UI (replace with live trip state later). */
  status?: string;
  /** Approximate speed for demo (km/h). */
  speedKmh?: number;
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
        status: 'En route',
        speedKmh: Math.round(28 + 8 * Math.sin(t * 0.7)),
      },
      {
        id: 'car2',
        lat: 59.3285 + 0.002 * Math.cos(t * 1.1),
        lng: 18.065 + 0.002 * Math.sin(t * 0.9),
        status: 'Idle',
        speedKmh: Math.round(3 + 4 * Math.abs(Math.sin(t * 1.2))),
      },
    ];
    res.json(vehicles);
  } catch {
    res.status(500).json({ error: 'Failed to load vehicles' });
  }
};
