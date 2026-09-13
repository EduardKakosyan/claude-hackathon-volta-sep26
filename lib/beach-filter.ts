import type { Beach } from '@/lib/seed/beaches'
import { PIN_STATES, type PinState } from '@/lib/beach-status'
import { searchBeaches } from '@/lib/search'

export type StatusFilter = 'all' | PinState

export interface FilterInput {
  beaches: Beach[]
  status: Record<string, PinState | undefined>
  query: string
  filter: StatusFilter
}

/** A missing status record reads as unknown — never as open. */
export function resolveState(
  status: Record<string, PinState | undefined>,
  beachId: string,
): PinState {
  return status[beachId] ?? 'unknown'
}

/** The wording every status filter control uses. Authority-independent by design. */
export const FILTER_LABEL: Record<StatusFilter, string> = {
  all: 'All beaches',
  open: 'Open / no advisory',
  advisory: 'Advisory',
  closed: 'Closed',
  offseason: 'Off-season',
  unknown: 'No status',
}

/** Every filter value, in the order the toolbar presents them. */
export const STATUS_FILTERS: readonly StatusFilter[] = ['all', ...PIN_STATES]

/**
 * The one derivation the shell runs: the same visible roster feeds the map and
 * the directory. A query goes through `searchBeaches` (lib/search.ts), so a lake
 * or community name finds its beaches and the hits come back ranked name >
 * water body > community > lake alias; the status filter then applies on top.
 * With no query the whole roster is returned by name. `BeachApp` re-sorts the
 * result by distance either way — the ranking decides what matches, the origin
 * decides the order on screen.
 */
export function filterBeaches(input: FilterInput): Beach[] {
  const { beaches, status, query, filter } = input

  const matched = query.trim()
    ? searchBeaches(query, beaches, { limit: Infinity }).map((hit) => hit.beach)
    : [...beaches].sort((a, b) => a.name.localeCompare(b.name, 'en'))

  if (filter === 'all') return matched
  return matched.filter((beach) => resolveState(status, beach.id) === filter)
}

/** Counts for the footer/heading, computed over the full roster, not the filtered one. */
export function countByState(
  beaches: Beach[],
  status: Record<string, PinState | undefined>,
): Record<PinState, number> {
  const counts: Record<PinState, number> = {
    open: 0,
    advisory: 0,
    closed: 0,
    offseason: 0,
    unknown: 0,
  }

  for (const beach of beaches) {
    const state = resolveState(status, beach.id)
    counts[state]++
  }

  return counts
}
