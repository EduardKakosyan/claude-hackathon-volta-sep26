import type { BuoyReading, ConditionsRow } from '@/lib/conditions'
import { FIXTURE_HEALTH, FIXTURE_TODAY, fixtureBuoy, fixtureConditions } from '@/lib/fixture/today'
import { SEED_DAYS } from '@/lib/seed/days'
import type { LiveStatus, SourceHealthView, StatusDayView } from '@/lib/status'

import { seedDayRows, type PageStore } from './store'

/**
 * The no-credentials store. Live status and health come from the hand-written
 * fixture day in lib/fixture/today.ts; replay comes from the seeded days in git.
 * Conditions are the fixture's wind and buoy figures stamped at the clock, so
 * the page's staleness rule keeps them and the line reads as today's.
 * Read-only: there is nothing to write to, so the refresh route answers 503.
 */
export class FixtureStore implements PageStore {
  readonly kind = 'fixture' as const

  constructor(private readonly clock: () => Date = () => new Date()) {}

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

  async conditions(): Promise<ConditionsRow[]> {
    return fixtureConditions(this.clock())
  }

  async buoy(): Promise<BuoyReading | null> {
    return fixtureBuoy(this.clock())
  }
}
