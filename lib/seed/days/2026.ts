import { addDays } from '@/lib/dates'
import { BEACHES, type BeachState } from '@/lib/seed/beaches'

/**
 * Every day of 2026 up to the day before the hourly refresh began writing its
 * own rows (2026-09-13), reconstructed from what was published.
 *
 * A replay row carries a state and the basis for it, never official provenance:
 * no verbatim notice, no source URL, no posted time. Those belong only to live
 * `beach_status` rows written by a real read of a government page.
 *
 *  - `verified`  the day of a dated notice, or a day HRM's status table was
 *                archived. The note names the source.
 *  - `inferred`  a day between such evidence, or an in-season day with no
 *                evidence at all. The note says what it is carried from, and
 *                an in-season day with nothing found reads as open — the
 *                same convention the replay has always used: no article
 *                records an ordinary open day.
 *  - `calendar`  a day outside the authority's published supervision window.
 *                Nothing was read and nothing could have been posted.
 *
 * Evidence checked 2026-09-13:
 *  - halifax.ca's supervised-beach table, archived by the Wayback Machine twice
 *    in season: July 1, 2026 09:35 UTC and July 24, 2026 15:58 UTC. Both use
 *    the 2026 wording "Water Quality Advisory in Effect" (one row on July 24
 *    reads "Water Quality Advisory"); no other capture of the table falls
 *    inside the season.
 *  - halifax.ca news, 2026, keyword "beach": "Outdoor pools and beaches
 *    opening for 2026 season" (June 25: beaches open Wednesday, July 1);
 *    "Oakfield Beach closed to swimming due to possible blue-green algae
 *    bloom" (July 28, 2:48 pm); "Oakfield Beach reopens to swimming" (August
 *    24, 1:55 pm); "Kearney Lake Beach closed to swimming due to possible
 *    blue-green algae bloom" (August 25, 9:55 am); "Sandy Lake Beach closed to
 *    swimming due to possible blue-green algae bloom" (August 26, 10:35 am).
 *    HRM posts no news item for a water quality advisory; those live only in
 *    the table.
 *  - The provincial blue-green algae feed (notices.novascotia.ca): of its 2026
 *    entries, two name a roster lake — Shubenacadie Grand Lake (2026-07-28,
 *    Oakfield) and Porters Lake (2026-08-26, Kinap).
 *  - CBC, "Swimming not advised at 2 N.S. beaches due to high bacteria
 *    levels" (August 14, 2026) and CTV, "Swimming advisories lifted for
 *    Lawrencetown, Rainbow Haven beaches" (August 17, 2026). No other 2026
 *    provincial advisory or closure was found in coverage; the
 *    parks.novascotia.ca advisories page was not archived in season.
 *  - HRM's Beach Water Quality Monitoring Protocol, Summer 2026 (p. 9): an
 *    advisory beach is re-sampled the same or the next weekday and the
 *    advisory stays until the five-sample geomean is within the guideline;
 *    lab results take one to two days. This is what the carry-forward rules
 *    below lean on where the table was not archived.
 */

export type SeedBasis = 'verified' | 'inferred' | 'calendar'

export interface SeedDayRow {
  state: BeachState
  basis: SeedBasis
  note: string
}

export type SeedDay = Record<string, SeedDayRow>

export const SEED_FROM = '2026-01-01'
/** The refresh wrote 2026-09-13 itself; the seed stops the day before. */
export const SEED_TO = '2026-09-12'

/** Published 2026 supervision windows, both ends included. */
const SEASON_2026 = {
  hrm: { open: '2026-07-01', close: '2026-08-31' },
  province: { open: '2026-07-01', close: '2026-08-30' },
} as const

const OFFSEASON_NOTE = {
  hrm: 'Off-season by the calendar: HRM supervised beaches ran July 1 – August 31, 2026 ("Outdoor pools and beaches opening for 2026 season", halifax.ca, June 25, 2026).',
  province:
    'Off-season by the calendar: provincial supervised swimming ran July 1 – August 30, 2026 (parks.novascotia.ca/supervised-swimming).',
} as const

