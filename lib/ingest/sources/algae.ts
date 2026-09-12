import { BEACHES } from '@/lib/seed/beaches'
import { SourceParseError } from '@/lib/ingest/errors'
import { isCalendarDay } from '@/lib/ingest/halifax-day'
import { fetchText } from '@/lib/ingest/http'
import { matchKey, normalizeText, textOf } from '@/lib/ingest/normalize'
import type { IngestAnomaly, ParseResult, Roster, SourceReading } from '@/lib/ingest/types'

export const ALGAE_FEED_URL = 'https://notices.novascotia.ca/feeds/blue-green-algae.atom'
/** Public page users can actually read; used when an entry has no <link rel="alternate">. */
export const ALGAE_PUBLIC_URL = 'https://novascotia.ca/blue-green-algae/'

export async function fetchAlgae(opts?: { fetchImpl?: typeof fetch }): Promise<string> {
  return fetchText(ALGAE_FEED_URL, opts)
}

function splitEntries(xml: string): string[] {
  const entries: string[] = []
  const re = /<entry>([\s\S]*?)<\/entry>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) entries.push(m[1])
  return entries
}

function tagText(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`)
  const m = block.match(re)
  return m ? textOf(m[1]) : null
}

export function parseAlgae(xml: string, roster: Roster = BEACHES): ParseResult {
  const entries = splitEntries(xml)
  if (entries.length === 0) throw new SourceParseError('algae feed has no entries')

  const withLakes = roster.filter((b) => b.match.lakes && b.match.lakes.length > 0)

  const readings: SourceReading[] = []
  const anomalies: IngestAnomaly[] = []

  for (const entry of entries) {
    const noticeMatch = entry.match(/<notice\b[^>]*>([\s\S]*?)<\/notice>/)
    const notice = noticeMatch ? noticeMatch[1] : entry

    const lake = tagText(notice, 'lake')
    const date = tagText(notice, 'date')

    if (!lake || !date || !isCalendarDay(date)) {
      anomalies.push({ source: 'algae', code: 'malformed-entry', detail: entry.slice(0, 120) })
      continue
    }

    const bloom = tagText(notice, 'bloom-details')
    const published = tagText(entry, 'published')
    const postedAt = published && !Number.isNaN(Date.parse(published)) ? published : undefined

    const linkMatch = entry.match(/<link\b[^>]*rel="alternate"[^>]*href="([^"]*)"/)
    const url = linkMatch ? linkMatch[1] : ALGAE_PUBLIC_URL

    const verbatim = bloom ? `${lake} — ${bloom}` : lake

    const candidates = new Set<string>([matchKey(lake)])
    for (const part of lake.split(',')) candidates.add(matchKey(normalizeText(part)))

    const seen = new Set<string>()
    for (const beach of withLakes) {
      if (seen.has(beach.id)) continue
      const aliases = beach.match.lakes ?? []
      if (aliases.some((alias) => candidates.has(matchKey(alias)))) {
        seen.add(beach.id)
        readings.push({
          beachId: beach.id,
          source: 'algae',
          kind: 'closed',
          verbatim,
          url,
          postedAt,
          observedOn: date,
        })
      }
    }
  }

  return { readings, anomalies }
}
