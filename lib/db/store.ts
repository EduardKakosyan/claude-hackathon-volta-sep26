import type { Beach } from '@/lib/seed/beaches'
import { SEED_DAYS } from '@/lib/seed/days'
import type { LiveStatus, SourceHealthView, StatusDayView } from '@/lib/status'

/**
 * The read port the page depends on. `SeedStore` serves it from the files in
 * git with no credentials at all; `SupabaseStore` (supabase-store.ts) serves it
 * from the tables. The page cannot tell which it got except through `kind`.
 */
export interface PageStore {
  readonly kind: 'seed' | 'supabase'
  liveStatus(): Promise<LiveStatus[]>
  dayStatus(day: string): Promise<StatusDayView[]>
  /** Every status_day row with fromDay <= day <= toDay, any beach. */
  history(fromDay: string, toDay: string): Promise<StatusDayView[]>
  health(): Promise<SourceHealthView[]>
  /** Distinct replayable days, newest first. */
  days(): Promise<string[]>
}

/**
 * The write port the refresh route depends on. Phase 2 only seeds through it;
 * the live ingest will call `upsertLiveStatus` and `upsertSourceHealth`.
 */
export interface StatusWriter {
  upsertBeaches(beaches: Beach[]): Promise<number>
  upsertStatusDays(rows: StatusDayView[]): Promise<number>
  upsertLiveStatus(rows: LiveStatus[]): Promise<number>
  upsertSourceHealth(rows: SourceHealthView[]): Promise<number>
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

/** Reads only what is in git. No live status, no health: the footer says so. */
export class SeedStore implements PageStore {
  readonly kind = 'seed' as const

  async liveStatus(): Promise<LiveStatus[]> {
    return []
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
    return []
  }

  async days(): Promise<string[]> {
    return Object.keys(SEED_DAYS).sort().reverse()
  }
}

/** In-memory store for tests: a PageStore and a StatusWriter over plain maps. */
export class MemoryStore implements PageStore, StatusWriter {
  readonly kind = 'supabase' as const
  beaches = new Map<string, Beach>()
  live = new Map<string, LiveStatus>()
  daysByKey = new Map<string, StatusDayView>()
  healthBySource = new Map<string, SourceHealthView>()

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
}
