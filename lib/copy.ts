// beach-status imports `offseasonLine` from here and this file imports the
// label rule from there; both are used inside functions only, never while a
// module is evaluating, so the two-way import is harmless.
import { statusPresentation } from '@/lib/beach-status'
import type { ConditionsView } from '@/lib/conditions'
import { formatClock, formatPosted } from '@/lib/dates'
import { SEASON } from '@/lib/season'
import type { Authority, Beach, BeachState } from '@/lib/seed/beaches'
import type { IngestSource, LiveStatus, SourceHealthView, StatusSource, StatusView } from '@/lib/status'

/**
 * The plain-English line under the status. Keyed by (state, source) because
 * state alone is not enough: a provincial "Closed for Construction" card must
 * not read as blue-green algae. Algae wording is reserved for the algae feed
 * and HRM's own closures.
 */
export const PLAIN_ENGLISH: Record<`${BeachState}:${StatusSource}`, string> = {
  'open:hrm': 'Tested and under the safe limit. Lifeguards on duty during posted hours.',
  'open:parks': 'No advisory posted by the province. Water is tested here but results are not published.',
  'open:algae': 'No advisory posted by the province. Water is tested here but results are not published.',
  'open:season': 'No advisory posted by the province. Water is tested here but results are not published.',

  'advisory:hrm':
    'Bacteria above the safe limit. Lifeguards are on site but not supervising swimming. Swimming is not recommended; keep dogs out of the water.',
  'advisory:parks': 'The province has posted a notice for this park. Read it below before you go.',
  'advisory:algae': 'The province has posted a notice for this park. Read it below before you go.',
  'advisory:season': 'The province has posted a notice for this park. Read it below before you go.',

  'closed:hrm':
    'Closed to swimming. Suspected blue-green algae, which can make people sick and kill dogs. Keep everyone out of the water.',
  'closed:algae':
    'Closed to swimming. Suspected blue-green algae, which can make people sick and kill dogs. Keep everyone out of the water.',
  'closed:parks': 'The province has closed this park. The reason is in the notice below.',
  'closed:season': 'The province has closed this park. The reason is in the notice below.',

  'offseason:hrm': 'No one is testing this beach right now. Last in-season status shown below.',
  'offseason:parks': 'No one is testing this beach right now. Last in-season status shown below.',
  'offseason:algae': 'No one is testing this beach right now. Last in-season status shown below.',
  'offseason:season': 'No one is testing this beach right now. Last in-season status shown below.',
}

/** Replay rows have no source, so the line can only describe the state. */
const REPLAY_LINE: Record<BeachState, string> = {
  open: 'No advisory or closure was recorded for this beach that day.',
  advisory: 'An advisory was in effect: swimming was not recommended.',
  closed: 'The beach was closed to swimming that day.',
  offseason: 'Supervision had ended for the season.',
}

export const SOURCE_SAYS: Record<StatusSource, string> = {
  hrm: 'halifax.ca says',
  parks: 'parks.novascotia.ca says',
  algae: 'novascotia.ca algae notice says',
  season: 'No notice posted',
}

export function plainEnglish(status: StatusView): string {
  if (status.kind === 'replay') return REPLAY_LINE[status.state]
  return PLAIN_ENGLISH[`${status.state}:${status.source}`]
}

/**
 * The one quiet status line out of season, in place of the status word, the
 * source's words and the plain English: nothing is being tested, and this is
 * when that changes. The date is the season window's (lib/season.ts), a
 * hand-edited constant until the authority posts a real one.
 */
export function offseasonLine(authority: Authority): string {
  return `Off-season. Lifeguards return ${SEASON[authority].returns}.`
}

export interface ConditionsFormat {
  /**
   * The row's right-hand column out of season, where the status word was:
   * "16 °C · 25 km/h SW", no "Wind" and no time — the row has no room, and
   * the detail carries the reading's time.
   */
  short?: boolean
  /** The detail out of season: " · Sunrise 6:41 a.m. · Sunset 7:32 p.m." appended when both are known. */
  daylight?: boolean
}

/**
 * The one quiet line of current conditions under the plain English:
 * "16 °C water · Wind 25 km/h SW · 2 p.m." for a salt beach near the buoy,
 * "Wind 25 km/h SW · 2 p.m." everywhere else. The time is the wind reading's,
 * never the page's. Nothing is printed for a figure the app does not have.
 */
export function formatConditions(c: ConditionsView, format: ConditionsFormat = {}): string {
  const parts: string[] = []
  if (format.short) {
    if (c.waterTempC !== undefined) parts.push(`${Math.round(c.waterTempC)} °C`)
    parts.push(`${Math.round(c.windKmh)} km/h ${c.windDir}`)
    return parts.join(' · ')
  }
  if (c.waterTempC !== undefined) parts.push(`${Math.round(c.waterTempC)} °C water`)
  parts.push(`Wind ${Math.round(c.windKmh)} km/h ${c.windDir}`)
  const clock = formatClock(c.observedAt)
  if (clock) parts.push(clock)
  if (format.daylight && c.sunrise && c.sunset) {
    const sunrise = formatClock(c.sunrise)
    const sunset = formatClock(c.sunset)
    if (sunrise && sunset) parts.push(`Sunrise ${sunrise}`, `Sunset ${sunset}`)
  }
  return parts.join(' · ')
}

