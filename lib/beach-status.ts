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
 * Standardized explanations for each state.
 * Verbatim from the EXPLANATION map in beach-detail.tsx.
 */
const EXPLANATIONS: Record<BeachState | 'unknown', string> = {
  open: 'The supplied status is open. Check the official page and signs at the beach before swimming; this is not a guarantee of current water quality or lifeguard coverage.',
  advisory:
    'Swimming is not recommended. Keep people and pets out of the water and check the official notice for the reason and instructions.',
  closed:
    'Closed to swimming. Keep people and pets out of the water. Check the official notice for the reason; a closure does not always mean blue-green algae.',
  offseason:
    'The supplied status is off-season. Do not assume water testing or lifeguard supervision is active. Check the published schedule and official page before visiting.',
  unknown:
    'We have not read an official status for this beach yet. Unknown does not mean open. Check the official source before deciding to swim.',
}

/** Repeated verbatim wherever an unknown count is surfaced. */
export const UNKNOWN_CAVEAT =
  'Unknown does not mean open.'

/** Caveat for provincial beaches: provincial evidence is advisory-based. */
const PROVINCIAL_CAVEAT =
  'A hollow pin identifies a provincial beach. Provincial evidence is advisory-based; the province does not publish individual sample results here. No advisory is weaker evidence than a published test result.'

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
        'For a provincial beach, open means no matching park advisory or algae notice was found in the supplied status. It does not mean a water sample passed today.',
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

  // Advisory, closed, offseason: use generic labels, no caveat.
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
