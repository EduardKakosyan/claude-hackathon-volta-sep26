import { describe, expect, it } from 'vitest'

import { detectPushSupport, isIosLike, readVapidPublicKey, urlBase64ToUint8Array, type PushPlatform } from './browser'

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const IPAD_AS_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
const CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0 Safari/537.36'

const platform = (overrides: Partial<PushPlatform> = {}): PushPlatform => ({
  hasServiceWorker: true,
  hasPushManager: true,
  hasNotification: true,
  userAgent: CHROME,
  maxTouchPoints: 0,
  standalone: false,
  ...overrides,
})

describe('detectPushSupport', () => {
  it('a browser with the Push API is supported, whatever its user agent says', () => {
    expect(detectPushSupport(platform())).toBe('supported')
    // Chromium wearing an iPhone user agent (the rig's chromium-iphone project) still has the API.
    expect(detectPushSupport(platform({ userAgent: IPHONE_SAFARI, maxTouchPoints: 5 }))).toBe('supported')
  })

  it('iOS Safari in a tab has no Push API: needs-install; from the Home Screen it has one: supported', () => {
    const tab = platform({ hasPushManager: false, hasNotification: false, userAgent: IPHONE_SAFARI, maxTouchPoints: 5 })
    expect(detectPushSupport(tab)).toBe('needs-install')
    expect(detectPushSupport({ ...tab, hasPushManager: true, hasNotification: true, standalone: true })).toBe('supported')
  })

  it('an iPad that calls itself a Mac is told to install too; a real Mac without the API is unsupported', () => {
    const noApi = { hasPushManager: false, hasNotification: false } as const
    expect(detectPushSupport(platform({ ...noApi, userAgent: IPAD_AS_MAC, maxTouchPoints: 5 }))).toBe('needs-install')
    expect(detectPushSupport(platform({ ...noApi, userAgent: IPAD_AS_MAC, maxTouchPoints: 0 }))).toBe('unsupported')
    expect(detectPushSupport(platform({ ...noApi, userAgent: CHROME }))).toBe('unsupported')
  })

  it('an installed iOS app that still lacks the API (older iOS) is unsupported, not told to install again', () => {
    expect(
      detectPushSupport(platform({ hasPushManager: false, hasNotification: false, userAgent: IPHONE_SAFARI, maxTouchPoints: 5, standalone: true })),
    ).toBe('unsupported')
  })

  it('isIosLike: the iPhone user agent alone is enough (Playwright WebKit reports no touch points)', () => {
    expect(isIosLike(IPHONE_SAFARI, 5)).toBe(true)
    expect(isIosLike(IPHONE_SAFARI, 0)).toBe(true)
    expect(isIosLike(IPAD_AS_MAC, 5)).toBe(true)
    expect(isIosLike(IPAD_AS_MAC, 0)).toBe(false)
    expect(isIosLike(CHROME, 0)).toBe(false)
  })
})

describe('urlBase64ToUint8Array', () => {
  it('decodes the base64url form web-push hands out, with or without padding', () => {
    expect([...urlBase64ToUint8Array('AQID')]).toEqual([1, 2, 3])
    expect([...urlBase64ToUint8Array('AQI')]).toEqual([1, 2])
    expect([...urlBase64ToUint8Array('-_8')]).toEqual([251, 255])
  })
})

describe('readVapidPublicKey', () => {
  /** The one call the reader makes, on a document that holds the given meta content (or no tag). */
  const doc = (content: string | null) =>
    ({
      querySelector: (selector: string) =>
        selector === 'meta[name="vapid-public-key"]' && content !== null ? ({ content } as HTMLMetaElement) : null,
    }) as unknown as Document

  it('reads the meta tag the layout renders, and is null without one or without a document', () => {
    expect(readVapidPublicKey(null)).toBeNull()
    expect(readVapidPublicKey(doc(' BKey '))).toBe('BKey')
    expect(readVapidPublicKey(doc(''))).toBeNull()
    expect(readVapidPublicKey(doc(null))).toBeNull()
  })
})
