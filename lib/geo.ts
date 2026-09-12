import type { Beach, Region } from '@/lib/seed/beaches'

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
 * A user position farther than this from Halifax is outside Nova Scotia; sorting
 * 35 beaches by distance from Toronto is honest but useless, so the list falls
 * back to Halifax order and says so.
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

/** Display order for the expanded list. Halifax first because most users are there. */
export const REGION_ORDER: readonly Region[] = [
  'Halifax',
  'Eastern Shore',
  'South Shore',
  'Valley',
  'North Shore',
  'Cape Breton',
]

export interface RegionGroup {
  region: Region
  beaches: WithDistance<Beach>[]
}

/** Groups in REGION_ORDER, each sorted by distance from `origin`; empty groups are omitted. */
export function groupByRegion(
  beaches: readonly Beach[],
  origin: LatLon,
): RegionGroup[] {
  const sorted = sortByDistance(beaches, origin)
  return REGION_ORDER.flatMap((region) => {
    const members = sorted.filter((b) => b.region === region)
    return members.length ? [{ region, beaches: members }] : []
  })
}

export type OriginKind = 'user' | 'halifax'

export interface ResolvedOrigin {
  origin: LatLon
  originKind: OriginKind
  /** True when a real position was supplied but is too far away to be useful. */
  farFromNovaScotia: boolean
}

export function resolveOrigin(position: LatLon | null | undefined): ResolvedOrigin {
  if (!position) return { origin: HALIFAX, originKind: 'halifax', farFromNovaScotia: false }
  if (haversineKm(position, HALIFAX) > MAX_USEFUL_ORIGIN_KM) {
    return { origin: HALIFAX, originKind: 'halifax', farFromNovaScotia: true }
  }
  return { origin: position, originKind: 'user', farFromNovaScotia: false }
}
