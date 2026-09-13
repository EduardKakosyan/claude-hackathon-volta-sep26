import type { ConditionsView } from '@/lib/conditions'
import { formatClock } from '@/lib/dates'
import type { BeachState } from '@/lib/seed/beaches'
import type { StatusSource, StatusView } from '@/lib/status'

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
 * The one quiet line of current conditions under the plain English:
 * "16 °C water · Wind 25 km/h SW · 2 p.m." for a salt beach near the buoy,
 * "Wind 25 km/h SW · 2 p.m." everywhere else. The time is the wind reading's,
 * never the page's. Nothing is printed for a figure the app does not have.
 */
export function formatConditions(c: ConditionsView): string {
  const parts: string[] = []
  if (c.waterTempC !== undefined) parts.push(`${Math.round(c.waterTempC)} °C water`)
  parts.push(`Wind ${Math.round(c.windKmh)} km/h ${c.windDir}`)
  const clock = formatClock(c.observedAt)
  if (clock) parts.push(clock)
  return parts.join(' · ')
}