const IN_SEASON_NOTE = {
  hrm: 'Inferred: in season, and no advisory or closure for this beach on this day was found in the two archived tables (July 1 and July 24), halifax.ca news for 2026 or coverage.',
  province:
    'Inferred: in season, and no provincial notice for this beach was found in coverage for this day; the advisories page itself was not archived in season.',
} as const

interface Span {
  from: string
  to: string
  state: BeachState
  basis: SeedBasis
  note: string
}

const span = (from: string, to: string, state: BeachState, basis: SeedBasis, note: string): Span => ({
  from,
  to,
  state,
  basis,
  note,
})

// ------------------------------------------------------ the two archived tables

const ADVISORY = 'Water Quality Advisory in Effect'
const TABLE_0701 = 'the halifax.ca supervised-beach table as archived on July 1, 2026 at 09:35 UTC (web.archive.org)'
const TABLE_0724 = 'the halifax.ca supervised-beach table as archived on July 24, 2026 at 15:58 UTC (web.archive.org)'

type TableRow = [state: BeachState, verbatim: string, samples: string]

/** Beach Status and Water Sample Results cells, July 1, 2026. Every other HRM row read "Open" / "Pass". */
const JULY_1: Record<string, TableRow> = {
  'hrm-kearney-lake': ['advisory', ADVISORY, '170, 110, 150, 160, 140'],
  'hrm-kidston-lake': ['advisory', ADVISORY, '290, 26, 18, 20, 20'],
  'hrm-long-pond': ['advisory', ADVISORY, '140, 130, 130, 160, 240'],
  'hrm-penhorn-lake': ['advisory', ADVISORY, '260, 140, 460, 160, 120'],
  'hrm-springfield': ['advisory', ADVISORY, '480, 180, 140, 140, 380'],
}

/** The same cells, July 24, 2026. "Heavy Rainfall" is the table's own sample-results entry. */
const JULY_24: Record<string, TableRow> = {
  'hrm-albro-lake': ['advisory', ADVISORY, 'Heavy Rainfall'],
  'hrm-birch-cove': ['advisory', ADVISORY, 'Heavy Rainfall'],
  'hrm-kearney-lake': ['advisory', ADVISORY, '310, 120, 100, 68, 66'],
  'hrm-kinap': ['advisory', ADVISORY, 'Heavy Rainfall'],
  'hrm-long-pond': ['advisory', ADVISORY, '110, 120, 240, 160, 110'],
  'hrm-penhorn-lake': ['advisory', 'Water Quality Advisory', 'Heavy Rainfall'],
  'hrm-springfield': ['advisory', ADVISORY, '140, 140, 150, 170, 160'],
}

function tableSpan(day: string, table: string, row: TableRow | undefined): Span {
  const [state, verbatim, samples] = row ?? ['open', 'Open', 'Pass']
  return span(day, day, state, 'verified', `Beach Status "${verbatim}", water sample results "${samples}", in ${table}.`)
}

// --------------------------------------------- carried between and after them

/** Advisory in both tables on the five-sample geomean: carried across the days between. */
const BOTH_TABLES = ['hrm-kearney-lake', 'hrm-long-pond', 'hrm-penhorn-lake', 'hrm-springfield'] as const
const BETWEEN_TABLES_NOTE =
  'Inferred: "Water Quality Advisory in Effect" in both archived tables, July 1 and July 24; an advisory stays until the five-sample geomean is back within the guideline (HRM 2026 protocol, p. 9), so the days between are carried as advisory.'

/** Geomean advisories in the July 24 table, with no later table: one more sampling week, then open. */
const GEOMEAN_0724 = ['hrm-kearney-lake', 'hrm-long-pond', 'hrm-springfield'] as const
const GEOMEAN_CARRY_NOTE =
  'Inferred: advisory in the July 24 table on the five-sample geomean; no later table was archived, so it is carried one sampling week (HRM re-samples weekly and lifts on a passing geomean, 2026 protocol, p. 9).'
const GEOMEAN_LIFTED_NOTE =
  'Inferred open: advisory in the July 24 table on the five-sample geomean, taken as lifted after the following sampling week; no later table was archived and no notice was posted.'

