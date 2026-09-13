import { addDays as datesAddDays, formatDay, formatDayShort, formatPosted, halifaxToday, isDay } from '@/lib/dates'
import type { CalendarDay, IsoInstant } from '@/lib/ingest/types'

export const HALIFAX_TZ = 'America/Halifax'

/** '2026-09-12' for the given instant, in Halifax local time. Thin adapter over lib/dates' halifaxToday. */
export function halifaxDay(instant: Date | IsoInstant): CalendarDay {
  return halifaxToday(instant instanceof Date ? instant : new Date(instant))
}

export const addDays = datesAddDays
export const isCalendarDay = isDay
export { formatDay, formatDayShort, formatPosted }

/** Pure 'YYYY-MM-DD' arithmetic via Date.UTC — to − from, in whole days. */
export function daysBetween(from: CalendarDay, to: CalendarDay): number {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  const fromUtc = Date.UTC(fy, fm - 1, fd)
  const toUtc = Date.UTC(ty, tm - 1, td)
  return Math.round((toUtc - fromUtc) / (24 * 60 * 60 * 1000))
}
