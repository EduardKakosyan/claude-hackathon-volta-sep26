import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { BEACHES_BY_ID } from '@/lib/seed/beaches'
import { SourceParseError } from '@/lib/ingest/errors'

import { PARKS_ADVISORIES_URL, parseParks } from './parks'

const parksLiveHtml = readFileSync(new URL('../__fixtures__/parks-live.html', import.meta.url), 'utf8')

// Reproduces the observed Drupal advisory-card markup (research §4): a
// `.views-row` wrapping an `<a>` around `.advisory-teaser-wrapper`, with a
// title span and a body div. Six cards; only some name a roster beach.
const SYNTHETIC_ADVISORIES = `
<div class="view view-all-advisories">
<div class="views-row col-sm-12 col-md-4"><a href="/rainbow-haven-closed-construction"><div class="advisory-teaser-wrapper card"><div class="advisory-teaser-content card-body"><strong><span class="field field--name-title">Rainbow Haven Closed for Construction</span></strong><div class="field field--name-body"><p>Rainbow Haven Beach Provincial Park is closed while the boardwalk is rebuilt.</p></div></div></div></a></div>
<div class="views-row col-sm-12 col-md-4"><a href="/heather-beach-adaptive-equipment"><div class="advisory-teaser-wrapper card"><div class="advisory-teaser-content card-body"><strong><span class="field field--name-title">Heather Beach adaptive equipment removed</span></strong><div class="field field--name-body"><p>The beach mat and floating wheelchair have been removed for the season.</p></div></div></div></a></div>
<div class="views-row col-sm-12 col-md-4"><a href="/boil-water-rissers-campground"><div class="advisory-teaser-wrapper card"><div class="advisory-teaser-content card-body"><strong><span class="field field--name-title">Boil Water Advisory - North Rissers Campground</span></strong><div class="field field--name-body"><p>Campers must boil water before drinking.</p></div></div></div></a></div>
<div class="views-row col-sm-12 col-md-4"><a href="/graves-island-closed-causeway-construction"><div class="advisory-teaser-wrapper card"><div class="advisory-teaser-content card-body"><strong><span class="field field--name-title">Graves Island Closed - Causeway Construction</span></strong><div class="field field--name-body"><p>The park is closed until further notice.</p></div></div></div></a></div>
<div class="views-row col-sm-12 col-md-4"><a href="/potential-blue-green-algae-grand-lake"><div class="advisory-teaser-wrapper card"><div class="advisory-teaser-content card-body"><strong><span class="field field--name-title">Potential Blue-green Algae Grand Lake</span></strong><div class="field field--name-body"><p>There has been a report of blue-green algae at Shubenacadie Grand Lake, HRM, near Oakfield Provincial Park.</p></div></div></div></a></div>
<div class="views-row col-sm-12 col-md-4"><a href="/swimming-advisory-dollar-lake-and-ellenwood"><div class="advisory-teaser-wrapper card"><div class="advisory-teaser-content card-body"><strong><span class="field field--name-title">Swimming advisory: Dollar Lake and Ellenwood Lake</span></strong><div class="field field--name-body"><p>Water quality results above guideline at Dollar Lake and Ellenwood Lake Provincial Parks.</p></div></div></div></a></div>
</div>`

describe('parseParks — synthetic, default policy', () => {
  const { readings, anomalies } = parseParks(SYNTHETIC_ADVISORIES)

  it('produces exactly the five expected readings', () => {
    expect(readings).toHaveLength(5)
    expect(anomalies).toEqual([])

    const byId = Object.fromEntries(readings.map((r) => [r.beachId, r]))
    expect(byId['ns-rainbow-haven'].kind).toBe('closed')
    expect(byId['ns-heather'].kind).toBe('advisory')
    expect(byId['ns-rissers'].kind).toBe('advisory')
    expect(byId['ns-dollar-lake'].kind).toBe('advisory')
    expect(byId['ns-ellenwood-lake'].kind).toBe('advisory')
  })

  it('shares verbatim and url for the two-beach card', () => {
    const dollar = readings.find((r) => r.beachId === 'ns-dollar-lake')!
    const ellenwood = readings.find((r) => r.beachId === 'ns-ellenwood-lake')!
    expect(dollar.verbatim).toBe('Swimming advisory: Dollar Lake and Ellenwood Lake')
    expect(dollar.url).toBe('https://parks.novascotia.ca/swimming-advisory-dollar-lake-and-ellenwood')
    expect(ellenwood.verbatim).toBe(dollar.verbatim)
    expect(ellenwood.url).toBe(dollar.url)
  })

  it('never attributes a card to an HRM beach', () => {
    expect(readings.every((r) => !r.beachId.startsWith('hrm-'))).toBe(true)
  })
})

describe('parseParks — swimRelevantOnly policy', () => {
  it('drops cards that mention no swim keyword', () => {
    const { readings } = parseParks(SYNTHETIC_ADVISORIES, undefined, {
      swimRelevantOnly: true,
      swimKeywords: ['closed', 'closure', 'algae', 'swim', 'water quality', 'e. coli', 'e.coli', 'bacteria'],
    })
    expect(new Set(readings.map((r) => r.beachId))).toEqual(
      new Set(['ns-rainbow-haven', 'ns-dollar-lake', 'ns-ellenwood-lake']),
    )
  })
})

describe('parseParks — captured fixture', () => {
  it('throws when the live page has no advisory container at all', () => {
    // This capture has no advisories markup whatsoever (the live page redirected
    // elsewhere) — a structural absence, not a legitimate zero-advisory page.
    expect(() => parseParks(parksLiveHtml)).toThrow(SourceParseError)
  })
})

describe('parseParks — malformed and structural failures', () => {
  it('flags a card missing an href', () => {
    const html = `<div class="views-row"><div class="advisory-teaser-wrapper"><span class="field field--name-title">No Link Advisory</span></div></div>`
    const { readings, anomalies } = parseParks(html)
    expect(readings).toEqual([])
    expect(anomalies).toHaveLength(1)
    expect(anomalies[0].code).toBe('malformed-entry')
  })

  it('throws on a page with no advisory markup', () => {
    expect(() => parseParks('<html><body><p>Maintenance</p></body></html>')).toThrow(SourceParseError)
  })

  it('every roster id referenced by the synthetic fixture exists', () => {
    for (const id of ['ns-rainbow-haven', 'ns-heather', 'ns-rissers', 'ns-dollar-lake', 'ns-ellenwood-lake']) {
      expect(BEACHES_BY_ID[id]).toBeDefined()
    }
  })

  it('exports the advisories URL used as the fetch base', () => {
    expect(PARKS_ADVISORIES_URL).toBe('https://parks.novascotia.ca/advisories')
  })
})
