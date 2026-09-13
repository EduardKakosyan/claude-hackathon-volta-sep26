import { readFile } from 'node:fs/promises'

import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

/**
 * The push migration applied on top of the real init migration, in PGlite:
 * a subscription is one row per endpoint, a follow is one row per
 * (endpoint, beach), and dropping the subscription takes its follows with it.
 */
const INIT = new URL('../../supabase/migrations/20260912000000_init.sql', import.meta.url)
const PUSH = new URL('../../supabase/migrations/20260914000100_push.sql', import.meta.url)

const ENDPOINT = 'https://push.example.org/send/abc'
const OTHER = 'https://push.example.org/send/def'

let db: PGlite
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`set time zone 'UTC'`)
  await db.exec(await readFile(INIT, 'utf8'))
  await db.exec(await readFile(PUSH, 'utf8'))
  await db.query(
    `insert into beaches (id, name, authority, lat, lon, water_body, region, source_url) values
     ('hrm-chocolate-lake', 'Chocolate Lake Beach', 'hrm', 44.63, -63.61, 'Chocolate Lake', 'Halifax', 'https://www.halifax.ca/x'),
     ('ns-rissers', 'Rissers Beach', 'province', 44.23, -64.44, 'Atlantic Ocean', 'South Shore', 'https://parks.novascotia.ca/park/rissers-beach')`,
  )
})
afterAll(() => db.close())
beforeEach(() => db.exec('truncate push_subscription, follow'))

const count = async (table: string, where = 'true') =>
  (await db.query<{ n: number }>(`select count(*)::int as n from ${table} where ${where}`)).rows[0].n

describe('push migration', () => {
  it('stores one subscription per endpoint, stamped when it arrived', async () => {
    await db.query(`insert into push_subscription (endpoint, p256dh, auth) values ($1, 'p', 'a')`, [ENDPOINT])
    await expect(
      db.query(`insert into push_subscription (endpoint, p256dh, auth) values ($1, 'p2', 'a2')`, [ENDPOINT]),
    ).rejects.toThrow()
    const { rows } = await db.query<{ created_at: string }>('select created_at from push_subscription')
    expect(rows).toHaveLength(1)
    expect(new Date(rows[0].created_at).getTime()).not.toBeNaN()
  })

  it('a subscription needs both keys', async () => {
    await expect(db.query(`insert into push_subscription (endpoint, p256dh, auth) values ($1, null, 'a')`, [ENDPOINT])).rejects.toThrow()
    await expect(db.query(`insert into push_subscription (endpoint, p256dh) values ($1, 'p')`, [ENDPOINT])).rejects.toThrow()
  })

  it('a follow is one row per (endpoint, beach): the same pair twice is rejected, two beaches are two rows', async () => {
    await db.query(`insert into push_subscription (endpoint, p256dh, auth) values ($1, 'p', 'a')`, [ENDPOINT])
    await db.query(`insert into follow (endpoint, beach_id) values ($1, 'hrm-chocolate-lake')`, [ENDPOINT])
    await expect(db.query(`insert into follow (endpoint, beach_id) values ($1, 'hrm-chocolate-lake')`, [ENDPOINT])).rejects.toThrow()
    await db.query(`insert into follow (endpoint, beach_id) values ($1, 'ns-rissers')`, [ENDPOINT])
    expect(await count('follow')).toBe(2)
  })

  it('a follow must point at a stored subscription and a roster beach', async () => {
    await expect(db.query(`insert into follow (endpoint, beach_id) values ($1, 'hrm-chocolate-lake')`, [OTHER])).rejects.toThrow()
    await db.query(`insert into push_subscription (endpoint, p256dh, auth) values ($1, 'p', 'a')`, [ENDPOINT])
    await expect(db.query(`insert into follow (endpoint, beach_id) values ($1, 'hrm-nowhere')`, [ENDPOINT])).rejects.toThrow()
  })

  it('deleting the subscription cascades to its follows and leaves other subscriptions alone', async () => {
    for (const endpoint of [ENDPOINT, OTHER]) {
      await db.query(`insert into push_subscription (endpoint, p256dh, auth) values ($1, 'p', 'a')`, [endpoint])
      await db.query(`insert into follow (endpoint, beach_id) values ($1, 'hrm-chocolate-lake'), ($1, 'ns-rissers')`, [endpoint])
    }
    expect(await count('follow')).toBe(4)

    await db.query(`delete from push_subscription where endpoint = $1`, [ENDPOINT])
    expect(await count('push_subscription')).toBe(1)
    expect(await count('follow')).toBe(2)
    expect(await count('follow', `endpoint = '${OTHER}'`)).toBe(2)
  })

  it('applies twice without error (idempotent)', async () => {
    await expect(db.exec(await readFile(PUSH, 'utf8'))).resolves.not.toThrow()
    await db.query(`insert into push_subscription (endpoint, p256dh, auth) values ($1, 'p', 'a')`, [ENDPOINT])
  })
})
