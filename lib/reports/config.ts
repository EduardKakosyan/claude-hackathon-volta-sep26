/**
 * Environment (all server-only except the site key):
 *   REPORTS_ENABLED                 'true' to turn the feature on at all
 *   TURNSTILE_SECRET_KEY            Cloudflare secret; test secrets are refused in production
 *   NEXT_PUBLIC_TURNSTILE_SITE_KEY  Cloudflare site key; delivered to the client via PageData, not inlined
 *   REPORT_IP_SALT                  >= 32 chars; rotate to invalidate all hashes
 *   REPORT_TRUSTED_IP_HEADER        optional; default 'x-real-ip' (see ip.ts)
 *   REPORT_DEV_FALLBACK_IP          optional; ignored in production; lets `next dev` submit when no proxy header exists
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  required for the store/storage adapters
 *   VERCEL_ENV / NODE_ENV           production detection (fail closed)
 */
export const TURNSTILE_TEST_SITE_KEYS = [
  '1x00000000000000000000AA', // always passes, visible
  '2x00000000000000000000AB', // always blocks
  '3x00000000000000000000FF', // forces interactive challenge
] as const

export const TURNSTILE_TEST_SECRET_KEYS = [
  '1x0000000000000000000000000000000AA', // always passes
  '2x0000000000000000000000000000000AA', // always fails
  '3x0000000000000000000000000000000AA', // token already spent
] as const

export const MIN_SALT_LENGTH = 32
export const DEFAULT_THROTTLE_WINDOW_SECONDS = 3600
export const TRUSTED_IP_HEADERS = ['x-real-ip', 'x-vercel-forwarded-for', 'x-forwarded-for'] as const
export type TrustedIpHeader = (typeof TRUSTED_IP_HEADERS)[number]

export type ReportsDisabledReason =
  | 'flag-off'
  | 'missing-secret'
  | 'missing-site-key'
  | 'missing-salt'
  | 'weak-salt'
  | 'test-keys-in-production'
  | 'missing-database'
  | 'bad-trusted-header'

export type ReportsConfig =
  | {
      enabled: true
      production: boolean
      siteKey: string
      secretKey: string
      ipSalt: string
      usingTestKeys: boolean
      trustedIpHeader: TrustedIpHeader
      devFallbackIp: string | null // always null in production
      throttleWindowSeconds: number
      supabaseUrl: string
      supabaseServiceRoleKey: string
    }
  | { enabled: false; production: boolean; reason: ReportsDisabledReason }

export interface ReportsEnv {
  REPORTS_ENABLED?: string
  TURNSTILE_SECRET_KEY?: string
  NEXT_PUBLIC_TURNSTILE_SITE_KEY?: string
  REPORT_IP_SALT?: string
  REPORT_TRUSTED_IP_HEADER?: string
  REPORT_DEV_FALLBACK_IP?: string
  SUPABASE_URL?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
  VERCEL_ENV?: string
  NODE_ENV?: string
}

/** VERCEL_ENV === 'production' || (VERCEL_ENV === undefined && NODE_ENV === 'production') */
export function isProductionEnv(env: ReportsEnv): boolean {
  if (env.VERCEL_ENV !== undefined) return env.VERCEL_ENV === 'production'
  return env.NODE_ENV === 'production'
}

function isTestKey(env: ReportsEnv): boolean {
  const secret = env.TURNSTILE_SECRET_KEY
  const siteKey = env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  const secretIsTest = secret !== undefined && (TURNSTILE_TEST_SECRET_KEYS as readonly string[]).includes(secret)
  const siteKeyIsTest = siteKey !== undefined && (TURNSTILE_TEST_SITE_KEYS as readonly string[]).includes(siteKey)
  return secretIsTest || siteKeyIsTest
}

function isTrustedIpHeader(value: string): value is TrustedIpHeader {
  return (TRUSTED_IP_HEADERS as readonly string[]).includes(value)
}

/**
 * Order of checks (first failure wins): flag-off → missing-secret → missing-site-key →
 * missing-salt → weak-salt → missing-database → bad-trusted-header → test-keys-in-production
 * (test keys = secret ∈ TURNSTILE_TEST_SECRET_KEYS or site key ∈ TURNSTILE_TEST_SITE_KEYS;
 * refused only when production)
 */
export function resolveReportsConfig(env: ReportsEnv): ReportsConfig {
  const production = isProductionEnv(env)

  if (env.REPORTS_ENABLED !== 'true') {
    return { enabled: false, production, reason: 'flag-off' }
  }
  if (!env.TURNSTILE_SECRET_KEY) {
    return { enabled: false, production, reason: 'missing-secret' }
  }
  if (!env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) {
    return { enabled: false, production, reason: 'missing-site-key' }
  }
  if (!env.REPORT_IP_SALT) {
    return { enabled: false, production, reason: 'missing-salt' }
  }
  if (env.REPORT_IP_SALT.length < MIN_SALT_LENGTH) {
    return { enabled: false, production, reason: 'weak-salt' }
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return { enabled: false, production, reason: 'missing-database' }
  }
  const trustedIpHeaderRaw = env.REPORT_TRUSTED_IP_HEADER ?? 'x-real-ip'
  if (!isTrustedIpHeader(trustedIpHeaderRaw)) {
    return { enabled: false, production, reason: 'bad-trusted-header' }
  }
  if (production && isTestKey(env)) {
    return { enabled: false, production, reason: 'test-keys-in-production' }
  }

  return {
    enabled: true,
    production,
    siteKey: env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    secretKey: env.TURNSTILE_SECRET_KEY,
    ipSalt: env.REPORT_IP_SALT,
    usingTestKeys: isTestKey(env),
    trustedIpHeader: trustedIpHeaderRaw,
    devFallbackIp: production ? null : (env.REPORT_DEV_FALLBACK_IP ?? null),
    throttleWindowSeconds: DEFAULT_THROTTLE_WINDOW_SECONDS,
    supabaseUrl: env.SUPABASE_URL,
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  }
}

/** The subset safe to send to the browser through PageData. */
export interface PublicReportsConfig {
  enabled: boolean
  siteKey: string | null
}

export function publicReportsConfig(config: ReportsConfig): PublicReportsConfig {
  if (!config.enabled) return { enabled: false, siteKey: null }
  return { enabled: true, siteKey: config.siteKey }
}
