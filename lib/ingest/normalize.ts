/** NBSP→space, collapse whitespace, trim. Keeps case. */
export function normalizeText(s: string): string {
  return s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim()
}

/** normalizeText + lower-case; the comparison key for every exact match. */
export function matchKey(s: string): string {
  return normalizeText(s).toLowerCase()
}

/** Decodes the handful of HTML entities that show up in government-page markup. */
export function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
}

/** Strips tags, decodes entities, and normalises whitespace — the text of an HTML fragment. */
export function textOf(html: string): string {
  return normalizeText(decodeEntities(html.replace(/<[^>]*>/g, ' ')))
}

/** Resolve a possibly root-relative href against a base. Returns null when href is empty or javascript:. */
export function absoluteUrl(href: string | undefined, base: string): string | null {
  if (!href) return null
  const trimmed = href.trim()
  if (!trimmed || trimmed.toLowerCase().startsWith('javascript:')) return null

  try {
    return new URL(trimmed, base).toString()
  } catch {
    return null
  }
}
