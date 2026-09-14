import { offseasonLine } from '@/lib/copy'
import type { Authority, BeachState } from '@/lib/seed/beaches'

/** Render-only. The resolver never produces it; a missing status record reads as unknown. */
export type PinState = BeachState | 'unknown'

/** Every state, in the order the map key and filter row present them. */
export const PIN_STATES: readonly PinState[] = [
  'open',
  'advisory',
  'closed',
  'offseason',
  'unknown',
] as const

/** Generic, authority-independent label. Used where authority is not in scope (filters, key rows). */
export const STATUS_LABEL: Record<PinState, string> = {
  open: 'Open',
  advisory: 'Advisory',
  closed: 'Closed',
  offseason: 'Off-season',
  unknown: 'No status available',
} as const

export interface StatusPresentation {
  /** Authority-aware headline label, e.g. 'No advisory posted' for a provincial open beach. */
  label: string
  /** One sentence of plain meaning, shown under the label in the detail view. */
  explanation: string
  /** Extra authority-specific warning, when one applies. Otherwise undefined. */
  caveat?: string
}

/**
 * Standardized explanations for each state. Off-season is the one that
 * depends on the authority (when its lifeguards return), so it lives with the
 * other wording in lib/copy.ts and is looked up below.
 */
const EXPLANATIONS: Record<Exclude<BeachState, 'offseason'> | 'unknown', string> = {
  open: 'Listed as open. Conditions can change, so check the official page and signs at the beach before swimming. Lifeguards are only on duty during posted hours.',
  advisory:
    'Swimming is not recommended. Keep people and pets out of the water. Read the official notice for details.',
  closed:
    'Closed to swimming. Keep people and pets out of the water. Read the official notice to find out why; not every closure is due to blue-green algae.',
  unknown:
    'We don’t have an official update for this beach yet. Unknown does not mean open. Check the government page before swimming.',
}

/** Repeated verbatim wherever an unknown count is surfaced. */
export const UNKNOWN_CAVEAT =
  'Unknown does not mean open.'

/** Caveat for provincial beaches: provincial evidence is advisory-based. */
const PROVINCIAL_CAVEAT =
  'Hollow pins mark provincial beaches. The province posts advisories but doesn’t publish individual water test results here. No advisory posted doesn’t mean the water has passed a test.'

/** The single owner of status wording across pins, list rows, detail, filters and the map key. */
export function statusPresentation(
  state: PinState,
  authority: Authority,
): StatusPresentation {
  // Provincial open: weaker evidence than a tested sample.
  if (state === 'open' && authority === 'province') {
    return {
      label: 'No advisory posted',
      explanation:
        'We found no park advisory or algae notice for this provincial beach. That doesn’t mean the water was tested or passed a test today.',
      caveat: PROVINCIAL_CAVEAT,
    }
  }

  // HRM open: tested open.
  if (state === 'open' && authority === 'hrm') {
    return {
      label: STATUS_LABEL.open,
      explanation: EXPLANATIONS.open,
    }
  }

  // Unknown: missing data, both authorities.
  if (state === 'unknown') {
    return {
      label: STATUS_LABEL.unknown,
      explanation: EXPLANATIONS.unknown,
      caveat: UNKNOWN_CAVEAT,
    }
  }

  // Off-season: the one quiet line the detail shows, with when it changes.
  if (state === 'offseason') {
    return {
      label: STATUS_LABEL.offseason,
      explanation: offseasonLine(authority),
    }
  }

  // Advisory, closed: generic labels, no caveat.
  return {
    label: STATUS_LABEL[state],
    explanation: EXPLANATIONS[state],
  }
}

/** Human name of the body that publishes the status. */
export function authorityName(authority: Authority): string {
  return authority === 'hrm'
    ? 'Halifax Regional Municipality'
    : 'Nova Scotia Parks'
}

/** True when the authority publishes advisory-based evidence rather than per-beach sample results. */
export function isAdvisoryBasedAuthority(authority: Authority): boolean {
  return authority === 'province'
}

/** Accessible name for a map marker / list row, combining beach name and status. */
export function statusAccessibleName(
  beachName: string,
  state: PinState,
  authority: Authority,
): string {
  const { label } = statusPresentation(state, authority)
  return `${beachName} — ${label}`
}
