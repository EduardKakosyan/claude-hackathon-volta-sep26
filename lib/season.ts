import type { Authority, Beach } from '@/lib/seed/beaches'
import type { LiveStatus, StatusView } from '@/lib/status'

/**
 * When each authority tests and supervises its beaches, and so when its status
 * source is worth reading. Outside the window the hourly refresh does not fetch
 * the source at all and writes every beach of that authority as `offseason`
 * from source `season` (lib/ingest/refresh-live.ts); inside it the source's
 * own words rule, "Supervision ended for the season" included.
 *
 * The windows are the published 2026 ones. halifax.ca's table says July 1 –
 * August 31 (the roster's verbatim `supervision`), but HRM has opened beaches
 * in the last days of June in other years, so its scrape starts a few days
 * early: reading a table that still says "Supervision ended" costs nothing,
 * while missing an opening-day "Open" would. `returns` is hand-edited copy
 * for the detail out of season; the scrapers resume on their own on the day.
 */
export const SEASON = {
  hrm: { start: '06-27', end: '08-31', returns: 'late June' },
  province: { start: '07-01', end: '08-30', returns: 'July 1' },
} as const satisfies Record<Authority, { start: string; end: string; returns: string }>

export const AUTHORITIES: readonly Authority[] = ['hrm', 'province']

/** True on every day of the window, both ends included, any year. `day` is 'YYYY-MM-DD'. */
export function inSeason(authority: Authority, day: string): boolean {
  const monthDay = day.slice(5, 10)
  const { start, end } = SEASON[authority]
  return monthDay >= start && monthDay <= end
}

/** The row the refresh writes for a beach whose authority is out of season. */
export function offseasonStatus(beach: Pick<Beach, 'id' | 'sourceUrl'>, confirmedAt: string): LiveStatus {
  return {
    kind: 'live',
    beachId: beach.id,
    state: 'offseason',
    source: 'season',
    verbatim: 'Off-season',
    sourceUrl: beach.sourceUrl,
    postedAt: null,
    confirmedAt,
  }
}

/**
 * The authorities the page should call off-season: every one of the
 * authority's beaches carries the refresh's out-of-season row. Read from what
 * was written rather than from the clock, so the footer always agrees with
 * the rows and the fixture's off-season day reads the same way with no clock
 * faked. A single beach whose source says "Supervision ended" does not count:
 * that is the source's word in season, and the footer still says it was read.
 */
export function offseasonAuthorities(
  beaches: readonly Pick<Beach, 'id' | 'authority'>[],
  status: Record<string, StatusView | undefined>,
): Authority[] {
  return AUTHORITIES.filter((authority) => {
    const own = beaches.filter((beach) => beach.authority === authority)
    return (
      own.length > 0 &&
      own.every((beach) => {
        const row = status[beach.id]
        return row?.kind === 'live' && row.state === 'offseason' && row.source === 'season'
      })
    )
  })
}
