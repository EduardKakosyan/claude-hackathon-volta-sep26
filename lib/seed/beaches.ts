/**
 * The 35-beach roster: every beach in Nova Scotia where a government samples the
 * water. 18 from HRM's supervised-beach table, 17 from the province's
 * supervised-swimming page. Nothing else belongs here — a pin with no monitoring
 * program behind it cannot carry a sourced status.
 *
 * This file is the single curated artefact in the project. Every later phase keys
 * off it: the map renders it, `refresh()` upserts it into `beaches`, and the three
 * parsers match scraped rows back to it through `match` — exactly, or not at all.
 *
 * Sources, captured 2026-09-12:
 *  - Names, water body, water type, supervision dates: the 18 rows of
 *    https://www.halifax.ca/parks-recreation/programs-activities/swimming/supervised-beaches-outdoor-pools-splash-pads
 *    and the 17 park links plus supervision prose on
 *    https://parks.novascotia.ca/supervised-swimming
 *  - HRM coordinates: HRM_Park_Recreation_Features_2/FeatureServer/0 point layer
 *    (`MAINRECUSE LIKE '%Beach%'`, `outSR=4326`)
 *  - Provincial coordinates: NS Open Data park entrances (Socrata `c6mf-qy4u`);
 *    note that dataset spells Mavillette "Mavilette"
 *  - Lawrencetown, Rainbow Haven, Oakfield Park, Ellenwood Lake: OpenStreetMap
 *    `natural=beach` centres, because neither government layer has a beach point
 *    for them
 *  - `match.lakes` strings are verbatim `<lake>` values from
 *    https://notices.novascotia.ca/feeds/blue-green-algae.atom
 */

export type Authority = 'hrm' | 'province'

export type BeachState = 'open' | 'advisory' | 'closed' | 'offseason'

export type Region =
  | 'Halifax'
  | 'Eastern Shore'
  | 'South Shore'
  | 'Valley'
  | 'North Shore'
  | 'Cape Breton'

export interface Beach {
  /** Stable key used by every table and by `?beach=`. */
  id: string
  name: string
  authority: Authority
  lat: number
  lon: number
  /** Lake, bay, or ocean — shown under the name on the row and the detail sheet. */
  waterBody: string
  /** Search only; never rendered on its own. */
  community: string
  region: Region
  water: 'fresh' | 'salt'
  /** Verbatim supervision window from the source page. */
  supervision: string
  /** The government page the detail sheet links to. */
  sourceUrl: string
  match: {
    /** Exact "Beach Name" cell on halifax.ca. HRM beaches only. */
    hrmTable?: string
    /** Exact names to look for in a provincial advisory card's title and body. */
    parksText?: string[]
    /** Exact `<lake>` strings from the blue-green algae Atom feed. */
    lakes?: string[]
  }
}

/** The one page HRM publishes live status on. */
export const HRM_STATUS_URL =
  'https://www.halifax.ca/parks-recreation/programs-activities/swimming/supervised-beaches-outdoor-pools-splash-pads'

const PARK = (slug: string) => `https://parks.novascotia.ca/park/${slug}`

/**
 * Verbatim from parks.novascotia.ca/supervised-swimming, 2026-09-12:
 * "Lifeguard supervision will take place from July 1 - August 30, 2026." /
 * "Lifeguards are on duty from 10 am - 6 pm daily except for at Clam Harbour and
 * Mavillette Beach where supervision is provided on weekends only."
 */
const NS_SUPERVISION = 'July 1 - August 30, 2026, 10 am - 6 pm daily'
const NS_SUPERVISION_WEEKENDS =
  'July 1 - August 30, 2026, 10 am - 6 pm, weekends only'
const NS_SUPERVISION_LAWRENCETOWN =
  'July 1 - August 30, 2026, 10 am - 6 pm daily; also September 5 - 7 and September 12 - 13'

