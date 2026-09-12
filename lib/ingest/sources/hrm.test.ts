import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { BEACHES } from '@/lib/seed/beaches'
import { SourceParseError } from '@/lib/ingest/errors'

import { HRM_STATUS_WORDS, parseHrm } from './hrm'

const hrmLiveHtml = readFileSync(new URL('../__fixtures__/hrm-live.html', import.meta.url), 'utf8')

const HRM_IDS = BEACHES.filter((b) => b.authority === 'hrm').map((b) => b.id)

function tableWith(rows: string): string {
  return `<table data-title="Supervised beach status updates">
    <thead><tr><th>Beach Name</th><th>Beach Status (Open/Risk Advisory in Effect/Closed)</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`
}

describe('parseHrm — captured fixture', () => {
  const { readings, anomalies } = parseHrm(hrmLiveHtml)

  it('returns one reading per HRM roster beach', () => {
    expect(readings).toHaveLength(18)
    expect(new Set(readings.map((r) => r.beachId))).toEqual(new Set(HRM_IDS))
  })

  it('maps every row to offseason with the verbatim cell text', () => {
    for (const r of readings) {
      expect(r.kind).toBe('offseason')
      expect(r.verbatim).toBe('Supervision ended for the season')
      expect(r.source).toBe('hrm')
    }
  })

  it('has no anomalies', () => {
    expect(anomalies).toEqual([])
  })
})

describe('parseHrm — vocabulary and anomalies', () => {
  it('maps all four known status words', () => {
    const html = tableWith(`
      <tr><td>Albro Lake Beach</td><td>Open</td></tr>
      <tr><td>Birch Cove Beach</td><td>Risk Advisory in Effect</td></tr>
      <tr><td>Chocolate Lake Beach</td><td>Closed</td></tr>
      <tr><td>Cunard Pond Beach</td><td>Supervision ended for the season</td></tr>
    `)
    const { readings, anomalies } = parseHrm(html)
    expect(readings).toHaveLength(4)
    expect(readings.map((r) => r.kind).sort()).toEqual(['advisory', 'closed', 'offseason', 'open'])
    expect(anomalies).toEqual([])
  })

  it('flags an unknown status word and skips the row', () => {
    const html = tableWith('<tr><td>Kinap Beach</td><td>Open (see note)</td></tr>')
    const { readings, anomalies } = parseHrm(html)
    expect(readings).toEqual([])
    expect(anomalies).toEqual([
      { source: 'hrm', code: 'unknown-hrm-word', detail: 'Kinap Beach: "Open (see note)"' },
    ])
  })

  it('flags a row whose name matches no roster beach and skips it', () => {
    const html = tableWith('<tr><td>Fenerty Beach</td><td>Open</td></tr>')
    const { readings, anomalies } = parseHrm(html)
    expect(readings).toEqual([])
    expect(anomalies).toEqual([{ source: 'hrm', code: 'unmatched-hrm-row', detail: 'Fenerty Beach' }])
  })

  it('is exact-match only — near-miss phrases never map', () => {
    expect(HRM_STATUS_WORDS['closed for the season']).toBeUndefined()
    expect(HRM_STATUS_WORDS['open (see note)']).toBeUndefined()
  })
})

describe('parseHrm — structural failures', () => {
  it('throws when there is no status table at all', () => {
    expect(() => parseHrm('<html><body><p>Maintenance</p></body></html>')).toThrow(SourceParseError)
  })

  it('throws when the table has a header but no body rows', () => {
    const html = tableWith('')
    expect(() => parseHrm(html)).toThrow(SourceParseError)
  })

  it('throws when the header lacks a status column', () => {
    const html = `<table data-title="Supervised beach status updates">
      <thead><tr><th>Beach Name</th><th>Location</th></tr></thead>
      <tbody><tr><td>Albro Lake Beach</td><td>Dartmouth</td></tr></tbody>
    </table>`
    expect(() => parseHrm(html)).toThrow(SourceParseError)
  })

  it('parses a header-driven column order, even swapped', () => {
    const html = `<table data-title="Supervised beach status updates">
      <thead><tr><th>Beach Status (Open/Risk Advisory in Effect/Closed)</th><th>Beach Name</th></tr></thead>
      <tbody><tr><td>Open</td><td>Albro Lake Beach</td></tr></tbody>
    </table>`
    const { readings } = parseHrm(html)
    expect(readings).toEqual([
      { beachId: 'hrm-albro-lake', source: 'hrm', kind: 'open', verbatim: 'Open', url: expect.any(String) },
    ])
  })
})
