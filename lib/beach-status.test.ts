import { describe, expect, it } from 'vitest'

import {
  PIN_STATES,
  STATUS_LABEL,
  UNKNOWN_CAVEAT,
  authorityName,
  isAdvisoryBasedAuthority,
  statusAccessibleName,
  statusPresentation,
  type PinState,
} from '@/lib/beach-status'

describe('beach-status', () => {
  describe('PIN_STATES', () => {
    it('contains all states in correct order', () => {
      expect(PIN_STATES).toEqual(['open', 'advisory', 'closed', 'offseason', 'unknown'])
    })
  })

  describe('STATUS_LABEL', () => {
    it('provides labels for all states', () => {
      expect(STATUS_LABEL.open).toBe('Open')
      expect(STATUS_LABEL.advisory).toBe('Advisory')
      expect(STATUS_LABEL.closed).toBe('Closed')
      expect(STATUS_LABEL.offseason).toBe('Off-season')
      expect(STATUS_LABEL.unknown).toBe('No status available')
    })
  })

  describe('statusPresentation', () => {
    describe('provincial open', () => {
      it('labels as "No advisory posted"', () => {
        const result = statusPresentation('open', 'province')
        expect(result.label).toBe('No advisory posted')
      })

      it('explains that open means no advisory found, not tested today', () => {
        const result = statusPresentation('open', 'province')
        expect(result.explanation).toContain('no matching park advisory')
        expect(result.explanation).toContain('does not mean a water sample passed today')
      })

      it('includes provincial caveat about advisory-based evidence', () => {
        const result = statusPresentation('open', 'province')
        expect(result.caveat).toBeDefined()
        expect(result.caveat).toContain('hollow pin')
        expect(result.caveat).toContain('advisory-based')
      })
    })

    describe('HRM open', () => {
      it('labels as "Open"', () => {
        const result = statusPresentation('open', 'hrm')
        expect(result.label).toBe('Open')
      })

      it('explains that status is open with caveats about current conditions', () => {
        const result = statusPresentation('open', 'hrm')
        expect(result.explanation).toContain('supplied status is open')
        expect(result.explanation).not.toContain('advisory')
      })

      it('does not include a caveat', () => {
        const result = statusPresentation('open', 'hrm')
        expect(result.caveat).toBeUndefined()
      })
    })

    describe('unknown', () => {
      it('labels as "No status available" for both authorities', () => {
        expect(statusPresentation('unknown', 'hrm').label).toBe('No status available')
        expect(statusPresentation('unknown', 'province').label).toBe('No status available')
      })

      it('explains that we have not read official status yet', () => {
        const result = statusPresentation('unknown', 'hrm')
        expect(result.explanation).toContain('have not read an official status')
      })

      it('includes caveat that unknown does not mean open', () => {
        const result = statusPresentation('unknown', 'hrm')
        expect(result.caveat).toBe(UNKNOWN_CAVEAT)
        expect(result.caveat).toContain('does not mean open')
      })

      it('includes caveat for provincial unknown too', () => {
        const result = statusPresentation('unknown', 'province')
        expect(result.caveat).toBe(UNKNOWN_CAVEAT)
      })
    })

    describe('advisory', () => {
      it('labels as "Advisory"', () => {
        const result = statusPresentation('advisory', 'hrm')
        expect(result.label).toBe('Advisory')
      })

      it('explains swimming not recommended', () => {
        const result = statusPresentation('advisory', 'hrm')
        expect(result.explanation).toContain('Swimming is not recommended')
      })

      it('has no caveat for HRM', () => {
        const result = statusPresentation('advisory', 'hrm')
        expect(result.caveat).toBeUndefined()
      })

      it('has no caveat for province either', () => {
        const result = statusPresentation('advisory', 'province')
        expect(result.caveat).toBeUndefined()
      })
    })

    describe('closed', () => {
      it('labels as "Closed"', () => {
        const result = statusPresentation('closed', 'hrm')
        expect(result.label).toBe('Closed')
      })

      it('explains closed to swimming', () => {
        const result = statusPresentation('closed', 'hrm')
        expect(result.explanation).toContain('Closed to swimming')
      })

      it('has no caveat', () => {
        const result = statusPresentation('closed', 'hrm')
        expect(result.caveat).toBeUndefined()
      })
    })

    describe('offseason', () => {
      it('labels as "Off-season"', () => {
        const result = statusPresentation('offseason', 'hrm')
        expect(result.label).toBe('Off-season')
      })

      it('explains off-season with when that authority\'s lifeguards return', () => {
        expect(statusPresentation('offseason', 'hrm').explanation).toBe('Off-season. Lifeguards return late June.')
        expect(statusPresentation('offseason', 'province').explanation).toBe('Off-season. Lifeguards return July 1.')
      })

      it('has no caveat', () => {
        const result = statusPresentation('offseason', 'hrm')
        expect(result.caveat).toBeUndefined()
      })
    })

    it('never claims water is safe in any explanation', () => {
      const states: PinState[] = ['open', 'advisory', 'closed', 'offseason', 'unknown']
      for (const state of states) {
        for (const authority of ['hrm', 'province'] as const) {
          const result = statusPresentation(state, authority)
          expect(
            result.explanation,
            `${state} / ${authority} should not claim water is safe`,
          ).not.toMatch(/\bsafe\b/i)
        }
      }
    })
  })

  describe('authorityName', () => {
    it('returns "Halifax Regional Municipality" for hrm', () => {
      expect(authorityName('hrm')).toBe('Halifax Regional Municipality')
    })

    it('returns "Nova Scotia Parks" for province', () => {
      expect(authorityName('province')).toBe('Nova Scotia Parks')
    })
  })

  describe('isAdvisoryBasedAuthority', () => {
    it('returns true for province', () => {
      expect(isAdvisoryBasedAuthority('province')).toBe(true)
    })

    it('returns false for hrm', () => {
      expect(isAdvisoryBasedAuthority('hrm')).toBe(false)
    })
  })

  describe('statusAccessibleName', () => {
    it('combines beach name and status with em dash and spaces', () => {
      const result = statusAccessibleName('Crystal Crescent Beach', 'open', 'province')
      expect(result).toBe('Crystal Crescent Beach — No advisory posted')
    })

    it('uses authority-aware label for open beaches', () => {
      const provincial = statusAccessibleName('Test Beach', 'open', 'province')
      const hrm = statusAccessibleName('Test Beach', 'open', 'hrm')
      expect(provincial).toContain('No advisory posted')
      expect(hrm).toContain('Open')
    })

    it('uses generic label for other states', () => {
      const result = statusAccessibleName('Test Beach', 'advisory', 'hrm')
      expect(result).toContain('Advisory')
    })
  })
})
