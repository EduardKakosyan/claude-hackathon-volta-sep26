import { describe, expect, it, vi } from 'vitest'

import { BEACHES_BY_ID } from '@/lib/seed/beaches'
import { buildBeachUrl, detectPlatform, directionsUrl, shareUrl, type ShareNavigator } from './navigation'

const kinap = BEACHES_BY_ID['hrm-kinap']

describe('detectPlatform', () => {
  it.each([
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15', 'apple'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Safari/605.1.15', 'apple'],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36', 'android'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120', 'other'],
    ['', 'other'],
  ])('%s → %s', (ua, platform) => {
    expect(detectPlatform(ua)).toBe(platform)
  })
})

describe('directionsUrl', () => {
  it('opens Apple Maps with a destination and label', () => {
    expect(directionsUrl(kinap, 'apple')).toBe(
      'https://maps.apple.com/?daddr=44.68002,-63.30658&q=Kinap%20Beach',
    )
  })
  it('uses a geo: intent on Android', () => {
    expect(directionsUrl(kinap, 'android')).toBe(
      'geo:44.68002,-63.30658?q=44.68002,-63.30658(Kinap%20Beach)',
    )
  })
  it('falls back to Google Maps directions elsewhere', () => {
    expect(directionsUrl(kinap, 'other')).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=44.68002%2C-63.30658',
    )
  })
})

describe('buildBeachUrl', () => {
  it('adds beach and keeps day', () => {
    expect(buildBeachUrl('https://x.test/?day=2026-08-14', 'hrm-kinap')).toBe(
      'https://x.test/?day=2026-08-14&beach=hrm-kinap',
    )
  })
  it('replaces an existing beach without touching other params or the hash', () => {
    expect(buildBeachUrl('https://x.test/?beach=hrm-long-pond&day=2026-08-14#top', 'hrm-kinap')).toBe(
      'https://x.test/?beach=hrm-kinap&day=2026-08-14#top',
    )
  })
  it('works on a bare origin', () => {
    expect(buildBeachUrl('http://localhost:3000/', 'ns-rissers')).toBe('http://localhost:3000/?beach=ns-rissers')
  })
})

describe('shareUrl', () => {
  const data = { title: 'Kinap Beach', url: 'https://x.test/?beach=hrm-kinap' }
  const abort = () => Object.assign(new Error('cancelled'), { name: 'AbortError' })

  it('shares when Web Share is available', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    expect(await shareUrl(data, { share })).toBe('shared')
    expect(share).toHaveBeenCalledWith(data)
  })
  it('reports a dismissed share sheet as cancelled, not failed', async () => {
    expect(await shareUrl(data, { share: vi.fn().mockRejectedValue(abort()) })).toBe('cancelled')
  })
  it('respects canShare', async () => {
    const share = vi.fn()
    const writeText = vi.fn().mockResolvedValue(undefined)
    expect(await shareUrl(data, { share, canShare: () => false, clipboard: { writeText } })).toBe('copied')
    expect(share).not.toHaveBeenCalled()
  })
  it('falls back to the clipboard when share throws a non-abort error', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    const nav: ShareNavigator = { share: vi.fn().mockRejectedValue(new Error('NotAllowedError')), clipboard: { writeText } }
    expect(await shareUrl(data, nav)).toBe('copied')
    expect(writeText).toHaveBeenCalledWith(data.url)
  })
  it('copies when there is no Web Share', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    expect(await shareUrl(data, { clipboard: { writeText } })).toBe('copied')
  })
  it('fails when the clipboard rejects', async () => {
    expect(await shareUrl(data, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } })).toBe('failed')
  })
  it('fails when nothing is available', async () => {
    expect(await shareUrl(data, {})).toBe('failed')
  })
})
