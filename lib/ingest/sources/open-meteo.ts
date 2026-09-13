import type { ConditionsRow } from '@/lib/conditions'
import { SourceParseError } from '@/lib/ingest/errors'
import { fetchText } from '@/lib/ingest/http'
import type { Roster } from '@/lib/ingest/types'
import { BEACHES } from '@/lib/seed/beaches'

/**
 * Open-Meteo: wind and air temperature at every beach's own coordinates, in one
 * batched call. Comma lists of coordinates return a JSON array with one object
 * per location, in request order, with `location_id` on the second and later
 * entries. `current.time` is local Halifax time without an offset; the payload
 * carries `utc_offset_seconds`, and the row stores the UTC instant.
 *
 * Free tier, no key, CC BY 4.0: credited in the footer.
 */
export const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast'
export const OPEN_METEO_CREDIT_URL = 'https://open-meteo.com/'

const CURRENT_FIELDS = ['wind_speed_10m', 'wind_direction_10m', 'temperature_2m'] as const

export function openMeteoUrl(roster: Roster = BEACHES): string {
  const params = new URLSearchParams({
    latitude: roster.map((b) => b.lat).join(','),
    longitude: roster.map((b) => b.lon).join(','),
    current: CURRENT_FIELDS.join(','),
    timezone: 'America/Halifax',
  })
  return `${OPEN_METEO_URL}?${params}`
}

export async function fetchOpenMeteo(
  roster: Roster = BEACHES,
  opts?: { fetchImpl?: typeof fetch },
): Promise<string> {
  return fetchText(openMeteoUrl(roster), { ...opts, headers: { accept: 'application/json' } })
}

interface OpenMeteoLocation {
  latitude?: unknown
  longitude?: unknown
  utc_offset_seconds?: unknown
  location_id?: unknown
  current?: {
    time?: unknown
    wind_speed_10m?: unknown
    wind_direction_10m?: unknown
    temperature_2m?: unknown
  }
}

const LOCAL_TIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/

/** '2026-09-13T16:15' at UTC−3 → '2026-09-13T19:15:00.000Z'. */
export function localToInstant(local: string, utcOffsetSeconds: number): string {
  const m = LOCAL_TIME_RE.exec(local)
  if (!m) throw new SourceParseError(`Open-Meteo: unreadable current.time "${local}"`)
  const [, y, mo, d, h, mi, s] = m
  const utc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0))
  return new Date(utc - utcOffsetSeconds * 1000).toISOString()
}

function finite(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new SourceParseError(`Open-Meteo: ${what} is not a number`)
  }
  return value
}

/**
 * One row per roster beach, matched by position (`location_id`, 0 when absent).
 * Any location missing its wind is a malformed payload, not a gap: the whole
 * call fails and the previous rows stay. A missing air temperature is a gap.
 */
export function parseOpenMeteo(raw: string, roster: Roster = BEACHES): ConditionsRow[] {
  let payload: unknown
  try {
    payload = JSON.parse(raw)
  } catch {
    throw new SourceParseError('Open-Meteo: response is not JSON')
  }
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const reason = (payload as { reason?: unknown }).reason
    throw new SourceParseError(`Open-Meteo: ${typeof reason === 'string' ? reason : 'error response'}`)
  }
  const locations = (Array.isArray(payload) ? payload : [payload]) as OpenMeteoLocation[]
  if (locations.length !== roster.length) {
    throw new SourceParseError(`Open-Meteo: ${locations.length} locations for ${roster.length} beaches`)
  }

  const rows: ConditionsRow[] = []
  const seen = new Set<number>()
  for (const location of locations) {
    const id = location.location_id === undefined ? 0 : finite(location.location_id, 'location_id')
    const beach = roster[id]
    if (!beach || seen.has(id)) throw new SourceParseError(`Open-Meteo: unexpected location_id ${id}`)
    seen.add(id)

    const current = location.current
    if (!current || typeof current.time !== 'string') {
      throw new SourceParseError(`Open-Meteo: no current block for ${beach.id}`)
    }
    const airTemp = current.temperature_2m
    rows.push({
      beachId: beach.id,
      windKmh: finite(current.wind_speed_10m, `wind_speed_10m for ${beach.id}`),
      windDirDeg: Math.round(finite(current.wind_direction_10m, `wind_direction_10m for ${beach.id}`)),
      airTempC: typeof airTemp === 'number' && Number.isFinite(airTemp) ? airTemp : null,
      observedAt: localToInstant(current.time, finite(location.utc_offset_seconds, 'utc_offset_seconds')),
    })
  }
  return rows
}
