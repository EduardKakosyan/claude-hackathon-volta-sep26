import { BEACHES } from '@/lib/seed/beaches'
import { SEED_DAYS } from '@/lib/seed/days'
import { seedDayRows, type StatusWriter } from '@/lib/db/store'

export interface SeedResult {
  seeded: { beaches: number; days: number; rows: number }
}

/** Rows per upsert: the whole seed is close to nine thousand rows, more than one request should carry. */
export const SEED_CHUNK = 1000

/** Writers this process has already seeded: the seed is static, so once per instance is enough. */
const seeded = new WeakSet<StatusWriter>()

/**
 * Seed-only refresh: the roster and the replay days go into the tables so a
 * seeded day and a scraped day are indistinguishable to the page. Natural keys
 * make re-running a no-op, and git wins: a seeded day edited here overwrites
 * the table's copy on the next seed. The replay days cover every day of the
 * year up to the day before the refresh started writing its own, so they are
 * written once per server instance rather than every hour; the roster is
 * cheap and goes in every time. The live ingest plugs in after this step.
 */
export async function seedRefresh(writer: StatusWriter): Promise<SeedResult> {
  const beaches = await writer.upsertBeaches(BEACHES)
  const days = Object.keys(SEED_DAYS)
  if (seeded.has(writer)) return { seeded: { beaches, days: days.length, rows: 0 } }
  const all = days.flatMap((day) => seedDayRows(day))
  let rows = 0
  for (let i = 0; i < all.length; i += SEED_CHUNK) {
    rows += await writer.upsertStatusDays(all.slice(i, i + SEED_CHUNK))
  }
  seeded.add(writer)
  return { seeded: { beaches, days: days.length, rows } }
}
