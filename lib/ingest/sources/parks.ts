import { BEACHES } from '@/lib/seed/beaches'
import { SourceParseError } from '@/lib/ingest/errors'
import { fetchText } from '@/lib/ingest/http'
import { absoluteUrl, matchKey, textOf } from '@/lib/ingest/normalize'
import type { IngestAnomaly, ParseResult, Roster, SourceReading } from '@/lib/ingest/types'

export const PARKS_ADVISORIES_URL = 'https://parks.novascotia.ca/advisories'

export interface ParksPolicy {
  /**
   * false (PRD-literal, DEFAULT): any card that names a roster beach colours its pin.
   * true: only cards whose title or body contains one of swimKeywords produce a reading.
   */
  swimRelevantOnly: boolean
  swimKeywords: readonly string[]
}

export const SWIM_KEYWORDS = [
  'closed',
  'closure',
  'algae',
  'swim',
  'water quality',
  'e. coli',
  'e.coli',
  'bacteria',
] as const

export const DEFAULT_PARKS_POLICY: ParksPolicy = { swimRelevantOnly: false, swimKeywords: SWIM_KEYWORDS }

export async function fetchParks(opts?: { fetchImpl?: typeof fetch }): Promise<string> {
  return fetchText(PARKS_ADVISORIES_URL, opts)
}

const CONTAINER_MARKERS = ['advisory-teaser-wrapper', 'views-row']

function hasAdvisoryContainer(html: string): boolean {
  return CONTAINER_MARKERS.some((marker) => html.includes(marker))
}

/** Slices the document into one chunk per `.views-row` card, from one marker to the next. */
function splitCards(html: string): string[] {
  const marker = /<div\b[^>]*class="[^"]*views-row[^"]*"[^>]*>/g
  const starts: number[] = []
  let m: RegExpExecArray | null
  while ((m = marker.exec(html))) starts.push(m.index)
  if (starts.length === 0) return []
  return starts.map((start, i) => html.slice(start, i + 1 < starts.length ? starts[i + 1] : html.length))
}

function extractField(card: string, fieldClass: string): string | null {
  const re = new RegExp(`class="[^"]*${fieldClass}[^"]*"[^>]*>([\\s\\S]*?)<\\/(?:span|strong|div|h[1-6])>`)
  const m = card.match(re)
  return m ? textOf(m[1]) : null
}

export function parseParks(
  html: string,
  roster: Roster = BEACHES,
  policy: ParksPolicy = DEFAULT_PARKS_POLICY,
): ParseResult {
  if (!hasAdvisoryContainer(html)) {
    throw new SourceParseError('no advisory cards found')
  }

  const cards = splitCards(html).filter((c) => c.includes('advisory-teaser-wrapper'))

  const readings: SourceReading[] = []
  const anomalies: IngestAnomaly[] = []

  const provincial = roster.filter((b) => b.match.parksText && b.match.parksText.length > 0)

  for (const card of cards) {
    const title = extractField(card, 'field--name-title')
    const hrefMatch = card.match(/<a\b[^>]*\shref="([^"]*)"/)
    const href = hrefMatch ? absoluteUrl(hrefMatch[1], PARKS_ADVISORIES_URL) : null

    if (!title || !href) {
      anomalies.push({ source: 'parks', code: 'malformed-entry', detail: card.slice(0, 120) })
      continue
    }

    const body = extractField(card, 'field--name-body') ?? ''
    const haystack = matchKey(`${title} ${body}`)

    if (policy.swimRelevantOnly && !policy.swimKeywords.some((kw) => haystack.includes(kw))) {
      continue
    }

    const kind = matchKey(title).includes('closed') || matchKey(title).includes('closure') ? 'closed' : 'advisory'

    for (const beach of provincial) {
      const aliases = beach.match.parksText ?? []
      if (aliases.some((alias) => haystack.includes(matchKey(alias)))) {
        readings.push({ beachId: beach.id, source: 'parks', kind, verbatim: title, url: href })
      }
    }
  }

  return { readings, anomalies }
}
