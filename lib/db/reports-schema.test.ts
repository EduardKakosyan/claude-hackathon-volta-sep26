import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { selectFlags } from '@/lib/reports/flags'

const MIGRATION = new URL('../../supabase/migrations/20260913000000_reports.sql', import.meta.url)
const BASE = new URL('./testing/base-schema.sql', import.meta.url)

let db: PGlite
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`set time zone 'UTC'`) // the hosted server runs UTC; the bug in contradiction #1 only shows here
  await db.exec(`create role anon nologin; create role authenticated nologin;`) // exercise the guarded revokes
  await db.exec(await readFile(BASE, 'utf8'))
  await db.exec(await readFile(MIGRATION, 'utf8'))
})
afterAll(() => db.close())
beforeEach(() => db.exec('truncate public.reports restart identity'))

const flags = async () =>
  (await db.query<{ beach_id: string; sign: string; people: number; last_at: string }>('select * from report_flags')).rows
const insert = (beach: string, sign: string, hash: string) =>
  db.query('insert into reports (beach_id, sign, ip_hash) values ($1, $2, $3)', [beach, sign, hash.padEnd(64, '0')])

describe('reports migration', () => {
  it('has America/Halifax tz data and truncates to Halifax midnight in a UTC session', async () => {
    const { rows } = await db.query<{ s: string }>(
      `select halifax_day_start(timestamptz '2026-08-14 03:29:00+00')::text as s`,
    )
    expect(rows[0].s).toBe('2026-08-14 03:00:00+00') // ADT is UTC-3 → local midnight is 03:00Z
  })
  it('shows no flag for one person, a flag for two distinct hashes, and ignores the same hash twice', async () => {
    await insert('hrm-kinap', 'closed', 'a')
    expect(await flags()).toHaveLength(0)
    await insert('hrm-kinap', 'closed', 'b')
    expect(await flags()).toMatchObject([{ beach_id: 'hrm-kinap', sign: 'closed', people: 2 }])
    await insert('hrm-kinap', 'closed', 'a')
    expect((await flags())[0].people).toBe(2)
  })
  it('does not merge different signs', async () => {
    await insert('hrm-kinap', 'closed', 'a')
    await insert('hrm-kinap', 'clear', 'b')
    expect(await flags()).toHaveLength(0)
  })
  it('expires yesterday', async () => {
    await insert('hrm-kinap', 'closed', 'a')
    await insert('hrm-kinap', 'closed', 'b')
    await db.query(`update reports set created_at = halifax_day_start(now()) - interval '1 second' where ip_hash like 'b%'`)
    expect(await flags()).toHaveLength(0)
  })
  it('selectFlags picks one row per beach from the view shape', async () => {
    await insert('hrm-kinap', 'closed', 'a')
    await insert('hrm-kinap', 'closed', 'b')
    await insert('hrm-kinap', 'clear', 'c')
    await insert('hrm-kinap', 'clear', 'd')
    const picked = selectFlags(await flags())
    expect(picked['hrm-kinap'].sign).toBe('closed')
  })
  it('submit_report inserts, throttles the same hash inside the window, and counts people', async () => {
    const call = (hash: string, win = 3600) =>
      db.query<{ outcome: string; id: number | null; people: number }>(
        'select * from submit_report($1, $2, $3, $4)',
        ['hrm-kinap', 'closed', hash.padEnd(64, '0'), win],
      )
    expect((await call('a')).rows[0]).toMatchObject({ outcome: 'inserted', people: 1 })
    expect((await call('a')).rows[0]).toMatchObject({ outcome: 'throttled' })
    expect((await call('b')).rows[0]).toMatchObject({ outcome: 'inserted', people: 2 })
    await db.query(`update reports set created_at = now() - interval '3601 seconds' where ip_hash like 'a%'`)
    expect((await call('a')).rows[0]).toMatchObject({ outcome: 'inserted', people: 2 })
  })
  it('throttles per beach, not globally', async () => {
    await db.query('select * from submit_report($1,$2,$3)', ['hrm-kinap', 'closed', 'a'.padEnd(64, '0')])
    const { rows } = await db.query<{ outcome: string }>('select * from submit_report($1,$2,$3)', [
      'hrm-birch-cove',
      'closed',
      'a'.padEnd(64, '0'),
    ])
    expect(rows[0].outcome).toBe('inserted')
  })
  it('rejects bad rows at the schema', async () => {
    await expect(insert('hrm-kinap', 'open', 'a')).rejects.toThrow() // official words are not signs
    await expect(insert('hrm-nowhere', 'closed', 'a')).rejects.toThrow() // FK to beaches
    await expect(
      db.query(`insert into reports (beach_id, sign, ip_hash) values ('hrm-kinap','closed','not-a-hash')`),
    ).rejects.toThrow()
    await expect(
      db.query(`insert into reports (beach_id, sign, ip_hash, photo_path) values ('hrm-kinap','closed',$1,'other/1.jpg')`, [
        'a'.padEnd(64, '0'),
      ]),
    ).rejects.toThrow()
  })
  it('locks the table to the service role', async () => {
    const { rows } = await db.query<{ rls: boolean }>(`select relrowsecurity as rls from pg_class where relname = 'reports'`)
    expect(rows[0].rls).toBe(true)
    const priv = await db.query<{ ok: boolean }>(`select has_table_privilege('anon', 'public.reports', 'SELECT') as ok`)
    expect(priv.rows[0].ok).toBe(false)
    const fn = await db.query<{ ok: boolean }>(
      `select has_function_privilege('anon', 'public.submit_report(text,text,text,integer)', 'EXECUTE') as ok`,
    )
    expect(fn.rows[0].ok).toBe(false)
  })
  it('applies twice without error (idempotent)', async () => {
    await expect(db.exec(await readFile(MIGRATION, 'utf8'))).resolves.not.toThrow()
  })
})
