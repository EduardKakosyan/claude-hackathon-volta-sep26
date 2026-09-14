import { DAYS_2026, type SeedDay } from './2026'

export type { SeedBasis, SeedDay, SeedDayRow } from './2026'
export { SEED_FROM, SEED_TO } from './2026'

/** Every seeded replay day, keyed by Halifax calendar date. */
export const SEED_DAYS: Record<string, SeedDay> = DAYS_2026
