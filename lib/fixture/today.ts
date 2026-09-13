import { BEACHES_BY_ID, HRM_STATUS_URL, type Beach, type BeachState } from '@/lib/seed/beaches'
import type { LiveStatus, SourceHealthView } from '@/lib/status'

/**
 * The fixture day: what the page serves when there is no database.
 *
 * A hand-written Saturday morning in season with a deliberate spread of states,
 * so a fresh clone, the Playwright suite and CI all see a realistic directory
 * instead of 35 unknowns. Every row is shaped exactly as the resolver would
 * write it (lib/ingest/resolve.ts): HRM beaches carry the table's own words,
 * provincial beaches carry a parks card, an algae notice, or the "no advisory
 * posted" season fallback, and two HRM beaches are missing from the table so
 * their pins read unknown — the honest state, never a colour.
 *
 * Nothing here is real. The footer says so whenever this file is what the page
 * shows, and `getStore()` refuses to serve it in production.
 */

/** 8:02 a.m. Halifax time on a Saturday in mid-August. */
export const FIXTURE_CHECKED_AT = '2026-08-15T11:02:00Z'

const PARKS_ADVISORIES_URL = 'https://parks.novascotia.ca/advisories'
const ALGAE_PUBLIC_URL = 'https://novascotia.ca/blue-green-algae/'

type Claim = Omit<LiveStatus, 'kind' | 'beachId' | 'confirmedAt'>
type ClaimFor = Claim | ((beach: Beach) => Claim)

/** A cell in the halifax.ca table. Exact vocabulary from lib/ingest/sources/hrm.ts. */
const hrm = (state: BeachState, verbatim: string): Claim => ({
  state,
  source: 'hrm',
  verbatim,
  sourceUrl: HRM_STATUS_URL,
  postedAt: null,
})

/** A card on parks.novascotia.ca/advisories. */
const parks = (state: 'advisory' | 'closed', title: string, postedAt: string): Claim => ({
  state,
  source: 'parks',
  verbatim: title,
  sourceUrl: PARKS_ADVISORIES_URL,
  postedAt,
})

/** An entry in the blue-green algae feed. Always a closure. */
const algae = (lake: string, bloom: string, postedAt: string): Claim => ({
  state: 'closed',
  source: 'algae',
  verbatim: `${lake} — ${bloom}`,
  sourceUrl: ALGAE_PUBLIC_URL,
  postedAt,
})

/** The resolver's in-season fallback for a provincial beach with no card and no notice. */
const noAdvisory: ClaimFor = (beach) => ({
  state: 'open',
  source: 'season',
  verbatim: 'No advisory posted',
  sourceUrl: beach.sourceUrl,
  postedAt: null,
})

const ADVISORY_POSTED = '2026-08-14T12:21:00Z'
const CLOSURE_POSTED = '2026-08-11T15:40:00Z'
const ALGAE_POSTED = '2026-07-28T17:48:00Z'

/**
 * One entry per roster beach. `null` means the source had no row for the beach:
 * the resolver omits it and the pin reads unknown.
 */
const CLAIMS: Record<string, ClaimFor | null> = {
  // ------------------------------------------------------------ HRM (18)
  'hrm-albro-lake': hrm('open', 'Open'),
  'hrm-birch-cove': hrm('advisory', 'Risk advisory in effect'),
  'hrm-campbell-point': hrm('offseason', 'Supervision ended for the season'),
  'hrm-chocolate-lake': hrm('open', 'Open'),
  'hrm-cunard-pond': hrm('offseason', 'Supervision ended for the season'),
  'hrm-kearney-lake': hrm('open', 'Open'),
  'hrm-kidston-lake': null,
  'hrm-kinap': hrm('open', 'Open'),
  'hrm-lake-echo': hrm('open', 'Open'),
  'hrm-long-pond': hrm('advisory', 'Risk advisory in effect'),
  'hrm-oakfield-park': algae(
    'Shubenacadie Grand Lake',
    'Bloom observed near Oakfield Park; toxin-producing cyanobacteria confirmed',
    ALGAE_POSTED,
  ),
  'hrm-penhorn-lake': null,
  'hrm-pleasant-drive': hrm('open', 'Open'),
  'hrm-sandy-lake': hrm('closed', 'Closed'),
  'hrm-saunders': hrm('open', 'Open'),
  'hrm-shubie-park': hrm('open', 'Open'),
  'hrm-springfield': hrm('open', 'Open'),
  'hrm-taylor-head': hrm('open', 'Open'),

  // ------------------------------------------------------ Province (17)
  'ns-bayfield': noAdvisory,
  'ns-bayswater': noAdvisory,
  'ns-clam-harbour': noAdvisory,
  'ns-dollar-lake': algae('Dollar Lake', 'Bloom reported at the beach', ALGAE_POSTED),
  'ns-dominion': noAdvisory,
  'ns-ellenwood-lake': noAdvisory,
  'ns-heather': noAdvisory,
  'ns-lawrencetown': parks('advisory', 'Lawrencetown Beach – Swimming Advisory', ADVISORY_POSTED),
  'ns-martinique': noAdvisory,
  'ns-mavillette': noAdvisory,
  'ns-melmerby': noAdvisory,
  'ns-point-michaud': noAdvisory,
  'ns-pomquet': noAdvisory,
  'ns-port-maitland': noAdvisory,
  'ns-queensland': noAdvisory,
  'ns-rainbow-haven': parks('advisory', 'Rainbow Haven Beach – Swimming Advisory', ADVISORY_POSTED),
  'ns-rissers': parks('closed', 'Rissers Beach – Closed for Construction', CLOSURE_POSTED),
}

/** Beaches the fixture's sources had no row for. Their pins read unknown. */
export const FIXTURE_OMITTED: readonly string[] = Object.entries(CLAIMS)
  .filter(([, claim]) => claim === null)
  .map(([id]) => id)

/** One live row per beach the fixture's sources covered, in roster order. */
export const FIXTURE_TODAY: LiveStatus[] = Object.entries(CLAIMS).flatMap(([beachId, claim]) => {
  const beach = BEACHES_BY_ID[beachId]
  if (!beach) throw new Error(`lib/fixture/today.ts names a beach that is not on the roster: ${beachId}`)
  if (claim === null) return []
  const resolved = typeof claim === 'function' ? claim(beach) : claim
  return [{ kind: 'live' as const, beachId, confirmedAt: FIXTURE_CHECKED_AT, ...resolved }]
})

/** All three sources read cleanly at the fixture time. */
export const FIXTURE_HEALTH: SourceHealthView[] = (['hrm', 'parks', 'algae'] as const).map(
  (source) => ({
    source,
    lastAttemptAt: FIXTURE_CHECKED_AT,
    lastSuccessAt: FIXTURE_CHECKED_AT,
    lastError: null,
  }),
)
