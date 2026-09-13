import { FIXTURE_HEALTH, FIXTURE_TODAY } from '@/lib/fixture/today'
import { SEED_DAYS } from '@/lib/seed/days'
import type { LiveStatus, SourceHealthView, StatusDayView } from '@/lib/status'

import { seedDayRows, type PageStore } from './store'

/**
 * The no-credentials store. Live status and health come from the hand-written
 * fixture day in lib/fixture/today.ts; replay comes from the seeded days in git.
 * Read-only: there is nothing to write to, so the refresh route answers 503.
 */
export class FixtureStore implements PageStore {
  readonly kind = 'fixture' as const

  async liveStatus(): Promise<LiveStatus[]> {
    return [...FIXTURE_TODAY]
  }

  async dayStatus(day: string): Promise<StatusDayView[]> {
    return seedDayRows(day)
  }

  async history(fromDay: string, toDay: string): Promise<StatusDayView[]> {
    return Object.keys(SEED_DAYS)
      .filter((d) => d >= fromDay && d <= toDay)
      .flatMap((d) => seedDayRows(d))
  }

  async health(): Promise<SourceHealthView[]> {
    return [...FIXTURE_HEALTH]
  }

  async days(): Promise<string[]> {
    return Object.keys(SEED_DAYS).sort().reverse()
  }
}
