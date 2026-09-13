import { getTimes } from 'suncalc'

import { haversineKm, type LatLon } from '@/lib/geo'
import type { Beach } from '@/lib/seed/beaches'

/**
 * Conditions: wind on every beach, water temperature only where it is really
 * measured, daylight computed at render. Pure: the store hands in rows, this
 * module decides what the page may honestly show.
 *
 * The rules, in the order they bite:
 *  - a wind row older than STALE_AFTER_MS is treated as absent, so a failed
 *    fetch leaves the previous row in the table but never shows yesterday's
 *    wind as now;
 *  - the one buoy reading joins only salt beaches within BUOY_REACH_KM of the
 *    buoy, so no lake ever carries a water figure and no far coast borrows one;
 *  - a buoy row whose sensor reported a gap (null) contributes nothing.
 */

/** The SmartAtlantic "Halifax (Herring Cove)" buoy. */
export const HALIFAX_BUOY = {
  id: 'smartatlantic-halifax',
  lat: 44.5559,
  lon: -63.5445,
} as const

/**
 * How far from the buoy its water temperature is still an honest reading. The
 * line falls in the natural gap between Taylor Head (83 km, same Atlantic
 * coast) and Melmerby (147 km, Northumberland Strait).
 */
export const BUOY_REACH_KM = 100

/** A wind row older than this is absent, not "current". */
export const STALE_AFTER_MS = 3 * 60 * 60 * 1000

/**
 * The buoy publishes in batches a few hours behind the clock (its newest row
 * sat four hours back when the feed was captured), so its reading keeps for
 * the same window the fetch asks for.
 */
export const BUOY_STALE_AFTER_MS = 6 * 60 * 60 * 1000

export type Compass = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW'

const COMPASS: readonly Compass[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

/** One `beach_conditions` row: what Open-Meteo said at the beach's own coordinates. */
export interface ConditionsRow {
  beachId: string
  windKmh: number
  windDirDeg: number
  airTempC: number | null
  /** Open-Meteo's `current.time` as a UTC instant, not the cron time. */
  observedAt: string
}

/** The `buoy_reading` row: one per buoy, `waterTempC` null when the sensor reported a gap. */
export interface BuoyReading {
  buoy: string
  waterTempC: number | null
  observedAt: string
}

/** What the page shows for one beach. Plain data, already merged and filtered. */
export interface ConditionsView {
  windKmh: number
  windDir: Compass
  airTempC?: number
  /** ISO instant of the wind reading; the line's time stamp. */
  observedAt: string
  /** Salt beaches within BUOY_REACH_KM only, and only when the sensor reported a value. */
  waterTempC?: number
  waterObservedAt?: string
  /** ISO instants, computed from the beach's coordinates for the day of `now`. Absent only where the sun never rises or sets. */
  sunrise?: string
  sunset?: string
}

/** Degrees → the nearest of eight points; 0 and 360 are both N. */
export function compassPoint(deg: number): Compass {
  const normalised = ((deg % 360) + 360) % 360
  return COMPASS[Math.round(normalised / 45) % 8]
}

/** True when `beach` may carry the Halifax buoy's water temperature at all. */
export function withinBuoyReach(beach: Pick<Beach, 'water'> & LatLon): boolean {
  return beach.water === 'salt' && haversineKm(beach, HALIFAX_BUOY) <= BUOY_REACH_KM
}

function isoOrUndefined(d: Date | null | undefined): string | undefined {
  return d && Number.isFinite(d.getTime()) ? d.toISOString() : undefined
}

function isFresh(observedAt: string, now: Date, maxAgeMs: number): boolean {
  const t = new Date(observedAt).getTime()
  return Number.isFinite(t) && now.getTime() - t <= maxAgeMs
}

export interface MergeConditionsInput {
  rows: readonly ConditionsRow[]
  buoy: BuoyReading | null
  beaches: readonly Beach[]
  now: Date
}

/**
 * Join the wind rows, the one buoy reading and daylight into a view per beach.
 * A beach with no fresh wind row has no entry: the detail omits the line rather
 * than print a placeholder.
 */
export function mergeConditions({ rows, buoy, beaches, now }: MergeConditionsInput): Record<string, ConditionsView | undefined> {
  const byBeach = new Map(rows.map((row) => [row.beachId, row]))
  const water =
    buoy && buoy.waterTempC !== null && isFresh(buoy.observedAt, now, BUOY_STALE_AFTER_MS)
      ? { waterTempC: buoy.waterTempC, waterObservedAt: buoy.observedAt }
      : null

  const out: Record<string, ConditionsView | undefined> = {}
  for (const beach of beaches) {
    const row = byBeach.get(beach.id)
    if (!row || !isFresh(row.observedAt, now, STALE_AFTER_MS)) continue

    const times = getTimes(now, beach.lat, beach.lon)
    const view: ConditionsView = {
      windKmh: row.windKmh,
      windDir: compassPoint(row.windDirDeg),
      observedAt: row.observedAt,
    }
    const sunrise = isoOrUndefined(times.sunrise)
    const sunset = isoOrUndefined(times.sunset)
    if (sunrise) view.sunrise = sunrise
    if (sunset) view.sunset = sunset
    if (row.airTempC !== null) view.airTempC = row.airTempC
    if (water && withinBuoyReach(beach)) {
      view.waterTempC = water.waterTempC
      view.waterObservedAt = water.waterObservedAt
    }
    out[beach.id] = view
  }
  return out
}
