import type { Beach } from '@/lib/seed/beaches'

export type SearchField = 'name' | 'waterBody' | 'community' | 'lake'

export interface SearchHit {
  beach: Beach
  /** The best-ranked field that matched. */
  field: SearchField
  /** The roster text that matched, verbatim (shown as "matched Porters Lake"). */
  matched: string
}

export interface SearchOptions {
  /** Default 8. Pass `Infinity` for every match. */
  limit?: number
}

/**
 * Lower-case ASCII words. Apostrophes are removed (so "Risser's" finds Rissers);
 * every other non-alphanumeric becomes a space (so "St. Margarets" finds
 * "St. Margarets Bay"). Accents are stripped for the day a roster name has one.
 */
export function normalizeQuery(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const FIELD_RANK: Record<SearchField, number> = { name: 0, waterBody: 1, community: 2, lake: 3 }

function candidates(beach: Beach): { field: SearchField; text: string }[] {
  return [
    { field: 'name', text: beach.name },
    { field: 'waterBody', text: beach.waterBody },
    { field: 'community', text: beach.community },
    ...(beach.match.lakes ?? []).map((text) => ({ field: 'lake' as const, text })),
  ]
}

interface Scored extends SearchHit {
  rank: number
  wordStart: boolean
}

/**
 * Substring match over name, water body, community, and the algae-feed lake
 * aliases. Ranked name > water body > community > lake, then word-start matches
 * before mid-word ones, then by name. Empty or whitespace queries return [].
 */
export function searchBeaches(
  query: string,
  roster: readonly Beach[],
  { limit = 8 }: SearchOptions = {},
): SearchHit[] {
  const q = normalizeQuery(query)
  if (!q) return []

  const scored: Scored[] = []
  for (const beach of roster) {
    let best: Scored | null = null
    for (const { field, text } of candidates(beach)) {
      const haystack = normalizeQuery(text)
      const at = haystack.indexOf(q)
      if (at < 0) continue
      const hit: Scored = {
        beach,
        field,
        matched: text,
        rank: FIELD_RANK[field],
        wordStart: at === 0 || haystack[at - 1] === ' ',
      }
      if (
        !best ||
        hit.rank < best.rank ||
        (hit.rank === best.rank && hit.wordStart && !best.wordStart)
      ) {
        best = hit
      }
    }
    if (best) scored.push(best)
  }

  scored.sort(
    (a, b) =>
      a.rank - b.rank ||
      Number(b.wordStart) - Number(a.wordStart) ||
      a.beach.name.localeCompare(b.beach.name, 'en'),
  )

  return scored.slice(0, Math.max(0, limit)).map(({ beach, field, matched }) => ({ beach, field, matched }))
}
