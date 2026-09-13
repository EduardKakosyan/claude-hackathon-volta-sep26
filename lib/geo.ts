export interface LatLon {
  lat: number
  lon: number
}

/**
 * Where the nearby list is measured from when location is unknown, declined, or
 * far away. The same point `HALIFAX_VIEW` in map-style.ts lands the camera on.
 */
export const HALIFAX: LatLon = { lat: 44.65, lon: -63.58 }

/** Mean Earth radius (IUGG). */
export const EARTH_RADIUS_KM = 6371.0088

/**
 * A user position farther than this from Halifax is outside Nova Scotia. The
 * list still sorts from there with honest distances ("310 km"), but the note
 * under the heading says the nearest monitored beach is far.
 */
export const MAX_USEFUL_ORIGIN_KM = 400

export function haversineKm(a: LatLon, b: LatLon): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}

/** "7.8 km" under ten kilometres, "17 km" from ten up, "<0.1 km" when on top of it. */
export function formatDistance(km: number): string {
  if (!Number.isFinite(km) || km < 0) return ''
  if (km < 0.1) return '<0.1 km'
  if (km < 9.95) return `${km.toFixed(1)} km`
  return `${Math.round(km)} km`
}

export type WithDistance<T> = T & { km: number }

export function withDistance<T extends LatLon>(
  items: readonly T[],
  origin: LatLon,
): WithDistance<T>[] {
  return items.map((item) => ({ ...item, km: haversineKm(origin, item) }))
}

/** Ascending by distance; ties broken by id so the order is stable across renders. */
export function sortByDistance<T extends LatLon & { id: string }>(
  items: readonly T[],
  origin: LatLon,
): WithDistance<T>[] {
  return withDistance(items, origin).sort(
    (a, b) => a.km - b.km || a.id.localeCompare(b.id, 'en'),
  )
}

export function nearest<T extends LatLon & { id: string }>(
  items: readonly T[],
  origin: LatLon,
  limit: number,
): WithDistance<T>[] {
  return sortByDistance(items, origin).slice(0, Math.max(0, limit))
}

export type OriginKind = 'user' | 'halifax'

/**
 * Where the directory measures from. `user` when a position is known (the
 * heading reads "Closest to you"), `halifax` otherwise ("Near Halifax").
 */
export interface ResolvedOrigin {
  kind: OriginKind
  point: LatLon
  /** True when the position is real but more than MAX_USEFUL_ORIGIN_KM from Halifax. */
  far: boolean
}

export function resolveOrigin(position: LatLon | null | undefined): ResolvedOrigin {
  if (!position) return { kind: 'halifax', point: HALIFAX, far: false }
  return { kind: 'user', point: position, far: haversineKm(position, HALIFAX) > MAX_USEFUL_ORIGIN_KM }
}
