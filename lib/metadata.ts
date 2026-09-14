import type { Metadata } from 'next'

import type { Beach } from '@/lib/seed/beaches'

export const SITE_NAME = 'Is the Beach Open'
export const SITE_SHORT_NAME = 'Beach Open'
export const SITE_DESCRIPTION =
  'Check beach advisories and closures across Nova Scotia before you go. Find monitored beaches, lifeguard hours and official updates on one map.'
export const THEME_COLOR = '#efeeea'

/**
 * Absolute base for OpenGraph URLs. `NEXT_PUBLIC_SITE_URL` wins when set; Vercel's
 * system env supplies the production host otherwise; local dev falls back.
 */
export function siteUrl(env: NodeJS.ProcessEnv = process.env): URL {
  if (env.NEXT_PUBLIC_SITE_URL) return new URL(env.NEXT_PUBLIC_SITE_URL)
  if (env.VERCEL_PROJECT_PRODUCTION_URL) return new URL(`https://${env.VERCEL_PROJECT_PRODUCTION_URL}`)
  return new URL('http://localhost:3000')
}

export function baseMetadata(env: NodeJS.ProcessEnv = process.env): Metadata {
  return {
    metadataBase: siteUrl(env),
    title: { default: SITE_NAME, template: `%s — ${SITE_NAME}` },
    description: SITE_DESCRIPTION,
    applicationName: SITE_NAME,
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      title: SITE_NAME,
      description: SITE_DESCRIPTION,
      locale: 'en_CA',
      url: '/',
    },
    twitter: { card: 'summary', title: SITE_NAME, description: SITE_DESCRIPTION },
    appleWebApp: { capable: true, title: SITE_SHORT_NAME, statusBarStyle: 'black-translucent' },
    formatDetection: { telephone: false },
  }
}

/** For Phase 2's `generateMetadata` when `?beach=` is set. `day` keeps the shared URL a replay. */
export function beachMetadata(beach: Beach, params: { day?: string } = {}): Metadata {
  const search = new URLSearchParams()
  if (params.day) search.set('day', params.day)
  search.set('beach', beach.id)
  const url = `/?${search.toString()}`
  const where = beach.waterBody === beach.community ? beach.waterBody : `${beach.waterBody}, ${beach.community}`
  const description = params.day
    ? `View the recorded status of ${beach.name} (${where}) on ${params.day}.`
    : `Heading to ${beach.name} (${where})? Check advisories, closures and lifeguard hours before you go.`
  return {
    title: beach.name,
    description,
    alternates: { canonical: url },
    openGraph: { title: `${beach.name} — ${SITE_NAME}`, description, url, type: 'website' },
    twitter: { card: 'summary', title: `${beach.name} — ${SITE_NAME}`, description },
  }
}
