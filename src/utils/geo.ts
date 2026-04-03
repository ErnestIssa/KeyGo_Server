export function parseCoordinate(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

export function isValidLatitude(n: number): boolean {
  return n >= -90 && n <= 90;
}

export function isValidLongitude(n: number): boolean {
  return n >= -180 && n <= 180;
}

export function isValidLatLng(lat: number, lng: number): boolean {
  return isValidLatitude(lat) && isValidLongitude(lng);
}
