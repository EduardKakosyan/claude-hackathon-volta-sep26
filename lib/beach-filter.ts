import type { Beach } from '@/lib/seed/beaches'
import { PIN_STATES, type PinState } from '@/lib/beach-status'

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

/**
 * Normalize a string for diacritic-insensitive and case-insensitive search.
 * Uses NFD normalization to decompose accented characters, then strips combining marks.
 */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining diacritical marks
    .toLowerCase()
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
 * The one derivation the shell runs: the same visible roster feeds the map and the directory.
 * Matches on name, water body and community only. Every whitespace-separated word must match
 * (case- and accent-insensitive). Result is sorted by name with `localeCompare`.
 */
export function filterBeaches(input: FilterInput): Beach[] {
  const { beaches, status, query, filter } = input

  // Parse query into normalized words.
  const words = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(normalize)

  // Filter by query and status.
  const filtered = beaches.filter((beach) => {
    // Status filter.
    if (filter !== 'all' && resolveState(status, beach.id) !== filter) {
      return false
    }

    // Query filter: all words must match somewhere in name, water body, or community.
    if (words.length > 0) {
      const searchable = normalize(
        `${beach.name} ${beach.waterBody} ${beach.community}`,
      )
      if (!words.every((word) => searchable.includes(word))) {
        return false
      }
    }

    return true
  })

  // Sort by name with localeCompare.
  return filtered.sort((a, b) => a.name.localeCompare(b.name))
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
