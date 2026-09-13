import { parseSubscription, type PushSubscriptionInput } from './follow-store'

/**
 * What this browser can do about Web Push, decided from the platform, not the
 * user agent alone:
 *
 * - `supported`      the Push API is here; whether notifications are allowed
 *                    is only known once the person is asked (the hook keeps
 *                    that answer — `Notification.permission` reads "denied"
 *                    in headless Chromium before any request, granted or not)
 * - `needs-install`  iOS Safari in a browser tab: WebKit only exposes the Push
 *                    API to a web app opened from the Home Screen, so the bell
 *                    explains Share → Add to Home Screen instead of asking
 * - `unsupported`    no Push API and no install path that would give one
 */
export type PushSupport = 'supported' | 'needs-install' | 'unsupported'

/** The browser facts the decision needs, so it can be tested without a browser. */
export interface PushPlatform {
  hasServiceWorker: boolean
  hasPushManager: boolean
  hasNotification: boolean
  userAgent: string
  maxTouchPoints: number
  standalone: boolean
}

/** iPhone, iPad, or an iPad that reports itself as a Mac (iPadOS does, with touch). */
export function isIosLike(userAgent: string, maxTouchPoints: number): boolean {
  return /iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1)
}

export function detectPushSupport(p: PushPlatform): PushSupport {
  if (p.hasServiceWorker && p.hasPushManager && p.hasNotification) return 'supported'
  if (isIosLike(p.userAgent, p.maxTouchPoints) && !p.standalone) return 'needs-install'
  return 'unsupported'
}

/** The browser slice the follow hook drives; a fake in tests, `browserPushPort()` in the app. */
export interface PushPort {
  support(): PushSupport
  requestPermission(): Promise<NotificationPermission>
  /** Registers the service worker and subscribes with the app's public key; re-subscribes if the key changed. */
  subscribe(applicationServerKey: string): Promise<PushSubscriptionInput>
}

/** Where the page says its VAPID public key: a meta tag the root layout renders from the server's env. */
export const VAPID_META_NAME = 'vapid-public-key'

export function readVapidPublicKey(doc: Document | null = typeof document === 'undefined' ? null : document): string | null {
  const content = doc?.querySelector<HTMLMetaElement>(`meta[name="${VAPID_META_NAME}"]`)?.content?.trim()
  return content ? content : null
}

export const SERVICE_WORKER_URL = '/sw.js'

/** The base64url string web-push hands out, as the bytes `pushManager.subscribe` wants. */
export function urlBase64ToUint8Array(base64url: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64url.length % 4)) % 4)
  const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i)
  return out
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a) return true // unknown: keep what is there
  const bytes = new Uint8Array(a)
  if (bytes.length !== b.length) return false
  for (let i = 0; i < bytes.length; i += 1) if (bytes[i] !== b[i]) return false
  return true
}

function readPlatform(win: Window & typeof globalThis): PushPlatform {
  const nav = win.navigator as Navigator & { standalone?: boolean }
  return {
    hasServiceWorker: 'serviceWorker' in nav,
    hasPushManager: 'PushManager' in win,
    hasNotification: 'Notification' in win,
    userAgent: nav.userAgent,
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    standalone: nav.standalone === true || (win.matchMedia?.('(display-mode: standalone)').matches ?? false),
  }
}

/** The real thing. Safe to construct on the server: every call checks for a window first. */
export function browserPushPort(getWindow: () => (Window & typeof globalThis) | null = () => (typeof window === 'undefined' ? null : window)): PushPort {
  return {
    support() {
      const win = getWindow()
      return win ? detectPushSupport(readPlatform(win)) : 'unsupported'
    },
    async requestPermission() {
      const win = getWindow()
      if (!win || !('Notification' in win)) return 'denied'
      return win.Notification.requestPermission()
    },
    async subscribe(applicationServerKey) {
      const win = getWindow()
      if (!win) throw new Error('push: no window')
      const registration = await win.navigator.serviceWorker.register(SERVICE_WORKER_URL)
      await win.navigator.serviceWorker.ready
      const key = urlBase64ToUint8Array(applicationServerKey)
      let subscription = await registration.pushManager.getSubscription()
      if (subscription && !sameKey(subscription.options?.applicationServerKey, key)) {
        await subscription.unsubscribe()
        subscription = null
      }
      subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
      const parsed = parseSubscription(subscription.toJSON())
      if (!parsed) throw new Error('push: the browser returned a subscription without keys')
      return parsed
    },
  }
}
