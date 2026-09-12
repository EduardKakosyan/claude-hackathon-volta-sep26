const HALIFAX = 'America/Halifax'

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

export function isDay(value: unknown): value is string {
  if (typeof value !== 'string' || !DAY_RE.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

/** Today's Halifax calendar date as YYYY-MM-DD, whatever the server's clock zone is. */
export function halifaxToday(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: HALIFAX,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/** Calendar arithmetic on YYYY-MM-DD strings, no time zone involved. */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** 'August 14, 2026' */
export function formatDay(day: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(`${day}T00:00:00Z`))
}

/** 'Aug 14' */
export function formatDayShort(day: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
  }).format(new Date(`${day}T00:00:00Z`))
}

/** 'today, 8:02 a.m.' or 'Aug 14, 8:02 a.m.' in Halifax time. */
export function formatPosted(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const time = new Intl.DateTimeFormat('en-CA', {
    timeZone: HALIFAX,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
    .format(d)
    .replace(/\s?([ap])\.?m\.?$/i, ' $1.m.')
    .toLowerCase()
  const dayOf = new Intl.DateTimeFormat('en-CA', {
    timeZone: HALIFAX,
    month: 'short',
    day: 'numeric',
  })
  const sameDay = halifaxToday(d) === halifaxToday(now)
  return sameDay ? `today, ${time}` : `${dayOf.format(d)}, ${time}`
}
