import { describe, expect, it } from 'vitest'
import { resolveReportsConfig, publicReportsConfig } from './config'
import { ENABLED_TEST_ENV, PRODUCTION_TEST_KEY_ENV, PRODUCTION_REAL_ENV } from './testing/fakes'

describe('resolveReportsConfig', () => {
  it('is enabled with test keys outside production', () => {
    const c = resolveReportsConfig(ENABLED_TEST_ENV)
    expect(c.enabled).toBe(true)
    if (c.enabled) expect(c.usingTestKeys).toBe(true)
  })
  it('refuses the Cloudflare test keys in production', () => {
    expect(resolveReportsConfig(PRODUCTION_TEST_KEY_ENV)).toMatchObject({ enabled: false, reason: 'test-keys-in-production' })
  })
  it('treats NODE_ENV=production without VERCEL_ENV as production', () => {
    expect(resolveReportsConfig({ ...PRODUCTION_TEST_KEY_ENV, VERCEL_ENV: undefined, NODE_ENV: 'production' }))
      .toMatchObject({ enabled: false, reason: 'test-keys-in-production' })
  })
  it('is disabled when the flag is off, or any secret is missing or weak', () => {
    expect(resolveReportsConfig({ ...ENABLED_TEST_ENV, REPORTS_ENABLED: 'false' })).toMatchObject({ enabled: false, reason: 'flag-off' })
    expect(resolveReportsConfig({ ...ENABLED_TEST_ENV, TURNSTILE_SECRET_KEY: '' })).toMatchObject({ enabled: false, reason: 'missing-secret' })
    expect(resolveReportsConfig({ ...ENABLED_TEST_ENV, REPORT_IP_SALT: 'short' })).toMatchObject({ enabled: false, reason: 'weak-salt' })
    expect(resolveReportsConfig({ ...ENABLED_TEST_ENV, SUPABASE_URL: undefined })).toMatchObject({ enabled: false, reason: 'missing-database' })
    expect(resolveReportsConfig({ ...ENABLED_TEST_ENV, REPORT_TRUSTED_IP_HEADER: 'cookie' })).toMatchObject({ enabled: false, reason: 'bad-trusted-header' })
  })
  it('drops the dev fallback IP in production', () => {
    const c = resolveReportsConfig({ ...PRODUCTION_REAL_ENV, REPORT_DEV_FALLBACK_IP: '127.0.0.1' })
    expect(c.enabled && c.devFallbackIp).toBeNull()
  })
  it('never exposes the secret through publicReportsConfig', () => {
    const pub = publicReportsConfig(resolveReportsConfig(ENABLED_TEST_ENV))
    expect(Object.keys(pub).sort()).toEqual(['enabled', 'siteKey'])
    expect(publicReportsConfig(resolveReportsConfig(PRODUCTION_TEST_KEY_ENV))).toEqual({ enabled: false, siteKey: null })
  })
})
