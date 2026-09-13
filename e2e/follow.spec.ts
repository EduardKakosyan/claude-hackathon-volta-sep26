import { expect, test, type Page, type Request } from '@playwright/test'

import { openBeach, stubMapTiles, stubPushService } from './helpers'

/**
 * The follow bell in fixture mode, against the in-memory follow store.
 *
 * Chromium (desktop and the iPhone descriptor alike) has the Push API, so the
 * whole path runs: bell → service worker → permission (granted per context)
 * → subscription → POST /api/follow → 204 → "Following", kept across a reload
 * through localStorage, and DELETE on the second tap. Only the push service
 * behind `pushManager.subscribe()` is stubbed (see helpers.ts).
 *
 * WebKit has no Push API, which is exactly what iOS Safari in a tab looks
 * like: the bell must explain Share → Add to Home Screen and never call the
 * server.
 */
const BEACH = 'Chocolate Lake Beach'
const BEACH_ID = 'hrm-chocolate-lake'

const isFollowCall = (method: string) => (request: Request) =>
  new URL(request.url()).pathname === '/api/follow' && request.method() === method

/** Every /api/follow request the page makes, from now on. */
function recordFollowCalls(page: Page): Request[] {
  const calls: Request[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/follow') calls.push(request)
  })
  return calls
}

test.describe('follow', () => {
  test.beforeEach(async ({ page }) => {
    await stubMapTiles(page)
  })

  test('the bell sits in the detail heading beside the name, off and not pressed, and asks nothing on load', async ({
    page,
  }) => {
    const calls = recordFollowCalls(page)
    await page.goto('/')
    const article = await openBeach(page, BEACH)

    const bell = article.locator('.beach-detail-head .beach-detail-follow-bell')
    await expect(bell).toBeVisible()
    await expect(bell).toHaveText('Follow')
    await expect(bell).toHaveAttribute('aria-pressed', 'false')
    await expect(article.locator('.beach-detail-follow-hint')).toHaveCount(0)
    // Nothing was registered or asked for by opening the detail.
    expect(await page.evaluate(() => navigator.serviceWorker?.controller ?? null)).toBeNull()
    expect(calls).toEqual([])
  })

  test('Chromium: tap → permission → subscription → POST → "Following"; reload keeps it; tap again → DELETE → off', async ({
    page,
    context,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'the Push API is Chromium-only in this rig')
    await context.grantPermissions(['notifications'])
    await stubPushService(page)
    await page.goto('/')
    const article = await openBeach(page, BEACH)
    const bell = article.getByRole('button', { name: /^Follow(ing)?$/ })

    const posted = page.waitForRequest(isFollowCall('POST'))
    await bell.click()
    const request = await posted
    const body = request.postDataJSON() as { subscription: { endpoint: string; keys: Record<string, string> }; beachId: string }
    expect(body.beachId).toBe(BEACH_ID)
    expect(body.subscription.endpoint).toMatch(/^https:\/\//)
    expect(Object.keys(body.subscription.keys).sort()).toEqual(['auth', 'p256dh'])
    expect((await request.response())!.status()).toBe(204)

    await expect(bell).toHaveText('Following')
    await expect(bell).toHaveAttribute('aria-pressed', 'true')
    await expect(article.locator('.beach-detail-follow')).toHaveAttribute('data-state', 'on')
    // The service worker is now registered for real.
    expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration('/'))?.active?.scriptURL ?? null)).toMatch(/\/sw\.js$/)

    // Another beach is still off.
    await page.getByRole('button', { name: 'Back to beaches' }).click()
    const other = await openBeach(page, 'Rainbow Haven Beach')
    await expect(other.getByRole('button', { name: 'Follow', exact: true })).toHaveAttribute('aria-pressed', 'false')

    // Following survives a reload: the state is this browser's, mirrored in localStorage.
    await page.goto(`/?beach=${BEACH_ID}`)
    const again = article.getByRole('button', { name: 'Following', exact: true })
    await expect(again).toHaveAttribute('aria-pressed', 'true')

    // Unfollow: DELETE with the endpoint the server stored, 204, back to off.
    const deleted = page.waitForRequest(isFollowCall('DELETE'))
    await again.click()
    const del = await deleted
    expect(del.postDataJSON()).toEqual({ endpoint: body.subscription.endpoint, beachId: BEACH_ID })
    expect((await del.response())!.status()).toBe(204)
    await expect(article.getByRole('button', { name: 'Follow', exact: true })).toHaveAttribute('aria-pressed', 'false')
  })

  test('Chromium: a refused prompt reads as blocked, with the settings hint, and nothing is posted', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'the Push API is Chromium-only in this rig')
    // Playwright cannot refuse a permission outright; the browser's own answer to a refused prompt is "denied".
    await page.addInitScript(() => {
      Notification.requestPermission = async () => 'denied'
    })
    await stubPushService(page)
    const calls = recordFollowCalls(page)
    await page.goto('/')
    const article = await openBeach(page, BEACH)

    await article.getByRole('button', { name: 'Follow', exact: true }).click()
    await expect(article.locator('.beach-detail-follow')).toHaveAttribute('data-state', 'blocked')
    await expect(article.locator('.beach-detail-follow-hint')).toContainText('Notifications are blocked for this site')
    await expect(article.getByRole('button', { name: 'Follow', exact: true })).toHaveAttribute('aria-pressed', 'false')
    expect(calls).toEqual([])
  })

  test('WebKit (iPhone and iPad, not installed): the bell explains Share, then Add to Home Screen, and never calls the server', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'webkit', 'WebKit stands in for iOS Safari in a tab')
    const calls = recordFollowCalls(page)
    await page.goto('/')
    const article = await openBeach(page, BEACH)

    const follow = article.locator('.beach-detail-follow')
    await expect(follow).toHaveAttribute('data-state', 'needs-install')
    const bell = article.getByRole('button', { name: 'Follow', exact: true })
    await expect(bell).toHaveAttribute('aria-pressed', 'false')

    await bell.click()
    const hint = article.locator('.beach-detail-follow-hint')
    await expect(hint).toBeVisible()
    await expect(hint).toContainText('Share, then Add to Home Screen')
    await expect(bell).toHaveAttribute('aria-pressed', 'false')

    // A second tap closes the hint; nothing ever went to the server.
    await bell.click()
    await expect(hint).toHaveCount(0)
    expect(calls).toEqual([])
  })

  test('the service worker is served at /sw.js and only handles push and clicks', async ({ page }) => {
    const res = await page.request.get('/sw.js')
    expect(res.status()).toBe(200)
    const source = await res.text()
    expect(source).toContain("addEventListener('push'")
    expect(source).toContain("addEventListener('notificationclick'")
    expect(source).not.toMatch(/addEventListener\('fetch'/)
  })
})
