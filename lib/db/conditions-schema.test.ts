import { readFile } from 'node:fs/promises'

import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

/**
 * The conditions migration applied on top of the real init migration, in
 * PGlite: the two tables exist with their keys and foreign keys, and the
 * widened source_health check accepts the two new feeds.
 */
const INIT = new URL('../../supabase/migrations/20260912000000_init.sql', import.meta.url)
const CONDITIONS = new URL('../../supabase/migrations/20260914000000_conditions.sql', import.meta.url)

let db: PGlite
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`set time zone 'UTC'`)
  await db.exec(await readFile(INIT, 'utf8'))
  await db.exec(await readFile(CONDITIONS, 'utf8'))
  await db.query(
    `insert into beaches (id, name, authority, lat, lon, water_body, region, source_url)
     values ('ns-rainbow-haven', 'Rainbow Haven Beach', 'province', 44.65006, -63.41726, 'Atlantic Ocean', 'Halifax', 'https://parks.novascotia.ca/park/rainbow-haven-beach')`,
  )
})
afterAll(() => db.close())
beforeEach(() => db.exec('truncate beach_conditions, buoy_reading, source_health'))

describe('conditions migration', () => {
  it('stores one wind row per beach, keyed by beach, with the reading\'s own time', async () => {
    await db.query(
      `insert into beach_conditions (beach_id, wind_kmh, wind_dir_deg, air_temp_c, observed_at)
       values ('ns-rainbow-haven', 25.3, 225, 18.2, '2026-09-13T19:15:00Z')`,
    )
    // Same key again is an update, not a second row.
    await db.query(
      `insert into beach_conditions (beach_id, wind_kmh, wind_dir_deg, air_temp_c, observed_at)
       values ('ns-rainbow-haven', 30, 270, null, '2026-09-13T20:15:00Z')
       on conflict (beach_id) do update set wind_kmh = excluded.wind_kmh, wind_dir_deg = excluded.wind_dir_deg,
         air_temp_c = excluded.air_temp_c, observed_at = excluded.observed_at`,
    )
    const { rows } = await db.query<{ wind_kmh: string; wind_dir_deg: number; air_temp_c: string | null; observed_at: string }>(
      'select wind_kmh, wind_dir_deg, air_temp_c, observed_at::text from beach_conditions',
    )
    expect(rows).toHaveLength(1)
    expect(Number(rows[0].wind_kmh)).toBe(30)
    expect(rows[0].wind_dir_deg).toBe(270)
    expect(rows[0].air_temp_c).toBeNull()
    expect(rows[0].observed_at).toBe('2026-09-13 20:15:00+00')
  })

  it('refuses a wind row for a beach that is not on the roster, or without wind', async () => {
    await expect(
      db.query(`insert into beach_conditions (beach_id, wind_kmh, wind_dir_deg, observed_at) values ('hrm-nowhere', 1, 0, now())`),
    ).rejects.toThrow()
    await expect(
      db.query(`insert into beach_conditions (beach_id, wind_kmh, wind_dir_deg, observed_at) values ('ns-rainbow-haven', null, 0, now())`),
    ).rejects.toThrow()
  })

  it('stores the buoy reading with a nullable water temperature, one row per buoy', async () => {
    await db.query(`insert into buoy_reading (buoy, water_temp_c, observed_at) values ('smartatlantic-halifax', null, '2026-09-13T12:23:01Z')`)
    await expect(
      db.query(`insert into buoy_reading (buoy, water_temp_c, observed_at) values ('smartatlantic-halifax', 16.1, now())`),
    ).rejects.toThrow() // primary key
    const { rows } = await db.query<{ water_temp_c: string | null }>('select water_temp_c from buoy_reading')
    expect(rows).toEqual([{ water_temp_c: null }])
  })

  it('source_health accepts wind and buoy beside the three status sources, and nothing else', async () => {
    for (const source of ['hrm', 'parks', 'algae', 'wind', 'buoy']) {
      await db.query(`insert into source_health (source, last_attempt_at) values ($1, now())`, [source])
    }
    await expect(db.query(`insert into source_health (source, last_attempt_at) values ('tide', now())`)).rejects.toThrow()
    const { rows } = await db.query<{ n: number }>('select count(*)::int as n from source_health')
    expect(rows[0].n).toBe(5)
  })

  it('applies twice without error (idempotent)', async () => {
    await expect(db.exec(await readFile(CONDITIONS, 'utf8'))).resolves.not.toThrow()
    await db.query(`insert into source_health (source, last_attempt_at) values ('wind', now())`)
  })
})
