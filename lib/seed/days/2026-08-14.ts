import type { BeachState } from '@/lib/seed/beaches'

/**
 * Replay day: Friday, August 14, 2026.
 *
 * A replay row carries a state and the basis for it, never official provenance:
 * no verbatim notice, no source URL, no posted time. Those belong only to live
 * `beach_status` rows written by a real read of a government page.
 *
 * `basis: 'verified'` rows are backed by dated coverage of that day.
 * `basis: 'inferred'` rows are reconstruction: the note says from what.
 *
 * Evidence checked 2026-09-12:
 *  - CBC, "Lawrencetown, Rainbow Haven beaches reopen to swimming", posted
 *    Aug 14, 2026 12:55 PM EDT, updated Aug 17: "Advisories released on Friday
 *    said the water at both beaches was unsafe"; Paul D'Eon (Nova Scotia
 *    Lifeguard Service) sampled early Friday; enterococci; reopened Monday
 *    Aug 17 per Nova Scotia Parks.
 *    https://www.cbc.ca/news/canada/nova-scotia/swimming-not-advised-rainbow-haven-lawrencetown-beach-bacteria-9.7307498
 *  - CTV, "Swimming not advised at two popular Nova Scotia beaches due to
 *    bacteria levels", Aug 14, 2026 9:21 a.m. EDT (Rainbow Haven, Lawrencetown);
 *    and "Swimming advisories lifted for Lawrencetown, Rainbow Haven beaches",
 *    Aug 17, 2026.
 *    https://www.ctvnews.ca/atlantic/nova-scotia/article/swimmers-told-to-avoid-the-water-at-rainbow-haven-lawrencetown-beaches/
 *  - halifax.ca news, "Oakfield Beach closed to swimming due to possible
 *    blue-green algae bloom", Posted July 28, 2026 - 2:48 pm: "closed for
 *    recreational use" (toxin-producing bloom). The provincial algae feed has a
 *    matching "Shubenacadie Grand Lake" bloom dated 2026-07-28.
 *    https://www.halifax.ca/home/news/oakfield-beach-closed-swimming-due-possible-blue-green-algae-bloom-0
 *  - The Laker News, "Oakfield Beach reopens to swimming, HRM says",
 *    Aug 24, 2026. Closure on Aug 14 is therefore inferred (continuous
 *    Jul 28 to Aug 24); no snapshot of the HRM table for Aug 14 was found.
 *  - A sweep of halifax.ca/home/news (2026 items) found no other HRM beach
 *    advisory or closure in effect on Aug 14: Kearney Lake (Aug 25) and
 *    Sandy Lake (Aug 26) algae closures both post-date it. The CTV video item
 *    "Two Halifax beaches under swimming advisories" (Aug 14) refers to
 *    Rainbow Haven and Lawrencetown, which are provincial beaches, not HRM.
 *
 * Not verified: the parks.novascotia.ca advisories card grid for that day
 * (undated cards, no archive found), and whether any other provincial beach
 * carried a notice. Those pins are `open` by inference only.
 */

export type SeedBasis = 'verified' | 'inferred'

export interface SeedDayRow {
  state: BeachState
  basis: SeedBasis
  note: string
}

export type SeedDay = Record<string, SeedDayRow>

const IN_SEASON_HRM =
  'Inferred: in season; no HRM advisory or closure for this beach found in halifax.ca news or coverage for 2026-08-14.'

const IN_SEASON_PROVINCE =
  'Inferred: in season; no provincial notice for this beach found in coverage for 2026-08-14. The advisories page for that day was not archived.'

const hrmOpen = (): SeedDayRow => ({ state: 'open', basis: 'inferred', note: IN_SEASON_HRM })
const nsOpen = (): SeedDayRow => ({ state: 'open', basis: 'inferred', note: IN_SEASON_PROVINCE })

export const DAY_2026_08_14: SeedDay = {
  // ------------------------------------------------------------ HRM (18)
  'hrm-albro-lake': hrmOpen(),
  'hrm-birch-cove': hrmOpen(),
  'hrm-campbell-point': hrmOpen(),
  'hrm-chocolate-lake': hrmOpen(),
  'hrm-cunard-pond': hrmOpen(),
  'hrm-kearney-lake': hrmOpen(),
  'hrm-kidston-lake': hrmOpen(),
  'hrm-kinap': hrmOpen(),
  'hrm-lake-echo': hrmOpen(),
  'hrm-long-pond': hrmOpen(),
  'hrm-oakfield-park': {
    state: 'closed',
    basis: 'inferred',
    note: 'HRM closed Oakfield Beach for a toxin-producing blue-green algae bloom on July 28, 2026 and announced the reopening on August 24, 2026; closure on August 14 is inferred from those two dates.',
  },
  'hrm-penhorn-lake': hrmOpen(),
  'hrm-pleasant-drive': hrmOpen(),
  'hrm-sandy-lake': hrmOpen(),
  'hrm-saunders': hrmOpen(),
  'hrm-shubie-park': hrmOpen(),
  'hrm-springfield': hrmOpen(),
  'hrm-taylor-head': hrmOpen(),

  // ------------------------------------------------------ Province (17)
  'ns-bayfield': nsOpen(),
  'ns-bayswater': nsOpen(),
  'ns-clam-harbour': nsOpen(),
  'ns-dollar-lake': nsOpen(),
  'ns-dominion': nsOpen(),
  'ns-ellenwood-lake': nsOpen(),
  'ns-heather': nsOpen(),
  'ns-lawrencetown': {
    state: 'advisory',
    basis: 'verified',
    note: 'Swimming advisory issued Friday, August 14, 2026 after Nova Scotia Lifeguard Service sampling found elevated enterococci; lifted Monday, August 17 (CBC, CTV).',
  },
  'ns-martinique': nsOpen(),
  'ns-mavillette': nsOpen(),
  'ns-melmerby': nsOpen(),
  'ns-point-michaud': nsOpen(),
  'ns-pomquet': nsOpen(),
  'ns-port-maitland': nsOpen(),
  'ns-queensland': nsOpen(),
  'ns-rainbow-haven': {
    state: 'advisory',
    basis: 'verified',
    note: 'Swimming advisory issued Friday, August 14, 2026 after Nova Scotia Lifeguard Service sampling found elevated enterococci; lifted Monday, August 17 (CBC, CTV).',
  },
  'ns-rissers': nsOpen(),
}
