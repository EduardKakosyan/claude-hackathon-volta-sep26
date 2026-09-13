import type { BuoyReading, ConditionsRow } from '@/lib/conditions'
import {
  FIXTURE_HEALTH,
  FIXTURE_OFFSEASON,
  FIXTURE_OFFSEASON_HEALTH,
  FIXTURE_TODAY,
  fixtureBuoy,
  fixtureConditions,
} from '@/lib/fixture/today'
import { SEED_DAYS } from '@/lib/seed/days'
import type { DaySummary, LiveStatus, SourceHealthView, StatusDayView } from '@/lib/status'

import { seedDayRows, summarizeDays, type FixtureVariant, type PageStore } from './store'

/**
 * The no-credentials store. Live status and health come from the hand-written
 * fixture day in lib/fixture/today.ts; replay comes from the seeded days in git.
 * Conditions are the fixture's wind and buoy figures stamped at the clock, so
 * the page's staleness rule keeps them and the line reads as today's.
 * `?fixture=offseason` swaps in the off-season day through `fixtureVariant`.
 * Read-only: there is nothing to write to, so the refresh route answers 503.
 */
export class FixtureStore implements PageStore {
  readonly kind = 'fixture' as const

  constructor(
    private readonly clock: () => Date = () => new Date(),
    private readonly variant: FixtureVariant | null = null,
  ) {}

  fixtureVariant(variant: FixtureVariant): FixtureStore {
    return new FixtureStore(this.clock, variant)
  }

  async liveStatus(): Promise<LiveStatus[]> {
    return this.variant === 'offseason' ? [...FIXTURE_OFFSEASON] : [...FIXTURE_TODAY]
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
    return this.variant === 'offseason' ? [...FIXTURE_OFFSEASON_HEALTH] : [...FIXTURE_HEALTH]
  }

  async days(): Promise<DaySummary[]> {
    return summarizeDays(Object.keys(SEED_DAYS).flatMap((d) => seedDayRows(d)))
  }

  async conditions(): Promise<ConditionsRow[]> {
    return fixtureConditions(this.clock())
  }

  async buoy(): Promise<BuoyReading | null> {
    return fixtureBuoy(this.clock())
  }
}
