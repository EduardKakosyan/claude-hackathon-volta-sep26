import type { BeachState } from '@/lib/seed/beaches'
import { BEACHES, HRM_STATUS_URL } from '@/lib/seed/beaches'
import { SourceParseError } from '@/lib/ingest/errors'
import { fetchText } from '@/lib/ingest/http'
import { matchKey, textOf } from '@/lib/ingest/normalize'
import type { IngestAnomaly, ParseResult, Roster, SourceReading } from '@/lib/ingest/types'

export { HRM_STATUS_URL }

/** Exact status vocabulary, keyed by matchKey(cell). Anything else is an anomaly, never a guess. */
export const HRM_STATUS_WORDS: Readonly<Record<string, BeachState>> = {
  open: 'open',
  'risk advisory in effect': 'advisory',
  closed: 'closed',
  'supervision ended for the season': 'offseason',
}

export async function fetchHrm(opts?: { fetchImpl?: typeof fetch }): Promise<string> {
  return fetchText(HRM_STATUS_URL, opts)
}

function extractRows(tableHtml: string): string[] {
  const rows: string[] = []
  const re = /<tr\b[^>]*>[\s\S]*?<\/tr>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(tableHtml))) rows.push(m[0])
  return rows
}

function extractCells(rowHtml: string): string[] {
  const cells: string[] = []
  const re = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(rowHtml))) cells.push(textOf(m[1]))
  return cells
}

/** Locates the "Supervised beach status updates" table, tolerating attribute reordering. */
function extractTable(html: string): string {
  const dataTitleIdx = html.indexOf('data-title="Supervised beach status updates"')
  if (dataTitleIdx !== -1) {
    const start = html.lastIndexOf('<table', dataTitleIdx)
    const end = html.indexOf('</table>', dataTitleIdx)
    if (start !== -1 && end !== -1) return html.slice(start, end + '</table>'.length)
  }

  const idIdx = html.indexOf('id="tablefield-paragraph-35121-field_table-0"')
  if (idIdx !== -1) {
    const start = html.lastIndexOf('<table', idIdx)
    const end = html.indexOf('</table>', idIdx)
    if (start !== -1 && end !== -1) return html.slice(start, end + '</table>'.length)
  }

  const tableRe = /<table\b[^>]*>[\s\S]*?<\/table>/g
  let m: RegExpExecArray | null
  while ((m = tableRe.exec(html))) {
    const candidate = m[0]
    const rows = extractRows(candidate)
    if (rows.length === 0) continue
    const firstCells = extractCells(rows[0])
    if (firstCells[0] && matchKey(firstCells[0]) === 'beach name') return candidate
  }

  throw new SourceParseError('HRM status table not found')
}

export function parseHrm(html: string, roster: Roster = BEACHES): ParseResult {
  const tableHtml = extractTable(html)
  const rows = extractRows(tableHtml)
  if (rows.length === 0) throw new SourceParseError('HRM status table has no rows')

  const headerRowIdx = rows.findIndex((r) => r.includes('<th'))
  const headerRow = headerRowIdx !== -1 ? rows[headerRowIdx] : rows[0]
  const headerCells = extractCells(headerRow)
  const nameIdx = headerCells.findIndex((c) => matchKey(c) === 'beach name')
  const statusIdx = headerCells.findIndex((c) => matchKey(c).startsWith('beach status'))
  if (nameIdx === -1 || statusIdx === -1) {
    throw new SourceParseError('HRM header columns not found')
  }

  const bodyRows = rows.filter((_, i) => i !== headerRowIdx)
  if (bodyRows.length === 0) throw new SourceParseError('HRM status table has no rows')

  const byName = new Map<string, string>()
  for (const b of roster) {
    if (b.authority === 'hrm' && b.match.hrmTable) byName.set(matchKey(b.match.hrmTable), b.id)
  }

  const requiredLen = Math.max(nameIdx, statusIdx) + 1
  const readings: SourceReading[] = []
  const anomalies: IngestAnomaly[] = []

  for (const row of bodyRows) {
    const cells = extractCells(row)
    if (cells.length < requiredLen) continue

    const name = cells[nameIdx]
    // The captured page repeats the header text as a literal data row; not a real beach.
    if (matchKey(name) === 'beach name') continue

    const raw = cells[statusIdx]
    const beachId = byName.get(matchKey(name))
    if (!beachId) {
      anomalies.push({ source: 'hrm', code: 'unmatched-hrm-row', detail: name })
      continue
    }

    const kind = HRM_STATUS_WORDS[matchKey(raw)]
    if (!kind) {
      anomalies.push({ source: 'hrm', code: 'unknown-hrm-word', detail: `${name}: "${raw}"` })
      continue
    }

    readings.push({ beachId, source: 'hrm', kind, verbatim: raw, url: HRM_STATUS_URL })
  }

  return { readings, anomalies }
}
