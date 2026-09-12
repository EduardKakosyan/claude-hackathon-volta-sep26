import { describe, expect, it } from 'vitest'

import { buildHref, readUrlState } from './url-state'

const isBeach = (id: string) => id === 'hrm-kinap' || id === 'ns-rainbow-haven'

describe('url state', () => {
  it('keeps both params and orders them day first', () => {
    expect(buildHref({ day: '2026-08-14', beach: 'hrm-kinap' })).toBe(
      '/?day=2026-08-14&beach=hrm-kinap',
    )
    expect(buildHref({ beach: 'hrm-kinap' })).toBe('/?beach=hrm-kinap')
    expect(buildHref({ day: '2026-08-14' })).toBe('/?day=2026-08-14')
    expect(buildHref({})).toBe('/')
  })

  it('drops a malformed day and an unknown beach', () => {
    expect(readUrlState({ day: '14-08-2026', beach: 'nope' }, isBeach)).toEqual({
      day: undefined,
      beach: undefined,
    })
    expect(readUrlState({ day: '2026-02-30', beach: 'hrm-kinap' }, isBeach)).toEqual({
      day: undefined,
      beach: 'hrm-kinap',
    })
  })

  it('takes the first value of a repeated param', () => {
    expect(
      readUrlState({ day: ['2026-08-14', '2026-08-15'], beach: ['ns-rainbow-haven'] }, isBeach),
    ).toEqual({ day: '2026-08-14', beach: 'ns-rainbow-haven' })
  })
})
