import { expect, type Locator, type Page, type TestInfo } from '@playwright/test'

/**
 * Shared helpers for the rig. Specs assert on roles, shell classes and `data-*`
 * hooks — never on pixels — so they survive the layout and detail rewrites that
 * later phases make.
 */

/**
 * Abort every request to the tile host. The style itself ships in the bundle
 * (lib/map-style/paper.json); its TileJSON, vector tiles, glyphs and sprite all
 * live on tiles.openfreemap.org, so one pattern keeps every run offline. The
 * suite verifies the app is usable with no tiles, not that tiles render: the
 * style's background layer still paints paper, pins still attach, and the camera
 * still flies.
 */
export async function stubMapTiles(page: Page): Promise<void> {
  await page.route(/tiles\.openfreemap\.org/, (route) => route.abort('blockedbyclient'))
}

/**
 * Collect uncaught errors, including a Web Worker that fails to start. WebKit
 * raises those on the page; Chromium only fires `error` on the Worker object, so
 * an init script forwards them too. Call before `page.goto`; read at the end.
 */
export async function watchPageErrors(page: Page): Promise<() => string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(`${error.name}: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error' && message.text().startsWith('[worker]')) errors.push(message.text())
  })
  await page.addInitScript(() => {
    const NativeWorker = window.Worker
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options)
        this.addEventListener('error', (event) => {
          const detail = (event as ErrorEvent).message || 'failed to start'
          console.error(`[worker] ${String(url) || '(empty url)'}: ${detail}`)
        })
      }
    } as unknown as typeof Worker
  })
  return () => [...errors]
}

/**
 * Stand in for the push service. Headless Chromium has no push service behind
 * `pushManager.subscribe()` — it rejects "Registration failed - permission
 * denied" whatever the permission — and a real one would mean FCM on the
 * network. Only that one call is replaced: the service worker registers for
 * real, the permission is the context's, the hook, the client, the route and
 * the memory store are all the real thing. Engines without a `PushManager`
 * (WebKit) are left alone, so they read `needs-install` / `unsupported` as
 * they would in the field. Call before `page.goto`.
 */
export async function stubPushService(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (!('PushManager' in window)) return
    const endpoint = `https://push.example.org/rig/${Math.random().toString(36).slice(2)}`
    const subscription = {
      endpoint,
      expirationTime: null,
      options: { userVisibleOnly: true, applicationServerKey: null },
      getKey: () => null,
      toJSON: () => ({ endpoint, expirationTime: null, keys: { p256dh: 'BRigP256dh', auth: 'rigAuth' } }),
      unsubscribe: async () => true,
    }
    let current: typeof subscription | null = null
    PushManager.prototype.subscribe = async function subscribe() {
      current = subscription
      return current as unknown as PushSubscription
    }
    PushManager.prototype.getSubscription = async function getSubscription() {
      return current as unknown as PushSubscription | null
    }
  })
}

/** Every directory row. */
export function rows(page: Page): Locator {
  return page.locator('.beach-shell-list > li')
}

/** The row button for one beach, matched on its exact name. */
export function row(page: Page, name: string): Locator {
  return page.locator('.beach-shell-row').filter({ has: page.getByText(name, { exact: true }) })
}

/** The directory container: the phone sheet, or the panel column on desktop and tablet. */
export function sheet(page: Page): Locator {
  return page.locator('.beach-sheet')
}

/**
 * Wait until React has hydrated: the map is client-only, so its first pin (or
 * the "map could not load" fallback) only exists once the app is interactive.
 */
export async function waitForApp(page: Page): Promise<void> {
  const pin = page.locator('.beach-map-pin').first()
  const mapUnavailable = page.getByRole('alert').filter({ hasText: 'The map could not load' })
  await expect(pin.or(mapUnavailable).first()).toBeAttached({ timeout: 30_000 })
}

/** The detail view, whichever markup renders it. */
export function detail(page: Page): Locator {
  return page.getByRole('article')
}

/** Click a beach in the directory and wait for its detail to open. */
export async function openBeach(page: Page, name: string): Promise<Locator> {
  await row(page, name).click()
  const article = detail(page)
  await expect(article).toBeVisible()
  await expect(article.getByRole('heading', { level: 2 })).toHaveText(name)
  return article
}

/** True for the three phone projects (portrait and landscape, both engines). */
export function isPhone(testInfo: TestInfo): boolean {
  return testInfo.project.name.includes('iphone')
}

/** Skip unless the project is a phone viewport. */
export function phoneOnly(testInfo: TestInfo): void {
  testInfo.skip(!isPhone(testInfo), 'phone viewports only')
}

/** Skip on the phone projects: desktop and tablet keep the panel layout. */
export function desktopOnly(testInfo: TestInfo): void {
  testInfo.skip(isPhone(testInfo), 'desktop and tablet viewports only')
}
