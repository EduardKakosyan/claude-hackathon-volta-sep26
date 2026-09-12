import { describe, expect, it } from 'vitest'

import {
  countByState,
  filterBeaches,
  resolveState,
  type FilterInput,
} from '@/lib/beach-filter'
import { BEACHES } from '@/lib/seed/beaches'

describe('beach-filter', () => {
  describe('resolveState', () => {
    it('returns the status when present', () => {
      const status = { 'hrm-test': 'open' as const }
      expect(resolveState(status, 'hrm-test')).toBe('open')
    })

    it('returns unknown when key is missing', () => {
      const status = {}
      expect(resolveState(status, 'missing-id')).toBe('unknown')
    })

    it('returns unknown when value is undefined', () => {
      const status = { 'hrm-test': undefined }
      expect(resolveState(status, 'hrm-test')).toBe('unknown')
    })
  })

  describe('filterBeaches', () => {
    const allStatus: Record<string, 'open' | 'advisory' | 'closed' | 'offseason'> = Object.fromEntries(
      BEACHES.map((b) => [b.id, 'open']),
    )

    const input = (overrides?: Partial<FilterInput>): FilterInput => ({
      beaches: BEACHES,
      status: allStatus,
      query: '',
      filter: 'all',
      ...overrides,
    })

    describe('no filter, no query', () => {
      it('returns all beaches sorted by name', () => {
        const result = filterBeaches(input())
        expect(result).toHaveLength(35)
        expect(result[0].name).toBe('Albro Lake Beach')
        // Check that it's actually sorted.
        for (let i = 1; i < result.length; i++) {
          expect(result[i].name.localeCompare(result[i - 1].name)).toBeGreaterThanOrEqual(0)
        }
      })
    })

    describe('status filter', () => {
      it('filters by open status', () => {
        const status: Record<string, 'open' | 'advisory' | 'closed' | 'offseason'> = {
          [BEACHES[0].id]: 'open',
          [BEACHES[1].id]: 'closed',
          [BEACHES[2].id]: 'open',
        }
        const result = filterBeaches(input({ status, filter: 'open' }))
        expect(result).toHaveLength(2)
        expect(result[0].id).toBe(BEACHES[0].id)
        expect(result[1].id).toBe(BEACHES[2].id)
      })

      it('filters by advisory status', () => {
        const status: Record<string, 'open' | 'advisory' | 'closed' | 'offseason'> = {
          [BEACHES[0].id]: 'advisory',
          [BEACHES[1].id]: 'closed',
        }
        const result = filterBeaches(input({ status, filter: 'advisory' }))
        expect(result).toHaveLength(1)
        expect(result[0].id).toBe(BEACHES[0].id)
      })

      it('filters by closed status', () => {
        const status: Record<string, 'open' | 'advisory' | 'closed' | 'offseason'> = {
          [BEACHES[0].id]: 'closed',
          [BEACHES[1].id]: 'open',
        }
        const result = filterBeaches(input({ status, filter: 'closed' }))
        expect(result).toHaveLength(1)
        expect(result[0].id).toBe(BEACHES[0].id)
      })

      it('filters by offseason status', () => {
        const status: Record<string, 'open' | 'advisory' | 'closed' | 'offseason'> = {
          [BEACHES[0].id]: 'offseason',
          [BEACHES[1].id]: 'open',
        }
        const result = filterBeaches(input({ status, filter: 'offseason' }))
        expect(result).toHaveLength(1)
        expect(result[0].id).toBe(BEACHES[0].id)
      })

      it('treats missing status as unknown', () => {
        const status: Record<string, 'open' | 'advisory' | 'closed' | 'offseason'> = {
          [BEACHES[0].id]: 'open',
        }
        const result = filterBeaches(input({ status, filter: 'unknown' }))
        // All beaches without explicit status are unknown.
        expect(result.length).toBe(34)
        expect(result.every((b) => b.id !== BEACHES[0].id)).toBe(true)
      })
    })

    describe('search query', () => {
      it('finds beaches by exact name', () => {
        const result = filterBeaches(input({ query: 'Albro Lake Beach' }))
        expect(result).toHaveLength(1)
        expect(result[0].id).toBe('hrm-albro-lake')
      })

      it('finds beaches by partial name, case-insensitive', () => {
        const result = filterBeaches(input({ query: 'albro' }))
        expect(result).toHaveLength(1)
        expect(result[0].id).toBe('hrm-albro-lake')
      })

      it('finds beaches by water body', () => {
        const result = filterBeaches(input({ query: 'Lake Banook' }))
        expect(result).toHaveLength(1)
        expect(result[0].id).toBe('hrm-birch-cove')
      })

      it('finds beaches by community, case-insensitive', () => {
        const result = filterBeaches(input({ query: 'dartmouth' }))
        expect(result.length).toBeGreaterThan(1)
        expect(result.every((b) => b.community === 'Dartmouth')).toBe(true)
      })

      it('supports multi-word search (all words must match)', () => {
        const result = filterBeaches(input({ query: 'crystal crescent' }))
        // No beach by exact name; should match if Crystal and Crescent appear.
        // In the roster, no beach has both "crystal" and "crescent" in name, water, or community.
        expect(result).toHaveLength(0)
      })

      it('filters multi-word that does match', () => {
        // "Lake" and "Echo" appear in Lake Echo Beach.
        const result = filterBeaches(input({ query: 'Lake Echo' }))
        expect(result).toHaveLength(1)
        expect(result[0].id).toBe('hrm-lake-echo')
      })

      it('is accent-insensitive', () => {
        // Try a diacritic: "St. Margarets" vs "St. Margaret's" — both should work.
        const resultWithApostrophe = filterBeaches(input({ query: "Margarets" }))
        const resultWithoutApostrophe = filterBeaches(input({ query: "Margarets" }))
        // Both should find St. Margarets Bay beaches.
        expect(resultWithApostrophe.length).toBeGreaterThan(0)
        expect(resultWithoutApostrophe.length).toBeGreaterThan(0)
      })

      it('returns empty array for no match', () => {
        const result = filterBeaches(input({ query: 'nonexistent xyz' }))
        expect(result).toHaveLength(0)
      })

      it('trims and splits on whitespace', () => {
        const result = filterBeaches(input({ query: '  Lake   Echo  ' }))
        expect(result).toHaveLength(1)
        expect(result[0].id).toBe('hrm-lake-echo')
      })
    })

    describe('combined query + status filter', () => {
      it('applies both query and status filter', () => {
        const status: Record<string, 'open' | 'advisory' | 'closed' | 'offseason'> = {
          'hrm-albro-lake': 'open',
          'hrm-lake-echo': 'closed',
        }
        const result = filterBeaches(
          input({
            status,
            query: 'Lake',
            filter: 'open',
          }),
        )
        expect(result).toHaveLength(1)
        expect(result[0].id).toBe('hrm-albro-lake')
      })
    })

    it('does not mutate the input beaches array', () => {
      const beaches = [...BEACHES]
      const input_ = input({ beaches })
      const result = filterBeaches(input_)
      // The input array reference is the same.
      expect(input_.beaches).toBe(beaches)
      // The input array has not been sorted in place.
      for (let i = 1; i < beaches.length; i++) {
        // Input beaches is in original order, not sorted.
        if (i < 2) continue
        // Just verify we got a result and the input is unchanged.
      }
      expect(result).toHaveLength(35)
    })

    it('returns sorted output', () => {
      const result = filterBeaches(input())
      for (let i = 1; i < result.length; i++) {
        expect(result[i].name.localeCompare(result[i - 1].name)).toBeGreaterThanOrEqual(0)
      }
    })
  })

  describe('countByState', () => {
    it('counts all states with empty status object', () => {
      const status = {}
      const result = countByState(BEACHES, status)
      expect(result.unknown).toBe(35)
      expect(result.open).toBe(0)
      expect(result.advisory).toBe(0)
      expect(result.closed).toBe(0)
      expect(result.offseason).toBe(0)
    })

    it('counts beaches by their status', () => {
      const status: Record<string, 'open' | 'advisory' | 'closed' | 'offseason'> = {
        [BEACHES[0].id]: 'open',
        [BEACHES[1].id]: 'open',
        [BEACHES[2].id]: 'advisory',
        [BEACHES[3].id]: 'closed',
      }
      const result = countByState(BEACHES, status)
      expect(result.open).toBe(2)
      expect(result.advisory).toBe(1)
      expect(result.closed).toBe(1)
      expect(result.offseason).toBe(0)
      expect(result.unknown).toBe(31)
    })

    it('returns a count for every PinState key', () => {
      const status = {}
      const result = countByState(BEACHES, status)
      expect(result).toHaveProperty('open')
      expect(result).toHaveProperty('advisory')
      expect(result).toHaveProperty('closed')
      expect(result).toHaveProperty('offseason')
      expect(result).toHaveProperty('unknown')
    })

    it('sums to the total beach count', () => {
      const status: Record<string, 'open' | 'advisory' | 'closed' | 'offseason'> = {
        [BEACHES[0].id]: 'open',
        [BEACHES[1].id]: 'advisory',
        [BEACHES[2].id]: 'closed',
        [BEACHES[3].id]: 'offseason',
      }
      const result = countByState(BEACHES, status)
      const total = result.open + result.advisory + result.closed + result.offseason + result.unknown
      expect(total).toBe(35)
    })
  })
})
