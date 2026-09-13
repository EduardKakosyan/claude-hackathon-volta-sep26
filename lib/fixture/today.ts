import { HALIFAX_BUOY, type BuoyReading, type ConditionsRow } from '@/lib/conditions'
import { BEACHES, BEACHES_BY_ID, HRM_STATUS_URL, type Beach, type BeachState, type Region } from '@/lib/seed/beaches'
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

/** All five sources read cleanly at the fixture time. */
export const FIXTURE_HEALTH: SourceHealthView[] = (['hrm', 'parks', 'algae', 'wind', 'buoy'] as const).map(
  (source) => ({
    source,
    lastAttemptAt: FIXTURE_CHECKED_AT,
    lastSuccessAt: FIXTURE_CHECKED_AT,
    lastError: null,
  }),
)

// ---------------------------------------------------------------- conditions

/**
 * A south-westerly afternoon: one wind per region, so the Halifax cluster reads
 * the same and the far coasts differ. Air temperatures are plausible for the
 * date; nothing is measured.
 */
const REGION_WIND: Record<Region, { kmh: number; deg: number; airC: number }> = {
  Halifax: { kmh: 19, deg: 225, airC: 21.4 },
  'Eastern Shore': { kmh: 23, deg: 210, airC: 19.8 },
  'South Shore': { kmh: 17, deg: 230, airC: 20.6 },
  Valley: { kmh: 12, deg: 270, airC: 23.1 },
  'North Shore': { kmh: 26, deg: 315, airC: 22.0 },
  'Cape Breton': { kmh: 31, deg: 280, airC: 18.7 },
}

/** What the fixture's buoy reads. Shown on the nine salt beaches within reach. */
export const FIXTURE_WATER_TEMP_C = 16.4

/** The start of the current quarter hour: what Open-Meteo's `current.time` would be. */
export function quarterHourBefore(now: Date): string {
  const d = new Date(now)
  d.setUTCMinutes(Math.floor(d.getUTCMinutes() / 15) * 15, 0, 0)
  return d.toISOString()
}

/**
 * One wind row per roster beach, stamped at the quarter hour before `now` so
 * the page's staleness rule keeps them whenever the fixture is served.
 */
export function fixtureConditions(now: Date): ConditionsRow[] {
  const observedAt = quarterHourBefore(now)
  return BEACHES.map((beach) => {
    const wind = REGION_WIND[beach.region]
    return {
      beachId: beach.id,
      windKmh: wind.kmh,
      windDirDeg: wind.deg,
      airTempC: wind.airC,
      observedAt,
    }
  })
}

/** The buoy reported half an hour before the wind. */
export function fixtureBuoy(now: Date): BuoyReading {
  const observedAt = new Date(new Date(quarterHourBefore(now)).getTime() - 30 * 60 * 1000).toISOString()
  return { buoy: HALIFAX_BUOY.id, waterTempC: FIXTURE_WATER_TEMP_C, observedAt }
}
