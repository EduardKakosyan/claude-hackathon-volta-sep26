import type { BuoyReading, ConditionsRow } from '@/lib/conditions'
import type { Beach } from '@/lib/seed/beaches'
import { SEED_DAYS } from '@/lib/seed/days'
import type { LiveStatus, SourceHealthView, StatusDayView } from '@/lib/status'

/**
 * The fixture days a test may ask for by name with `?fixture=`. Only the
 * fixture store knows them; every other store ignores the flag.
 */
export type FixtureVariant = 'offseason'

export function isFixtureVariant(value: unknown): value is FixtureVariant {
  return value === 'offseason'
}

/**
 * The read port the page depends on. `FixtureStore` (fixture-store.ts) serves it
 * from a hand-written day plus the seeded replay days in git, with no credentials
 * at all; `SupabaseStore` (supabase-store.ts) serves it from the tables. The page
 * cannot tell which it got except through `kind`, which the footer reports.
 */
export interface PageStore {
  readonly kind: 'fixture' | 'supabase'
  /**
   * Fixture mode only: the same store serving another hand-written day, so the
   * rig can reach the off-season screens in any month. Absent on a real store,
   * which is how `?fixture=` is ignored with a database.
   */
  fixtureVariant?(variant: FixtureVariant): PageStore
  liveStatus(): Promise<LiveStatus[]>
  dayStatus(day: string): Promise<StatusDayView[]>
  /** Every status_day row with fromDay <= day <= toDay, any beach. */
  history(fromDay: string, toDay: string): Promise<StatusDayView[]>
  health(): Promise<SourceHealthView[]>
  /** Distinct replayable days, newest first. */
  days(): Promise<string[]>
  /** The last wind reading per beach, whatever its age; `loadPage` decides staleness. */
  conditions(): Promise<ConditionsRow[]>
  /** The Halifax buoy's last reading, or null when none was ever written. */
  buoy(): Promise<BuoyReading | null>
}

/**
 * The write port the refresh route depends on: the seed, the live status
 * ingest, and the conditions ingest all go through it.
 */
export interface StatusWriter {
  upsertBeaches(beaches: Beach[]): Promise<number>
  upsertStatusDays(rows: StatusDayView[]): Promise<number>
  upsertLiveStatus(rows: LiveStatus[]): Promise<number>
  upsertSourceHealth(rows: SourceHealthView[]): Promise<number>
  upsertConditions(rows: ConditionsRow[]): Promise<number>
  upsertBuoy(reading: BuoyReading): Promise<void>
}

export function seedDayRows(day: string): StatusDayView[] {
  const rows = SEED_DAYS[day]
  if (!rows) return []
  return Object.entries(rows).map(([beachId, r]) => ({
    beachId,
    day,
    state: r.state,
    basis: r.basis,
    note: r.note,
  }))
}

/** In-memory store for tests: a PageStore and a StatusWriter over plain maps. */
export class MemoryStore implements PageStore, StatusWriter {
  readonly kind = 'supabase' as const
  beaches = new Map<string, Beach>()
  live = new Map<string, LiveStatus>()
  daysByKey = new Map<string, StatusDayView>()
  healthBySource = new Map<string, SourceHealthView>()
  conditionsByBeach = new Map<string, ConditionsRow>()
  buoyReading: BuoyReading | null = null

  async liveStatus() {
    return [...this.live.values()]
  }
  async dayStatus(day: string) {
    return [...this.daysByKey.values()].filter((r) => r.day === day)
  }
  async history(fromDay: string, toDay: string) {
    return [...this.daysByKey.values()].filter((r) => r.day >= fromDay && r.day <= toDay)
  }
  async health() {
    return [...this.healthBySource.values()]
  }
  async days() {
    return [...new Set([...this.daysByKey.values()].map((r) => r.day))].sort().reverse()
  }
  async conditions() {
    return [...this.conditionsByBeach.values()]
  }
  async buoy() {
    return this.buoyReading
  }
  async upsertBeaches(beaches: Beach[]) {
    for (const b of beaches) this.beaches.set(b.id, b)
    return beaches.length
  }
  async upsertStatusDays(rows: StatusDayView[]) {
    for (const r of rows) this.daysByKey.set(`${r.beachId}|${r.day}`, r)
    return rows.length
  }
  async upsertLiveStatus(rows: LiveStatus[]) {
    for (const r of rows) this.live.set(r.beachId, r)
    return rows.length
  }
  async upsertSourceHealth(rows: SourceHealthView[]) {
    for (const r of rows) this.healthBySource.set(r.source, r)
    return rows.length
  }
  async upsertConditions(rows: ConditionsRow[]) {
    for (const r of rows) this.conditionsByBeach.set(r.beachId, r)
    return rows.length
  }
  async upsertBuoy(reading: BuoyReading) {
    this.buoyReading = reading
  }
}
