import { BEACHES } from '@/lib/seed/beaches'
import { SEED_DAYS } from '@/lib/seed/days'
import { seedDayRows, type StatusWriter } from '@/lib/db/store'

export interface SeedResult {
  seeded: { beaches: number; days: number; rows: number }
}

/**
 * Seed-only refresh: the roster and the replay days go into the tables so a
 * seeded day and a scraped day are indistinguishable to the page. Natural keys
 * make re-running a no-op. The live ingest plugs in after this step.
 */
export async function seedRefresh(writer: StatusWriter): Promise<SeedResult> {
  const beaches = await writer.upsertBeaches(BEACHES)
  const days = Object.keys(SEED_DAYS)
  let rows = 0
  for (const day of days) {
    rows += await writer.upsertStatusDays(seedDayRows(day))
  }
  return { seeded: { beaches, days: days.length, rows } }
}
