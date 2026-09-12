import { describe, expect, it } from 'vitest'

import { absoluteUrl, matchKey, normalizeText } from './normalize'

describe('normalizeText', () => {
  it('collapses whitespace, converts NBSP to space, and trims', () => {
    expect(normalizeText('  Risk Advisory   in Effect ')).toBe('Risk Advisory in Effect')
    expect(normalizeText('Beach Status')).toBe('Beach Status')
  })

  it('keeps case', () => {
    expect(normalizeText('  Closed  ')).toBe('Closed')
  })
})

describe('matchKey', () => {
  it('normalises and lower-cases', () => {
    expect(matchKey('  Risk Advisory   in Effect ')).toBe('risk advisory in effect')
  })
})

describe('absoluteUrl', () => {
  it('resolves a root-relative href against a base', () => {
    expect(absoluteUrl('/graves-island-closed', 'https://parks.novascotia.ca/advisories')).toBe(
      'https://parks.novascotia.ca/graves-island-closed',
    )
  })

  it('returns null for empty or javascript: hrefs', () => {
    expect(absoluteUrl(undefined, 'https://parks.novascotia.ca/advisories')).toBeNull()
    expect(absoluteUrl('', 'https://parks.novascotia.ca/advisories')).toBeNull()
    expect(absoluteUrl('javascript:void(0)', 'https://parks.novascotia.ca/advisories')).toBeNull()
  })

  it('passes through an already-absolute href', () => {
    expect(absoluteUrl('https://example.com/x', 'https://parks.novascotia.ca/advisories')).toBe(
      'https://example.com/x',
    )
  })
})
