import { describe, expect, it } from 'vitest'

import { BEACHES_BY_ID } from '@/lib/seed/beaches'
import { baseMetadata, beachMetadata, siteUrl } from './metadata'

describe('siteUrl', () => {
  it('prefers NEXT_PUBLIC_SITE_URL, then the Vercel production host, then localhost', () => {
    expect(siteUrl({ NEXT_PUBLIC_SITE_URL: 'https://beach.example' } as unknown as NodeJS.ProcessEnv).href).toBe('https://beach.example/')
    expect(siteUrl({ VERCEL_PROJECT_PRODUCTION_URL: 'beach.vercel.app' } as unknown as NodeJS.ProcessEnv).href).toBe('https://beach.vercel.app/')
    expect(siteUrl({} as unknown as NodeJS.ProcessEnv).href).toBe('http://localhost:3000/')
  })
})

describe('baseMetadata', () => {
  it('sets a title template and app-capable flags', () => {
    const m = baseMetadata({} as unknown as NodeJS.ProcessEnv)
    expect(m.title).toEqual({ default: 'Is the Beach Open', template: '%s — Is the Beach Open' })
    expect(m.appleWebApp).toMatchObject({ capable: true })
    expect((m.metadataBase as URL | undefined)?.href).toBe('http://localhost:3000/')
  })
})

describe('beachMetadata', () => {
  const kinap = BEACHES_BY_ID['hrm-kinap']
  it('points at ?beach= and names the beach', () => {
    const m = beachMetadata(kinap)
    expect(m.title).toBe('Kinap Beach')
    expect(m.alternates?.canonical).toBe('/?beach=hrm-kinap')
    expect(m.description).toContain('Porters Lake')
  })
  it('keeps the replay day first in the canonical URL', () => {
    expect(beachMetadata(kinap, { day: '2026-08-14' }).alternates?.canonical).toBe('/?day=2026-08-14&beach=hrm-kinap')
  })
})