/** "Heavy Rainfall" advisories in the July 24 (Friday) table: re-sampled the next weekday, results within two days. */
const RAINFALL_0724 = ['hrm-albro-lake', 'hrm-birch-cove', 'hrm-kinap', 'hrm-penhorn-lake'] as const
const RAINFALL_CARRY_NOTE =
  'Inferred: "Heavy Rainfall" advisory in the July 24 (Friday) table; HRM re-samples the next weekday and lab results take one to two days (2026 protocol), so the advisory is carried to July 28.'
const RAINFALL_LIFTED_NOTE =
  'Inferred open: the July 24 heavy-rainfall advisory is taken as lifted after the following week’s re-sampling; no later table was archived and no notice was posted.'

// ------------------------------------------------------------------ notices

const OAKFIELD_CLOSED =
  'halifax.ca, "Oakfield Beach closed to swimming due to possible blue-green algae bloom", posted July 28, 2026, 2:48 pm: closed for recreational use; the provincial algae feed lists a Shubenacadie Grand Lake bloom dated 2026-07-28.'
const OAKFIELD_BETWEEN =
  'Inferred: HRM closed Oakfield Beach for a toxin-producing blue-green algae bloom on July 28, 2026 and announced the reopening on August 24, 2026 (halifax.ca notices); closure between those dates is inferred.'
const OAKFIELD_REOPENED =
  'halifax.ca, "Oakfield Beach reopens to swimming", posted August 24, 2026, 1:55 pm: toxin levels within Health Canada limits and no new algae observed.'
const OAKFIELD_AFTER = 'Inferred open: reopened August 24, 2026 (halifax.ca); no later notice before the season ended.'

const KEARNEY_CLOSED =
  'halifax.ca, "Kearney Lake Beach closed to swimming due to possible blue-green algae bloom", posted August 25, 2026, 9:55 am: closed for recreational use.'
const KEARNEY_AFTER =
  'Inferred: closed August 25, 2026 for a toxin-producing blue-green algae bloom (halifax.ca); no reopening notice was posted before the season ended.'

const SANDY_CLOSED =
  'halifax.ca, "Sandy Lake Beach closed to swimming due to possible blue-green algae bloom", posted August 26, 2026, 10:35 am: closed for recreational use.'
const SANDY_AFTER =
  'Inferred: closed August 26, 2026 for a toxin-producing blue-green algae bloom (halifax.ca); no reopening notice was posted before the season ended.'

const KINAP_CLOSED =
  'The provincial blue-green algae feed (notices.novascotia.ca) lists a Porters Lake bloom dated 2026-08-26, which this app reads as a closure for Kinap Beach; halifax.ca posted no notice either way.'
const KINAP_AFTER =
  'Inferred: Porters Lake bloom notice dated 2026-08-26 in the provincial algae feed, which this app keeps in effect for the calendar year; halifax.ca posted no notice either way.'

const SALT_ADVISORY =
  'Swimming advisory issued Friday, August 14, 2026 after Nova Scotia Lifeguard Service sampling found elevated enterococci; lifted Monday, August 17 (CBC, CTV).'
const SALT_BETWEEN = 'Inferred: advisory issued August 14, 2026 and lifted Monday, August 17 (CBC, CTV); in effect between.'
const SALT_LIFTED = 'CTV, "Swimming advisories lifted for Lawrencetown, Rainbow Haven beaches in Nova Scotia", August 17, 2026.'

/**
 * Per beach, in evidence order: a later span overrides an earlier one on any
 * day they share, so the dated notices sit last.
 */
