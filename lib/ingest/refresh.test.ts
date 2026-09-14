import { describe, expect, it, vi } from 'vitest'

import { MemoryStore } from '@/lib/db/store'
import { BEACHES } from '@/lib/seed/beaches'
import { SEED_DAYS } from '@/lib/seed/days'

import { SEED_CHUNK, seedRefresh } from './refresh'

const DAY_COUNT = Object.keys(SEED_DAYS).length

describe('seedRefresh', () => {
  it('writes the roster and every seeded day, in chunks', async () => {
    const store = new MemoryStore()
    const upserts = vi.spyOn(store, 'upsertStatusDays')
    const result = await seedRefresh(store)
    expect(result).toEqual({
      seeded: { beaches: BEACHES.length, days: DAY_COUNT, rows: DAY_COUNT * BEACHES.length },
    })
    expect(store.daysByKey.size).toBe(DAY_COUNT * BEACHES.length)
    expect(upserts).toHaveBeenCalledTimes(Math.ceil((DAY_COUNT * BEACHES.length) / SEED_CHUNK))
    for (const call of upserts.mock.calls) expect(call[0].length).toBeLessThanOrEqual(SEED_CHUNK)
  })

  it('seeds the days once per writer and the roster every time', async () => {
    const store = new MemoryStore()
    await seedRefresh(store)
    const upserts = vi.spyOn(store, 'upsertStatusDays')
    const beaches = vi.spyOn(store, 'upsertBeaches')
    const again = await seedRefresh(store)
    expect(again.seeded).toEqual({ beaches: BEACHES.length, days: DAY_COUNT, rows: 0 })
    expect(upserts).not.toHaveBeenCalled()
    expect(beaches).toHaveBeenCalledTimes(1)

    const other = new MemoryStore()
    expect((await seedRefresh(other)).seeded.rows).toBe(DAY_COUNT * BEACHES.length)
  })
})
