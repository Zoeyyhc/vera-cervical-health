export type LatLng = { lat: number; lng: number };

const EARTH_RADIUS_M = 6_371_000;

/**
 * Great-circle distance between two coordinates, in metres.
 * Uses the Haversine formula - accurate to ~0.5% over distances up to ~1000 km
 * which is well within what we need for clinic-finder UX.
 */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}