export const BEACHES: Beach[] = [
  // ---------------------------------------------------------------- HRM (18)
  {
    id: 'hrm-albro-lake',
    name: 'Albro Lake Beach',
    authority: 'hrm',
    lat: 44.6863,
    lon: -63.5758,
    waterBody: 'Albro Lake',
    community: 'Dartmouth',
    region: 'Halifax',
    water: 'fresh',
    supervision: 'July 1 - August 31',
    sourceUrl: HRM_STATUS_URL,
    match: {
      hrmTable: 'Albro Lake Beach',
      // "Little Albro Lake" appears in the feed but is a different lake.
      lakes: ['Albro Lake'],
    },
  },
  {
    id: 'hrm-birch-cove',
    name: 'Birch Cove Beach',
    authority: 'hrm',
    lat: 44.67991,
    lon: -63.56021,
    waterBody: 'Lake Banook',
    community: 'Dartmouth',
    region: 'Halifax',
    water: 'fresh',
    supervision: 'July 1 - September 1',
    sourceUrl: HRM_STATUS_URL,
    match: {
      hrmTable: 'Birch Cove Beach',
      lakes: ['Lake Banook', 'Lake Banook, Grahams Grove Park'],
    },
  },
  {
    id: 'hrm-campbell-point',
    name: 'Campbell Point Beach',
    authority: 'hrm',
    lat: 44.55889,
    lon: -63.72239,
    waterBody: 'Hatchet Lake',
    community: 'Halifax',
    region: 'Halifax',
    water: 'fresh',
    supervision: 'July 1 - September 1',
    sourceUrl: HRM_STATUS_URL,
    match: { hrmTable: 'Campbell Point Beach', lakes: ['Hatchet Lake'] },
  },
  {
    id: 'hrm-chocolate-lake',
    name: 'Chocolate Lake Beach',
    authority: 'hrm',
    lat: 44.63794,
    lon: -63.62182,
    waterBody: 'Chocolate Lake',
    community: 'Halifax',
    region: 'Halifax',
    water: 'fresh',
    supervision: 'July 1 - September 1',
    sourceUrl: HRM_STATUS_URL,
    match: { hrmTable: 'Chocolate Lake Beach', lakes: ['Chocolate Lake'] },
  },
  {
    id: 'hrm-cunard-pond',
    name: 'Cunard Pond Beach',
    authority: 'hrm',
    lat: 44.62096,
    lon: -63.60158,
    waterBody: 'Williams Lake',
    community: 'Halifax',
    region: 'Halifax',
    water: 'fresh',
    supervision: 'July 1 - September 1',
    sourceUrl: HRM_STATUS_URL,
    match: { hrmTable: 'Cunard Pond Beach', lakes: ['Williams Lake'] },
  },
  {
    id: 'hrm-kearney-lake',
    name: 'Kearney Lake Beach',
    authority: 'hrm',
    lat: 44.68768,
    lon: -63.68469,
    waterBody: 'Kearney Lake',
    community: 'Halifax',
    region: 'Halifax',
    water: 'fresh',
    supervision: 'July 1 - September 1',
    sourceUrl: HRM_STATUS_URL,
    match: { hrmTable: 'Kearney Lake Beach', lakes: ['Kearney Lake'] },
  },
  {
    id: 'hrm-kidston-lake',
    name: 'Kidston Lake Beach',
    authority: 'hrm',
    lat: 44.59584,
    lon: -63.61821,
    waterBody: 'Kidston Lake',
    community: 'Halifax',
    region: 'Halifax',
    water: 'fresh',
    supervision: 'July 1 - August 31',
    sourceUrl: HRM_STATUS_URL,
    match: { hrmTable: 'Kidston Lake Beach', lakes: ['Kidston Lake'] },
  },
  {
    id: 'hrm-kinap',
    name: 'Kinap Beach',
    authority: 'hrm',
    lat: 44.68002,
    lon: -63.30658,
    waterBody: 'Porters Lake',
    community: 'Porters Lake',
    region: 'Halifax',
    water: 'salt',
    supervision: 'July 1 - August 31',
    sourceUrl: HRM_STATUS_URL,
    match: { hrmTable: 'Kinap Beach', lakes: ['Porters Lake'] },
  },
  {
    id: 'hrm-lake-echo',
    name: 'Lake Echo Beach',
    authority: 'hrm',
    lat: 44.73903,
    lon: -63.38552,
    waterBody: 'Lake Echo',
    community: 'Lake Echo',
    region: 'Halifax',
    water: 'fresh',
    supervision: 'July 1 - August 31',
    sourceUrl: HRM_STATUS_URL,
    match: { hrmTable: 'Lake Echo Beach', lakes: ['Lake Echo'] },
  },
  {
    id: 'hrm-long-pond',
    name: 'Long Pond Beach',
    authority: 'hrm',
    lat: 44.57587,
    lon: -63.57527,
    waterBody: 'Long Pond',
    community: 'Halifax',
    region: 'Halifax',
    water: 'fresh',
    supervision: 'July 1 - August 31',
    sourceUrl: HRM_STATUS_URL,
    match: { hrmTable: 'Long Pond Beach', lakes: ['Long Pond'] },
  },
  {
    id: 'hrm-oakfield-park',
    name: 'Oakfield Park Beach',
    authority: 'hrm',
    lat: 44.92129,
    lon: -63.5811,
    waterBody: 'Shubenacadie Grand Lake',
    community: 'Oakfield',
    region: 'Halifax',
    water: 'fresh',
    supervision: 'July 1 - September 1',
    sourceUrl: HRM_STATUS_URL,
    match: {
      hrmTable: 'Oakfield Park Beach',
      lakes: [
        'Shubenacadie Grand Lake',
        'Shubenacadie Grand Lake at Fish Lake',
        'Between Shubenacadie-Grand Lake and Fish Lake',
      ],
    },
  },
  {
    id: 'hrm-penhorn-lake',
    name: 'Penhorn Lake Beach',
    authority: 'hrm',
    lat: 44.67537,
    lon: -63.53973,
    waterBody: 'Penhorn Lake',
    community: 'Dartmouth',
    region: 'Halifax',
    water: 'fresh',
    supervision: 'July 1 - September 1',
    sourceUrl: HRM_STATUS_URL,
    match: { hrmTable: 'Penhorn Lake Beach', lakes: ['Penhorn Lake'] },
  },
  {
    id: 'hrm-pleasant-drive',
    name: 'Pleasant Drive Beach',
    authority: 'hrm',
    lat: 44.77091,
    lon: -63.19954,
    waterBody: 'Petpeswick Lake',
    community: 'West Petpeswick',
    region: 'Eastern Shore',
    water: 'fresh',
    supervision: 'July 1 - September 1',
    sourceUrl: HRM_STATUS_URL,
    match: { hrmTable: 'Pleasant Drive Beach', lakes: ['Petpeswick Lake'] },
  },
  {
    id: 'hrm-sandy-lake',
    name: 'Sandy Lake Beach',
    authority: 'hrm',
    lat: 44.73651,
    lon: -63.69506,
    waterBody: 'Sandy Lake',
    community: 'Bedford',
    region: 'Halifax',
    water: 'fresh',
    supervision: 'July 1 - September 1',
    sourceUrl: HRM_STATUS_URL,
    match: {
      hrmTable: 'Sandy Lake Beach',
      // The feed carries both spellings for the Bedford lake. Nova Scotia has
      // other Sandy Lakes, so a bare "Sandy Lake" notice will close this beach;
      // over-closing is the safe direction for a swimming advisory.
      lakes: ['Sandy Lake', 'Sandy Lake, Bedford'],
    },
  },
  {
    id: 'hrm-saunders',
    name: 'Saunders Beach',
    authority: 'hrm',
    lat: 44.71408,
    lon: -63.68415,
    waterBody: 'Paper Mill Lake',
    community: 'Bedford',
    region: 'Halifax',
    water: 'fresh',
    supervision: 'July 1 - September 1',
    sourceUrl: HRM_STATUS_URL,
    match: { hrmTable: 'Saunders Beach', lakes: ['Paper Mill Lake'] },
  },
  {
    id: 'hrm-shubie-park',
    name: 'Shubie Park Beach',
    authority: 'hrm',
    lat: 44.69779,
    lon: -63.5531,
    waterBody: 'Lake Charles',
    community: 'Dartmouth',
    region: 'Halifax',
    water: 'fresh',
    supervision: 'July 1 - September 1',
    sourceUrl: HRM_STATUS_URL,
    match: { hrmTable: 'Shubie Park Beach', lakes: ['Lake Charles'] },
  },
  {
    id: 'hrm-springfield',
    name: 'Springfield Beach',
    authority: 'hrm',
    lat: 44.81982,
    lon: -63.73636,
    waterBody: 'Springfield Lake',
    community: 'Sackville',
    region: 'Halifax',
    water: 'fresh',
    supervision: 'July 1 - August 31',
    sourceUrl: HRM_STATUS_URL,
    match: {
      hrmTable: 'Springfield Beach',
      lakes: ['Springfield Lake', 'Springfield Lake Beach'],
    },
  },
  {
    id: 'hrm-taylor-head',
    name: 'Taylor Head Beach',
    authority: 'hrm',
    lat: 44.80859,
    lon: -62.56078,
    waterBody: 'Atlantic Ocean',
    community: 'Spry Bay',
    region: 'Eastern Shore',
    water: 'salt',
    supervision: 'July 1 - August 31',
    sourceUrl: HRM_STATUS_URL,
    match: { hrmTable: 'Taylor Head Beach' },
  },

  // ----------------------------------------------------------- Province (17)
  {
    id: 'ns-bayfield',
    name: 'Bayfield Beach',
    authority: 'province',
    lat: 45.63954,
    lon: -61.75885,
    waterBody: 'Northumberland Strait',
    community: 'Bayfield',
    region: 'North Shore',
    water: 'salt',
    supervision: NS_SUPERVISION,
    sourceUrl: PARK('bayfield-beach'),
    match: { parksText: ['Bayfield Beach'] },
  },
  {
    id: 'ns-bayswater',
    name: 'Bayswater Beach',
    authority: 'province',
    lat: 44.50183,
    lon: -64.06721,
    waterBody: 'St. Margarets Bay',
    community: 'Bayswater',
    region: 'South Shore',
    water: 'salt',
    supervision: NS_SUPERVISION,
    sourceUrl: PARK('bayswater-beach'),
    match: { parksText: ['Bayswater Beach'] },
  },
  {
    id: 'ns-clam-harbour',
    name: 'Clam Harbour Beach',
    authority: 'province',
    lat: 44.7306,
    lon: -62.88562,
    waterBody: 'Atlantic Ocean',
    community: 'Clam Harbour',
    region: 'Eastern Shore',
    water: 'salt',
    supervision: NS_SUPERVISION_WEEKENDS,
    sourceUrl: PARK('clam-harbour-beach'),
    match: { parksText: ['Clam Harbour'] },
  },
  {
    id: 'ns-dollar-lake',
    name: 'Dollar Lake',
    authority: 'province',
    lat: 44.92953,
    lon: -63.32241,
    waterBody: 'Dollar Lake',
    community: 'Wyses Corner',
    region: 'Halifax',
    water: 'fresh',
    supervision: NS_SUPERVISION,
    sourceUrl: PARK('dollar-lake'),
    match: { parksText: ['Dollar Lake'], lakes: ['Dollar Lake'] },
  },
  {
    id: 'ns-dominion',
    name: 'Dominion Beach',
    authority: 'province',
    lat: 46.21364,
    lon: -60.02882,
    waterBody: 'Atlantic Ocean',
    community: 'Dominion',
    region: 'Cape Breton',
    water: 'salt',
    supervision: NS_SUPERVISION,
    sourceUrl: PARK('dominion-beach'),
    match: { parksText: ['Dominion Beach'] },
  },
  {
    id: 'ns-ellenwood-lake',
    name: 'Ellenwood Lake',
    authority: 'province',
    lat: 43.92712,
    lon: -65.99416,
    waterBody: 'Ellenwood Lake',
    community: 'Deerfield',
    region: 'Valley',
    water: 'fresh',
    supervision: NS_SUPERVISION,
    sourceUrl: PARK('ellenwood-lake'),
    match: { parksText: ['Ellenwood'], lakes: ['Ellenwood Lake'] },
  },
  {
    id: 'ns-heather',
    name: 'Heather Beach',
    authority: 'province',
    lat: 45.87468,
    lon: -63.75384,
    waterBody: 'Northumberland Strait',
    community: 'Heather Beach',
    region: 'North Shore',
    water: 'salt',
    supervision: NS_SUPERVISION,
    sourceUrl: PARK('heather-beach'),
    match: { parksText: ['Heather Beach'] },
  },
  {
    id: 'ns-lawrencetown',
    name: 'Lawrencetown Beach',
    authority: 'province',
    lat: 44.64406,
    lon: -63.33525,
    waterBody: 'Atlantic Ocean',
    community: 'East Lawrencetown',
    region: 'Halifax',
    water: 'salt',
    supervision: NS_SUPERVISION_LAWRENCETOWN,
    sourceUrl: PARK('lawrencetown-beach'),
    match: { parksText: ['Lawrencetown Beach'] },
  },
  {
    id: 'ns-martinique',
    name: 'Martinique Beach',
    authority: 'province',
    lat: 44.68986,
    lon: -63.14757,
    waterBody: 'Atlantic Ocean',
    community: 'East Petpeswick',
    region: 'Eastern Shore',
    water: 'salt',
    supervision: NS_SUPERVISION,
    sourceUrl: PARK('martinique-beach'),
    match: { parksText: ['Martinique Beach'] },
  },
  {
    id: 'ns-mavillette',
    name: 'Mavillette Beach',
    authority: 'province',
    lat: 44.09149,
    lon: -66.19705,
    waterBody: 'St. Marys Bay',
    community: 'Mavillette',
    region: 'Valley',
    water: 'salt',
    supervision: NS_SUPERVISION_WEEKENDS,
    sourceUrl: PARK('mavillette-beach'),
    // The NS Open Data park-entrances dataset drops an "l"; the parks site does not.
    match: { parksText: ['Mavillette', 'Mavilette'] },
  },
  {
    id: 'ns-melmerby',
    name: 'Melmerby Beach',
    authority: 'province',
    lat: 45.6525,
    lon: -62.49586,
    waterBody: 'Northumberland Strait',
    community: 'Little Harbour',
    region: 'North Shore',
    water: 'salt',
    supervision: NS_SUPERVISION,
    sourceUrl: PARK('melmerby-beach'),
    match: { parksText: ['Melmerby Beach'] },
  },
  {
    id: 'ns-point-michaud',
    name: 'Point Michaud Beach',
    authority: 'province',
    lat: 45.5923,
    lon: -60.68015,
    waterBody: 'Atlantic Ocean',
    community: 'Point Michaud',
    region: 'Cape Breton',
    water: 'salt',
    supervision: NS_SUPERVISION,
    sourceUrl: PARK('point-michaud-beach'),
    match: { parksText: ['Point Michaud'] },
  },
  {
    id: 'ns-pomquet',
    name: 'Pomquet Beach',
    authority: 'province',
    lat: 45.64494,
    lon: -61.82132,
    waterBody: 'Northumberland Strait',
    community: 'Pomquet',
    region: 'North Shore',
    water: 'salt',
    supervision: NS_SUPERVISION,
    sourceUrl: PARK('pomquet-beach'),
    match: { parksText: ['Pomquet Beach'] },
  },
  {
    id: 'ns-port-maitland',
    name: 'Port Maitland Beach',
    authority: 'province',
    lat: 43.98465,
    lon: -66.1538,
    waterBody: 'Gulf of Maine',
    community: 'Port Maitland',
    region: 'Valley',
    water: 'salt',
    supervision: NS_SUPERVISION,
    sourceUrl: PARK('port-maitland-beach'),
    match: { parksText: ['Port Maitland Beach'] },
  },
  {
    id: 'ns-queensland',
    name: 'Queensland Beach',
    authority: 'province',
    lat: 44.63541,
    lon: -64.02685,
    waterBody: 'St. Margarets Bay',
    community: 'Queensland',
    region: 'South Shore',
    water: 'salt',
    supervision: NS_SUPERVISION,
    sourceUrl: PARK('queensland-beach'),
    match: { parksText: ['Queensland Beach'] },
  },
  {
    id: 'ns-rainbow-haven',
    name: 'Rainbow Haven Beach',
    authority: 'province',
    lat: 44.65006,
    lon: -63.41726,
    waterBody: 'Atlantic Ocean',
    community: 'Cow Bay',
    region: 'Halifax',
    water: 'salt',
    supervision: NS_SUPERVISION,
    sourceUrl: PARK('rainbow-haven-beach'),
    match: { parksText: ['Rainbow Haven'] },
  },
  {
    id: 'ns-rissers',
    name: 'Rissers Beach',
    authority: 'province',
    lat: 44.23189,
    lon: -64.43036,
    waterBody: 'Atlantic Ocean',
    community: 'Crescent Beach',
    region: 'South Shore',
    water: 'salt',
    supervision: NS_SUPERVISION,
    sourceUrl: PARK('rissers-beach'),
    // Advisory cards say "North Rissers", so match the park name, not "Rissers Beach".
    match: { parksText: ['Rissers', "Risser's"] },
  },
]

/** Roster lookup by id; the map, the sheet, and every parser go through this. */
export const BEACHES_BY_ID: Record<string, Beach> = Object.fromEntries(
  BEACHES.map((b) => [b.id, b]),
)