function spansFor(beachId: string): Span[] {
  const out: Span[] = []
  if (beachId.startsWith('hrm-')) {
    out.push(tableSpan('2026-07-01', TABLE_0701, JULY_1[beachId]), tableSpan('2026-07-24', TABLE_0724, JULY_24[beachId]))
  }
  if ((BOTH_TABLES as readonly string[]).includes(beachId)) {
    out.push(span('2026-07-02', '2026-07-23', 'advisory', 'inferred', BETWEEN_TABLES_NOTE))
  }
  if (beachId === 'hrm-kidston-lake') {
    out.push(
      span(
        '2026-07-02',
        '2026-07-07',
        'advisory',
        'inferred',
        'Inferred: advisory in the July 1 table on one sample of 290 CFU (the other four 18–26); HRM re-samples the next weekday and results take one to two days (2026 protocol), so the advisory is carried one sampling week. Open in the July 24 table.',
      ),
      span(
        '2026-07-08',
        '2026-07-23',
        'open',
        'inferred',
        'Inferred open: advisory in the July 1 table on a single high sample, open in the July 24 table; the day it lifted is not recorded, so it is taken as one sampling week.',
      ),
    )
  }
  if ((GEOMEAN_0724 as readonly string[]).includes(beachId)) {
    out.push(
      span('2026-07-25', '2026-07-31', 'advisory', 'inferred', GEOMEAN_CARRY_NOTE),
      span('2026-08-01', '2026-08-31', 'open', 'inferred', GEOMEAN_LIFTED_NOTE),
    )
  }
  if ((RAINFALL_0724 as readonly string[]).includes(beachId)) {
    out.push(
      span('2026-07-25', '2026-07-28', 'advisory', 'inferred', RAINFALL_CARRY_NOTE),
      span('2026-07-29', '2026-08-31', 'open', 'inferred', RAINFALL_LIFTED_NOTE),
    )
  }
  switch (beachId) {
    case 'hrm-oakfield-park':
      out.push(
        span('2026-07-28', '2026-07-28', 'closed', 'verified', OAKFIELD_CLOSED),
        span('2026-07-29', '2026-08-23', 'closed', 'inferred', OAKFIELD_BETWEEN),
        span('2026-08-24', '2026-08-24', 'open', 'verified', OAKFIELD_REOPENED),
        span('2026-08-25', '2026-08-31', 'open', 'inferred', OAKFIELD_AFTER),
      )
      break
    case 'hrm-kearney-lake':
      out.push(
        span('2026-08-25', '2026-08-25', 'closed', 'verified', KEARNEY_CLOSED),
        span('2026-08-26', '2026-08-31', 'closed', 'inferred', KEARNEY_AFTER),
      )
      break
    case 'hrm-sandy-lake':
      out.push(
        span('2026-08-26', '2026-08-26', 'closed', 'verified', SANDY_CLOSED),
        span('2026-08-27', '2026-08-31', 'closed', 'inferred', SANDY_AFTER),
      )
      break
    case 'hrm-kinap':
      out.push(
        span('2026-08-26', '2026-08-26', 'closed', 'verified', KINAP_CLOSED),
        span('2026-08-27', '2026-08-31', 'closed', 'inferred', KINAP_AFTER),
      )
      break
    case 'ns-rainbow-haven':
    case 'ns-lawrencetown':
      out.push(
        span('2026-08-14', '2026-08-14', 'advisory', 'verified', SALT_ADVISORY),
        span('2026-08-15', '2026-08-16', 'advisory', 'inferred', SALT_BETWEEN),
        span('2026-08-17', '2026-08-17', 'open', 'verified', SALT_LIFTED),
      )
      break
  }
  return out
}

function rowFor(beachId: string, authority: 'hrm' | 'province', day: string, spans: readonly Span[]): SeedDayRow {
  const season = SEASON_2026[authority]
  if (day < season.open || day > season.close) {
    return { state: 'offseason', basis: 'calendar', note: OFFSEASON_NOTE[authority] }
  }
  let row: SeedDayRow = { state: 'open', basis: 'inferred', note: IN_SEASON_NOTE[authority] }
  for (const s of spans) {
    if (day >= s.from && day <= s.to) row = { state: s.state, basis: s.basis, note: s.note }
  }
  return row
}

function build(): Record<string, SeedDay> {
  const spans = new Map(BEACHES.map((b) => [b.id, spansFor(b.id)]))
  const days: Record<string, SeedDay> = {}
  for (let day = SEED_FROM; day <= SEED_TO; day = addDays(day, 1)) {
    const rows: SeedDay = {}
    for (const beach of BEACHES) rows[beach.id] = rowFor(beach.id, beach.authority, day, spans.get(beach.id)!)
    days[day] = rows
  }
  return days
}

/** Every day from SEED_FROM to SEED_TO, keyed by Halifax calendar date, every roster beach in each. */
export const DAYS_2026: Record<string, SeedDay> = build()
