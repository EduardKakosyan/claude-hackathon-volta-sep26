import { readFile } from 'node:fs/promises'

import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * The season migration on top of the real init migration, in PGlite: the
 * widened basis check takes 'calendar' and nothing else new, and the summary
 * view counts one row per day.
 */
const INIT = new URL('../../supabase/migrations/20260912000000_init.sql', import.meta.url)
const SEASON = new URL('../../supabase/migrations/20260914000300_season.sql', import.meta.url)

let db: PGlite
beforeAll(async () => {
  db = new PGlite()
  await db.exec(await readFile(INIT, 'utf8'))
  await db.exec(await readFile(SEASON, 'utf8'))
  await db.query(
    `insert into beaches (id, name, authority, lat, lon, water_body, region, source_url) values
       ('hrm-kinap', 'Kinap Beach', 'hrm', 44.72, -63.3, 'Porters Lake', 'Halifax', 'https://www.halifax.ca/'),
       ('hrm-kearney-lake', 'Kearney Lake Beach', 'hrm', 44.68, -63.66, 'Kearney Lake', 'Halifax', 'https://www.halifax.ca/'),
       ('ns-rissers', 'Rissers Beach', 'province', 44.23, -64.42, 'Atlantic Ocean', 'South Shore', 'https://parks.novascotia.ca/')`,
  )
})
afterAll(() => db.close())

describe('season migration', () => {
  it('accepts a calendar row and still rejects an unknown basis', async () => {
    await db.query(
      `insert into status_day (beach_id, day, state, basis, note) values ('hrm-kinap', '2026-03-01', 'offseason', 'calendar', 'Off-season by the calendar.')`,
    )
    await expect(
      db.query(`insert into status_day (beach_id, day, state, basis) values ('hrm-kinap', '2026-03-02', 'open', 'guessed')`),
    ).rejects.toThrow(/status_day_basis_check/)
  })

  it('summarises each day by state', async () => {
    await db.query(
      `insert into status_day (beach_id, day, state, basis) values
         ('hrm-kinap', '2026-08-26', 'closed', 'verified'),
         ('hrm-kearney-lake', '2026-08-26', 'closed', 'inferred'),
         ('ns-rissers', '2026-08-26', 'open', 'inferred'),
         ('hrm-kinap', '2026-08-27', 'closed', 'inferred'),
         ('hrm-kearney-lake', '2026-08-27', 'advisory', 'inferred'),
         ('ns-rissers', '2026-08-27', 'open', 'inferred')`,
    )
    const { rows } = await db.query<{ day: string; open: number; advisory: number; closed: number; offseason: number }>(
      `select day::text, open::int, advisory::int, closed::int, offseason::int from status_day_summary order by day`,
    )
    expect(rows).toEqual([
      { day: '2026-03-01', open: 0, advisory: 0, closed: 0, offseason: 1 },
      { day: '2026-08-26', open: 1, advisory: 0, closed: 2, offseason: 0 },
      { day: '2026-08-27', open: 1, advisory: 1, closed: 1, offseason: 0 },
    ])
  })
})
