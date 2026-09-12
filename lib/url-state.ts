import { isDay } from '@/lib/dates'

/** The only two pieces of URL state the app has. Both are optional and both survive every change. */
export interface UrlState {
  day?: string
  beach?: string
}

type Params = Record<string, string | string[] | undefined>

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

/** Reads `?day=` and `?beach=`; a malformed `day` is dropped rather than replayed. */
export function readUrlState(params: Params, isBeach: (id: string) => boolean): UrlState {
  const day = first(params.day)
  const beach = first(params.beach)
  return {
    day: isDay(day) ? day : undefined,
    beach: beach && isBeach(beach) ? beach : undefined,
  }
}

/** `/`, `/?day=…`, `/?beach=…` or `/?day=…&beach=…` — always in that order so links compare equal. */
export function buildHref(state: UrlState): string {
  const q = new URLSearchParams()
  if (state.day) q.set('day', state.day)
  if (state.beach) q.set('beach', state.beach)
  const s = q.toString()
  return s ? `/?${s}` : '/'
}
