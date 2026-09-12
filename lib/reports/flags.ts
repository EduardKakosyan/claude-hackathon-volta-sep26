import { isReportSign } from './validate'
import type { ReportFlag, ReportFlagRow, ReportSign } from './types'

export const SIGN_LABEL: Record<ReportSign, string> = { closed: 'Closed', advisory: 'Advisory', clear: 'All clear' }
export const SIGN_SEVERITY: Record<ReportSign, number> = { closed: 3, advisory: 2, clear: 1 }
export const HALIFAX_TZ = 'America/Halifax'

const MIN_PEOPLE_TO_FLAG = 2

/**
 * The view can return several signs for one beach (two people say Closed, two say All
 * clear). The page shows one. Pick: most people → higher severity → most recent.
 * Malformed rows (unknown sign, people < 2, bad date) are dropped, never guessed.
 */
export function selectFlags(rows: ReadonlyArray<ReportFlagRow>): Record<string, ReportFlag> {
  const best: Record<string, ReportFlag> = {}

  for (const row of rows) {
    if (!isReportSign(row.sign)) continue
    if (row.people < MIN_PEOPLE_TO_FLAG) continue
    const lastAtMs = Date.parse(row.last_at)
    if (Number.isNaN(lastAtMs)) continue

    const candidate: ReportFlag = {
      beachId: row.beach_id,
      sign: row.sign,
      people: row.people,
      lastAt: row.last_at,
    }

    const current = best[row.beach_id]
    if (!current || isBetter(candidate, current)) {
      best[row.beach_id] = candidate
    }
  }

  return best
}

function isBetter(candidate: ReportFlag, current: ReportFlag): boolean {
  if (candidate.people !== current.people) return candidate.people > current.people
  const candidateSeverity = SIGN_SEVERITY[candidate.sign]
  const currentSeverity = SIGN_SEVERITY[current.sign]
  if (candidateSeverity !== currentSeverity) return candidateSeverity > currentSeverity
  return Date.parse(candidate.lastAt) > Date.parse(current.lastAt)
}

function peopleWord(people: number): string {
  return people === 1 ? 'person' : 'people'
}

/** "2 people reported a Closed sign here today" — used for the badge's title/aria-label */
export function formatFlagTitle(flag: ReportFlag): string {
  return `${flag.people} ${peopleWord(flag.people)} reported a ${SIGN_LABEL[flag.sign]} sign here today`
}

/** "2 people reported a Closed sign here today · last at 1:15 p.m." */
export function formatFlagLine(flag: ReportFlag, opts?: { timeZone?: string; locale?: string }): string {
  const time = new Intl.DateTimeFormat(opts?.locale ?? 'en-CA', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: opts?.timeZone ?? HALIFAX_TZ,
  }).format(new Date(flag.lastAt))

  return `${formatFlagTitle(flag)} · last at ${time}`
}
