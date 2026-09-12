import { describe, expect, it } from 'vitest'
import { resolveReportsConfig } from './config'
import { createReportService } from './service'
import {
  createFakeVerifier,
  createMemoryPhotoStorage,
  createMemoryReportStore,
  ENABLED_TEST_ENV,
  PRODUCTION_TEST_KEY_ENV,
} from './testing/fakes'
import { PHOTO_FIXTURES } from './testing/photos'
import type { SubmitReportInput } from './types'

const roster = new Set(['hrm-kinap', 'hrm-birch-cove', 'ns-rainbow-haven'])
const base: SubmitReportInput = {
  beachId: 'hrm-kinap',
  sign: 'closed',
  turnstileToken: 'tok',
  clientIp: '203.0.113.9',
  photo: null,
}

function harness(over: Partial<Parameters<typeof createReportService>[0]> = {}) {
  const store = createMemoryReportStore()
  const storage = createMemoryPhotoStorage()
  const verifier = createFakeVerifier({ success: true })
  const events: unknown[] = []
  const service = createReportService({
    config: resolveReportsConfig(ENABLED_TEST_ENV),
    verifier,
    store,
    storage,
    roster,
    log: (e) => events.push(e),
    ...over,
  })
  return { service, store, storage, verifier, events }
}

describe('report service', () => {
  it('rejects everything when disabled, before touching any port', async () => {
    const h = harness({ config: resolveReportsConfig(PRODUCTION_TEST_KEY_ENV) })
    expect(await h.service.submit(base)).toEqual({ ok: false, reason: 'disabled' })
    expect(h.verifier.calls).toHaveLength(0)
    expect(h.store.rows).toHaveLength(0)
  })

  it('rejects a missing client IP and never calls Turnstile', async () => {
    const h = harness()
    expect(await h.service.submit({ ...base, clientIp: null })).toEqual({ ok: false, reason: 'no-ip' })
    expect(h.verifier.calls).toHaveLength(0)
  })

  it('rejects an unknown beach and a non-report sign as invalid', async () => {
    const h = harness()
    expect(await h.service.submit({ ...base, beachId: 'hrm-nowhere' })).toEqual({ ok: false, reason: 'invalid' })
    expect(await h.service.submit({ ...base, sign: 'open' as never })).toEqual({ ok: false, reason: 'invalid' })
  })

  it('rejects a bad photo before spending the token', async () => {
    const h = harness()
    const r = await h.service.submit({
      ...base,
      photo: { bytes: PHOTO_FIXTURES.textAsJpeg, declaredType: 'image/jpeg' },
    })
    expect(r).toEqual({ ok: false, reason: 'invalid' })
    expect(h.verifier.calls).toHaveLength(0)
  })

  it('rejects when Turnstile says no and writes nothing', async () => {
    const h = harness({ verifier: createFakeVerifier({ success: false, errorCodes: ['invalid-input-response'] }) })
    expect(await h.service.submit(base)).toEqual({ ok: false, reason: 'bot' })
    expect(h.store.rows).toHaveLength(0)
  })

  it('stores a hash, never the IP, and passes the IP to Turnstile only', async () => {
    const h = harness()
    await h.service.submit(base)
    expect(h.store.rows[0].ipHash).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(h.store.rows)).not.toContain('203.0.113.9')
    expect(h.verifier.calls[0].remoteIp).toBe('203.0.113.9')
  })

  it('does not flag on one person, flags on the second distinct address, not on the first address twice at another beach-day', async () => {
    const h = harness()
    expect(await h.service.submit(base)).toMatchObject({ ok: true, people: 1, flagged: false })
    expect(await h.service.submit({ ...base, clientIp: '198.51.100.7' })).toMatchObject({
      ok: true,
      people: 2,
      flagged: true,
    })
    expect(h.store.flagsToday()).toEqual([expect.objectContaining({ beach_id: 'hrm-kinap', sign: 'closed', people: 2 })])
  })

  it('throttles the same address at the same beach inside the window and never uploads', async () => {
    const h = harness()
    await h.service.submit(base)
    const r = await h.service.submit({ ...base, photo: { bytes: PHOTO_FIXTURES.jpeg, declaredType: 'image/jpeg' } })
    expect(r).toEqual({ ok: false, reason: 'throttled' })
    expect(h.storage.objects.size).toBe(0)
  })

  it('lets the same address report a different beach', async () => {
    const h = harness()
    await h.service.submit(base)
    expect(await h.service.submit({ ...base, beachId: 'hrm-birch-cove' })).toMatchObject({ ok: true })
  })

  it('uploads a valid photo to <beachId>/<id>.<ext> and attaches it', async () => {
    const h = harness()
    const r = await h.service.submit({ ...base, photo: { bytes: PHOTO_FIXTURES.png, declaredType: 'image/png' } })
    expect(r).toMatchObject({ ok: true })
    const row = h.store.rows[0]
    expect(row.photoPath).toBe(`hrm-kinap/${row.id}.png`)
    expect(h.storage.objects.has(row.photoPath!)).toBe(true)
  })

  it('keeps the report when the upload fails and logs the detached photo', async () => {
    const h = harness()
    h.storage.failNextUpload = new Error('bucket down')
    const r = await h.service.submit({ ...base, photo: { bytes: PHOTO_FIXTURES.jpeg, declaredType: 'image/jpeg' } })
    expect(r).toMatchObject({ ok: true })
    expect(h.store.rows[0].photoPath).toBeNull()
    expect(h.events).toContainEqual(expect.objectContaining({ kind: 'photo-detached' }))
  })

  it('removes the uploaded object when attaching the path fails (no orphan)', async () => {
    const h = harness()
    h.store.failNextAttach = new Error('db blip')
    await h.service.submit({ ...base, photo: { bytes: PHOTO_FIXTURES.webp, declaredType: 'image/webp' } })
    expect(h.storage.objects.size).toBe(0)
    expect(h.storage.removed).toHaveLength(1)
  })

  it('answers error, not ok, when the store throws', async () => {
    const h = harness()
    h.store.failNextInsert = new Error('connection reset')
    expect(await h.service.submit(base)).toEqual({ ok: false, reason: 'error' })
  })
})
