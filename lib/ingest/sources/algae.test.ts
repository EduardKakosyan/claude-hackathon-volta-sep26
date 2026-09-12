import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { SourceParseError } from '@/lib/ingest/errors'

import { ALGAE_PUBLIC_URL, parseAlgae } from './algae'

const algaeLiveXml = readFileSync(new URL('../__fixtures__/algae-live.xml', import.meta.url), 'utf8')

// Reproduces the observed Atom structure (research §3): entry > published,
// entry > content > notice { lake, county, date, location-details, bloom-details }.
const SYNTHETIC_FEED = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>Blue-green algae</title><updated>2026-09-10T09:00:00-03:00</updated>
<entry><id>https://notices.novascotia.ca/node/9001</id><title>Porters Lake</title><published>2026-08-20T10:00:00-03:00</published>
  <content type="application/xml"><notice xmlns="https://notices.novascotia.ca/xmlns/blue-green-algae-report"><lake xml:lang="en">Porters Lake</lake><county>Halifax</county><date>2026-08-20</date><location-details>Porters Lake</location-details><bloom-details>Bloom</bloom-details></notice></content></entry>
<entry><id>https://notices.novascotia.ca/node/9002</id><title>Shubenacadie Grand Lake</title><published>2026-05-02T10:00:00-03:00</published>
  <content type="application/xml"><notice xmlns="https://notices.novascotia.ca/xmlns/blue-green-algae-report"><lake xml:lang="en">Shubenacadie Grand Lake</lake><county>Halifax</county><date>2026-05-02</date><location-details>Oakfield</location-details><bloom-details>Mat</bloom-details></notice></content></entry>
<entry><id>https://notices.novascotia.ca/node/9003</id><title>Kearney Lake</title><published>2025-08-01T10:00:00-03:00</published>
  <content type="application/xml"><notice xmlns="https://notices.novascotia.ca/xmlns/blue-green-algae-report"><lake xml:lang="en">Kearney Lake</lake><county>Halifax</county><date>2025-08-01</date><location-details>Halifax</location-details><bloom-details>bloom</bloom-details></notice></content></entry>
<entry><id>https://notices.novascotia.ca/node/9004</id><title>Long Lake</title><published>2026-08-25T10:00:00-03:00</published>
  <content type="application/xml"><notice xmlns="https://notices.novascotia.ca/xmlns/blue-green-algae-report"><lake xml:lang="en">Long Lake</lake><county>Halifax</county><date>2026-08-25</date><location-details>Spryfield</location-details><bloom-details>Mat</bloom-details></notice></content></entry>
<entry><id>https://notices.novascotia.ca/node/9005</id><title>Lake Echo, Chocolate Lake</title><published>2026-09-01T10:00:00-03:00</published>
  <content type="application/xml"><notice xmlns="https://notices.novascotia.ca/xmlns/blue-green-algae-report"><lake xml:lang="en">Lake Echo, Chocolate Lake</lake><county>Halifax</county><date>2026-09-01</date><location-details>Lake Echo</location-details><bloom-details>Bloom</bloom-details></notice></content></entry>
<entry><id>https://notices.novascotia.ca/node/9006</id><title>Broken</title><published>2026-09-02T10:00:00-03:00</published><content type="application/xml"><notice xmlns="https://notices.novascotia.ca/xmlns/blue-green-algae-report"><county>Halifax</county></notice></content></entry>
</feed>`

describe('parseAlgae — synthetic feed', () => {
  const { readings, anomalies } = parseAlgae(SYNTHETIC_FEED)

  it('produces readings for exactly the matched roster beaches', () => {
    expect(new Set(readings.map((r) => r.beachId))).toEqual(
      new Set(['hrm-kinap', 'hrm-oakfield-park', 'hrm-kearney-lake', 'hrm-lake-echo', 'hrm-chocolate-lake']),
    )
  })

  it('attaches full provenance to the Kinap (Porters Lake) reading', () => {
    const kinap = readings.find((r) => r.beachId === 'hrm-kinap')!
    expect(kinap.observedOn).toBe('2026-08-20')
    expect(kinap.postedAt).toBe('2026-08-20T10:00:00-03:00')
    expect(kinap.verbatim).toBe('Porters Lake — Bloom')
    expect(kinap.url).toBe(ALGAE_PUBLIC_URL)
    expect(kinap.kind).toBe('closed')
  })

  it('never matches Long Lake to Long Pond', () => {
    expect(readings.some((r) => r.beachId === 'hrm-long-pond')).toBe(false)
  })

  it('flags the entry with no lake as malformed', () => {
    expect(anomalies).toHaveLength(1)
    expect(anomalies[0].code).toBe('malformed-entry')
  })

  it('returns every entry regardless of year — the resolver applies the window', () => {
    const kearney = readings.find((r) => r.beachId === 'hrm-kearney-lake')!
    expect(kearney.observedOn).toBe('2025-08-01')
  })
})

describe('parseAlgae — captured fixture', () => {
  it('parses without throwing and only ever produces closed readings', () => {
    const { readings } = parseAlgae(algaeLiveXml)
    for (const r of readings) {
      expect(r.kind).toBe('closed')
      expect(r.observedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })
})

describe('parseAlgae — structural failures', () => {
  it('throws on a page with no entries', () => {
    expect(() => parseAlgae('<html>nope</html>')).toThrow(SourceParseError)
  })

  it('throws on an empty string', () => {
    expect(() => parseAlgae('')).toThrow(SourceParseError)
  })
})