/** Who a status came from, as a notification names it: the site, not "says". */
const SOURCE_NAME: Record<Exclude<StatusSource, 'season'>, string> = {
  hrm: 'halifax.ca',
  parks: 'parks.novascotia.ca',
  algae: 'novascotia.ca algae notice',
}

export interface PushPayload {
  title: string
  body: string
  beachId: string
}

/**
 * The one notification a follower gets when a beach changes state, in the
 * app's own words and the source's:
 *
 *   Chocolate Lake Beach is now Advisory
 *   halifax.ca: "Risk advisory in effect." Posted today, 8:02 a.m.
 *
 * The title uses the same authority-aware label as the detail, so a provincial
 * beach is never called "Open" — it reads "Rissers Beach: no advisory posted".
 * A calendar row (source `season`) has no words to quote: off-season it says
 * when the lifeguards return, in season that no notice is posted.
 */
export function pushPayload(beach: Pick<Beach, 'id' | 'name' | 'authority'>, status: LiveStatus, now: Date = new Date()): PushPayload {
  const { label } = statusPresentation(status.state, beach.authority)
  const title = /^No /.test(label)
    ? `${beach.name}: ${label.charAt(0).toLowerCase()}${label.slice(1)}`
    : `${beach.name} is now ${label}`

  const when = status.postedAt
    ? `Posted ${formatPosted(status.postedAt, now)}`
    : `Confirmed ${formatPosted(status.confirmedAt, now)}`

  let body: string
  if (status.source === 'season') {
    body = status.state === 'offseason' ? offseasonLine(beach.authority) : `${SOURCE_SAYS.season}. ${when}`
  } else {
    const words = status.verbatim?.trim()
    body = words ? `${SOURCE_NAME[status.source]}: “${words}” ${when}` : `${SOURCE_NAME[status.source]}. ${when}`
  }

  return { title, body, beachId: beach.id }
}

/** How the footer names each thing the refresh reads. */
const SOURCE_LABEL: Record<IngestSource, string> = {
  hrm: 'HRM',
  parks: 'Province',
  algae: 'Algae feed',
  wind: 'Wind',
  buoy: 'Buoy',
}

/** "HRM off-season" / "Province off-season". */
export function offseasonLabel(authority: Authority): string {
  return `${authority === 'hrm' ? 'HRM' : 'Province'} off-season`
}

const SOURCES_OF: Record<Authority, readonly IngestSource[]> = {
  hrm: ['hrm'],
  province: ['parks', 'algae'],
}

/** The footer's order: the status sources first, then the conditions feeds. */
const SOURCE_ORDER: readonly IngestSource[] = ['hrm', 'parks', 'algae', 'wind', 'buoy']

function checkedCleanly(h: SourceHealthView): boolean {
  return h.lastSuccessAt !== null && h.lastSuccessAt === h.lastAttemptAt
}

function healthLine(h: SourceHealthView, now: Date): string {
  const label = SOURCE_LABEL[h.source]
  if (checkedCleanly(h)) return `${label} checked ${formatPosted(h.lastAttemptAt, now)}`
  if (h.lastSuccessAt) return `${label} last confirmed ${formatPosted(h.lastSuccessAt, now)}; could not reach it since`
  return `${label} never read`
}

/**
 * The footer's freshness line: one part per thing the refresh reads, in a
 * fixed order. An authority the calendar has closed reads "HRM off-season"
 * in place of its sources' lines, whatever their last read says — the rows
 * are the calendar's, not the source's. Wind and the buoy collapse to one
 * "conditions checked" when the same run read both cleanly; otherwise each
 * says what happened to it. Nothing read at all, in season, says so.
 */
export function formatFreshness(
  health: readonly SourceHealthView[],
  offseason: readonly Authority[],
  now: Date = new Date(),
): string {
  const bySource = new Map(health.map((h) => [h.source, h]))
  const covered = new Set<IngestSource>()
  const parts: string[] = []

  for (const authority of ['hrm', 'province'] as const) {
    if (!offseason.includes(authority)) continue
    parts.push(offseasonLabel(authority))
    for (const source of SOURCES_OF[authority]) covered.add(source)
  }

  const wind = bySource.get('wind')
  const buoy = bySource.get('buoy')
  const conditionsTogether =
    wind !== undefined && buoy !== undefined && checkedCleanly(wind) && checkedCleanly(buoy) && wind.lastAttemptAt === buoy.lastAttemptAt

  for (const source of SOURCE_ORDER) {
    if (covered.has(source)) continue
    if (conditionsTogether && (source === 'wind' || source === 'buoy')) {
      if (source === 'wind') parts.push(`conditions checked ${formatPosted(wind.lastAttemptAt, now)}`)
      continue
    }
    const h = bySource.get(source)
    if (h) parts.push(healthLine(h, now))
  }

  return parts.length > 0 ? parts.join(' · ') : 'No source has been read yet'
}
