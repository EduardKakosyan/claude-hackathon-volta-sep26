export type Platform = 'apple' | 'android' | 'other'

/** Apple Maps on any Apple device (iPadOS reports as Macintosh); geo: on Android; Google Maps web elsewhere. */
export function detectPlatform(userAgent: string): Platform {
  if (/iPhone|iPad|iPod|Macintosh/i.test(userAgent)) return 'apple'
  if (/Android/i.test(userAgent)) return 'android'
  return 'other'
}

export interface DirectionsTarget {
  lat: number
  lon: number
  name: string
}

export function directionsUrl({ lat, lon, name }: DirectionsTarget, platform: Platform): string {
  const point = `${lat},${lon}`
  const label = encodeURIComponent(name)
  switch (platform) {
    case 'apple':
      return `https://maps.apple.com/?daddr=${point}&q=${label}`
    case 'android':
      return `geo:${point}?q=${point}(${label})`
    default:
      return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(point)}`
  }
}

/**
 * The URL Share copies: the current page with `beach` set. Every other search
 * param — `day` above all — survives untouched, so a replayed beach shares as a
 * replayed beach. Never navigates; the caller decides what to do with the string.
 */
export function buildBeachUrl(currentHref: string, beachId: string): string {
  const url = new URL(currentHref)
  url.searchParams.set('beach', beachId)
  return url.toString()
}

export interface ShareData {
  title: string
  text?: string
  url: string
}

/** The slice of `navigator` Share needs, so tests and the harness can hand in fakes. */
export interface ShareNavigator {
  share?: (data: ShareData) => Promise<void>
  canShare?: (data: ShareData) => boolean
  clipboard?: { writeText: (text: string) => Promise<void> }
}

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed'

/**
 * Web Share when available, clipboard otherwise, and a plain "failed" when
 * neither works (http origins, old WebViews, denied clipboard permission). A user
 * dismissing the share sheet is `cancelled`, not an error.
 */
export async function shareUrl(data: ShareData, nav: ShareNavigator): Promise<ShareOutcome> {
  if (typeof nav.share === 'function' && (typeof nav.canShare !== 'function' || nav.canShare(data))) {
    try {
      await nav.share(data)
      return 'shared'
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return 'cancelled'
      // fall through to the clipboard
    }
  }
  if (nav.clipboard && typeof nav.clipboard.writeText === 'function') {
    try {
      await nav.clipboard.writeText(data.url)
      return 'copied'
    } catch {
      return 'failed'
    }
  }
  return 'failed'
}
